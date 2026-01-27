import React, { useState, useRef, useEffect } from 'react';

type SendMode = 'automatic' | 'trigger';

interface VoiceInputProps {
  onSendMessage: (text: string) => void;
  isListening: boolean;
  interimTranscript?: string;
  pendingTranscript?: string;
  onToggleListening: () => void;
  sendMode: SendMode;
  triggerWord: string;
  onSendModeChange: (mode: SendMode) => void;
  onTriggerWordChange: (word: string) => void;
}

export const VoiceInput: React.FC<VoiceInputProps> = ({
  onSendMessage,
  isListening,
  interimTranscript = '',
  pendingTranscript = '',
  onToggleListening,
  sendMode,
  triggerWord,
  onSendModeChange,
  onTriggerWordChange,
}) => {
  const [message, setMessage] = useState('');
  const [showSettings, setShowSettings] = useState(false);
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

  const hasTranscript = isListening && (interimTranscript || pendingTranscript);

  return (
    <div className="border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900">
      {/* Live transcript - appears above input when speaking */}
      {hasTranscript && (
        <div className="px-6 pt-4 pb-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-start gap-3 p-4 bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-sm">
            <div className="flex-shrink-0 mt-0.5">
              <span className="flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-terracotta-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-terracotta-500"></span>
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
                {pendingTranscript && (
                  <span className="text-stone-800 dark:text-stone-100">{pendingTranscript} </span>
                )}
                {interimTranscript && (
                  <span className="text-stone-400 dark:text-stone-500">{interimTranscript}</span>
                )}
              </p>
              {sendMode === 'trigger' && (
                <p className="mt-1.5 text-xs text-stone-400 dark:text-stone-500">
                  Say "{triggerWord}" to send
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main input area */}
      <div className="p-6">
        <div className="flex items-end gap-4">
          {/* Text input */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isListening ? "Listening..." : "Type a message..."}
              rows={1}
              className="w-full px-4 py-3 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-2xl text-[15px] text-stone-800 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-terracotta-500/20 focus:border-terracotta-500 dark:focus:border-terracotta-400 resize-none transition-all duration-200"
            />
            {message.trim() && (
              <button
                onClick={handleSend}
                className="absolute right-2 bottom-2 p-2 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors duration-200"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            )}
          </div>

          {/* Voice button */}
          <button
            onClick={onToggleListening}
            className={`
              flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center
              transition-colors duration-200
              ${isListening
                ? 'bg-terracotta-500 hover:bg-terracotta-600'
                : 'bg-stone-900 dark:bg-stone-100 hover:bg-stone-800 dark:hover:bg-stone-200'
              }
            `}
            title={isListening ? 'Stop listening' : 'Start voice input'}
          >
            <svg
              className={`w-5 h-5 ${isListening ? 'text-white' : 'text-white dark:text-stone-900'}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              {isListening ? (
                <rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" stroke="none" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              )}
            </svg>
          </button>

          {/* Settings toggle */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`
              flex-shrink-0 p-3.5 rounded-xl transition-all duration-200
              ${showSettings
                ? 'bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-200'
                : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
              }
            `}
            title="Voice settings"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
          </button>
        </div>

        {/* Inline settings panel */}
        {showSettings && (
          <div className="mt-4 p-4 bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex flex-wrap items-center gap-6">
              {/* Send mode toggle */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide">Mode</span>
                <div className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-stone-700 rounded-xl">
                  <button
                    onClick={() => onSendModeChange('automatic')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                      sendMode === 'automatic'
                        ? 'bg-white dark:bg-stone-600 text-stone-900 dark:text-stone-100 shadow-sm'
                        : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
                    }`}
                  >
                    Auto
                  </button>
                  <button
                    onClick={() => onSendModeChange('trigger')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                      sendMode === 'trigger'
                        ? 'bg-white dark:bg-stone-600 text-stone-900 dark:text-stone-100 shadow-sm'
                        : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
                    }`}
                  >
                    Trigger
                  </button>
                </div>
              </div>

              {/* Trigger word input */}
              {sendMode === 'trigger' && (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide">Word</span>
                  <input
                    type="text"
                    value={triggerWord}
                    onChange={(e) => onTriggerWordChange(e.target.value)}
                    placeholder="send"
                    className="w-24 px-3 py-1.5 text-sm bg-stone-100 dark:bg-stone-700 border-0 rounded-xl text-stone-800 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-terracotta-500/20"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
