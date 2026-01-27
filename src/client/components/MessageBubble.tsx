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
  const [isHovered, setIsHovered] = useState(false);

  const isUser = message.role === 'user';
  const canDelete = isUser && message.status === 'pending' && onDelete;

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getStatusIndicator = (status: MessageStatus) => {
    const config = {
      pending: { color: 'bg-amber-400', label: 'Sending' },
      delivered: { color: 'bg-stone-400', label: 'Sent' },
      responded: { color: 'bg-emerald-400', label: 'Responded' },
    };
    return config[status];
  };

  return (
    <div
      className={`group flex ${isUser ? 'justify-end' : 'justify-start'}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`relative max-w-[75%] ${isUser ? 'order-2' : 'order-1'}`}>
        {/* Message bubble */}
        <div
          className={`
            relative px-4 py-3 rounded-2xl
            ${isUser
              ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-br-md'
              : 'bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 rounded-bl-md border border-stone-200 dark:border-stone-700'
            }
          `}
        >
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
            {message.text}
          </p>
        </div>

        {/* Meta row - timestamp and status */}
        <div
          className={`
            flex items-center gap-2 mt-1.5 px-1
            ${isUser ? 'justify-end' : 'justify-start'}
          `}
        >
          {/* Status indicator for user messages */}
          {isUser && message.status && (
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${getStatusIndicator(message.status).color}`} />
              <span className="text-[11px] text-stone-400 dark:text-stone-500">
                {getStatusIndicator(message.status).label}
              </span>
            </div>
          )}

          {/* Timestamp - always visible on hover */}
          <span
            className={`
              text-[11px] text-stone-400 dark:text-stone-500
              transition-opacity duration-200
              ${isHovered ? 'opacity-100' : 'opacity-0'}
            `}
          >
            {formatTime(message.timestamp)}
          </span>

          {/* Delete button for pending messages */}
          {canDelete && (
            <button
              onClick={() => onDelete(message.id)}
              className={`
                p-1 rounded-md text-stone-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20
                transition-all duration-200
                ${isHovered ? 'opacity-100' : 'opacity-0'}
              `}
              title="Cancel message"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
