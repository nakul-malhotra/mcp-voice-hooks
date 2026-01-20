import React, { useState } from 'react';

export type MessageStatus = 'pending' | 'delivered' | 'responded';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  status?: MessageStatus;
}

interface MessageBubbleProps {
  message: Message;
  onDelete?: (messageId: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onDelete }) => {
  const [showTimestamp, setShowTimestamp] = useState(false);

  const isUser = message.role === 'user';
  const canDelete = isUser && message.status === 'pending' && onDelete;

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getStatusBadge = (status: MessageStatus) => {
    const statusConfig = {
      pending: {
        text: 'Pending',
        color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
      },
      delivered: {
        text: 'Delivered',
        color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
      },
      responded: {
        text: 'Responded',
        color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
      },
    };

    const config = statusConfig[status];
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${config.color}`}
      >
        {config.text}
      </span>
    );
  };

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-200`}
    >
      <div
        className={`
          group relative max-w-[70%] px-4 py-2 rounded-2xl
          ${
            isUser
              ? 'bg-emerald-500 text-white rounded-br-sm'
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-bl-sm'
          }
        `}
        onMouseEnter={() => setShowTimestamp(true)}
        onMouseLeave={() => setShowTimestamp(false)}
      >
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
          {message.text}
        </p>

        {(message.status || canDelete || showTimestamp) && (
          <div
            className={`
              flex items-center justify-between gap-2 mt-1.5 text-xs
              ${isUser ? 'text-emerald-100' : 'text-zinc-500 dark:text-zinc-400'}
            `}
          >
            <div className="flex items-center gap-2">
              {message.status && getStatusBadge(message.status)}
              {showTimestamp && (
                <span className="opacity-70">{formatTime(message.timestamp)}</span>
              )}
            </div>

            {canDelete && (
              <button
                onClick={() => onDelete(message.id)}
                className="opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity"
                title="Delete message"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
