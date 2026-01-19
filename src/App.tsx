
import React, { useState, useRef, useEffect } from 'react';
import { Analytics } from "@vercel/analytics/react";
import SessionSidebar from './components/layout/SessionSidebar';
import ChatInput from './components/chat/ChatInput';
import ChatMessage from './components/chat/ChatMessage';
import { Message, Sender, PE_TOPICS, MediaAttachment, ChatSession } from './types';
import { MediaData } from './services/ai/geminiService';
import { getAIService } from './services/ai/aiServiceRegistry';
import { poseDetectionService, type PoseData } from './services/vision/poseDetectionService';

const App: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const STORAGE_KEY = 'sg_pe_syllabus_bot_history_v2'; // Changed key for new schema

  // DEFAULT WELCOME MESSAGE
  const getWelcomeMessage = (): Message => ({
    id: 'welcome-' + Date.now(),
    text: "Hello! I am your **Singapore PE Syllabus Bot**. \n\nI can help you with:\n1. **Syllabus Questions**: Ask about the 2024 PE Syllabus, learning outcomes, or goals.\n2. **AI Movement Analysis**: Upload a video or use your camera to record a skill (e.g., Overhand Throw). I will analyze your form frame-by-frame! 🏃‍♂️📹\n\nTry asking a question or uploading a video!",
    sender: Sender.BOT,
    timestamp: new Date(),
  });

  // State: Sessions Dictionary
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Revive Date objects
        return parsed.map((s: any) => ({
          ...s,
          createdAt: new Date(s.createdAt),
          updatedAt: new Date(s.updatedAt),
          messages: s.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }))
        }));
      }
    } catch (e) {
      console.error("Failed to load sessions:", e);
    }
    // Default: One empty session
    const initialId = Date.now().toString();
    return [{
      id: initialId,
      title: 'New Chat',
      messages: [getWelcomeMessage()],
      createdAt: new Date(),
      updatedAt: new Date()
    }];
  });

  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    if (sessions.length > 0) return sessions[0].id;
    return '';
  });

  // Derived State: Current Messages
  const currentSession = sessions.find(s => s.id === currentSessionId);
  const messages = currentSession ? currentSession.messages : [];

  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedModel, setSelectedModel] = useState<'gemini' | 'bedrock' | 'molmo'>('molmo');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  // Sync Current Session ID if sessions change (e.g. deletion)
  useEffect(() => {
    if (!sessions.find(s => s.id === currentSessionId) && sessions.length > 0) {
      setCurrentSessionId(sessions[0].id);
    } else if (sessions.length === 0) {
      // Force create new if empty
      handleNewSession();
    }
  }, [sessions, currentSessionId]);

  // Save Persistence
  useEffect(() => {
    // Strip heavy data before saving
    const safeSessions = sessions.map(s => ({
      ...s,
      messages: s.messages.map(m => ({
        ...m,
        media: m.media?.map(media => ({
          ...media,
          data: '', // STRIP DATA
          thumbnailData: undefined
        })),
        analysisFrames: [] // STRIP DATA
      }))
    }));

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safeSessions));
    } catch (e) {
      console.warn("LocalStorage Quota Exceeded.", e);
    }
  }, [sessions]);


  // Session Management Actions
  const handleNewSession = () => {
    const newId = Date.now().toString();
    const newSession: ChatSession = {
      id: newId,
      title: 'New Chat',
      messages: [getWelcomeMessage()],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newId);
    if (window.innerWidth < 768) setIsSidebarOpen(false); // Close on mobile
  };

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this chat?")) {
      const remaining = sessions.filter(s => s.id !== sessionId);
      setSessions(remaining);
      // Auto-switch handled by useEffect
    }
  };

  const handleUpdateCurrentSession = (updatedMessages: Message[], newTitle?: string) => {
    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        return {
          ...s,
          messages: updatedMessages,
          title: newTitle || s.title,
          updatedAt: new Date()
        };
      }
      return s;
    }));
  };

  // -------------------------------------------------------------------------------- //
  //  Existing Logic Adapted for Multi-Session
  // -------------------------------------------------------------------------------- //

  // Toggle Dark Mode
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading, isProcessing]);

  // Load Image Helper
  const loadImageFromUrl = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  };

  // File to Base64 Helper
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const processMediaFiles = async (
    files: File[],
    metadata?: { startTime?: number; endTime?: number }
  ): Promise<{ attachments: MediaAttachment[], poseData: PoseData[], analysisFrames: MediaData[], debugFrames: string[] }> => {
    const attachments: MediaAttachment[] = [];
    let poseData: PoseData[] = [];
    const analysisFrames: MediaData[] = [];
    const debugFrames: string[] = [];
    const processedImages: { img: HTMLImageElement, pose: any, ball: any, timestamp: number }[] = [];

    for (const file of files) {
      if (file.type.startsWith('image/')) {
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
        const ball = await poseDetectionService.detectBallFromImage(img, pose || undefined);
        if (pose) processedImages.push({ img, pose, ball: ball || undefined, timestamp: 0 });

      } else if (file.type.startsWith('video/')) {
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
          const pose = await poseDetectionService.detectPoseFromImage(img);
          const ball = await poseDetectionService.detectBallFromImage(img, pose || undefined);
          if (pose) processedImages.push({ img, pose, ball: ball || undefined, timestamp: i });
        }
      }
    }

    let rawPoseData = processedImages.map(p => ({ ...p.pose, timestamp: p.timestamp, ball: p.ball }));
    poseData = rawPoseData;

    for (let i = 0; i < processedImages.length; i++) {
      const data = processedImages[i];
      const filteredPose = poseData[i];
      const debugFrame = await poseDetectionService.drawPoseToImage(data.img, filteredPose, filteredPose.ball);
      if (debugFrame) {
        debugFrames.push(debugFrame);
        analysisFrames.push({ mimeType: 'image/jpeg', data: debugFrame });
      }
    }
    return { attachments, poseData, analysisFrames, debugFrames };
  };

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

        const start = startTime !== undefined ? startTime : 0;
        const end = endTime !== undefined ? endTime : video.duration;
        const duration = Math.max(0, end - start);
        const interval = duration / (numFrames + 1);
        let currentFrame = 0;

        const captureFrame = () => {
          if (currentFrame >= numFrames) {
            URL.revokeObjectURL(video.src);
            resolve(frames);
            return;
          }
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
    let isVerifying = metadata?.isVerified;
    let skillContext = metadata?.skillName;

    // Logic for Auto-Verification / Skill Correction
    if (!isVerifying && text) {
      const lowerText = text.toLowerCase().trim();
      const confirmationWords = ['yes', 'correct', 'yup', 'yeah', 'sure', 'confirm'];
      const isConfirmation = confirmationWords.some(w => lowerText === w || lowerText.startsWith(w + ' '));
      const knownSkills = [
        'underhand throw', 'underhand roll', 'overhand throw', 'kick',
        'dribble with feet', 'dribble with hands', 'chest pass', 'bounce pass', 'bounce', 'above the waist catch',
      ];
      const matchedSkill = knownSkills.sort((a, b) => b.length - a.length).find(skill => lowerText.includes(skill));
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.sender === Sender.BOT && lastMsg.text.includes("Phase 1")) {
        if (isConfirmation) {
          isVerifying = true;
          const skillMatch = lastMsg.text.match(/\*\*(.*?)\*\*/);
          if (skillMatch && !skillContext) skillContext = skillMatch[1];
        } else if (matchedSkill) {
          isVerifying = true;
          skillContext = matchedSkill;
        }
      }
    }

    let mediaAttachments: MediaAttachment[] | undefined;
    let poseData: PoseData[] | undefined;
    let analysisFrames: MediaData[] | undefined;
    let debugFrames: string[] | undefined;

    if (files && files.length > 0) {
      setIsProcessing(true);
      try {
        const processed = await processMediaFiles(files, metadata);
        mediaAttachments = processed.attachments;
        poseData = processed.poseData;
        analysisFrames = processed.analysisFrames;
        debugFrames = processed.debugFrames;
      } finally {
        setIsProcessing(false);
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

    // UPDATE STATE: Optimistic Update
    const optimisticMessages = [...messages, newMessage];

    // Auto-Title Logic on First Message
    let newTitle: string | undefined = undefined;
    if (messages.length <= 1) { // 1 because "Welcome" message is already there
      // Simple heuristic: First few words of user request
      newTitle = text.substring(0, 30) + (text.length > 30 ? '...' : '') || 'Media Analysis';
    }

    handleUpdateCurrentSession(optimisticMessages, newTitle);
    setIsLoading(true);

    try {
      let response;
      let contextPoseData = poseData;
      let contextAnalysisFrames = analysisFrames;

      if (!contextPoseData || !contextAnalysisFrames) {
        for (let i = messages.length - 1; i >= 0; i--) {
          if (!contextPoseData && messages[i].poseData && messages[i].poseData!.length > 0) {
            contextPoseData = messages[i].poseData;
          }
          if (!contextAnalysisFrames) {
            if (messages[i].analysisFrames && messages[i].analysisFrames!.length > 0) {
              contextAnalysisFrames = messages[i].analysisFrames!.map(f => ({
                mimeType: f.match(/^data:([^;]+);/)?.[1] || 'image/jpeg',
                data: f
              }));
            }
            else if (messages[i].media && messages[i].media!.length > 0) {
              const images = messages[i].media!.filter(m => m.type === 'image');
              if (images.length > 0) {
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

      const standardHistory = messages.map(m => ({
        role: m.sender === Sender.USER ? 'user' : 'assistant',
        content: m.text
      }));

      const aiService = getAIService(selectedModel);
      response = await aiService(
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
        tokenUsage: response.tokenUsage,
        modelId: selectedModel
      };

      const skillMatch = response.text.match(/(?:I believe this is a|this looks like a|I have detected a|Performance Analysis for) (?:\*\*|)?([^*:\n]+)(?:\*\*|:)?/i);
      const detectedSkill = skillMatch ? skillMatch[1].trim() : undefined;

      // UPDATE STATE: Bot Response
      // We need to fetch FRESH state (messages could have changed in background?) - for now using valid function closure or state setter updater
      setSessions(prev => prev.map(s => {
        if (s.id === currentSessionId) {
          const updatedMsgs = [...s.messages]; // Note: s.messages here might be stale if we don't use functional update correctly. 
          // Actually, we should rebuild from 'optimisticMessages' + botMessage
          // But wait, 'optimisticMessages' is local.
          // Let's just append to the specific session we are targeting.

          // ...BUT we also updated the video message with predicted skill...
          // Let's re-run that logic on the session's messages
          const finalMessages = [...s.messages];
          if (detectedSkill) {
            for (let i = finalMessages.length - 1; i >= 0; i--) {
              if (finalMessages[i].sender === Sender.USER && finalMessages[i].media?.some(m => m.type === 'video')) {
                finalMessages[i] = { ...finalMessages[i], predictedSkill: detectedSkill };
                break;
              }
            }
          }

          return {
            ...s,
            messages: [...finalMessages, botMessage],
            updatedAt: new Date()
          };
        }
        return s;
      }));


    } catch (error) {
      console.error("Error generating response:", error);
      let errorText = `Error: ${error instanceof Error ? error.message : String(error)}`;
      if (errorText.toLowerCase().includes('quota') || errorText.toLowerCase().includes('429')) {
        errorText = "⚠️ API Limit Reached. Please wait.";
      }

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: errorText,
        sender: Sender.BOT,
        timestamp: new Date(),
        isError: true
      };
      setSessions(prev => prev.map(s => {
        if (s.id === currentSessionId) {
          return { ...s, messages: [...s.messages, errorMessage], updatedAt: new Date() };
        }
        return s;
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleChipClick = (topic: string) => {
    handleSendMessage(`Tell me about ${topic}`);
  };

  const handleAnalyzeConfirm = (message: Message) => {
    const skillName = message.predictedSkill || "Movement";
    handleSendMessage("Analyze Now", undefined, { skillName: skillName, isVerified: true });
  };

  return (
    <div className="flex h-screen bg-white dark:bg-slate-900 transition-colors">

      <SessionSidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSwitchSession={setCurrentSessionId}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col h-full relative bg-white dark:bg-slate-900">
        {/* Header */}
        <div className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 p-4 shrink-0 flex items-center justify-between z-10 w-full">
          <div className="flex items-center gap-3">
            {/* Mobile Toggle */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="md:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>

            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-none">
              <span className="text-2xl">🤸‍♂️</span>
            </div>
            <div>
              <h1 className="font-bold text-xl text-slate-800 dark:text-white hidden sm:block">SG PE Syllabus Bot</h1>
              <h1 className="font-bold text-lg text-slate-800 dark:text-white sm:hidden">SG PE Bot</h1>
            </div>
          </div>

          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-400"
          >
            {isDarkMode ? '☀️' : '🌙'}
          </button>
        </div>

        {/* Main Chat Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth bg-slate-50 dark:bg-slate-900/50">
          <div className="max-w-4xl mx-auto min-h-full flex flex-col justify-end">

            {/* Spacer for empty chat to push welcome down? No, standard flow */}

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
                  const newMessages = messages.map(m => m.id === updatedMsg.id ? updatedMsg : m);
                  handleUpdateCurrentSession(newMessages); // Use session updater
                }}
                onAnalyze={handleAnalyzeConfirm}
              />
            ))}

            {isProcessing && (
              <div className="flex justify-start mb-6 animate-pulse">
                <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl border border-amber-100 dark:border-amber-900/30 text-amber-700 dark:text-amber-400 text-sm font-medium flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  Processing video frames...
                </div>
              </div>
            )}

            {isLoading && (
              <div className="flex justify-start mb-6 animate-pulse">
                <div className="flex flex-row items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                    <div className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce"></div>
                  </div>
                  <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-none border border-slate-100 dark:border-slate-700 shadow-sm text-slate-500 dark:text-slate-400 text-sm">
                    Thinking...
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} className="h-4" />
          </div>
        </main>

        {/* Footer Input */}
        <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shrink-0 z-10">
          <div className="max-w-4xl mx-auto">
            {/* Model Selector Row */}
            <div className="flex justify-between items-center mb-3 px-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">AI Model:</span>
                <div className="relative">
                  <button
                    onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm flex items-center gap-2 min-w-[180px] justify-between"
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
            </div>

            <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading || isProcessing} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
