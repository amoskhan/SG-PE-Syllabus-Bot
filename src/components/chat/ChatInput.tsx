import React, { useState, useRef, useEffect } from 'react';
import CameraRecorder from '../video/CameraRecorder';
import VideoFrameSelector from '../video/VideoFrameSelector';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useAuth } from '../../hooks/useAuth';
import { getStudents } from '../../services/studentService';
import { Student, SkillMode } from '../../types';

interface ChatInputProps {
  onSendMessage: (message: string, files?: File[], metadata?: { startTime?: number; endTime?: number; skillName?: string; studentIndexNumber?: string; studentName?: string }) => void;
  isLoading: boolean;
  selectedModel?: 'gemini' | 'claude' | 'openrouter' | 'deepseek';
  skillMode?: SkillMode;
  onSkillModeChange?: (mode: SkillMode) => void;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, isLoading, selectedModel = 'gemini', skillMode = 'fms', onSkillModeChange }) => {
  const [input, setInput] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [vidStartTime, setVidStartTime] = useState<number | undefined>(undefined);
  const [vidEndTime, setVidEndTime] = useState<number | undefined>(undefined);
  const [skillName, setSkillName] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  const { user } = useAuth();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice Input Hook
  const { isListening, transcript, startListening, stopListening, resetTranscript, hasRecognitionSupport } = useSpeechRecognition();

  const [finalTranscript, setFinalTranscript] = useState('');

  // Sync Voice Transcript to Input
  useEffect(() => {
    if (transcript) {
      setInput(prev => {
        // Remove the previous interim transcript if it exists in the input
        let baseInput = prev;
        if (finalTranscript && prev.endsWith(finalTranscript)) {
          baseInput = prev.substring(0, prev.length - finalTranscript.length).trim();
        }
        
        const newInput = baseInput + (baseInput ? ' ' : '') + transcript;
        setFinalTranscript(transcript);
        return newInput;
      });
    }
  }, [transcript]);

  // Handle stop listening cleanup
  useEffect(() => {
    if (!isListening) {
      setFinalTranscript('');
      resetTranscript();
    }
  }, [isListening, resetTranscript]);

  // Fetch students when a video is attached and user is logged in
  const hasVideo = selectedFiles.some(f => f.type.startsWith('video/'));
  useEffect(() => {
    if (hasVideo && user && students.length === 0) {
      getStudents(user.id).then(setStudents);
    }
  }, [hasVideo, user]);

  // Close picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setStudentPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isListening) stopListening(); // Stop recording on send

    if ((input.trim() || selectedFiles.length > 0) && !isLoading) {
      const metadata = selectedFiles.some(f => f.type.startsWith('video/'))
        ? {
            startTime: vidStartTime,
            endTime: vidEndTime,
            skillName: skillName.trim() || undefined,
            studentIndexNumber: selectedStudent?.indexNumber || undefined,
            studentName: selectedStudent?.name || undefined,
          }
        : undefined;

      onSendMessage(input, selectedFiles.length > 0 ? selectedFiles : undefined, metadata);

      // Cleanup
      setInput('');
      setSelectedFiles([]);
      setSkillName('');
      setSelectedStudent(null);
      setVidStartTime(undefined);
      setVidEndTime(undefined);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    const validFiles = files.filter((f: File) =>
      f.type.startsWith('image/') ||
      f.type.startsWith('video/') ||
      f.name.endsWith('.docx') ||
      f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    setSelectedFiles(prev => [...prev, ...validFiles]);
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleVideoRecorded = (videoBlob: Blob) => {
    // Convert blob to File
    const file = new File([videoBlob], `recording-${Date.now()}.webm`, {
      type: 'video/webm'
    });
    setSelectedFiles(prev => [...prev, file]);
    setShowCamera(false);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleRangeChange = (start: number, end: number) => {
    setVidStartTime(start);
    setVidEndTime(end);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="p-4 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl max-w-5xl mx-auto w-full rounded-[24px] shadow-[0_20px_50px_rgba(15,23,42,0.12)] border border-slate-200/50 dark:border-zinc-800/80 transition-all duration-300 flex flex-col gap-3"
      >
        {/* File Preview Area */}
        {selectedFiles.length > 0 && (
          <div className="space-y-3.5">
            <div className="flex flex-wrap gap-2.5">
              {selectedFiles.map((file, index) => (
                <div key={index} className="relative group">
                  <div className="w-16 h-16 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 flex items-center justify-center overflow-hidden shadow-2xs">
                    {file.type.startsWith('image/') ? (
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    ) : file.type.startsWith('video/') ? (
                      <div className="text-center flex flex-col items-center">
                        <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span className="text-[8px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-1">Video</span>
                      </div>
                    ) : (
                      <div className="text-center flex flex-col items-center">
                        <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="text-[8px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-1">Doc</span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(index)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs transition-colors shadow-sm z-20 cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Video Tools Drawer */}
            {hasVideo && (
              <div className="bg-slate-50/75 dark:bg-zinc-950/40 rounded-2xl p-4 border border-slate-200/50 dark:border-zinc-800/80 min-w-0 overflow-hidden animate-fade-in-up">
                <div className="flex items-center gap-2 mb-3.5 pb-2 border-b border-slate-200/30 dark:border-zinc-800/30">
                  <span className="text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">AI Analysis Settings</span>
                </div>

                {/* 0. Student Picker */}
                {user && (
                  <div className="mb-3.5" ref={pickerRef}>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1.5 uppercase tracking-wider">
                      Student (Optional — saves to progress record)
                    </label>

                    {selectedStudent ? (
                      <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-indigo-150 dark:border-indigo-900/40 bg-indigo-50/30 dark:bg-indigo-950/10 shadow-3xs">
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{selectedStudent.name}</span>
                          <span className="ml-2 text-[10px] font-semibold text-indigo-400 dark:text-indigo-500">#{selectedStudent.indexNumber}</span>
                          {selectedStudent.class && <span className="ml-1.5 text-[10px] text-slate-400 dark:text-slate-500">· Class {selectedStudent.class}</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedStudent(null)}
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors flex-shrink-0 cursor-pointer"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setStudentPickerOpen(o => !o)}
                          className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-650 dark:text-slate-350 hover:border-indigo-500 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all duration-200 cursor-pointer shadow-2xs"
                        >
                          <span>{students.length === 0 ? 'No students yet — add from Dashboard' : 'Select a student…'}</span>
                          <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${studentPickerOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {studentPickerOpen && students.length > 0 && (
                          <div className="absolute z-50 top-full mt-1.5 w-full bg-white dark:bg-zinc-800 border border-slate-200/60 dark:border-zinc-700 rounded-2xl shadow-lg overflow-hidden animate-scale-in">
                            <div className="p-2 border-b border-slate-100 dark:border-zinc-700/60">
                              <input
                                autoFocus
                                type="text"
                                value={studentSearch}
                                onChange={e => setStudentSearch(e.target.value)}
                                placeholder="Search by name or index…"
                                className="w-full px-2.5 py-2 text-xs bg-slate-50 dark:bg-zinc-950/30 rounded-lg border-0 outline-none text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                              />
                            </div>
                            <div className="max-h-48 overflow-y-auto p-1.5 space-y-0.5 scrollbar-thin">
                              {students
                                .filter(s =>
                                  !studentSearch ||
                                  s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
                                  s.indexNumber.includes(studentSearch)
                                )
                                .map(s => (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => { setSelectedStudent(s); setStudentPickerOpen(false); setStudentSearch(''); }}
                                    className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs hover:bg-slate-50 dark:hover:bg-zinc-800/80 transition-colors text-left cursor-pointer"
                                  >
                                    <span className="font-semibold text-slate-800 dark:text-slate-200">{s.name}</span>
                                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                      #{s.indexNumber}{s.class ? ` · ${s.class}` : ''}
                                    </span>
                                  </button>
                                ))
                              }
                              {students.filter(s =>
                                !studentSearch ||
                                s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
                                s.indexNumber.includes(studentSearch)
                              ).length === 0 && (
                                <p className="px-3.5 py-3 text-xs text-slate-400 text-center">No match found.</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 1. Skill Name Input */}
                <div className="mb-4">
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1.5 uppercase tracking-wider">Target Skill (Optional)</label>
                  <input
                    type="text"
                    value={skillName}
                    onChange={(e) => setSkillName(e.target.value)}
                    placeholder="e.g. Underhand Throw (Skip to let AI guess)"
                    className="w-full px-3.5 py-2.5 text-xs font-semibold border border-slate-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 text-slate-900 dark:text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none placeholder-slate-400 dark:placeholder-slate-500 shadow-2xs"
                  />
                  <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1.5 font-medium ml-1">If provided, AI will skip "Guessing" and grade specifically for this skill.</p>
                </div>

                {/* 2. Frame Selector for the FIRST video found */}
                {selectedFiles.find(f => f.type.startsWith('video/')) && (
                  <div className="mt-4 pt-4 border-t border-slate-200/30 dark:border-zinc-800/30">
                    <VideoFrameSelector
                      file={selectedFiles.find(f => f.type.startsWith('video/'))!}
                      onRangeChange={handleRangeChange}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Mode Switcher Segmented Control */}
        <div className="flex self-start bg-slate-100/80 dark:bg-zinc-950/60 p-1 rounded-xl border border-slate-200/30 dark:border-zinc-850/30">
          {([['fms', 'FMS Skills'], ['gymnastics', 'Gymnastics']] as const).map(([mode, label]) => {
            const isSelected = skillMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onSkillModeChange?.(mode)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {mode === 'fms' ? '🤸 ' : '🧘 '}
                {label}
              </button>
            );
          })}
        </div>

        {/* Input Area - RESPONSIVE LAYOUT */}
        <div className="flex flex-col gap-1 w-full relative">

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Text Input */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? "Listening to your voice..." : "Message SG PE Syllabus Bot..."}
            disabled={isLoading}
            className="w-full px-1 pt-1 bg-transparent text-slate-900 dark:text-white resize-none focus:outline-none disabled:opacity-50 min-h-[56px] max-h-[220px] placeholder-slate-450 dark:placeholder-slate-400 [&::-webkit-scrollbar]:hidden text-[15px] md:text-[16px] leading-relaxed"
            rows={1}
          />

          <div className="flex items-center justify-between gap-3 text-[10px] font-medium text-slate-400 dark:text-slate-500 px-1 mt-1">
            <span>Shift + Enter for a new line</span>
            <span className="flex items-center gap-1.5">
              {isListening && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
              {isListening ? 'Voice input active' : 'Ready for text, video, or image'}
            </span>
          </div>

          {/* Actions Bar */}
          <div className="flex items-center justify-between w-full pt-2 border-t border-slate-200/10 dark:border-zinc-800/10 mt-2">

            {/* Left Tools Group (Attach, Camera, Voice) */}
            <div className="flex items-center gap-1">

              {/* Attachment Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="p-2.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-zinc-800/80 rounded-xl transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                title="Upload image, document or video"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>

              {/* Camera Button */}
              <button
                type="button"
                onClick={() => setShowCamera(true)}
                disabled={isLoading}
                className="p-2.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-zinc-800/80 rounded-xl transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                title="Record video"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>

              {/* Voice Input Button */}
              <button
                type="button"
                onClick={() => {
                  if (!hasRecognitionSupport) {
                    alert("Voice input is not supported in this browser. Please use Chrome, Edge, or Safari.");
                    return;
                  }
                  isListening ? stopListening() : startListening();
                }}
                disabled={isLoading}
                className={`p-2.5 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${isListening
                  ? 'text-red-500 bg-red-50 dark:bg-red-950/20 shadow-xs animate-pulse'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-zinc-800/80'
                  }`}
                title={isListening ? "Stop listening" : "Start voice input"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill={isListening ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.85} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                </svg>
              </button>
            </div>

            {/* Model Branding & SEND Button */}
            <div className="flex items-center gap-3">
              {/* Model Chip (Minimalist) */}
              <div className="hidden xs:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100/80 dark:bg-zinc-950/60 border border-slate-200/50 dark:border-zinc-850/30 transition-colors backdrop-blur-sm select-none">
                <img
                  src={`/assets/model-icons/${selectedModel === 'openrouter' ? 'qwen' : selectedModel === 'claude' ? 'claude' : selectedModel === 'deepseek' ? 'deepseek' : selectedModel}.png`}
                  alt={selectedModel}
                  className="w-3.5 h-3.5 object-contain opacity-80"
                />
                <span className="text-[9px] font-extrabold text-slate-500 dark:text-slate-450 uppercase tracking-widest">
                  {selectedModel === 'gemini' ? 'Gemini' :
                   selectedModel === 'openrouter' ? 'OpenRouter' :
                   selectedModel === 'deepseek' ? 'DeepSeek' :
                   'Claude'}
                </span>
              </div>

              <button
                type="submit"
                disabled={(!input.trim() && selectedFiles.length === 0) || isLoading}
                className={`p-2 rounded-xl transition-all duration-200 flex items-center justify-center border cursor-pointer ${(!input.trim() && selectedFiles.length === 0) || isLoading
                    ? 'text-slate-300 dark:text-slate-650 bg-transparent border-transparent cursor-not-allowed'
                    : 'text-white bg-gradient-to-br from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 border-indigo-600 dark:border-indigo-600 shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-95'
                  }`}
                style={{ width: '38px', height: '38px' }}
              >
                {isLoading ? (
                  <svg className="w-5 h-5 animate-spin text-current" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-5 h-5 transform -rotate-90 text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                )}
              </button>
            </div>

          </div>
        </div>
      </form>

      {/* Camera Recorder Modal */}
      {showCamera && (
        <CameraRecorder
          onVideoRecorded={handleVideoRecorded}
          onClose={() => setShowCamera(false)}
        />
      )}
    </>
  );
};

export default ChatInput;