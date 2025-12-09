
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
      text: "Hello! I am your **Singapore PE Syllabus Assistant**. I can help you with anything related to the **PE Syllabus (2024)** and **Fundamental Movement Skills** (e.g., overhand throw, kick). How can I help you today?",
      sender: Sender.BOT,
      timestamp: new Date(),
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<'gemini' | 'bedrock' | 'nemotron' | 'gemini-exp'>('nemotron');
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
        // Dynamic Frame Count: Nemotron (Small model) gets 10 frames to match API limit & Visual Vetting.
        // Gemini/Bedrock (Frontier models) get 24 frames for higher temporal resolution.
        const frameCount = selectedModel === 'nemotron' ? 10 : 24;
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
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

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
      const processed = await processMediaFiles(files, metadata);
      mediaAttachments = processed.attachments;
      poseData = processed.poseData;
      analysisFrames = processed.analysisFrames;
      debugFrames = processed.debugFrames;
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
      const skillMatch = response.text.match(/(?:I believe this is a|this looks like a|I have detected a) \*\*([^*]+)\*\*/i);
      const detectedSkill = skillMatch ? skillMatch[1] : undefined;

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
        const modelName = selectedModel.charAt(0).toUpperCase() + selectedModel.slice(1);
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
    <div className="flex flex-col h-full bg-slate-50">
      <Header />

      {/* Model Selector */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-600">AI Model:</span>
            <div className="inline-flex rounded-lg border border-slate-200 p-1 bg-slate-50 flex-wrap gap-1">
              <button
                onClick={() => setSelectedModel('gemini-exp')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${selectedModel === 'gemini-exp'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                ⚡ Gemini 2.0
              </button>
              <button
                onClick={() => setSelectedModel('gemini')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${selectedModel === 'gemini'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                🔷 Gemini 2.5 Flash
              </button>
              <button
                onClick={() => setSelectedModel('nemotron')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${selectedModel === 'nemotron'
                  ? 'bg-white text-green-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                🎮 Nemotron
              </button>
              <button
                onClick={() => setSelectedModel('bedrock')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${selectedModel === 'bedrock'
                  ? 'bg-white text-orange-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                🟠 Bedrock
              </button>
            </div>
          </div>
          <span className="text-xs text-slate-400 hidden sm:block">
            {selectedModel === 'gemini-exp' ? 'Gemini 2.0 Flash Experimental' :
              selectedModel === 'gemini' ? 'Google Gemini 2.5 Flash' :
                selectedModel === 'nemotron' ? 'Nvidia Nemotron 12B' :
                  'Claude 3.5 Sonnet'}
          </span>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">
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
                    className="px-4 py-2 bg-white border border-slate-200 rounded-full text-sm text-slate-700 hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition-all shadow-sm"
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
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                </div>
                <div className="bg-white px-4 py-3 rounded-2xl rounded-tl-none border border-slate-100 shadow-sm text-slate-500 text-sm flex items-center gap-1">
                  Thinking <span className="typing-dot">.</span><span className="typing-dot">.</span><span className="typing-dot">.</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} className="h-4" />
        </div>
      </main>

      <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
      <Analytics />
    </div >
  );
};

export default App;
