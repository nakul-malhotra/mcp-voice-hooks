import React, { useState, useCallback, useEffect } from 'react';
import {
  SessionTabs,
  ConversationView,
  VoiceInput,
  SettingsPanel,
  SessionPicker,
} from './components';
import {
  useSession,
  useSpeechRecognition,
  useSpeechSynthesis,
  useSSE,
} from './hooks';

export const App: React.FC = () => {
  const baseUrl = window.location.origin;

  const {
    sessions,
    activeSession,
    activeSessionId,
    createSession,
    switchSession,
    addMessage,
    deleteMessage,
    clearMessages,
    updateSendMode,
    updateTriggerWord,
  } = useSession(baseUrl);

  const [isSessionPickerOpen, setIsSessionPickerOpen] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('system');
  const [speechRate, setSpeechRate] = useState(1.0);
  const [isWaiting, setIsWaiting] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) return saved === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Local state fallback for send mode when no session is active
  const [localSendMode, setLocalSendMode] = useState<'automatic' | 'trigger'>(() => {
    const saved = localStorage.getItem('sendMode');
    return (saved === 'trigger') ? 'trigger' : 'automatic';
  });
  const [localTriggerWord, setLocalTriggerWord] = useState(() => {
    return localStorage.getItem('triggerWord') || 'send';
  });

  // Sync local state with session when available
  const currentSendMode = activeSession?.sendMode || localSendMode;
  const currentTriggerWord = activeSession?.triggerWord || localTriggerWord;

  const handleSendModeChange = useCallback((mode: 'automatic' | 'trigger') => {
    setLocalSendMode(mode);
    localStorage.setItem('sendMode', mode);
    updateSendMode(mode);
  }, [updateSendMode]);

  const handleTriggerWordChange = useCallback((word: string) => {
    setLocalTriggerWord(word);
    localStorage.setItem('triggerWord', word);
    updateTriggerWord(word);
  }, [updateTriggerWord]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('darkMode', String(isDarkMode));
  }, [isDarkMode]);

  const { speak } = useSpeechSynthesis({
    voice: selectedVoice,
    rate: speechRate,
  });

  const handleTranscript = useCallback(
    (transcript: string, isFinal: boolean) => {
      if (!isFinal) return;

      if (currentSendMode === 'automatic') {
        addMessage({
          role: 'user',
          text: transcript,
          status: 'pending',
        });
      } else if (currentSendMode === 'trigger') {
        const words = transcript.toLowerCase().split(/\s+/);
        if (words.includes(currentTriggerWord.toLowerCase())) {
          const messageText = transcript
            .replace(new RegExp(`\\b${currentTriggerWord}\\b`, 'gi'), '')
            .trim();
          if (messageText) {
            addMessage({
              role: 'user',
              text: messageText,
              status: 'pending',
            });
          }
        }
      }
    },
    [currentSendMode, currentTriggerWord, addMessage]
  );

  const { isListening, startListening, stopListening } = useSpeechRecognition({
    continuous: true,
    interimResults: true,
    onTranscript: handleTranscript,
  });

  useSSE({
    url: `${baseUrl}/api/events`,
    enabled: !!activeSessionId,
    onMessage: (data) => {
      if (data.type === 'message') {
        addMessage({
          role: 'assistant',
          text: data.text,
        });

        if (isVoiceEnabled) {
          speak(data.text);
        }
      } else if (data.type === 'waiting') {
        setIsWaiting(true);
      } else if (data.type === 'response') {
        setIsWaiting(false);
      }
    },
  });

  const handleToggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleSendMessage = (text: string) => {
    addMessage({
      role: 'user',
      text,
      status: 'pending',
    });
  };

  const handleTestVoice = () => {
    speak('This is a test of the voice synthesis system.');
  };

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-950">
      <header className="flex items-center justify-between px-6 py-4 bg-zinc-900 border-b-4 border-zinc-700 shadow-xl">
        <h1 className="text-2xl font-black text-white uppercase tracking-tight">
          Voice Mode for Claude Code
        </h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
            title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDarkMode ? (
              <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-zinc-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              </svg>
            )}
          </button>
          <a
            href="/legacy"
            className="text-sm text-zinc-400 hover:text-zinc-300 transition-colors duration-200"
          >
            Switch to Legacy UI
          </a>
        </div>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden">
        <SessionTabs
          sessions={sessions.map((s) => ({
            id: s.id,
            name: s.name,
            messageCount: s.messageCount,
            isActive: s.isActive,
          }))}
          activeSessionId={activeSessionId}
          onSessionChange={switchSession}
          onNewSession={createSession}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          <ConversationView
            messages={activeSession?.messages || []}
            isWaiting={isWaiting}
            onDeleteMessage={deleteMessage}
            onClearConversation={clearMessages}
          />

          <VoiceInput
            onSendMessage={handleSendMessage}
            isListening={isListening}
            onToggleListening={handleToggleListening}
            sendMode={currentSendMode}
            triggerWord={currentTriggerWord}
            onSendModeChange={handleSendModeChange}
            onTriggerWordChange={handleTriggerWordChange}
          />

          <SettingsPanel
            isVoiceEnabled={isVoiceEnabled}
            onVoiceEnabledChange={setIsVoiceEnabled}
            selectedVoice={selectedVoice}
            onVoiceChange={setSelectedVoice}
            speechRate={speechRate}
            onSpeechRateChange={setSpeechRate}
            onTestVoice={handleTestVoice}
          />
        </div>
      </div>

      <SessionPicker
        isOpen={isSessionPickerOpen}
        sessions={sessions.map((s) => ({
          id: s.id,
          name: s.name,
          messageCount: s.messageCount,
          lastActivity: s.lastActivity,
          isActive: s.isActive,
        }))}
        onClose={() => setIsSessionPickerOpen(false)}
        onSelectSession={switchSession}
        onCreateSession={createSession}
      />
    </div>
  );
};
