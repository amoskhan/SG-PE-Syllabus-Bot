import React from 'react';
import { ChatSession } from '../../types';

interface SessionSidebarProps {
    sessions: ChatSession[];
    currentSessionId: string;
    onSwitchSession: (sessionId: string) => void;
    onNewSession: () => void;
    onDeleteSession: (sessionId: string, e: React.MouseEvent) => void;
    isOpen: boolean;
    onClose: () => void;
}

const SessionSidebar: React.FC<SessionSidebarProps> = ({
    sessions,
    currentSessionId,
    onSwitchSession,
    onNewSession,
    onDeleteSession,
    isOpen,
    onClose
}) => {
    // Sort sessions by update time (newest first)
    const sortedSessions = [...sessions].sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    // Lock body scroll when sidebar is open on mobile
    React.useEffect(() => {
        if (isOpen && window.innerWidth < 768) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={onClose}
                />
            )}

            {/* Sidebar Container */}
            <div className={`
        fixed md:relative inset-y-0 left-0 z-50
        w-[85%] md:w-72 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xl border-r border-slate-200 dark:border-slate-800
        transform transition-transform duration-300 ease-in-out shadow-2xl md:shadow-none
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        flex flex-col h-full
      `}>
                {/* Header */}
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <h2 className="font-semibold text-slate-700 dark:text-slate-200">History</h2>
                    <button
                        onClick={onClose}
                        className="md:hidden p-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* New Chat Button */}
                <div className="p-3">
                    <button
                        onClick={() => {
                            onNewSession();
                            if (window.innerWidth < 768) onClose();
                        }}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors shadow-sm font-medium"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        New Chat
                    </button>
                </div>

                {/* Session List */}
                <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
                    {sortedSessions.map((session) => (
                        <button
                            key={session.id}
                            onClick={() => {
                                onSwitchSession(session.id);
                                if (window.innerWidth < 768) onClose();
                            }}
                            className={`
                w-full text-left px-3 py-3 rounded-lg group relative flex items-center gap-3 transition-colors
                ${session.id === currentSessionId
                                    ? 'bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700'
                                    : 'hover:bg-slate-100 dark:hover:bg-slate-900 border border-transparent'
                                }
              `}
                        >
                            <div className={`p-1.5 rounded-md ${session.id === currentSessionId ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400'}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                                </svg>
                            </div>

                            <div className="flex-1 min-w-0">
                                <h3 className={`text-sm font-medium truncate ${session.id === currentSessionId ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                                    {session.title || 'New Chat'}
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-500 truncate">
                                    {new Date(session.updatedAt).toLocaleDateString()} • {new Date(session.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>

                            {/* Delete Button (Visible on Hover or Selected) */}
                            <div
                                onClick={(e) => {
                                    e.stopPropagation(); // Prevent switching
                                    onDeleteSession(session.id, e);
                                }}
                                className={`
                  p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors
                  ${session.id === currentSessionId ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                `}
                                title="Delete Chat"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                            </div>
                        </button>
                    ))}
                </div>

                {/* Footer/About */}
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-400 text-center">
                    SG PE Syllabus Bot v1.2
                </div>
            </div>
        </>
    );
};

export default SessionSidebar;
