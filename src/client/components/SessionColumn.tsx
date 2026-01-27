import React from 'react';
import { ConversationView } from './ConversationView';
import { Message } from './MessageBubble';

interface Session {
  id: string;
  name?: string;
  messages: Message[];
  triggerWord: string;
}

interface SessionColumnProps {
  session: Session;
  isTargeted: boolean;
  onClose: () => void;
  onDeleteMessage: (messageId: string) => void;
  onClearMessages: () => void;
}

export const SessionColumn: React.FC<SessionColumnProps> = ({
  session,
  isTargeted,
  onClose,
  onDeleteMessage,
  onClearMessages,
}) => {
  console.log(`[SessionColumn] Rendering ${session.triggerWord}, isTargeted=${isTargeted}, messages=${session.messages.length}`);

  return (
    <div
      className={`
        flex flex-col flex-1 min-w-[300px] max-w-[600px]
        bg-white dark:bg-zinc-900
        border-2 rounded-xl overflow-hidden
        transition-all duration-200
        ${isTargeted
          ? 'border-emerald-500 shadow-lg shadow-emerald-500/20'
          : 'border-zinc-200 dark:border-zinc-700'
        }
      `}
    >
      {/* Column Header */}
      <div
        className={`
          flex items-center justify-between px-4 py-3
          border-b transition-colors duration-200
          ${isTargeted
            ? 'bg-emerald-500 border-emerald-500'
            : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700'
          }
        `}
      >
        <div className="flex items-center gap-2">
          <span
            className={`
              text-lg font-bold uppercase tracking-wide
              ${isTargeted ? 'text-white' : 'text-zinc-700 dark:text-zinc-300'}
            `}
          >
            {session.triggerWord}
          </span>
          {isTargeted && (
            <span className="px-2 py-0.5 text-xs font-medium bg-white/20 text-white rounded-full">
              Active
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className={`
            p-1.5 rounded-lg transition-colors duration-200
            ${isTargeted
              ? 'text-white/80 hover:text-white hover:bg-white/20'
              : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }
          `}
          title="Close session"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Conversation */}
      <div className="flex-1 overflow-hidden">
        <ConversationView
          messages={session.messages}
          isWaiting={false}
          onDeleteMessage={onDeleteMessage}
          onClearConversation={onClearMessages}
        />
      </div>

      {/* Footer with trigger hint */}
      <div
        className={`
          px-4 py-2 text-xs text-center border-t
          ${isTargeted
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
            : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
          }
        `}
      >
        Say "<span className="font-semibold">{session.triggerWord}</span>" to send here
      </div>
    </div>
  );
};
