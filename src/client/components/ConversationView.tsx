import React, { useEffect, useRef } from 'react';
import { MessageBubble, Message } from './MessageBubble';
import { WaitingIndicator } from './WaitingIndicator';

interface ConversationViewProps {
  messages: Message[];
  isWaiting?: boolean;
  onDeleteMessage?: (messageId: string) => void;
  onClearConversation?: () => void;
}

export const ConversationView: React.FC<ConversationViewProps> = ({
  messages,
  isWaiting = false,
  onDeleteMessage,
  onClearConversation,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full">
      {!isEmpty && onClearConversation && (
        <div className="flex items-center justify-between px-5 py-3 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Conversation
          </h2>
          <button
            onClick={onClearConversation}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all duration-200 border border-zinc-200 dark:border-zinc-700"
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
            Clear
          </button>
        </div>
      )}

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-950 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 scrollbar-track-transparent"
      >
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="w-16 h-16 mb-4 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-zinc-400 dark:text-zinc-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
              No messages yet
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm">
              Start a conversation by typing a message or using voice input below
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-5">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onDelete={onDeleteMessage}
              />
            ))}
            {isWaiting && <WaitingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
    </div>
  );
};
