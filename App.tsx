
import React, { useState, useRef, useEffect } from 'react';
import { Content, Part } from '@google/genai';
import { Analytics } from "@vercel/analytics/react";
import Header from './components/Header';
import ChatInput from './components/ChatInput';
import ChatMessage from './components/ChatMessage';
import { Message, Sender, PE_TOPICS, MediaAttachment } from './types';
import { sendMessageToGemini, MediaData } from './services/geminiService';
import { sendMessageToBedrock } from './services/bedrockService';
import { sendMessageToDeepSeek } from './services/deepSeekService';
import { sendMessageToAmazonNova } from './services/amazonNovaService';
import { poseDetectionService, type PoseData } from './services/poseDetectionService';

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
  const [selectedModel, setSelectedModel] = useState<'gemini' | 'bedrock' | 'deepseek' | 'nova'>('gemini');
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
        const frames = await extractVideoFrames(file, 24, metadata?.startTime, metadata?.endTime);
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
      if (!contextPoseData) {
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].poseData && messages[i].poseData!.length > 0) {
            contextPoseData = messages[i].poseData;
            console.log('📌 Using pose data from previous message for context');
            break;
          }
        }
      }

      if (selectedModel === 'gemini') {
        const history: Content[] = messages.map(m => ({
          role: m.sender === Sender.USER ? 'user' : 'model',
          parts: [{ text: m.text } as Part]
        }));
        // Note: The new message is passed as a separate argument to sendMessageToGemini, 
        // unlike Bedrock/DeepSeek/Nova which append it to history.


        // Pass isVerified from metadata (default undefined/false)
        response = await sendMessageToGemini(history, newMessage.text, contextPoseData, analysisFrames, metadata?.skillName, metadata?.isVerified);

      } else if (selectedModel === 'bedrock') {
        const history = messages.map(m => ({
          role: m.sender === Sender.USER ? 'user' : 'assistant',
          content: m.text
        }));

        response = await sendMessageToBedrock(history, text);
      } else if (selectedModel === 'deepseek') {
        const history = messages.map(m => ({
          role: m.sender === Sender.USER ? 'user' : 'assistant',
          content: m.text
        }));

        response = await sendMessageToDeepSeek(history, text, contextPoseData, undefined, metadata?.skillName, metadata?.isVerified);
      } else {
        // Amazon Nova
        const history = messages.map(m => ({
          role: m.sender === Sender.USER ? 'user' : 'assistant',
          content: m.text
        }));

        response = await sendMessageToAmazonNova(history, text, contextPoseData, undefined, metadata?.skillName, metadata?.isVerified);
      }

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response.text,
        sender: Sender.BOT,
        timestamp: new Date(),
        groundingChunks: selectedModel === 'gemini' ? response.groundingChunks : undefined,
        referenceImageURI: selectedModel === 'gemini' ? response.referenceImageURI : undefined,
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
        errorText = "⚠️ Usage limit reached. The AI is a bit tired. Please wait a minute before trying again.";
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
            <div className="inline-flex rounded-lg border border-slate-200 p-1 bg-slate-50">
              <button
                onClick={() => setSelectedModel('gemini')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${selectedModel === 'gemini'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                🔷 Gemini
              </button>
              <button
                onClick={() => setSelectedModel('nova')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${selectedModel === 'nova'
                  ? 'bg-white text-teal-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                🟢 Nova
              </button>
              <button
                onClick={() => setSelectedModel('deepseek')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${selectedModel === 'deepseek'
                  ? 'bg-white text-purple-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                🟣 DeepSeek
              </button>
              <button
                onClick={() => setSelectedModel('bedrock')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${selectedModel === 'bedrock'
                  ? 'bg-white text-orange-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                🟠 Bedrock
              </button>
            </div>
          </div>
          <span className="text-xs text-slate-400">
            {selectedModel === 'gemini' ? 'Google Gemini 2.5 Flash' : selectedModel === 'bedrock' ? 'Claude 3.5 Sonnet' : selectedModel === 'deepseek' ? 'DeepSeek-R1-Chimera' : 'Amazon Nova 2 Lite'}
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
    </div>
  );
};

export default App;
