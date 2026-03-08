
import React, { useState, useRef, useEffect } from 'react';
import { Analytics } from "@vercel/analytics/react";
import Header from './components/layout/Header';
import ChatInput from './components/chat/ChatInput';
import ChatMessage from './components/chat/ChatMessage';
import { Message, Sender, PE_TOPICS, MediaAttachment } from './types';
import { MediaData } from './services/ai/geminiService';
import { getAIService } from './services/ai/aiServiceRegistry';
import { poseDetectionService, type PoseData } from './services/vision/poseDetectionService';
import { NEMOTRON_FRAME_COUNT, NOVA_FRAME_COUNT, FRONTIER_FRAME_COUNT, MAX_FRAME_DIMENSION, FRAME_JPEG_QUALITY } from './constants';

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

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
  const [selectedModel, setSelectedModel] = useState<'gemini' | 'bedrock' | 'nemotron' | 'nova'>('nova');
  const [isDarkMode, setIsDarkMode] = useState(false);
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
  }, [messages.length, isLoading]);

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
        try {
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
        } catch (imageError) {
          console.warn(`⚠️ Skipping image "${file.name}": ${getErrorMessage(imageError)}`);
        }

      } else if (file.type.startsWith('video/')) {
        let videoUrl: string | null = null;
        try {
          // Process video - extract frames respecting trim range
          // Dynamic Frame Count: Nemotron (Small model) gets 10 frames to match API limit & Visual Vetting.
          // Gemini/Bedrock (Frontier models) get 24 frames for higher temporal resolution.
          const frameCount = selectedModel === 'nemotron' ? NEMOTRON_FRAME_COUNT : (selectedModel === 'nova' ? NOVA_FRAME_COUNT : FRONTIER_FRAME_COUNT);
          const frames = await extractVideoFrames(file, frameCount, metadata?.startTime, metadata?.endTime);
          videoUrl = URL.createObjectURL(file);

          attachments.push({
            id: Date.now().toString() + Math.random(),
            type: 'video',
            mimeType: file.type,
            data: videoUrl,
            fileName: file.name,
            thumbnailData: frames[0]
          });

          for (let i = 0; i < frames.length; i++) {
            try {
              const img = await loadImageFromUrl(frames[i]);

              // PHASE 1: Detect Pose FIRST
              const pose = await poseDetectionService.detectPoseFromImage(img);

              // PHASE 2: Detect Ball
              const ball = await poseDetectionService.detectBallFromImage(img, pose || undefined);

              if (pose) {
                processedImages.push({ img, pose, ball: ball || undefined, timestamp: i });
              }
            } catch (frameError) {
              console.warn(`⚠️ Skipping frame ${i + 1}: ${getErrorMessage(frameError)}`);
            }
          }
        } catch (videoError) {
          if (videoUrl) {
            URL.revokeObjectURL(videoUrl);
          }
          console.warn(`⚠️ Skipping video "${file.name}": ${getErrorMessage(videoError)}`);
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
        // Downscale frames to reduce Token Usage (Nemotron 128k limit / Nova Limits)
        // Original 1080p frames are HUGE tokens. 640px is sufficient for pose/form analysis.
        let width = video.videoWidth;
        let height = video.videoHeight;

        if (width > height) {
          if (width > MAX_FRAME_DIMENSION) {
            height = Math.round((height * MAX_FRAME_DIMENSION) / width);
            width = MAX_FRAME_DIMENSION;
          }
        } else {
          if (height > MAX_FRAME_DIMENSION) {
            width = Math.round((width * MAX_FRAME_DIMENSION) / height);
            height = MAX_FRAME_DIMENSION;
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
          try {
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              frames.push(canvas.toDataURL('image/jpeg', FRAME_JPEG_QUALITY));
            }
            currentFrame++;
            captureFrame();
          } catch (err) {
            URL.revokeObjectURL(video.src);
            reject(new Error(`Failed to capture frame ${currentFrame + 1}: ${getErrorMessage(err)}`));
          }
        };

        video.onerror = () => {
          URL.revokeObjectURL(video.src);
          reject(new Error('Failed to load video'));
        };
        captureFrame();
      };
    });
  };

  // Detect skill verification or correction from user text
  const detectSkillContext = (
    text: string,
    currentMessages: Message[],
    metadata?: { skillName?: string; isVerified?: boolean }
  ): { isVerifying?: boolean; skillContext?: string } => {
    let isVerifying = metadata?.isVerified;
    let skillContext = metadata?.skillName;

    if (!isVerifying && text) {
      const lowerText = text.toLowerCase().trim();

      const confirmationWords = ['yes', 'correct', 'yup', 'yeah', 'sure', 'confirm'];
      const isConfirmation = confirmationWords.some(w => lowerText === w || lowerText.startsWith(w + ' '));

      const knownSkills = [
        'underhand throw', 'underhand roll', 'overhand throw', 'kick',
        'dribble with feet', 'dribble with hands', 'chest pass', 'bounce pass', 'bounce', 'above the waist catch',
      ];
      const matchedSkill = knownSkills.sort((a, b) => b.length - a.length).find(skill => new RegExp(`\\b${skill}\\b`).test(lowerText));

      const lastMsg = currentMessages[currentMessages.length - 1];
      if (lastMsg && lastMsg.sender === Sender.BOT && lastMsg.text.includes("Phase 1")) {
        if (isConfirmation) {
          console.log("✅ Auto-detecting verification from text: 'yes'");
          isVerifying = true;
          const skillMatch = lastMsg.text.match(/\*\*(.*?)\*\*/);
          if (skillMatch && !skillContext) skillContext = skillMatch[1];
        } else if (matchedSkill) {
          console.log(`✅ Auto-detecting Skill Correction: '${matchedSkill}'`);
          isVerifying = true;
          skillContext = matchedSkill;
        }
      }
    }

    return { isVerifying, skillContext };
  };

  // Find pose data and analysis frames from message history
  const findContextFromHistory = (
    currentMessages: Message[],
    poseData?: PoseData[],
    analysisFrames?: MediaData[]
  ): { contextPoseData?: PoseData[]; contextAnalysisFrames?: MediaData[] } => {
    let contextPoseData = poseData;
    let contextAnalysisFrames = analysisFrames;

    if (!contextPoseData || !contextAnalysisFrames) {
      for (let i = currentMessages.length - 1; i >= 0; i--) {
        if (!contextPoseData && currentMessages[i].poseData && currentMessages[i].poseData!.length > 0) {
          contextPoseData = currentMessages[i].poseData;
          console.log('📌 Using pose data from previous message for context');
        }

        if (!contextAnalysisFrames) {
          if (currentMessages[i].analysisFrames && currentMessages[i].analysisFrames!.length > 0) {
            console.log(`📌 Reusing ${currentMessages[i].analysisFrames!.length} visual frames from history.`);
            contextAnalysisFrames = currentMessages[i].analysisFrames!.map(f => ({
              mimeType: f.match(/^data:([^;]+);/)?.[1] || 'image/jpeg',
              data: f
            }));
          } else if (currentMessages[i].media && currentMessages[i].media!.length > 0) {
            const images = currentMessages[i].media!.filter(m => m.type === 'image');
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

    return { contextPoseData, contextAnalysisFrames };
  };

  // Extract predicted skill from AI response and tag the video message
  const extractAndTagSkill = (responseText: string): string | undefined => {
    const skillMatch = responseText.match(/(?:I believe this is a|this looks like a|I have detected a|Performance Analysis for) (?:\*\*|)?([^*:\n]+)(?:\*\*|:)?/i);
    return skillMatch ? skillMatch[1].trim() : undefined;
  };

  // Build a user-friendly error message for AI service errors
  const buildAIErrorMessage = (error: unknown): string => {
    let errorText = `Error: ${getErrorMessage(error)}`;
    const errorMsgLower = errorText.toLowerCase();
    if (
      errorMsgLower.includes('429') ||
      errorMsgLower.includes('quota') ||
      errorMsgLower.includes('limit') ||
      errorMsgLower.includes('resource exhausted')
    ) {
      const modelName = selectedModel.charAt(0).toUpperCase() + selectedModel.slice(1);
      errorText = `⚠️ ${modelName} API usage limit reached. It attempted to generate a response but was stopped. Please wait a minute before trying again.`;
    }
    return errorText;
  };

  const handleSendMessage = async (
    text: string,
    files?: File[],
    metadata?: { startTime?: number; endTime?: number; skillName?: string; isVerified?: boolean }
  ) => {
    const { isVerifying, skillContext } = detectSkillContext(text, messages, metadata);

    // Process media files if present
    let mediaAttachments: MediaAttachment[] | undefined;
    let poseData: PoseData[] | undefined;
    let analysisFrames: MediaData[] | undefined;
    let debugFrames: string[] | undefined;

    if (files && files.length > 0) {
      try {
        const processed = await processMediaFiles(files, metadata);
        mediaAttachments = processed.attachments;
        poseData = processed.poseData;
        analysisFrames = processed.analysisFrames;
        debugFrames = processed.debugFrames;
      } catch (mediaError) {
        const userMsg: Message = {
          id: crypto.randomUUID(),
          text: text || 'Analyze this movement',
          sender: Sender.USER,
          timestamp: new Date(),
        };
        const errorMsg: Message = {
          id: crypto.randomUUID(),
          text: `⚠️ Could not process the uploaded file: ${getErrorMessage(mediaError)}. Please check the file and try again.`,
          sender: Sender.BOT,
          timestamp: new Date(),
          isError: true,
        };
        setMessages(prev => [...prev, userMsg, errorMsg]);
        return;
      }
    }

    const newMessage: Message = {
      id: Date.now().toString(),
      text: text || (mediaAttachments ? 'Analyze this movement' : ''),
      sender: Sender.USER,
      timestamp: new Date(),
      media: mediaAttachments,
      poseData: poseData,
      analysisFrames: debugFrames
    };

    setMessages((prev) => [...prev, newMessage]);
    setIsLoading(true);

    try {
      const { contextPoseData, contextAnalysisFrames } = findContextFromHistory(messages, poseData, analysisFrames);

      const standardHistory = messages.map(m => ({
        role: m.sender === Sender.USER ? 'user' : 'assistant',
        content: m.text
      }));

      const aiService = getAIService(selectedModel);
      const response = await aiService(
        standardHistory,
        newMessage.text,
        contextPoseData,
        contextAnalysisFrames,
        skillContext,
        isVerifying
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

      const detectedSkill = extractAndTagSkill(response.text);

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
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: buildAIErrorMessage(error),
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
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-1 bg-slate-50 dark:bg-slate-950 flex-wrap gap-1">
              <button
                onClick={() => setSelectedModel('nova')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${selectedModel === 'nova'
                  ? 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                  }`}
              >
                <img src="/assets/model-icons/nova.png" alt="Nova" className="w-6 h-6 object-contain" />
                Amazon Nova
              </button>
              <button
                onClick={() => setSelectedModel('gemini')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${selectedModel === 'gemini'
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                  }`}
              >
                <img src="/assets/model-icons/gemini.png" alt="Gemini" className="w-6 h-6 object-contain" />
                Gemini 2.5 Flash
              </button>
              <button
                onClick={() => setSelectedModel('nemotron')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${selectedModel === 'nemotron'
                  ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                  }`}
              >
                <img src="/assets/model-icons/nvidia.png" alt="Nemotron" className="w-6 h-6 object-contain" />
                Nvidia Nemotron
              </button>
              <button
                onClick={() => setSelectedModel('bedrock')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${selectedModel === 'bedrock'
                  ? 'bg-white dark:bg-slate-800 text-orange-600 dark:text-orange-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                  }`}
              >
                <img src="/assets/model-icons/bedrock.png" alt="Bedrock" className="w-6 h-6 object-contain" />
                Bedrock
              </button>
            </div>
          </div>
          <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:block">
            {selectedModel === 'nova' ? 'Amazon Nova 2 Lite (Free)' :
              selectedModel === 'gemini' ? 'Google Gemini 2.5 Flash' :
                selectedModel === 'nemotron' ? 'Nvidia Nemotron 12B' :
                  'Claude 3.5 Sonnet'}
          </span>
        </div>

        <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
      </div>
      <Analytics />
    </div>
  );
};

export default App;
