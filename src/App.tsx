
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
import RubricBuilderModal from './components/admin/RubricBuilderModal';
import { ALL_FMS_SKILLS } from './data/fundamentalMovementSkillsData';
import { useAuth } from './hooks/useAuth';
import { supabase } from './services/db/supabaseClient';

const App: React.FC = () => {
  const { user, teacherProfile, signInWithGoogle, signOut, updateTeacherProfile } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const STORAGE_KEY = 'sg_pe_syllabus_bot_history_v2'; // Changed key for new schema

  // Maps temp numeric IDs -> real Supabase UUIDs, so pending syncs can be flushed
  const tempToRealIdRef = React.useRef<Record<string, string>>({});
  // Queue of sessions that need to be synced once their real UUID is known
  const pendingSyncRef = React.useRef<ChatSession[]>([]);

  // DEFAULT WELCOME MESSAGE
  const getWelcomeMessage = (): Message => ({
    id: 'welcome-' + Date.now(),
    text: "Hello! I am your **Singapore PE Syllabus Bot**. \n\nI can help you with:\n1. **Syllabus Questions**: Ask about the 2024 PE Syllabus, learning outcomes, or goals.\n2. **AI Movement Analysis**: Upload a video or use your camera to record a skill (e.g., Overhand Throw). I will analyze your form frame-by-frame! 🏃‍♂️📹\n\nTry asking a question or uploading a video!",
    sender: Sender.BOT,
    timestamp: new Date(),
  });

  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed)) throw new Error('Stored sessions is not an array');
        return parsed.map((s: any) => {
          const createdAt = new Date(s.createdAt);
          const updatedAt = new Date(s.updatedAt);
          return {
            ...s,
            createdAt: isNaN(createdAt.getTime()) ? new Date() : createdAt,
            updatedAt: isNaN(updatedAt.getTime()) ? new Date() : updatedAt,
            messages: Array.isArray(s.messages)
              ? s.messages.map((m: any) => {
                  const ts = new Date(m.timestamp);
                  return { ...m, timestamp: isNaN(ts.getTime()) ? new Date() : ts };
                })
              : []
          };
        });
      }
    } catch (e) {
      console.error("Failed to load local sessions:", e);
    }
    const initialId = Date.now().toString();
    return [{
      id: initialId,
      title: 'New Chat',
      messages: [getWelcomeMessage()],
      createdAt: new Date(),
      updatedAt: new Date()
    }];
  });

  // Track the most recent sessions state to allow synchronous reading inside helpers
  const sessionsRef = React.useRef<ChatSession[]>(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);


  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    if (sessions.length > 0) return sessions[0].id;
    return '';
  });

  // 2. Fetch from Supabase on Login and handle Migration
  useEffect(() => {
    if (!user) return;

    const fetchSessions = async () => {
      try {
        const { data, error } = await supabase
          .from('chat_sessions')
          .select('*')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false });

        if (error) {
           console.error("Error fetching sessions from Supabase", error);
           return;
        }

        if (data && data.length > 0) {
          const cloudSessions: ChatSession[] = data.map(s => ({
            id: s.id,
            title: s.title,
            messages: (s.messages as any[]).map(m => ({
               ...m,
               timestamp: new Date(m.timestamp)
            })),
            createdAt: new Date(s.created_at),
            updatedAt: new Date(s.updated_at)
          }));

          // Merge: keep any local sessions that are NOT yet in the cloud (temp IDs)
          // These are sessions the user started before the cloud fetch returned.
          setSessions(prev => {
            const cloudIds = new Set(cloudSessions.map(s => s.id));
            // Local sessions without a cloud counterpart (still have temp numeric IDs)
            const unseenLocal = prev.filter(s => !cloudIds.has(s.id) && !s.id.includes('-'));
            return [...unseenLocal, ...cloudSessions];
          });
        } else {
          // No cloud data – migrate from localStorage
          const localSaved = localStorage.getItem(STORAGE_KEY);
          if (localSaved) {
            try {
              const parsed: any[] = JSON.parse(localSaved);
              if (parsed.length > 0) {
                console.log("Migrating local history to Supabase...");
                for (const sess of parsed) {
                  await supabase.from('chat_sessions').insert({
                    user_id: user.id,
                    title: sess.title,
                    messages: sess.messages,
                    created_at: sess.createdAt,
                    updated_at: sess.updatedAt
                  });
                }
                fetchSessions();
              }
            } catch (e) {
              console.error("Migration failed", e);
            }
          }
        }
      } catch (err) {
        console.error("Unexpected error in fetchSessions", err);
      }
    };

    fetchSessions();
  }, [user]);

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
  const [isRubricBuilderOpen, setIsRubricBuilderOpen] = useState(false);

  // Ref to always have the latest currentSessionId in async callbacks
  const currentSessionIdRef = React.useRef(currentSessionId);
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // Sync Current Session ID if sessions change
  useEffect(() => {
    if (!sessions.find(s => s.id === currentSessionId) && sessions.length > 0) {
      setCurrentSessionId(sessions[0].id);
    } else if (sessions.length === 0) {
      handleNewSession();
    }
  }, [sessions, currentSessionId]);

  // Persistence to LocalStorage (Instant Feedback)
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
  const handleNewSession = async () => {
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
    if (window.innerWidth < 768) setIsSidebarOpen(false);

    // Sync to Supabase and swap temp ID for real UUID
    if (user) {
      const { data, error } = await supabase.from('chat_sessions').insert({
        user_id: user.id,
        title: newSession.title,
        messages: newSession.messages
      }).select().single();

      if (!error && data) {
        const realId = data.id;
        // Record the mapping so pending syncs can use the real ID
        tempToRealIdRef.current[newId] = realId;

        // Swap temp ID for real UUID in state and ref
        setSessions(prev => prev.map(s => s.id === newId ? { ...s, id: realId } : s));
        if (currentSessionIdRef.current === newId) {
          currentSessionIdRef.current = realId;
          setCurrentSessionId(realId);
        }

        // Flush any messages that were queued while waiting for the real UUID
        const queued = pendingSyncRef.current.filter(s => s.id === newId);
        pendingSyncRef.current = pendingSyncRef.current.filter(s => s.id !== newId);
        for (const pending of queued) {
          const cloudMessages = pending.messages.map(m => ({
            ...m,
            media: m.media?.map(med => ({ ...med, data: '', thumbnailData: undefined })),
            analysisFrames: []
          }));
          await supabase.from('chat_sessions').update({
            title: pending.title,
            messages: cloudMessages,
            updated_at: new Date().toISOString()
          }).eq('id', realId);
        }
      }
    }
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this chat?")) {
      const remaining = sessions.filter(s => s.id !== sessionId);
      setSessions(remaining);
      
      if (user && sessionId.includes('-')) { // UUIDs have hyphens, local IDs are numeric Date.now()
         await supabase.from('chat_sessions').delete().eq('id', sessionId);
      }
    }
  };

  const syncSessionToSupabase = async (session: ChatSession) => {
    if (!user) return;

    // Resolve temp IDs to real UUIDs if the mapping is known
    const resolvedId = tempToRealIdRef.current[session.id] || session.id;

    if (!resolvedId.includes('-')) {
      // Real UUID not yet available – queue this sync to flush after Supabase responds
      console.log(`⏳ Queuing sync for temp session ${session.id} until real UUID is assigned`);
      // Replace any existing queued entry for this session with the latest state
      pendingSyncRef.current = [
        ...pendingSyncRef.current.filter(s => s.id !== session.id),
        session
      ];
      return;
    }

    // Strip heavy data for cloud storage
    const cloudMessages = session.messages.map(m => ({
      ...m,
      media: m.media?.map(med => ({ ...med, data: '', thumbnailData: undefined })),
      analysisFrames: []
    }));

    const { error } = await supabase.from('chat_sessions').update({
       title: session.title,
       messages: cloudMessages,
       updated_at: new Date().toISOString()
    }).eq('id', resolvedId);

    if (error) {
      console.error("Failed to sync session to Supabase:", error);
    }
  };

  // A clean utility to safely update a session's state and trigger its associated sync side-effect 
  // without coupling it to React's internal asynchronous rendering lifecycle.
  const updateSessionAndSync = (
    targetSessionId: string,
    updater: (session: ChatSession) => ChatSession
  ) => {
    // 1. Resolve to permanent UUID if a mapping exists (to handle temp -> real ID transitions)
    const resolvedId = tempToRealIdRef.current[targetSessionId] || targetSessionId;

    // 2. Read synchronously from the latest stored ref (bypassing stale closures)
    const currentSessions = sessionsRef.current;
    const sessionToUpdate = currentSessions.find(s => s.id === resolvedId);
    
    if (!sessionToUpdate) return;
    
    // 3. Compute the new state strictly once
    const updatedSession = updater(sessionToUpdate);
    
    // 4. Update the React UI
    setSessions(prev => prev.map(s => s.id === resolvedId ? updatedSession : s));
    
    // 5. Fire external side-effect cleanly (isolated from React's state setter internals)
    syncSessionToSupabase(updatedSession);
  };

  const handleUpdateCurrentSession = (updatedMessages: Message[], newTitle?: string) => {
    updateSessionAndSync(currentSessionIdRef.current, session => ({
      ...session,
      messages: updatedMessages,
      title: newTitle || session.title,
      updatedAt: new Date()
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
    originatingSessionId: string,
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
      updateSessionAndSync(originatingSessionId, session => ({
        ...session,
        messages: session.messages.map(m => 
          m.id === messageId ? { ...m, poseData: poseData, analysisFrames: debugFrames } : m
        )
      }));


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
    // LOCK TARGET SESSION ID context to heavily prevent "chat-swapping" side effects
    const originatingSessionId = currentSessionIdRef.current;
    
    let isVerifying = metadata?.isVerified;
    let skillContext = metadata?.skillName;

    // Get fresh messages from state (not from closure)
    const currentSessionNow = sessionsRef.current.find(s => s.id === originatingSessionId);
    const currentMessages = currentSessionNow?.messages || [];

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
      const lastMsg = currentMessages[currentMessages.length - 1];
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
      media: mediaAttachments,
      hasMedia: !!(mediaAttachments && mediaAttachments.length > 0) || currentMessages.some(m => m.media && m.media.length > 0)
    };

    // UPDATE STATE: Optimistic Update (Immediate)
    const optimisticMessages = [...currentMessages, newMessage];

    // Auto-Title Logic on First Message
    let newTitle: string | undefined = undefined;
    if (currentMessages.length <= 1) { // 1 because "Welcome" message is already there
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

    updateSessionAndSync(originatingSessionId, session => ({
      ...session,
      messages: optimisticMessages,
      title: newTitle || session.title,
      updatedAt: new Date()
    }));

    setIsLoading(true);

    try {
      let response;
      let contextPoseData: PoseData[] | undefined;
      let contextAnalysisFrames: MediaData[] | undefined;

      // BACKGROUND: Run slow pose detection (Await here so AI waits, but UI is already updated)
      if (files && files.length > 0) {
        const result = await runBackgroundAnalysis(originatingSessionId, newMessageId, files, metadata);
        contextPoseData = result.poseData;
        contextAnalysisFrames = result.analysisFrames;
      }

      if (!contextPoseData || !contextAnalysisFrames) {
        for (let i = currentMessages.length - 1; i >= 0; i--) {
          if (!contextPoseData && currentMessages[i].poseData && currentMessages[i].poseData!.length > 0) {
            contextPoseData = currentMessages[i].poseData;
          }
          if (!contextAnalysisFrames) {
            if (currentMessages[i].analysisFrames && currentMessages[i].analysisFrames!.length > 0) {
              contextAnalysisFrames = currentMessages[i].analysisFrames!.map(f => ({
                mimeType: f.match(/^data:([^;]+);/)?.[1] || 'image/jpeg',
                data: f
              }));
            }
            else if (currentMessages[i].media && currentMessages[i].media!.length > 0) {
              const images = currentMessages[i].media!.filter(m => m.type === 'image');
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

      const standardHistory = currentMessages.map(m => {
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
        currentSessionIdRef.current,
        teacherProfile
      );

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response.text,
        sender: Sender.BOT,
        timestamp: new Date(),
        groundingChunks: selectedModel === 'gemini' ? response.groundingChunks : undefined,
        referenceImageURI: response.referenceImageURI,
        tokenUsage: response.tokenUsage,
        modelId: selectedModel,
        // hasMedia is true if: user uploaded media OR we have pose data/analysis frames
        hasMedia: newMessage.hasMedia || !!(contextPoseData && contextPoseData.length > 0)
      };

      const skillMatch = response.text.match(/(?:I believe this is a|this looks like a|I have detected a|Performance Analysis for) (?:\*\*|)?([^*:\n]+)(?:\*\*|:)?/i);
      const detectedSkill = skillMatch ? skillMatch[1].trim() : undefined;

      // UPDATE STATE: Bot Response
      updateSessionAndSync(originatingSessionId, session => {
        const userMsgIndex = session.messages.findIndex(m => m.id === newMessageId);
        let finalMessages = session.messages;

        if (userMsgIndex !== -1 && detectedSkill) {
          finalMessages = session.messages.map((m, idx) =>
            idx === userMsgIndex ? { ...m, predictedSkill: detectedSkill } : m
          );
        }

        return {
          ...session,
          messages: [...finalMessages, botMessage],
          updatedAt: new Date()
        };
      });


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
      
      updateSessionAndSync(originatingSessionId, session => ({
        ...session,
        messages: [...session.messages, errorMessage],
        updatedAt: new Date()
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
    // Check if the current session has any media uploaded
    const currentSession = sessions.find(s => s.id === currentSessionId);
    const hasMedia = currentSession?.messages.some(m => m.media && m.media.length > 0);

    if (hasMedia) {
      handleSendMessage(`Analyze ${skillName}`, undefined, { skillName: skillName, isVerified: true });
    } else {
      handleSendMessage(skillName);
    }
  };

  return (
    <div className="flex h-screen bg-white dark:bg-slate-950 transition-colors overflow-x-hidden">

      <SessionSidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSwitchSession={setCurrentSessionId}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={(id, title) => {
          const session = sessions.find(s => s.id === id);
          if (session) {
            handleUpdateCurrentSession(session.messages, title);
          }
        }}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        user={user}
        teacherProfile={teacherProfile}
        signInWithGoogle={signInWithGoogle}
        signOut={signOut}
        onOpenSettings={() => setIsRubricBuilderOpen(true)}
      />

      <div className="flex-1 flex flex-col h-full relative bg-white dark:bg-slate-950">
        
        {/* Minimalist Floating Top Bar */}
        <div className="absolute top-0 left-0 right-0 z-30 p-3 md:p-4 flex items-center justify-between pointer-events-none">
          {/* Left: Mobile Sidebar Toggle */}
          <div className="pointer-events-auto">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="md:hidden p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              aria-label="Toggle Menu"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
          </div>

          {/* Right: Actions Cluster */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              onClick={() => setIsPdfModalOpen(true)}
              className="px-3 py-1.5 rounded-lg border border-slate-200/60 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur text-slate-600 dark:text-slate-300 text-sm font-medium flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors shadow-sm"
              title="Add Syllabus PDF"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Add PDF</span>
            </button>

            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-1.5 rounded-lg border border-slate-200/60 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-slate-600 dark:text-slate-300 shadow-sm"
            >
              {isDarkMode ? '☀️' : '🌙'}
            </button>

            <div className="relative">
              <button
                onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                className="px-3 py-1.5 rounded-lg border border-slate-200/60 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <img
                  src={`/assets/model-icons/${selectedModel === 'nemotron' ? 'nvidia' : selectedModel}.png`}
                  alt={selectedModel}
                  className="w-4 h-4 object-contain"
                />
                <span className="hidden sm:inline">
                  {selectedModel === 'nemotron' ? 'Nemotron' :
                    selectedModel === 'gemini' ? 'Gemini 3 Flash' :
                      'Bedrock'}
                </span>
                <svg className={`w-3 h-3 text-slate-400 transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isModelDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsModelDropdownOpen(false)} />
                  <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-zinc-900 rounded-xl shadow-lg border border-slate-200 dark:border-zinc-800 overflow-hidden z-20 flex flex-col p-1">
                    {[
                      { id: 'nemotron', name: 'Nemotron', icon: 'nvidia.png' },
                      { id: 'gemini', name: 'Gemini 3 Flash', icon: 'gemini.png' },
                      { id: 'bedrock', name: 'Bedrock', icon: 'bedrock.png' }
                    ].map((model) => (
                      <button
                        key={model.id}
                        onClick={() => {
                          setSelectedModel(model.id as any);
                          setIsModelDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 ${selectedModel === model.id
                          ? 'bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-slate-100'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-800/50'
                          }`}
                      >
                        <img src={`/assets/model-icons/${model.icon}`} alt={model.name} className="w-4 h-4 object-contain" />
                        {model.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Main Chat Area */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 scroll-smooth bg-white dark:bg-zinc-900 pt-16 md:pt-6">
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
                  updateSessionAndSync(currentSessionIdRef.current, session => ({
                    ...session,
                    messages: session.messages.map(m => m.id === updatedMsg.id ? updatedMsg : m),
                    updatedAt: new Date()
                  }));
                }}
                onAnalyze={handleAnalyzeConfirm}
                onSelectSkill={handleSelectSkill}
                onShowAllSkills={() => setIsSkillSelectorOpen(true)}
                disabled={isLoading || isProcessing}
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


            <ChatInput 
              onSendMessage={handleSendMessage} 
              isLoading={isLoading || isProcessing} 
              selectedModel={selectedModel}
            />
          </div>
        </div>
      </div>

      <PdfUploaderModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
      />

      <RubricBuilderModal
        isOpen={isRubricBuilderOpen}
        onClose={() => setIsRubricBuilderOpen(false)}
        profile={teacherProfile}
        onSave={(updatedProfile) => updateTeacherProfile(updatedProfile)}
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
