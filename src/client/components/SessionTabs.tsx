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
  return (
    <div className="flex items-center gap-2 px-5 py-3 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto">
      <div className="flex items-center gap-2">
        {sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => onSessionChange(session.id)}
            className={`
              relative px-4 py-2 rounded-full text-sm font-medium
              transition-all duration-200 whitespace-nowrap
              ${
                session.id === activeSessionId
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                  : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700'
              }
            `}
            title={session.triggerWord ? `Trigger word: "${session.triggerWord}"` : undefined}
          >
            <span className="font-bold">{session.triggerWord || 'Alpha'}</span>
            {session.hasUnread && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>
        ))}
        <button
          onClick={onNewSession}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 transition-all duration-200"
          title="New session"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};
