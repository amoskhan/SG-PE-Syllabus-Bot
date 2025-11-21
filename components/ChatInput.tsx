import React, { useState, useRef, useEffect } from 'react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, isLoading }) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input);
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
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
    <form
      onSubmit={handleSubmit}
      className="p-4 bg-white border-t border-slate-200 max-w-4xl mx-auto w-full sticky bottom-0"
    >
      <div className="relative flex items-end gap-2 bg-slate-100 p-2 rounded-2xl border border-transparent focus-within:border-red-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-red-50 transition-all duration-200">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me anything! (i.e. Design an activity for primary 4 net and barrier games...) "
          className="w-full bg-transparent border-none focus:ring-0 resize-none max-h-32 min-h-[24px] py-2 px-2 text-slate-800 placeholder-slate-400"
          rows={1}
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className={`p-2 rounded-xl flex-shrink-0 transition-all duration-200 ${input.trim() && !isLoading
            ? 'bg-red-600 text-white hover:bg-red-700 shadow-md transform hover:scale-105'
            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </button>
      </div>
      <div className="text-center mt-2">
        <p className="text-[10px] text-slate-400">
          AI may display inaccurate information. Please verify with official MOE documents.
        </p>
      </div>
    </form>
  );
};

export default ChatInput;