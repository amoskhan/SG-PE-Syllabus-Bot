
import React, { useState, useRef, useEffect } from 'react';
import { Analytics } from "@vercel/analytics/react";
import SessionSidebar from './components/layout/SessionSidebar';
import ChatInput from './components/chat/ChatInput';
import ChatMessage from './components/chat/ChatMessage';
import { Message, Sender, PE_TOPICS, MediaAttachment, ChatSession } from './types';
import { MediaData } from './services/ai/geminiService';
import { getAIService } from './services/ai/aiServiceRegistry';

import { poseDetectionService, type PoseData } from './services/vision/poseDetectionService';
import { parseDocument } from './services/documentService';
import PdfUploaderModal from './components/admin/PdfUploaderModal';
import { ALL_FMS_SKILLS } from './data/fundamentalMovementSkillsData';

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
  const [selectedModel, setSelectedModel] = useState<'gemini' | 'bedrock' | 'nemotron'>('gemini');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [isSkillSelectorOpen, setIsSkillSelectorOpen] = useState(false);

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
    const processedImages: { img: HTMLImageElement, pose: any, ball: any, timestamp: number }[] = [];

    // Phase 1: Fast Path (Attachments only for UI)
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
      } else if (file.type.startsWith('video/')) {
        const videoUrl = URL.createObjectURL(file);
        // Fast thumbnail (first frame only)
        const thumbnails = await extractVideoFrames(file, 1);
        attachments.push({
          id: Date.now().toString() + Math.random(),
          type: 'video',
          mimeType: file.type,
          data: videoUrl,
          fileName: file.name,
          thumbnailData: thumbnails[0]
        });
      } else if (file.name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const text = await parseDocument(file);
        attachments.push({
          id: Date.now().toString() + Math.random(),
          type: 'document',
          mimeType: file.type,
          data: '',
          fileName: file.name,
          textContent: text
        });
      }
    }

    return { attachments, poseData: [], analysisFrames: [], debugFrames: [] };
  };

  const runBackgroundAnalysis = async (
    messageId: string,
    files: File[],
    metadata?: { startTime?: number; endTime?: number }
  ): Promise<{ poseData: PoseData[], analysisFrames: MediaData[] }> => {
    setIsProcessing(true);
    try {
      const processedImages: { img: HTMLImageElement, pose: any, ball: any, timestamp: number }[] = [];
      const debugFrames: string[] = [];
      const analysisFrames: MediaData[] = [];

      for (const file of files) {
        if (file.type.startsWith('image/')) {
          const base64 = await fileToBase64(file);
          const img = await loadImageFromUrl(base64);
          const pose = await poseDetectionService.detectPoseFromImage(img);
          const ball = await poseDetectionService.detectBallFromImage(img, pose || undefined);
          if (pose) processedImages.push({ img, pose, ball: ball || undefined, timestamp: 0 });

        } else if (file.type.startsWith('video/')) {
          const frameCount = 12;
          const frames = await extractVideoFrames(file, frameCount, metadata?.startTime, metadata?.endTime);
          for (let i = 0; i < frames.length; i++) {
            const img = await loadImageFromUrl(frames[i]);
            try {
              const pose = await poseDetectionService.detectPoseFromImage(img);
              const ball = await poseDetectionService.detectBallFromImage(img, pose || undefined);
              if (pose) {
                processedImages.push({ img, pose, ball: ball || undefined, timestamp: i });
              } else {
                console.warn(`⚠️ No pose detected in frame ${i}`);
              }
            } catch (frameError) {
              console.error(`❌ Error processing frame ${i}:`, frameError);
            }
          }
        }
      }

      const poseData = processedImages.map(p => ({ ...p.pose, timestamp: p.timestamp, ball: p.ball }));

      for (let i = 0; i < processedImages.length; i++) {
        const data = processedImages[i];
        const filteredPose = poseData[i];
        const debugFrame = await poseDetectionService.drawPoseToImage(data.img, filteredPose, filteredPose.ball);
        if (debugFrame) {
          debugFrames.push(debugFrame);
          analysisFrames.push({ mimeType: 'image/jpeg', data: debugFrame });
        }
      }

      // Final Update to the Session Message (Visuals)
      setSessions(prev => prev.map(s => ({
        ...s,
        messages: s.messages.map(m => {
          if (m.id === messageId) {
            return { ...m, poseData: poseData, analysisFrames: debugFrames };
          }
          return m;
        })
      })));

      return { poseData, analysisFrames };

    } catch (e) {
      console.error("Background analysis failed", e);
      return { poseData: [], analysisFrames: [] };
    } finally {
      setIsProcessing(false);
    }
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

    if (files && files.length > 0) {
      const processed = await processMediaFiles(files, metadata);
      mediaAttachments = processed.attachments;
    }

    const newMessageId = Date.now().toString();
    const newMessage: Message = {
      id: newMessageId,
      text: text || (mediaAttachments ? 'Analyze this movement' : ''),
      sender: Sender.USER,
      timestamp: new Date(),
      media: mediaAttachments
    };

    // UPDATE STATE: Optimistic Update (Immediate)
    const optimisticMessages = [...messages, newMessage];

    // Auto-Title Logic on First Message
    let newTitle: string | undefined = undefined;
    if (messages.length <= 1) { // 1 because "Welcome" message is already there
      if (text && text.trim().length > 0) {
        newTitle = text.substring(0, 30) + (text.length > 30 ? '...' : '');
      } else if (skillContext) {
        newTitle = `Analysis: ${skillContext}`;
      } else if (mediaAttachments && mediaAttachments.length > 0) {
        newTitle = 'Media Analysis';
      } else {
        newTitle = 'New Conversation';
      }
    }

    handleUpdateCurrentSession(optimisticMessages, newTitle);

    setIsLoading(true);

    try {
      let response;
      let contextPoseData: PoseData[] | undefined;
      let contextAnalysisFrames: MediaData[] | undefined;

      // BACKGROUND: Run slow pose detection (Await here so AI waits, but UI is already updated)
      if (files && files.length > 0) {
        const result = await runBackgroundAnalysis(newMessageId, files, metadata);
        contextPoseData = result.poseData;
        contextAnalysisFrames = result.analysisFrames;
      }

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

      const standardHistory = messages.map(m => {
        let content = m.text;
        // Append document content to history if present
        if (m.media) {
          const docs = m.media.filter(a => a.type === 'document' && a.textContent);
          if (docs.length > 0) {
            const docContext = docs.map(d => `\n\n[Document Context: ${d.fileName}]\n${d.textContent}`).join('\n');
            content += docContext;
          }
        }
        return {
          role: m.sender === Sender.USER ? 'user' : 'assistant',
          content: content
        };
      });

      // Prepare current message context
      let promptText = newMessage.text;
      if (newMessage.media) {
        const docs = newMessage.media.filter(a => a.type === 'document' && a.textContent);
        if (docs.length > 0) {
          const docContext = docs.map(d => `\n\n[Document Context: ${d.fileName}]\n${d.textContent}`).join('\n');
          promptText += docContext;
        }
      }

      const aiService = getAIService(selectedModel);
      response = await aiService(
        standardHistory,
        promptText,
        contextPoseData,
        contextAnalysisFrames,
        skillContext,
        isVerifying,
        currentSessionId
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
      const rawError = error instanceof Error ? error.message : String(error);
      let errorText: string;

      const lower = rawError.toLowerCase();
      if (lower.includes('429') || lower.includes('rate') && lower.includes('limit')) {
        errorText = "⚠️ You're sending messages too fast. Please wait a moment and try again.";
      } else if (lower.includes('quota') || lower.includes('resource_exhausted') || lower.includes('402')) {
        errorText = "⚠️ The AI service has reached its daily usage limit. Please try again later or switch to a different model.";
      } else if (lower.includes('safety') || lower.includes('blocked') || lower.includes('recitation')) {
        errorText = "⚠️ The AI couldn't respond to that — it may have been flagged by safety filters. Try rephrasing your question.";
      } else if (lower.includes('empty') || lower.includes('no response') || lower.includes('no candidates')) {
        errorText = "⚠️ The AI returned an empty response. This can happen with very complex questions — please try rephrasing or breaking it into smaller parts.";
      } else if (lower.includes('api key') || lower.includes('unauthorized') || lower.includes('401')) {
        errorText = "⚠️ API authentication failed. Check the server configuration.";
      } else {
        errorText = `⚠️ Something went wrong: ${rawError}`;
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

  const handleSelectSkill = (skillName: string) => {
    handleSendMessage(`Analyze ${skillName}`, undefined, { skillName: skillName, isVerified: true });
  };

  return (
    <div className="flex h-screen bg-white dark:bg-slate-950 transition-colors overflow-x-hidden">

      <SessionSidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSwitchSession={setCurrentSessionId}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col h-full relative bg-white dark:bg-slate-950">
        {/* Header */}
        <div className="bg-white/80 dark:bg-slate-950/70 backdrop-blur-xl border-b border-slate-200/70 dark:border-slate-800/70 p-4 shrink-0 flex items-center justify-between z-30 w-full relative">
          <div className="flex items-center gap-2">
            {/* Mobile Toggle */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="md:hidden p-3 -ml-1 mr-1 text-slate-700 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 rounded-xl transition-colors"
              aria-label="Toggle History"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>

            <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200/60 dark:shadow-none ring-1 ring-indigo-500/20">
              <span className="text-2xl">🤸‍♂️</span>
            </div>
            <div>
              <h1 className="font-bold text-xl text-slate-800 dark:text-white hidden sm:block">
                SG PE Chatbot
              </h1>
              <h1 className="font-bold text-lg text-slate-800 dark:text-white sm:hidden">SG PE Chatbot</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                className="px-3 py-2 rounded-xl border border-slate-200/70 dark:border-slate-700/70 bg-white/70 dark:bg-slate-900/40 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm flex items-center gap-2 hover:bg-white dark:hover:bg-slate-900 transition-colors"
              >
                <img
                  src={`/assets/model-icons/${selectedModel === 'nemotron' ? 'nvidia' : selectedModel}.png`}
                  alt={selectedModel}
                  className="w-5 h-5 object-contain"
                />
                <span className="hidden sm:inline">
                  {selectedModel === 'nemotron' ? 'Nemotron 12B' :
                    selectedModel === 'gemini' ? 'Gemini 3 Flash' :
                      'Bedrock'}
                </span>
                <svg className={`w-3 h-3 text-slate-400 transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isModelDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsModelDropdownOpen(false)}
                  />
                  <div className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200/70 dark:border-slate-700/70 overflow-hidden z-20 flex flex-col p-1 animate-scale-in">
                    {[
                      { id: 'nemotron', name: 'Nemotron 12B', icon: 'nvidia.png' },
                      { id: 'gemini', name: 'Gemini 3 Flash', icon: 'gemini.png' },
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

            <button
              onClick={() => setIsPdfModalOpen(true)}
              className="px-3 py-2 rounded-xl border border-indigo-200/60 dark:border-indigo-900/50 bg-indigo-50/70 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-sm font-medium flex items-center gap-2 hover:bg-indigo-100/80 dark:hover:bg-indigo-800/40 transition-colors shadow-sm"
              title="Add Syllabus PDF"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Add PDF</span>
            </button>

            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-full hover:bg-slate-100/70 dark:hover:bg-slate-800/60 transition-colors text-slate-700 dark:text-slate-300"
            >
              {isDarkMode ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        {/* Main Chat Area */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 scroll-smooth bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-950">
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
                      className="px-4 py-2 bg-white/80 dark:bg-slate-900/40 border border-slate-200/70 dark:border-slate-700/70 rounded-full text-sm text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:border-indigo-200/80 dark:hover:border-indigo-800 hover:text-indigo-700 dark:hover:text-indigo-300 transition-all shadow-sm"
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
                onSelectSkill={handleSelectSkill}
                onShowAllSkills={() => setIsSkillSelectorOpen(true)}
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
        <div className="p-4 bg-transparent shrink-0 z-10">
          <div className="max-w-4xl mx-auto">
            {/* Model Selector Row */}


            <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading || isProcessing} />
          </div>
        </div>
      </div>

      <PdfUploaderModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
      />

      {/* Manual Skill Selector Modal */}
      {isSkillSelectorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[80vh] animate-scale-in">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <span className="text-2xl">🔍</span>
                Select Fundamental Skill
              </h3>
              <button
                onClick={() => setIsSkillSelectorOpen(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 overflow-y-auto grid grid-cols-1 gap-2">
              <p className="text-xs text-slate-500 mb-2 px-2 uppercase tracking-widest font-bold">Supported FMS Skills</p>
              {ALL_FMS_SKILLS.map((skill) => (
                <button
                  key={skill}
                  onClick={() => {
                    handleSelectSkill(skill);
                    setIsSkillSelectorOpen(false);
                  }}
                  className="w-full text-left px-5 py-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-slate-700 dark:text-slate-200 font-medium transition-all flex items-center justify-between group"
                >
                  <span>{skill}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              ))}
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <p className="text-sm text-slate-600 dark:text-slate-400 italic">
                Tip: If your skill isn't here, it may not be part of the current MOE PE Syllabus.
              </p>
            </div>
          </div>
        </div>
      )}

      <Analytics />
    </div>
  );
};

export default App;
