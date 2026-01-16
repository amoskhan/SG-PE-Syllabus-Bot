
import React, { useState, useRef, useEffect } from 'react';
import { Analytics } from "@vercel/analytics/react";
import Header from './components/layout/Header';
import ChatInput from './components/chat/ChatInput';
import ChatMessage from './components/chat/ChatMessage';
import { Message, Sender, PE_TOPICS, MediaAttachment } from './types';
import { MediaData } from './services/ai/geminiService';
import { getAIService } from './services/ai/aiServiceRegistry';
import { poseDetectionService, type PoseData } from './services/vision/poseDetectionService';

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome-1',
      text: "Hello! I am your **Singapore PE Syllabus Bot**. \n\nI can help you with:\n1. **Syllabus Questions**: Ask about the 2024 PE Syllabus, learning outcomes, or goals.\n2. **AI Movement Analysis**: Upload a video or use your camera to record a skill (e.g., Overhand Throw). I will analyze your form frame-by-frame! 🏃‍♂️📹\n\nTry asking a question or uploading a video!",
      sender: Sender.BOT,
      timestamp: new Date(),
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedModel, setSelectedModel] = useState<'gemini' | 'bedrock' | 'molmo'>('molmo');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Toggle Dark Mode
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading, isProcessing]);

  // Helper to load image from URL
  const loadImageFromUrl = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  };

  // Convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Helper function to process media files
  const processMediaFiles = async (
    files: File[],
    metadata?: { startTime?: number; endTime?: number }
  ): Promise<{ attachments: MediaAttachment[], poseData: PoseData[], analysisFrames: MediaData[], debugFrames: string[] }> => {
    const attachments: MediaAttachment[] = [];
    let poseData: PoseData[] = [];
    const analysisFrames: MediaData[] = [];
    const debugFrames: string[] = [];

    // Store images for post-processing drawing
    const processedImages: { img: HTMLImageElement, pose: any, ball: any, timestamp: number }[] = [];

    for (const file of files) {
      if (file.type.startsWith('image/')) {
        // ... (image processing remains same)
        const base64 = await fileToBase64(file);
        attachments.push({
          id: Date.now().toString() + Math.random(),
          type: 'image',
          mimeType: file.type,
          data: base64,
          fileName: file.name
        });

        const img = await loadImageFromUrl(base64);
        const pose = await poseDetectionService.detectPoseFromImage(img);

        // For single images, static usage isn't applicable, but we keep consistency
        const ball = await poseDetectionService.detectBallFromImage(img, pose || undefined);

        if (pose) {
          processedImages.push({ img, pose, ball: ball || undefined, timestamp: 0 });
        }

      } else if (file.type.startsWith('video/')) {
        // Process video - extract frames respecting trim range
        // Dynamic Frame Count: Molmo (Small model) gets 10 frames to match API limit & Visual Vetting.
        // Gemini/Bedrock (Frontier models) get 24 frames for higher temporal resolution.
        const frameCount = selectedModel === 'molmo' ? 5 : 24;
        const frames = await extractVideoFrames(file, frameCount, metadata?.startTime, metadata?.endTime);
        const videoUrl = URL.createObjectURL(file);

        attachments.push({
          id: Date.now().toString() + Math.random(),
          type: 'video',
          mimeType: file.type,
          data: videoUrl,
          fileName: file.name,
          thumbnailData: frames[0]
        });

        for (let i = 0; i < frames.length; i++) {
          const img = await loadImageFromUrl(frames[i]);

          // PHASE 1: Detect Pose FIRST
          const pose = await poseDetectionService.detectPoseFromImage(img);

          // PHASE 2: Detect Ball
          const ball = await poseDetectionService.detectBallFromImage(img, pose || undefined);

          if (pose) {
            processedImages.push({ img, pose, ball: ball || undefined, timestamp: i });
          }
        }
      }
    }

    // PHASE 3: Post-Process Filtering (Static Object Suppression) - REMOVED per user request
    // User wants manual control and better detection logic instead of brute-force filtering.
    let rawPoseData = processedImages.map(p => ({ ...p.pose, timestamp: p.timestamp, ball: p.ball }));
    poseData = rawPoseData;

    // PHASE 4: Generate Debug/Analysis Frames using Filtered Data
    for (let i = 0; i < processedImages.length; i++) {
      const data = processedImages[i];
      // Find the filtered version of this pose
      const filteredPose = poseData[i];

      // Add to main list
      // Note: poseData is already populated by the filter function return

      // Draw using the UPDATED ball status/validity
      const debugFrame = await poseDetectionService.drawPoseToImage(data.img, filteredPose, filteredPose.ball);

      if (debugFrame) {
        debugFrames.push(debugFrame);
        analysisFrames.push({
          mimeType: 'image/jpeg', // Assuming jpeg
          data: debugFrame
        });
      }
    }

    return { attachments, poseData, analysisFrames, debugFrames };
  };

  // Extract frames from video
  const extractVideoFrames = (
    file: File,
    numFrames: number = 12,
    startTime?: number,
    endTime?: number
  ): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const frames: string[] = [];

      video.preload = 'metadata';
      video.src = URL.createObjectURL(file);

      video.onloadedmetadata = () => {
        // Downscale frames to reduce Token Usage (Molmo 128k limit / Nova Limits)
        // Original 1080p frames are HUGE tokens. 640px is sufficient for pose/form analysis.
        const MAX_DIMENSION = 640;
        let width = video.videoWidth;
        let height = video.videoHeight;

        if (width > height) {
          if (width > MAX_DIMENSION) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          }
        } else {
          if (height > MAX_DIMENSION) {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }

        canvas.width = width;
        canvas.height = height;

        // Determine trim range
        const start = startTime !== undefined ? startTime : 0;
        const end = endTime !== undefined ? endTime : video.duration;
        const duration = Math.max(0, end - start);

        // Interval calculation
        const interval = duration / (numFrames + 1);
        let currentFrame = 0;

        const captureFrame = () => {
          if (currentFrame >= numFrames) {
            URL.revokeObjectURL(video.src);
            resolve(frames);
            return;
          }

          // Seek to: start time + (interval * step)
          // We add interval to avoid just getting the very first frame repeatedly if interval is small? 
          // Actually standard sampling: start + interval * (i+0.5) is center, or start + interval * (i)
          // Let's do start + interval * (currentFrame + 0.5) for centered sampling
          const time = start + (interval * (currentFrame + 0.5));

          video.currentTime = Math.min(time, end);
        };

        video.onseeked = () => {
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            frames.push(canvas.toDataURL('image/jpeg', 0.8));
          }
          currentFrame++;
          captureFrame();
        };

        video.onerror = () => reject(new Error('Failed to load video'));
        captureFrame();
      };
    });
  };

  const handleSendMessage = async (
    text: string,
    files?: File[],
    metadata?: { startTime?: number; endTime?: number; skillName?: string; isVerified?: boolean }
  ) => {
    // Smart Verification Check: If user types "yes" to a confirmation, treat it as verified.
    let isVerifying = metadata?.isVerified;
    let skillContext = metadata?.skillName;

    if (!isVerifying && text) {
      const lowerText = text.toLowerCase().trim();

      // 1. Check for explicit verification words
      const confirmationWords = ['yes', 'correct', 'yup', 'yeah', 'sure', 'confirm'];
      const isConfirmation = confirmationWords.some(w => lowerText === w || lowerText.startsWith(w + ' '));

      // 2. Check for explicit Skill Name Correction (e.g. "it's underhand roll", "underhand roll")
      const knownSkills = [
        'underhand throw', 'underhand roll', 'overhand throw', 'kick',
        'dribble with feet', 'dribble with hands', 'chest pass', 'bounce pass', 'bounce', 'above the waist catch',
      ];
      // Find if user text contains a skill name. We sort by length desc to match "Underhand Roll" before "Roll"
      const matchedSkill = knownSkills.sort((a, b) => b.length - a.length).find(skill => lowerText.includes(skill));

      // Check if the LAST message was a Bot Phase 1 detection
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.sender === Sender.BOT && lastMsg.text.includes("Phase 1")) {
        if (isConfirmation) {
          console.log("✅ Auto-detecting verification from text: 'yes'");
          isVerifying = true;
          const skillMatch = lastMsg.text.match(/\*\*(.*?)\*\*/);
          if (skillMatch && !skillContext) skillContext = skillMatch[1];
        } else if (matchedSkill) {
          console.log(`✅ Auto-detecting Skill Correction: '${matchedSkill}'`);
          isVerifying = true; // Treat correction as verification of the NEW skill
          skillContext = matchedSkill; // OVERRIDE the context with user input
        }
      }
    }
    // Process media files if present
    let mediaAttachments: MediaAttachment[] | undefined;
    let poseData: PoseData[] | undefined;
    let analysisFrames: MediaData[] | undefined;
    let debugFrames: string[] | undefined;

    if (files && files.length > 0) {
      setIsProcessing(true); // START PROCESSING INDICATOR
      try {
        const processed = await processMediaFiles(files, metadata);
        mediaAttachments = processed.attachments;
        poseData = processed.poseData;
        analysisFrames = processed.analysisFrames;
        debugFrames = processed.debugFrames;
      } finally {
        setIsProcessing(false); // STOP PROCESSING INDICATOR
      }
    }

    const newMessage: Message = {
      id: Date.now().toString(),
      text: text || (mediaAttachments ? 'Analyze this movement' : ''),
      sender: Sender.USER,
      timestamp: new Date(),
      media: mediaAttachments,
      poseData: poseData, // Store pose data in message
      analysisFrames: debugFrames // Visual proof of analysis
    };

    setMessages((prev) => [...prev, newMessage]);
    setIsLoading(true);

    try {
      let response;

      // Context finding for pose data
      let contextPoseData = poseData;
      // Context finding for visual frames (CRITICAL for "Analyze Now" button)
      let contextAnalysisFrames = analysisFrames;

      if (!contextPoseData || !contextAnalysisFrames) {
        for (let i = messages.length - 1; i >= 0; i--) {
          // 1. Find Pose Data
          if (!contextPoseData && messages[i].poseData && messages[i].poseData!.length > 0) {
            contextPoseData = messages[i].poseData;
            console.log('📌 Using pose data from previous message for context');
          }

          // 2. Find Visual Frames (Reconstruct from history)
          if (!contextAnalysisFrames) {
            // Try used analysis frames (Debug frames)
            if (messages[i].analysisFrames && messages[i].analysisFrames!.length > 0) {
              console.log(`📌 Reusing ${messages[i].analysisFrames!.length} visual frames from history.`);
              contextAnalysisFrames = messages[i].analysisFrames!.map(f => ({
                mimeType: f.match(/^data:([^;]+);/)?.[1] || 'image/jpeg',
                data: f
              }));
            }
            // Fallback: Try raw media attachments (e.g. single upload)
            else if (messages[i].media && messages[i].media!.length > 0) {
              const images = messages[i].media!.filter(m => m.type === 'image');
              if (images.length > 0) {
                console.log(`📌 Reusing ${images.length} raw images from history.`);
                contextAnalysisFrames = images.map(img => ({
                  mimeType: img.mimeType,
                  data: img.data
                }));
              }
            }
          }

          if (contextPoseData && contextAnalysisFrames) break;
        }
      }

      // Standardize history for all models (OpenAI style)
      // The registry wrapper handles conversion to specific formats (e.g. Google Content)
      const standardHistory = messages.map(m => ({
        role: m.sender === Sender.USER ? 'user' : 'assistant',
        content: m.text
      }));

      // Get appropriate service function from registry
      const aiService = getAIService(selectedModel);

      // Call the service with standard arguments
      // Note: Bedrock service wrapper ignores extra args
      response = await aiService(
        standardHistory,
        newMessage.text,
        contextPoseData,
        contextAnalysisFrames, // Use the context-aware frames
        skillContext, // Use detected or metadata skill
        isVerifying // Use detected or metadata verification status
      );

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response.text,
        sender: Sender.BOT,
        timestamp: new Date(),
        groundingChunks: selectedModel === 'gemini' ? response.groundingChunks : undefined,
        referenceImageURI: response.referenceImageURI,
        tokenUsage: response.tokenUsage
      };

      // Check for predicted skill in response (Supports both formats)
      // 1. "I believe this is a **Skill**" (Standard)
      // 2. "this looks like a **Skill**" (Verification Mode)
      // 3. "I have detected a **Skill**" (Strict Phase 1 Mode)
      // 4. "Performance Analysis for **Skill**" (Phase 2 Reporting Mode)
      // Regex simplified: Look for one of the prefixes, then capture the text until the next * or : or newline
      const skillMatch = response.text.match(/(?:I believe this is a|this looks like a|I have detected a|Performance Analysis for) (?:\*\*|)?([^*:\n]+)(?:\*\*|:)?/i);
      const detectedSkill = skillMatch ? skillMatch[1].trim() : undefined;

      setMessages((prev) => {
        const updatedMessages = [...prev];

        if (detectedSkill) {
          for (let i = updatedMessages.length - 1; i >= 0; i--) {
            if (updatedMessages[i].sender === Sender.USER && updatedMessages[i].media?.some(m => m.type === 'video')) {
              updatedMessages[i] = { ...updatedMessages[i], predictedSkill: detectedSkill };
              console.log(`✅ Updated video message with skill: ${detectedSkill}`);
              break;
            }
          }
        }

        return [...updatedMessages, botMessage];
      });

    } catch (error) {
      console.error("Error generating response:", error);
      let errorText = `Error: ${error instanceof Error ? error.message : String(error)}`;

      const errorMsgLower = errorText.toLowerCase();
      if (
        errorMsgLower.includes('429') ||
        errorMsgLower.includes('quota') ||
        errorMsgLower.includes('limit') ||
        errorMsgLower.includes('resource exhausted')
      ) {
        let modelName = selectedModel.charAt(0).toUpperCase() + selectedModel.slice(1);
        if (selectedModel === 'molmo') modelName = 'Molmo 2 8B';

        errorText = `⚠️ ${modelName} API usage limit reached. It attempted to generate a response but was stopped. Please wait a minute before trying again.`;
      }

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: errorText,
        sender: Sender.BOT,
        timestamp: new Date(),
        isError: true
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChipClick = (topic: string) => {
    handleSendMessage(`Tell me about ${topic}`);
  };

  const handleAnalyzeConfirm = (message: Message) => {
    // When user confirms, we send the UPDATED pose data (from message state) back to AI
    // We treat this as a text command "Analyze [Skill]" but attach the existing data context

    // 1. Find the skill name if present in message or inferred
    const skillName = message.predictedSkill || "Movement";

    // 2. Trigger analysis with isVerified = true
    handleSendMessage(
      "Analyze Now",
      undefined,
      { skillName: skillName, isVerified: true }
    );
  };

  return (
    <div className="max-w-4xl mx-auto h-full flex flex-col bg-white dark:bg-slate-900 shadow-xl rounded-none sm:rounded-2xl overflow-hidden transition-colors duration-200 border-x border-slate-200 dark:border-slate-800">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 p-4 sm:p-5 flex items-center justify-between shrink-0 transition-colors duration-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-none">
            <span className="text-2xl">🤸‍♂️</span>
          </div>
          <div>
            <h1 className="font-bold text-xl text-slate-800 dark:text-white">SG PE Syllabus Bot</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">AI Motion Analysis & Feedback</p>
          </div>
        </div>

        {/* Theme Toggle */}
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-400"
          title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {isDarkMode ? '☀️' : '🌙'}
        </button>
      </div>

      {/* Main Chat Area - Flex Grow to take available space */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w-4xl mx-auto">

          {/* Welcome Chips (Only show if history is short) */}
          {messages.length < 2 && (
            <div className="mb-8 animate-fade-in">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 ml-1">Explore the Syllabus</h2>
              <div className="flex flex-wrap gap-2">
                {PE_TOPICS.map((topic, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleChipClick(topic)}
                    className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-sm text-slate-700 dark:text-slate-200 hover:bg-red-50 dark:hover:bg-red-900/40 hover:border-red-200 dark:hover:border-red-800 hover:text-red-700 dark:hover:text-red-300 transition-all shadow-sm"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              onUpdateMessage={(updatedMsg) => {
                setMessages(prev => prev.map(m => m.id === updatedMsg.id ? updatedMsg : m));
              }}
              onAnalyze={handleAnalyzeConfirm}
            />
          ))}

          {/* Processing Media Indicator (Before AI Thinking) */}
          {isProcessing && (
            <div className="flex justify-start mb-6 animate-pulse">
              <div className="flex flex-row items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center border border-amber-200 dark:border-amber-700/50">
                  <svg className="w-4 h-4 text-amber-600 dark:text-amber-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-none border border-amber-100 dark:border-amber-900/30 shadow-sm text-amber-700 dark:text-amber-400 text-sm font-medium flex items-center gap-2">
                  <span>Processing video frames & detecting poses...</span>
                  <span className="text-xs opacity-70 font-normal">(This may take ~30s)</span>
                </div>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="flex justify-start mb-6 animate-pulse">
              <div className="flex flex-row items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                  <div className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                </div>
                <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-none border border-slate-100 dark:border-slate-700 shadow-sm text-slate-500 dark:text-slate-400 text-sm flex items-center gap-1">
                  Thinking <span className="typing-dot">.</span><span className="typing-dot">.</span><span className="typing-dot">.</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} className="h-4" />
        </div>
      </main>

      {/* Footer Area: Model Selector & Input */}
      <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shrink-0 transition-colors duration-200">
        <div className="flex justify-between items-center mb-3 px-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">AI Model:</span>
            <div className="relative">
              <button
                onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all flex items-center gap-2 min-w-[180px] justify-between"
              >
                <div className="flex items-center gap-2">
                  <img
                    src={`/assets/model-icons/${selectedModel === 'molmo' ? 'allen' : selectedModel}.png`}
                    alt={selectedModel}
                    className="w-5 h-5 object-contain"
                  />
                  <span>
                    {selectedModel === 'molmo' ? 'Molmo 2 8B' :
                      selectedModel === 'gemini' ? 'Gemini 2.5 Flash' :
                        'Bedrock'}
                  </span>
                </div>
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isModelDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsModelDropdownOpen(false)}
                  />
                  <div className="absolute bottom-full left-0 mb-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden z-20 flex flex-col p-1 animate-scale-in">
                    {[
                      { id: 'molmo', name: 'Molmo 2 8B', icon: 'allen.png' },
                      { id: 'gemini', name: 'Gemini 2.5 Flash', icon: 'gemini.png' },
                      { id: 'bedrock', name: 'Bedrock', icon: 'bedrock.png' }
                    ].map((model) => (
                      <button
                        key={model.id}
                        onClick={() => {
                          setSelectedModel(model.id as any);
                          setIsModelDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-3 ${selectedModel === model.id
                          ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-slate-200'
                          }`}
                      >
                        <img src={`/assets/model-icons/${model.icon}`} alt={model.name} className="w-5 h-5 object-contain" />
                        {model.name}
                        {selectedModel === model.id && (
                          <svg className="w-4 h-4 ml-auto text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:block">
            {selectedModel === 'molmo' ? 'AllenAI Molmo 2 8B (Free)' :
              selectedModel === 'gemini' ? 'Google Gemini 2.5 Flash' :
                'Claude 3.5 Sonnet'}
          </span>
        </div>

        <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading || isProcessing} />
      </div >
      <Analytics />
    </div >
  );
};

export default App;
