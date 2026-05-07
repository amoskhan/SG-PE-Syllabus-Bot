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
  selectedModel?: 'gemini' | 'claude' | 'openrouter';
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
        className="p-2 md:p-3 bg-slate-50 dark:bg-zinc-800/80 max-w-3xl mx-auto w-full rounded-2xl shadow-sm border border-slate-200 dark:border-zinc-700 transition-colors duration-200 flex flex-col"
      >
        {/* File Preview Area */}
        {selectedFiles.length > 0 && (
          <div className="mb-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              {selectedFiles.map((file, index) => (
                <div key={index} className="relative group">
                  <div className="w-16 h-16 rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                    {file.type.startsWith('image/') ? (
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    ) : file.type.startsWith('video/') ? (
                      <div className="text-center">
                        <svg className="w-6 h-6 text-slate-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span className="text-[8px] text-slate-400">Video</span>
                      </div>
                    ) : (
                      <div className="text-center">
                        <svg className="w-6 h-6 text-blue-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="text-[8px] text-slate-400">Doc</span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(index)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-colors z-20"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Video Tools: Range Selector & Skill Name */}
            {hasVideo && (
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700 min-w-0 overflow-hidden">
                {/* 0. Student Picker */}
                {user && (
                  <div className="mb-3" ref={pickerRef}>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">
                      Student (Optional — saves to progress record)
                    </label>

                    {selectedStudent ? (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-slate-800 dark:text-white">{selectedStudent.name}</span>
                          <span className="ml-2 text-xs text-slate-400">#{selectedStudent.indexNumber}</span>
                          {selectedStudent.class && <span className="ml-1 text-xs text-slate-400">· {selectedStudent.class}</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedStudent(null)}
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors flex-shrink-0"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setStudentPickerOpen(o => !o)}
                          className="w-full flex items-center justify-between px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                        >
                          <span>{students.length === 0 ? 'No students yet — add from Dashboard' : 'Select a student…'}</span>
                          <svg className={`w-4 h-4 transition-transform ${studentPickerOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {studentPickerOpen && students.length > 0 && (
                          <div className="absolute z-50 top-full mt-1 w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden">
                            <div className="p-2 border-b border-slate-100 dark:border-zinc-700">
                              <input
                                autoFocus
                                type="text"
                                value={studentSearch}
                                onChange={e => setStudentSearch(e.target.value)}
                                placeholder="Search by name or index…"
                                className="w-full px-2 py-1.5 text-sm bg-slate-50 dark:bg-zinc-700 rounded border-0 outline-none text-slate-800 dark:text-white placeholder-slate-400"
                              />
                            </div>
                            <div className="max-h-48 overflow-y-auto">
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
                                    className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors text-left"
                                  >
                                    <span className="font-medium text-slate-800 dark:text-white">{s.name}</span>
                                    <span className="text-xs text-slate-400">
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
                                <p className="px-3 py-3 text-xs text-slate-400 text-center">No match found.</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 1. Skill Name Input */}
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Target Skill (Optional)</label>
                  <input
                    type="text"
                    value={skillName}
                    onChange={(e) => setSkillName(e.target.value)}
                    placeholder="e.g. Underhand Throw (Skip to let AI guess)"
                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none placeholder-slate-400 dark:placeholder-slate-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">If provided, AI will skip "Guessing" and grade specifically for this skill.</p>
                </div>

                {/* 2. Frame Selector for the FIRST video found */}
                {selectedFiles.find(f => f.type.startsWith('video/')) && (
                  <VideoFrameSelector
                    file={selectedFiles.find(f => f.type.startsWith('video/'))!}
                    onRangeChange={handleRangeChange}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Mode Switcher Toggle */}
        <div className="flex items-center gap-1 mb-2">
          {([['fms', 'FMS Skills'], ['gymnastics', 'Gymnastics']] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => onSkillModeChange?.(mode)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors border ${
                skillMode === mode
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-transparent text-slate-500 dark:text-slate-400 border-slate-300 dark:border-zinc-600 hover:border-indigo-400 dark:hover:border-indigo-500'
              }`}
            >
              {label}
            </button>
          ))}
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
            placeholder={isListening ? "Listening..." : "Message SG PE Syllabus..."}
            disabled={isLoading}
            className="w-full px-2 pt-2 bg-transparent text-slate-900 dark:text-white resize-none focus:outline-none disabled:opacity-50 min-h-[44px] max-h-[200px] placeholder-slate-500 dark:placeholder-slate-400 [&::-webkit-scrollbar]:hidden text-[15px] leading-relaxed"
            rows={1}
          />

          {/* Actions Bar */}
          <div className="flex items-center justify-between w-full pt-1">

            {/* Left Tools Group (Attach, Camera, Voice) */}
            <div className="flex items-center gap-1">

              {/* Attachment Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-zinc-700/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Upload image or video"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>

              {/* Camera Button */}
              <button
                type="button"
                onClick={() => setShowCamera(true)}
                disabled={isLoading}
                className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-zinc-700/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Record video"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
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
                className={`p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isListening
                  ? 'text-red-500 bg-red-50 dark:bg-red-900/20'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-zinc-700/50'
                  }`}
                title={isListening ? "Stop listening" : "Start voice input"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill={isListening ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                </svg>
              </button>
            </div>

            {/* Model Branding & SEND Button */}
            <div className="flex items-center gap-2">
              {/* Model Chip (Minimalist) */}
              <div className="hidden xs:flex items-center gap-1.5 px-2 py-1.5 rounded-full bg-slate-100 dark:bg-zinc-800/50 border border-slate-200/50 dark:border-zinc-700/50 transition-colors">
                <img
                  src={`/assets/model-icons/${selectedModel === 'openrouter' ? 'qwen' : selectedModel === 'claude' ? 'claude' : selectedModel}.png`}
                  alt={selectedModel}
                  className="w-3.5 h-3.5 object-contain opacity-80"
                />
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {selectedModel === 'gemini' ? 'Gemini' :
                   selectedModel === 'openrouter' ? 'OpenRouter' :
                   'Claude'}
                </span>
              </div>

              <button
                type="submit"
                disabled={(!input.trim() && selectedFiles.length === 0) || isLoading}
                className={`p-1.5 rounded-lg transition-all duration-200 flex items-center justify-center border ${(!input.trim() && selectedFiles.length === 0) || isLoading
                    ? 'text-slate-300 dark:text-slate-600 bg-transparent border-transparent'
                    : 'text-white bg-slate-900 border-slate-900 dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900 hover:opacity-90 shadow-sm'
                  }`}
                style={{ width: '36px', height: '36px' }}
              >
                {isLoading ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-5 h-5 transform -rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
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