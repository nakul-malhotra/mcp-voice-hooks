import React from 'react';

interface Session {
  id: string;
  name?: string;
  messageCount: number;
  isActive: boolean;
  hasUnread?: boolean;
  triggerWord?: string;
}

interface SessionTabsProps {
  sessions: Session[];
  activeSessionId: string | null;
  onSessionChange: (sessionId: string) => void;
  onNewSession: () => void;
}

export const SessionTabs: React.FC<SessionTabsProps> = ({
  sessions,
  activeSessionId,
  onSessionChange,
  onNewSession,
}) => {
  console.log('[SessionTabs] sessions:', sessions.length, 'activeSessionId:', activeSessionId);

  // Only hide tabs when there's exactly 1 session (or none)
  if (sessions.length <= 1) {
    console.log('[SessionTabs] Hiding tabs (only', sessions.length, 'session)');
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-6 py-3 bg-stone-50 dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 overflow-x-auto">
      <div className="flex items-center gap-1.5">
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId;
          return (
            <button
              key={session.id}
              onClick={() => onSessionChange(session.id)}
              className={`
                relative px-4 py-2 rounded-xl text-sm font-medium
                transition-all duration-200 whitespace-nowrap
                ${isActive
                  ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-sm'
                  : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800'
                }
              `}
            >
              {session.triggerWord || 'Session'}
              {session.hasUnread && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-terracotta-500 rounded-full" />
              )}
            </button>
          );
        })}

        {/* Add session button */}
        <button
          onClick={onNewSession}
          className="flex items-center justify-center w-8 h-8 rounded-xl text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all duration-200"
          title="New session"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </div>
  );
};
