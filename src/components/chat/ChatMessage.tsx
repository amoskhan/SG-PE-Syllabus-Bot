import React, { useState } from 'react';
import { Message, Sender } from '../../types';
import MarkdownRenderer from './MarkdownRenderer';
import VideoAnalysisPlayer from '../video/VideoAnalysisPlayer';
import { generatePDF } from '../../services/pdfService';

interface ChatMessageProps {
  message: Message;
  onUpdateMessage?: (message: Message) => void;
  onAnalyze?: (message: Message) => void;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onUpdateMessage, onAnalyze }) => {
  const [lightboxSrc, setLightboxSrc] = React.useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handleExportPdf = async () => {
    setIsGeneratingPdf(true);
    await generatePDF(`message-${message.id}`, `analysis-${message.id}`);
    setIsGeneratingPdf(false);
  };

  const isBot = message.sender === Sender.BOT;
  const isError = message.isError;

  const toggleBallValidity = (frameIdx: number) => {
    if (!message.poseData || !onUpdateMessage) return;

    const newPoseData = [...message.poseData];
    // Find entry for this frame index
    const dataIndex = newPoseData.findIndex(p => p.timestamp === frameIdx);

    if (dataIndex === -1 || !newPoseData[dataIndex].ball) return;

    const currentBall = newPoseData[dataIndex].ball!;
    // Toggle validity
    const newIsValid = !currentBall.isValid;

    newPoseData[dataIndex] = {
      ...newPoseData[dataIndex],
      ball: {
        ...currentBall,
        isValid: newIsValid,
        status: newIsValid ? 'User Verified' : 'User Omitted'
      }
    };

    onUpdateMessage({ ...message, poseData: newPoseData });
  };

  const omitAllBalls = () => {
    if (!message.poseData || !onUpdateMessage) return;

    const newPoseData = message.poseData.map(p => ({
      ...p,
      ball: p.ball ? { ...p.ball, isValid: false, status: 'User Omitted All' } : undefined
    }));

    onUpdateMessage({ ...message, poseData: newPoseData });
  };


  return (
    <>
      <div className={`flex w-full ${isBot ? 'justify-start' : 'justify-end'} mb-6 animate-fade-in-up`}>
        <div className={`flex max-w-[90%] md:max-w-[80%] gap-3 ${isBot ? 'flex-row' : 'flex-row-reverse'}`}>

          {/* Avatar */}
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isBot ? 'bg-gradient-to-br from-red-500 to-red-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
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
          <div
            id={`message-${message.id}`}
            className={`flex flex-col gap-2 w-full min-w-0`}
          >
            <div className={`px-4 py-3 rounded-2xl shadow-sm break-words overflow-hidden ${isError
              ? 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
              : isBot
                ? 'bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                : 'bg-blue-600 text-white'
              } ${isBot ? 'rounded-tl-none' : 'rounded-tr-none'}`}>

              {isBot ? (
                <MarkdownRenderer content={message.text} />
              ) : (
                <p className="whitespace-pre-wrap text-sm md:text-base">{message.text}</p>
              )}

              {/* Reference Image Display (TEACHER VERIFICATION MODE) */}
              {isBot && message.referenceImageURI && (
                <div className="mt-4 mb-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 rounded-lg flex flex-col sm:flex-row gap-4 items-center">
                  <div className="flex-shrink-0 w-24 h-24 bg-white dark:bg-slate-700 rounded border border-red-200 dark:border-red-800 p-1">
                    <img
                      src={message.referenceImageURI}
                      alt="Textbook Reference"
                      className="w-full h-full object-cover rounded-sm cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setLightboxSrc(message.referenceImageURI!)}
                    />
                  </div>
                  <div className="flex-1 text-sm text-red-900 dark:text-red-200">
                    <p className="font-bold text-red-700 flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                      </svg>
                      Graded against MOE Syllabus Standard
                    </p>
                    <p className="mt-1 text-xs opacity-80">
                      Comparison based on the "Textbook Perfect" form shown on the left.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Media Attachments Display */}
            {!isBot && message.media && message.media.length > 0 && (
              <div className="flex flex-col gap-2">
                {message.media.map((attachment) => (
                  <div key={attachment.id} className="rounded-lg overflow-hidden border border-slate-200 bg-white w-full max-w-[85vw] md:max-w-4xl shadow-sm mx-auto">
                    {!attachment.data ? (
                      <div className="h-32 bg-slate-100 dark:bg-slate-800 flex flex-col items-center justify-center p-4 text-slate-400 border-b border-slate-200 dark:border-slate-700">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mb-2 opacity-50">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3.25a2.25 2.25 0 00-2.25-2.25h-9m12 2.25l-2.625 2.625M12 5.25h.008v.008H12V5.25z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-xs font-medium">Media expired from local storage</span>
                      </div>
                    ) : attachment.type === 'image' ? (
                      <img
                        src={attachment.data}
                        alt={attachment.fileName}
                        loading="lazy"
                        className="w-full h-auto object-contain"
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
                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1 ml-1 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span>Analysis Breakdown</span>
                    <span className="bg-green-100 text-green-700 px-1 rounded text-[9px]">AI DEBUG</span>
                  </div>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200 w-full max-w-[85vw] md:max-w-full mx-auto touch-pan-x">
                  {message.analysisFrames.map((frame, idx) => {
                    // Correctly find the pose data for this specific frame index
                    // poseData.timestamp corresponds to the frame index 'idx'
                    const currentPose = message.poseData?.find(p => p.timestamp === idx);
                    const ball = currentPose?.ball;

                    return (
                      <div
                        key={idx}
                        onClick={(e) => {
                          if (ball) {
                            toggleBallValidity(idx);
                          }
                        }}
                        className={`flex-shrink-0 w-48 h-64 md:w-60 md:h-80 bg-black rounded-xl overflow-hidden border shadow-sm relative group cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all ${ball?.isValid ? 'border-green-500 ring-2 ring-green-500/50' : 'border-slate-200'
                          }`}
                      >
                        <img src={frame} alt={`Analysis Frame ${idx}`} className="w-full h-full object-cover" />

                        {/* Frame Number Badge */}
                        <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm pointer-events-none font-medium">
                          Frame {idx + 1}
                        </div>

                        {/* Visual Verification Badges */}
                        {ball && (
                          ball.isValid ? (
                            <div className="absolute top-2 right-2 bg-green-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-lg backdrop-blur-sm border border-green-400 animate-pulse pointer-events-none">
                              BALL ⚽
                            </div>
                          ) : (
                            <div className="absolute top-2 right-2 bg-amber-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-lg backdrop-blur-sm border border-amber-300 pointer-events-none">
                              BALL OMIT ⚠️
                            </div>
                          )
                        )}

                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          {/* Interaction Hint */}
                          {ball && (
                            <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 bg-white/95 text-slate-800 text-[10px] px-2 py-0.5 rounded font-semibold transition-opacity mb-8 mr-1 pointer-events-none shadow-sm">
                              {ball.isValid ? 'Click to Omit' : 'Click to Include'}
                            </div>
                          )}

                          {/* Zoom Button */}
                          <button
                            onClick={(e) => { e.stopPropagation(); setLightboxSrc(frame); }}
                            className="opacity-0 group-hover:opacity-100 bg-black/60 hover:bg-black/80 text-white p-3 rounded-full transition-opacity transform hover:scale-110 shadow-lg backdrop-blur-sm border border-white/20"
                            title="Enlarge Image"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Actions Row (Bottom) */}
                {!isBot && onUpdateMessage && (
                  <div className="flex items-center justify-between mt-2 px-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); omitAllBalls(); }}
                      className="text-xs text-red-500 hover:text-red-700 underline cursor-pointer"
                      title="Ignore all detected balls for analysis"
                    >
                      Omit All Balls
                    </button>

                    {onAnalyze && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onAnalyze(message); }}
                        className="text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg shadow-md transition-all flex items-center gap-2 animate-pulse hover:scale-105 active:scale-95"
                        title="Submit these frames for grading"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                        </svg>
                        Analyze Now
                      </button>
                    )}
                  </div>
                )}
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

            {/* Footer Row */}
            <div className={`text-[10px] ${isBot ? 'text-slate-400 ml-1' : 'text-slate-300 mr-1 text-right'} flex items-center justify-between mt-1`}>

              <div className="flex items-center gap-3">
                <span>{message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>

                {isBot && message.tokenUsage && (
                  <span className="font-mono opacity-70">
                    ⚡ {message.tokenUsage.toLocaleString()} tokens
                  </span>
                )}

                {isBot && message.modelId && (
                  <div className="flex items-center gap-1 opacity-80" title={`Generated by ${message.modelId}`}>
                    <img
                      src={`/assets/model-icons/${message.modelId === 'molmo' ? 'allen' : message.modelId}.png`}
                      alt={message.modelId}
                      className="w-3.5 h-3.5 object-contain"
                      onError={(e) => e.currentTarget.style.display = 'none'}
                    />
                    <span className="uppercase tracking-wider font-semibold opacity-70">{message.modelId}</span>
                  </div>
                )}
              </div>

              {/* Export Button (Only for Bot) */}
              {isBot && !isError && (
                <button
                  onClick={handleExportPdf}
                  disabled={isGeneratingPdf}
                  className="flex items-center gap-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors disabled:opacity-50"
                  title="Export Analysis as PDF"
                >
                  {isGeneratingPdf ? (
                    <span className="animate-spin">⏳</span>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  )}
                  <span className="uppercase tracking-wider font-semibold opacity-70">PDF</span>
                </button>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Lightbox Modal */}
      {lightboxSrc && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 animate-fade-in" onClick={() => setLightboxSrc(null)}>
          <img
            src={lightboxSrc}
            alt="Enlarged view"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          />
          <button
            className="absolute top-4 right-4 text-white hover:text-slate-300 transition-colors"
            onClick={() => setLightboxSrc(null)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
};

export default ChatMessage;