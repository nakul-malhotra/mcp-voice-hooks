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

  console.log('[ConversationView] Rendering with', messages.length, 'messages:', messages.map(m => m.text.substring(0, 30)));

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Minimal header - only shows when there are messages */}
      {!isEmpty && onClearConversation && (
        <div className="flex items-center justify-end px-6 py-3 border-b border-stone-100 dark:border-stone-800/50">
          <button
            onClick={onClearConversation}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all duration-200"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clear
          </button>
        </div>
      )}

      {/* Messages area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto bg-stone-50 dark:bg-stone-950"
      >
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full p-8">
            {/* Empty state - refined and minimal */}
            <div className="max-w-sm text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-stone-100 to-stone-200 dark:from-stone-800 dark:to-stone-700 flex items-center justify-center">
                <svg className="w-7 h-7 text-stone-400 dark:text-stone-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-stone-700 dark:text-stone-200 mb-2">
                Ready to listen
              </h3>
              <p className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">
                Tap the microphone to start speaking, or type a message below
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-6 max-w-3xl mx-auto">
            {messages.map((message, index) => (
              <div
                key={message.id}
                className="animate-in fade-in slide-in-from-bottom-2"
                style={{ animationDelay: `${Math.min(index * 50, 200)}ms` }}
              >
                <MessageBubble
                  message={message}
                  onDelete={onDeleteMessage}
                />
              </div>
            ))}
            {isWaiting && <WaitingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
    </div>
  );
};
