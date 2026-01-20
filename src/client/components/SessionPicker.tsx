import React from 'react';

interface Session {
  id: string;
  name?: string;
  messageCount: number;
  lastActivity?: Date;
  isActive: boolean;
}

interface SessionPickerProps {
  isOpen: boolean;
  sessions: Session[];
  onClose: () => void;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: () => void;
}

export const SessionPicker: React.FC<SessionPickerProps> = ({
  isOpen,
  sessions,
  onClose,
  onSelectSession,
  onCreateSession,
}) => {
  if (!isOpen) return null;

  const formatLastActivity = (date?: Date) => {
    if (!date) return 'No activity';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              Select a Session
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-200"
            >
              <svg
                className="w-5 h-5 text-zinc-500 dark:text-zinc-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-4 max-h-96 overflow-y-auto">
          <div className="space-y-2">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => {
                  onSelectSession(session.id);
                  onClose();
                }}
                className={`
                  w-full p-4 rounded-xl text-left transition-all duration-200
                  ${
                    session.isActive
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-500 dark:border-emerald-600'
                      : 'bg-zinc-50 dark:bg-zinc-800 border-2 border-transparent hover:border-zinc-300 dark:hover:border-zinc-700'
                  }
                `}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
                      {session.name || `Session ${session.id.slice(0, 8)}`}
                    </h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                      {session.messageCount} {session.messageCount === 1 ? 'message' : 'messages'}
                    </p>
                  </div>
                  <div className="text-xs text-zinc-400 dark:text-zinc-500">
                    {formatLastActivity(session.lastActivity)}
                  </div>
                </div>
                {session.isActive && (
                  <div className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    Active
                  </div>
                )}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              onCreateSession();
              onClose();
            }}
            className="w-full mt-4 p-4 rounded-xl bg-white dark:bg-zinc-800 border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-emerald-500 dark:hover:border-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-all duration-200 group"
          >
            <div className="flex items-center justify-center gap-2">
              <svg
                className="w-5 h-5 text-zinc-400 dark:text-zinc-500 group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition-colors duration-200"
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
              <span className="font-medium text-zinc-600 dark:text-zinc-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors duration-200">
                Create New Session
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
