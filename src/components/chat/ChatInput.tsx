import React, { useState, useRef, useEffect } from 'react';
import CameraRecorder from '../video/CameraRecorder';
import VideoFrameSelector from '../video/VideoFrameSelector';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';

interface ChatInputProps {
  onSendMessage: (message: string, files?: File[], metadata?: { startTime?: number; endTime?: number; skillName?: string }) => void;
  isLoading: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, isLoading }) => {
  const [input, setInput] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [vidStartTime, setVidStartTime] = useState<number | undefined>(undefined);
  const [vidEndTime, setVidEndTime] = useState<number | undefined>(undefined);
  const [skillName, setSkillName] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice Input Hook
  const { isListening, transcript, startListening, stopListening, resetTranscript, hasRecognitionSupport } = useSpeechRecognition();

  // Sync Voice Transcript to Input
  useEffect(() => {
    if (transcript) {
      setInput(prev => {
        // Avoid duplicate appending if the user stopped speaking briefly
        if (prev.endsWith(transcript)) return prev;
        return prev + (prev && !prev.endsWith(' ') ? ' ' : '') + transcript;
      });
      resetTranscript(); // Clear hook buffer so next sentence appends correctly
    }
  }, [transcript, resetTranscript]);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isListening) stopListening(); // Stop recording on send

    if ((input.trim() || selectedFiles.length > 0) && !isLoading) {
      const metadata = selectedFiles.some(f => f.type.startsWith('video/'))
        ? { startTime: vidStartTime, endTime: vidEndTime, skillName: skillName.trim() || undefined }
        : undefined;

      onSendMessage(input, selectedFiles.length > 0 ? selectedFiles : undefined, metadata);

      // Cleanup
      setInput('');
      setSelectedFiles([]);
      setSkillName('');
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
      f.type.startsWith('image/') || f.type.startsWith('video/')
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

  const hasVideo = selectedFiles.some(f => f.type.startsWith('video/'));

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 max-w-4xl mx-auto w-full sticky bottom-0 transition-colors duration-200"
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
                    ) : (
                      <div className="text-center">
                        <svg className="w-6 h-6 text-slate-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span className="text-[8px] text-slate-400">Video</span>
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
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
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

        {/* Input Area */}
        <div className="flex items-end gap-2">
          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Camera Button */}
          <button
            type="button"
            onClick={() => setShowCamera(true)}
            disabled={isLoading}
            className="flex-shrink-0 p-2.5 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed hidden md:block"
            title="Record video"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>

          {/* Attachment Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="flex-shrink-0 p-2.5 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Upload image or video"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>

          {/* Voice Input Button - NEW */}
          {hasRecognitionSupport && (
            <button
              type="button"
              onClick={isListening ? stopListening : startListening}
              disabled={isLoading}
              className={`flex-shrink-0 p-2.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${isListening
                ? 'text-white bg-red-500 animate-pulse shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30'
                }`}
              title={isListening ? "Stop listening" : "Start voice input"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill={isListening ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
            </button>
          )}

          {/* Text Input */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? "Listening..." : "Ask about PE syllabus or upload..."}
            disabled={isLoading}
            className="flex-1 px-4 py-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:bg-slate-50 disabled:cursor-not-allowed min-h-[48px] max-h-[120px] placeholder-slate-400 dark:placeholder-slate-500 [&::-webkit-scrollbar]:hidden"
            rows={1}
          />

          {/* Submit Button */}
          <button
            type="submit"
            disabled={(!input.trim() && selectedFiles.length === 0) || isLoading}
            className="flex-shrink-0 p-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-600 hover:to-red-700 disabled:from-slate-300 disabled:to-slate-600 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg"
          >
            {isLoading ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
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