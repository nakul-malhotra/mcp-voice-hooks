import React, { useState, useRef, useEffect } from 'react';

type SendMode = 'automatic' | 'trigger';

interface VoiceInputProps {
  onSendMessage: (text: string) => void;
  isListening: boolean;
  onToggleListening: () => void;
  sendMode: SendMode;
  triggerWord: string;
  onSendModeChange: (mode: SendMode) => void;
  onTriggerWordChange: (word: string) => void;
}

export const VoiceInput: React.FC<VoiceInputProps> = ({
  onSendMessage,
  isListening,
  onToggleListening,
  sendMode,
  triggerWord,
  onSendModeChange,
  onTriggerWordChange,
}) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [message]);

  const handleSend = () => {
    if (message.trim()) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <div className="flex items-center gap-4 mb-3 p-2 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="sendMode"
            value="automatic"
            checked={sendMode === 'automatic'}
            onChange={() => onSendModeChange('automatic')}
            className="w-4 h-4 text-emerald-500 focus:ring-emerald-500 dark:focus:ring-emerald-600"
          />
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            Auto-send on pause
          </span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="sendMode"
            value="trigger"
            checked={sendMode === 'trigger'}
            onChange={() => onSendModeChange('trigger')}
            className="w-4 h-4 text-emerald-500 focus:ring-emerald-500 dark:focus:ring-emerald-600"
          />
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            Wait for trigger word
          </span>
        </label>

        {sendMode === 'trigger' && (
          <div className="flex items-center gap-2 ml-auto">
            <label className="text-xs text-zinc-500 dark:text-zinc-400">
              Trigger:
            </label>
            <input
              type="text"
              value={triggerWord}
              onChange={(e) => onTriggerWordChange(e.target.value)}
              placeholder="e.g., send, go"
              className="px-2 py-1 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-600"
            />
          </div>
        )}
      </div>

      <div className="flex items-end gap-2 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border-2 border-zinc-200 dark:border-zinc-800 focus-within:border-emerald-500 dark:focus-within:border-emerald-600 transition-all duration-200">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message or use voice..."
          rows={1}
          className="flex-1 bg-transparent border-none outline-none resize-none text-[15px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500"
        />

        <button
          onClick={onToggleListening}
          className={`
            flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center
            transition-all duration-200
            ${
              isListening
                ? 'bg-red-500 hover:bg-red-600 animate-pulse-slow shadow-lg shadow-red-500/50'
                : 'bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/25'
            }
          `}
          title={isListening ? 'Stop listening' : 'Start voice input'}
        >
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {isListening ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            )}
          </svg>
        </button>
      </div>

      {sendMode === 'trigger' && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 text-center">
          Say "<span className="font-semibold text-emerald-600 dark:text-emerald-400">{triggerWord}</span>" to send your message
        </p>
      )}
    </div>
  );
};
