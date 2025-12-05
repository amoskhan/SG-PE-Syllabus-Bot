import React from 'react';
import { Message, Sender } from '../types';
import MarkdownRenderer from './MarkdownRenderer';
import VideoAnalysisPlayer from './VideoAnalysisPlayer';

interface ChatMessageProps {
  message: Message;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isBot = message.sender === Sender.BOT;
  const isError = message.isError;

  return (
    <div className={`flex w-full ${isBot ? 'justify-start' : 'justify-end'} mb-6 animate-fade-in-up`}>
      <div className={`flex max-w-[90%] md:max-w-[80%] gap-3 ${isBot ? 'flex-row' : 'flex-row-reverse'}`}>

        {/* Avatar */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isBot ? 'bg-gradient-to-br from-red-500 to-red-600 text-white' : 'bg-slate-200 text-slate-600'
          }`}>
          {isBot ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          )}
        </div>

        {/* Content */}
        <div className={`flex flex-col gap-2 w-full`}>
          <div className={`px-4 py-3 rounded-2xl shadow-sm ${isError
            ? 'bg-red-50 border border-red-200 text-red-800'
            : isBot
              ? 'bg-white border border-slate-100 text-slate-800'
              : 'bg-blue-600 text-white'
            } ${isBot ? 'rounded-tl-none' : 'rounded-tr-none'}`}>

            {isBot ? (
              <MarkdownRenderer content={message.text} />
            ) : (
              <p className="whitespace-pre-wrap text-sm md:text-base">{message.text}</p>
            )}
          </div>

          {/* Media Attachments Display */}
          {!isBot && message.media && message.media.length > 0 && (
            <div className="flex flex-col gap-2">
              {message.media.map((attachment) => (
                <div key={attachment.id} className="rounded-lg overflow-hidden border border-slate-200 bg-white max-w-sm">
                  {attachment.type === 'image' ? (
                    <img
                      src={attachment.data}
                      alt={attachment.fileName}
                      className="w-full object-contain"
                    />
                  ) : (
                    <VideoAnalysisPlayer
                      src={attachment.data}
                      label={message.predictedSkill}
                    />
                  )}
                  <div className="px-2 py-1 bg-slate-50 text-xs text-slate-600 truncate">
                    📎 {attachment.fileName}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Analysis Breakdown (Visual Proof) */}
          {!isBot && message.analysisFrames && message.analysisFrames.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1 ml-1 flex items-center gap-1">
                <span>Analysis Breakdown</span>
                <span className="bg-green-100 text-green-700 px-1 rounded text-[9px]">AI DEBUG</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200">
                {message.analysisFrames.map((frame, idx) => (
                  <div key={idx} className="flex-shrink-0 w-24 h-32 bg-black rounded-lg overflow-hidden border border-slate-200 shadow-sm relative group">
                    <img src={frame} alt={`Analysis Frame ${idx}`} className="w-full h-full object-cover" />
                    <div className="absolute top-1 left-1 bg-black/60 text-white text-[8px] px-1 rounded backdrop-blur-sm">
                      Frame {idx + 1}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Grounding Sources */}
          {isBot && message.groundingChunks && message.groundingChunks.length > 0 && (
            <div className="flex flex-col gap-1 mt-1">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 ml-1">Sources</span>
              <div className="flex flex-wrap gap-2">
                {message.groundingChunks.map((chunk, idx) => (
                  chunk.web?.uri && (
                    <a
                      key={idx}
                      href={chunk.web.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded-md text-xs text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-colors max-w-xs truncate"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 flex-shrink-0">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                      </svg>
                      <span className="truncate max-w-[150px]">{chunk.web.title || new URL(chunk.web.uri).hostname}</span>
                    </a>
                  )
                ))}
              </div>
            </div>
          )}

          <div className={`text-[10px] ${isBot ? 'text-slate-400 ml-1' : 'text-slate-300 mr-1 text-right'}`}>
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

      </div>
    </div>
  );
};

export default ChatMessage;