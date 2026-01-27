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
    updateVoiceSettings,
  } = useSession(baseUrl);

  const [isSessionPickerOpen, setIsSessionPickerOpen] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState('system');
  const [speechRate, setSpeechRate] = useState(1.0);
  const [isWaiting, setIsWaiting] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) return saved === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [localSendMode, setLocalSendMode] = useState<'automatic' | 'trigger'>(() => {
    const saved = localStorage.getItem('sendMode');
    return (saved === 'trigger') ? 'trigger' : 'automatic';
  });
  const [localTriggerWord, setLocalTriggerWord] = useState(() => {
    return localStorage.getItem('triggerWord') || 'send';
  });

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

  // Sync voice responses setting to server
  useEffect(() => {
    if (activeSessionId) {
      updateVoiceSettings({ voiceResponsesEnabled: isVoiceEnabled });
    }
  }, [isVoiceEnabled, activeSessionId, updateVoiceSettings]);

  const { speak } = useSpeechSynthesis({
    voice: selectedVoice,
    rate: speechRate,
    onEnd: () => {
      if (activeSessionId) {
        fetch(`${baseUrl}/api/speak-done?sessionId=${activeSessionId}`, {
          method: 'POST',
        }).catch(err => console.error('[TTS] Failed to notify speak-done:', err));
      }
    },
  });

  const [pendingTranscript, setPendingTranscript] = useState('');

  const handleTranscript = useCallback(
    (transcript: string, isFinal: boolean) => {
      if (!isFinal) return;

      if (currentSendMode === 'automatic') {
        addMessage({
          role: 'user',
          text: transcript,
          status: 'pending',
        });
        // Clear any pending transcript when message is sent
        setPendingTranscript('');
      } else if (currentSendMode === 'trigger') {
        const combinedText = pendingTranscript ? `${pendingTranscript} ${transcript}` : transcript;
        const words = combinedText.toLowerCase().split(/\s+/);

        if (words.includes(currentTriggerWord.toLowerCase())) {
          const messageText = combinedText
            .replace(new RegExp(`\\b${currentTriggerWord}\\b`, 'gi'), '')
            .trim();
          if (messageText) {
            addMessage({
              role: 'user',
              text: messageText,
              status: 'pending',
            });
          }
          setPendingTranscript('');
        } else {
          setPendingTranscript(combinedText);
        }
      }
    },
    [currentSendMode, currentTriggerWord, addMessage, pendingTranscript]
  );

  const { isListening, interimTranscript, startListening, stopListening } = useSpeechRecognition({
    continuous: true,
    interimResults: true,
    onTranscript: handleTranscript,
  });

  // Sync voice input active state to server when listening changes
  useEffect(() => {
    if (activeSessionId) {
      updateVoiceSettings({ voiceInputActive: isListening });
    }
  }, [isListening, activeSessionId, updateVoiceSettings]);

  const { isConnected } = useSSE({
    url: `${baseUrl}/api/tts-events?sessionId=${activeSessionId}`,
    enabled: !!activeSessionId,
    onOpen: () => {
      console.log('[SSE] Connection opened successfully, sessionId:', activeSessionId);
    },
    onError: (error) => {
      console.error('[SSE] Connection error:', error, 'sessionId:', activeSessionId);
    },
    onMessage: (data) => {
      console.log('[SSE] Message received:', data.type, data);
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

  // Debug logging for connection state
  useEffect(() => {
    console.log('[App] Connection state changed:', {
      activeSessionId,
      isConnected,
      sseEnabled: !!activeSessionId,
    });
  }, [activeSessionId, isConnected]);

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
    // Clear pending transcript when message is sent
    setPendingTranscript('');
  };

  const handleTestVoice = () => {
    speak('This is a test of the voice synthesis system.');
  };

  return (
    <div className="flex flex-col h-screen bg-stone-50 dark:bg-stone-950 font-['Satoshi',system-ui,sans-serif]">
      {/* Minimal header */}
      <header className="flex items-center justify-between px-6 py-5 border-b border-stone-200 dark:border-stone-800">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-stone-900 dark:text-stone-100 tracking-tight">
            Claude Voice
          </h1>
          {/* Connection status indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ml-2">
            {!activeSessionId ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-amber-600 dark:text-amber-400">Waiting for Claude...</span>
              </>
            ) : isConnected ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400">Connected</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-stone-400 animate-pulse" />
                <span className="text-stone-500 dark:text-stone-400">Connecting...</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2.5 rounded-xl text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all duration-200"
            title={isDarkMode ? 'Light mode' : 'Dark mode'}
          >
            {isDarkMode ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Debug: log sessions and activeSession */}
        {console.log('[App Render] sessions:', sessions.length, 'activeSession:', activeSession?.id, 'messages:', activeSession?.messages?.length)}
        <SessionTabs
          sessions={sessions.map((s) => ({
            id: s.id,
            name: s.name,
            messageCount: s.messageCount,
            isActive: s.isActive,
            triggerWord: s.triggerWord,
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
            interimTranscript={interimTranscript}
            pendingTranscript={pendingTranscript}
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
