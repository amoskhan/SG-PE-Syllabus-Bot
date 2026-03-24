import React from 'react';
import { ChatSession } from '../../types';

interface SessionSidebarProps {
    sessions: ChatSession[];
    currentSessionId: string;
    onSwitchSession: (sessionId: string) => void;
    onNewSession: () => void;
    onDeleteSession: (sessionId: string, e: React.MouseEvent) => void;
    onRenameSession: (sessionId: string, newTitle: string) => void;
    isOpen: boolean;
    onClose: () => void;
    // User Auth & Settings
    user: any;
    teacherProfile: import('../../types').TeacherProfile | null;
    signInWithGoogle: () => void;
    signOut: () => void;
    onOpenSettings: () => void;
}

const SessionSidebar: React.FC<SessionSidebarProps> = ({
    sessions,
    currentSessionId,
    onSwitchSession,
    onNewSession,
    onDeleteSession,
    onRenameSession,
    isOpen,
    onClose,
    user,
    teacherProfile,
    signInWithGoogle,
    signOut,
    onOpenSettings
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

    const handleRenameClick = (sessionId: string, currentTitle: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newTitle = window.prompt("Enter new chat title:", currentTitle);
        if (newTitle && newTitle.trim().length > 0) {
            onRenameSession(sessionId, newTitle.trim());
        }
    };

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
        w-[280px] bg-[#fdfdfd] dark:bg-zinc-950 border-r border-slate-200/60 dark:border-slate-800/60
        transform transition-transform duration-300 ease-in-out shadow-2xl md:shadow-none
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        flex flex-col h-full
      `}>
                {/* Header / Logo */}
                <div className="p-4 flex items-center justify-between sticky top-0 bg-[#fdfdfd] dark:bg-zinc-950 z-10">
                    <div className="flex items-center gap-2 px-1">
                        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white text-sm shadow-sm">
                            <span className="text-lg">🤸</span>
                        </div>
                        <h1 className="font-semibold text-sm text-slate-800 dark:text-slate-200 tracking-tight">
                            SG PE Chatbot
                        </h1>
                    </div>
                    <button
                        onClick={onClose}
                        className="md:hidden p-1.5 text-slate-400 hover:bg-slate-100 rounded-md transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* New Chat Button */}
                <div className="px-3 pb-3">
                    <button
                        onClick={() => {
                            onNewSession();
                            if (window.innerWidth < 768) onClose();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-zinc-900 text-slate-700 dark:text-slate-300 rounded-lg transition-colors border border-transparent hover:border-slate-200/60 dark:hover:border-slate-800/60 font-medium text-sm group"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200">
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
                w-full text-left px-3 py-2.5 rounded-lg group relative flex items-center gap-2.5 transition-colors
                ${session.id === currentSessionId
                                    ? 'bg-slate-100 dark:bg-zinc-800/50 text-slate-900 dark:text-slate-100'
                                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-900/50'
                                }
              `}
                        >
                            <div className={`p-1 rounded-md shrink-0 flex items-center justify-center ${session.id === currentSessionId ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}`}>
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

                            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                {/* Rename Button */}
                                <div
                                    onClick={(e) => handleRenameClick(session.id, session.title || 'New Chat', e)}
                                    className="p-1.5 rounded-md text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors cursor-pointer"
                                    title="Rename Chat"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                    </svg>
                                </div>

                                {/* Delete Button */}
                                <div
                                    onClick={(e) => {
                                        e.stopPropagation(); // Prevent switching
                                        onDeleteSession(session.id, e);
                                    }}
                                    className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                    title="Delete Chat"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                    </svg>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>

                {/* User Profile / Settings (Bottom) */}
                <div className="mt-auto border-t border-slate-200/60 dark:border-slate-800/60 p-3 flex flex-col gap-2 bg-[#fdfdfd] dark:bg-zinc-950">
                    {user ? (
                        <div className="flex items-center gap-3 px-2 py-2 mb-1">
                            {teacherProfile?.avatar_url ? (
                                <img src={teacherProfile.avatar_url} alt="Profile" className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 object-cover" />
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold flex items-center justify-center text-xs shrink-0">
                                    {(teacherProfile?.name || 'U')[0].toUpperCase()}
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                                    {teacherProfile?.name || "Teacher"}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={signInWithGoogle}
                            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm mb-2"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            Sign In / Register
                        </button>
                    )}

                    {user && (
                        <div className="flex flex-col gap-0.5">
                            <button
                                onClick={onOpenSettings}
                                className="w-full text-left px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-zinc-900 rounded-lg transition-colors flex items-center gap-2 font-medium"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                Customize Rubrics
                            </button>
                            <button
                                onClick={signOut}
                                className="w-full text-left px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-zinc-900 rounded-lg transition-colors flex items-center gap-2 font-medium"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                                </svg>
                                Log out
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default SessionSidebar;
