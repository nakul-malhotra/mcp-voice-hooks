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
  isWaiting?: boolean;
  onDeleteMessage: (messageId: string) => void;
  onClearMessages: () => void;
}

export const SessionColumn: React.FC<SessionColumnProps> = ({
  session,
  isTargeted,
  isWaiting = false,
  onDeleteMessage,
  onClearMessages,
}) => {
  return (
    <div
      className={`
        flex flex-col flex-1 min-w-[320px]
        bg-white dark:bg-stone-900
        border rounded-2xl overflow-hidden
        transition-all duration-300
        ${isTargeted
          ? 'border-terracotta-400 ring-2 ring-terracotta-400/20'
          : 'border-stone-200 dark:border-stone-700'
        }
      `}
    >
      {/* Column Header */}
      <div
        className={`
          flex items-center justify-between px-5 py-4
          border-b transition-colors duration-200
          ${isTargeted
            ? 'bg-terracotta-500 border-terracotta-500'
            : 'bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700'
          }
        `}
      >
        <div className="flex items-center gap-3">
          <span
            className={`
              text-base font-semibold tracking-tight
              ${isTargeted ? 'text-white' : 'text-stone-800 dark:text-stone-100'}
            `}
          >
            {session.triggerWord}
          </span>
          {isTargeted && (
            <span className="px-2 py-0.5 text-[10px] font-medium bg-white/20 text-white rounded-full uppercase tracking-wide">
              Active
            </span>
          )}
        </div>
      </div>

      {/* Conversation */}
      <div className="flex-1 overflow-hidden">
        <ConversationView
          messages={session.messages}
          isWaiting={isWaiting}
          onDeleteMessage={onDeleteMessage}
          onClearConversation={onClearMessages}
        />
      </div>

      {/* Footer with trigger hint */}
      <div
        className={`
          px-5 py-3 text-xs border-t
          ${isTargeted
            ? 'bg-terracotta-50 dark:bg-terracotta-900/20 border-terracotta-200 dark:border-terracotta-800 text-terracotta-700 dark:text-terracotta-300'
            : 'bg-stone-50 dark:bg-stone-800/50 border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400'
          }
        `}
      >
        Say "<span className="font-medium">{session.triggerWord}</span>" to send here
      </div>
    </div>
  );
};
