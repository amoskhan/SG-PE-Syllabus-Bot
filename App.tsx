
import React, { useState, useRef, useEffect } from 'react';
import { Content, Part } from '@google/genai';
import { Analytics } from "@vercel/analytics/react";
import Header from './components/Header';
import ChatInput from './components/ChatInput';
import ChatMessage from './components/ChatMessage';
import { Message, Sender, PE_TOPICS, MediaAttachment } from './types';
import { sendMessageToGemini, MediaData } from './services/geminiService';
import { sendMessageToBedrock } from './services/bedrockService';
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
  const [selectedModel, setSelectedModel] = useState<'gemini' | 'bedrock'>('gemini');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

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
  const processMediaFiles = async (files: File[]): Promise<{ attachments: MediaAttachment[], poseData: PoseData[], analysisFrames: MediaData[], debugFrames: string[] }> => {
    const attachments: MediaAttachment[] = [];
    const poseData: PoseData[] = [];
    const analysisFrames: MediaData[] = [];
    const debugFrames: string[] = [];

    for (const file of files) {
      if (file.type.startsWith('image/')) {
        // Process image
        const base64 = await fileToBase64(file);
        attachments.push({
          id: Date.now().toString() + Math.random(),
          type: 'image',
          mimeType: file.type,
          data: base64,
          fileName: file.name
        });

        // Add to analysis frames
        analysisFrames.push({
          mimeType: file.type,
          data: base64
        });

        // Detect pose from image
        const img = await loadImageFromUrl(base64);
        const pose = await poseDetectionService.detectPoseFromImage(img);
        if (pose) {
          poseData.push(pose);
          // Generate debug frame with skeleton
          const debugFrame = await poseDetectionService.drawPoseToImage(img, pose);
          if (debugFrame) debugFrames.push(debugFrame);
        }
      } else if (file.type.startsWith('video/')) {
        // Process video - extract frames
        // Increase frame count to 12 for better kinetic chain analysis
        const frames = await extractVideoFrames(file, 12);
        // Use Blob URL for efficient playback instead of Base64
        const videoUrl = URL.createObjectURL(file);

        // Store video for playback
        attachments.push({
          id: Date.now().toString() + Math.random(),
          type: 'video',
          mimeType: file.type,
          data: videoUrl, // Use Blob URL
          fileName: file.name,
          thumbnailData: frames[0]
        });

        // Add extracted frames to analysis payload (instead of full video)
        frames.forEach(frame => {
          analysisFrames.push({
            mimeType: 'image/jpeg',
            data: frame
          });
        });

        // Detect poses from each frame
        for (let i = 0; i < frames.length; i++) {
          const img = await loadImageFromUrl(frames[i]);
          const pose = await poseDetectionService.detectPoseFromImage(img);
          if (pose) {
            poseData.push({ ...pose, timestamp: i });
            // Generate debug frame with skeleton
            const debugFrame = await poseDetectionService.drawPoseToImage(img, pose);
            if (debugFrame) debugFrames.push(debugFrame);
          }
        }
      }
    }

    return { attachments, poseData, analysisFrames, debugFrames };
  };

  // Extract frames from video
  const extractVideoFrames = (file: File, numFrames: number = 12): Promise<string[]> => {
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
        const duration = video.duration;
        const interval = duration / (numFrames + 1);
        let currentFrame = 0;

        const captureFrame = () => {
          if (currentFrame >= numFrames) {
            URL.revokeObjectURL(video.src);
            resolve(frames);
            return;
          }

          const time = interval * (currentFrame + 1);
          video.currentTime = time;
        };

        video.onseeked = () => {
          ctx!.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.push(canvas.toDataURL('image/jpeg', 0.8));
          currentFrame++;
          captureFrame();
        };

        video.onerror = () => reject(new Error('Failed to load video'));
        captureFrame();
      };
    });
  };

  const handleSendMessage = async (text: string, files?: File[]) => {
    // Process media files if present
    let mediaAttachments: MediaAttachment[] | undefined;
    let poseData: PoseData[] | undefined;
    let analysisFrames: MediaData[] | undefined;
    let debugFrames: string[] | undefined;

    if (files && files.length > 0) {
      const processed = await processMediaFiles(files);
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

      if (selectedModel === 'gemini') {
        // Convert internal message format to Gemini Content format
        const history: Content[] = messages.map(m => ({
          role: m.sender === Sender.USER ? 'user' : 'model',
          parts: [{ text: m.text } as Part]
        }));

        // Add the new user message to history
        history.push({
          role: 'user',
          parts: [{ text: newMessage.text }]
        });

        // Find the most recent pose data from this conversation
        // (either from the current message or a previous one in this session)
        let contextPoseData = poseData;
        if (!contextPoseData) {
          // Look backwards through messages to find the most recent pose data
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].poseData && messages[i].poseData!.length > 0) {
              contextPoseData = messages[i].poseData;
              console.log('📌 Using pose data from previous message for context');
              break;
            }
          }
        }

        response = await sendMessageToGemini(history, newMessage.text, contextPoseData, analysisFrames);
      } else {
        // Bedrock uses a simpler format
        const history = messages.map(m => ({
          role: m.sender === Sender.USER ? 'user' : 'assistant',
          content: m.text
        }));

        response = await sendMessageToBedrock(history, text);
      }

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response.text,
        sender: Sender.BOT,
        timestamp: new Date(),
        groundingChunks: selectedModel === 'gemini' ? response.groundingChunks : undefined
      };

      // Check for predicted skill in response
      const skillMatch = response.text.match(/I believe this is a \*\*([^*]+)\*\*/i);
      const detectedSkill = skillMatch ? skillMatch[1] : undefined;

      setMessages((prev) => {
        const updatedMessages = [...prev];

        // If skill detected, update the last user message with video
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
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
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
            {selectedModel === 'gemini' ? 'Google Gemini 2.5 Flash' : 'Claude 3.5 Sonnet'}
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
            <ChatMessage key={msg.id} message={msg} />
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
