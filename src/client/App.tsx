import React, { useState, useCallback, useEffect } from 'react';
import { SessionColumn, VoiceInput, SettingsPanel } from './components';
import { useSession, useSpeechRecognition, useSpeechSynthesis, useSSE } from './hooks';

export const App: React.FC = () => {
  const baseUrl = window.location.origin;

  const {
    sessions,
    activeSessionId,
    switchSession,
    addMessageToSession,
    clearMessagesForSession,
    updateVoiceSettings,
    findSessionByTrigger,
    refreshAllSessions,
  } = useSession(baseUrl);

  const [targetedSessionId, setTargetedSessionId] = useState<string | null>(null);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState('system');
  const [speechRate, setSpeechRate] = useState(1.0);
  const [waitingSessions, setWaitingSessions] = useState<Set<string>>(new Set());
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) return saved === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('darkMode', String(isDarkMode));
  }, [isDarkMode]);

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

      const combinedText = pendingTranscript ? `${pendingTranscript} ${transcript}` : transcript;

      // Try to find target session by trigger word
      const match = findSessionByTrigger(combinedText);

      if (match && match.textWithoutTrigger) {
        // Route to specific session
        addMessageToSession(match.session.id, {
          role: 'user',
          text: match.textWithoutTrigger,
          status: 'pending',
        });
        setTargetedSessionId(match.session.id);
        setPendingTranscript('');
      } else if (sessions.length === 1) {
        // Only one session - send directly
        addMessageToSession(sessions[0].id, {
          role: 'user',
          text: combinedText,
          status: 'pending',
        });
        setTargetedSessionId(sessions[0].id);
        setPendingTranscript('');
      } else if (sessions.length > 1) {
        // Multiple sessions, no trigger found - accumulate
        setPendingTranscript(combinedText);
      }
    },
    [findSessionByTrigger, addMessageToSession, sessions, pendingTranscript]
  );

  const { isListening, interimTranscript, startListening, stopListening } = useSpeechRecognition({
    continuous: true,
    interimResults: true,
    onTranscript: handleTranscript,
  });

  useEffect(() => {
    if (activeSessionId) {
      updateVoiceSettings({ voiceInputActive: isListening });
    }
  }, [isListening, activeSessionId, updateVoiceSettings]);

  // SSE connection for the active session
  const { isConnected, reconnect: sseReconnect } = useSSE({
    url: `${baseUrl}/api/tts-events?sessionId=${activeSessionId}`,
    enabled: !!activeSessionId,
    onMessage: (data) => {
      if (!activeSessionId) return;

      if (data.type === 'message') {
        addMessageToSession(activeSessionId, {
          role: 'assistant',
          text: data.text,
        });
        setTargetedSessionId(activeSessionId);

        if (isVoiceEnabled) {
          speak(data.text);
        }
      } else if (data.type === 'waiting') {
        setWaitingSessions(prev => new Set(prev).add(activeSessionId));
      } else if (data.type === 'response') {
        setWaitingSessions(prev => {
          const next = new Set(prev);
          next.delete(activeSessionId);
          return next;
        });
      }
    },
  });

  // Manual reconnect handler - refreshes all session data from server
  const handleReconnect = useCallback(() => {
    console.log('[App] Manual reconnect triggered');
    sseReconnect();
    refreshAllSessions();
  }, [sseReconnect, refreshAllSessions]);

  const handleToggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleSendMessage = (text: string) => {
    // Try to route by trigger word first
    const match = findSessionByTrigger(text);

    if (match && match.textWithoutTrigger) {
      addMessageToSession(match.session.id, {
        role: 'user',
        text: match.textWithoutTrigger,
        status: 'pending',
      });
      setTargetedSessionId(match.session.id);
    } else if (sessions.length === 1) {
      addMessageToSession(sessions[0].id, {
        role: 'user',
        text,
        status: 'pending',
      });
      setTargetedSessionId(sessions[0].id);
    } else if (targetedSessionId) {
      // Send to last targeted session
      addMessageToSession(targetedSessionId, {
        role: 'user',
        text,
        status: 'pending',
      });
    } else if (sessions.length > 0) {
      // Fallback to first session
      addMessageToSession(sessions[0].id, {
        role: 'user',
        text,
        status: 'pending',
      });
      setTargetedSessionId(sessions[0].id);
    }

    setPendingTranscript('');
  };

  const handleTestVoice = () => {
    speak('This is a test of the voice synthesis system.');
  };

  const handleDeleteMessage = (sessionId: string, messageId: string) => {
    // For now, just clear the message locally
    // In a full implementation, this would call the server
  };

  // Set initial targeted session
  useEffect(() => {
    if (!targetedSessionId && sessions.length > 0) {
      setTargetedSessionId(sessions[0].id);
    }
  }, [sessions, targetedSessionId]);

  const triggerHints = sessions.map(s => s.triggerWord).join(', ');

  return (
    <div className="flex flex-col h-screen bg-stone-100 dark:bg-stone-950 font-['Satoshi',system-ui,sans-serif]">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-stone-900 dark:text-stone-100 tracking-tight">
            Claude Voice
          </h1>
          {sessions.length > 0 && (
            <span className="text-xs text-stone-500 dark:text-stone-400">
              {sessions.length} session{sessions.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Connection status and reconnect button */}
          {sessions.length > 0 && (
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
              {!isConnected && (
                <button
                  onClick={handleReconnect}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                >
                  Reconnect
                </button>
              )}
            </div>
          )}
          <button
            onClick={handleReconnect}
            className="p-2.5 rounded-xl text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all duration-200"
            title="Refresh conversations"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </button>
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

      {/* Main content - Multi-column layout */}
      <div className="flex-1 flex overflow-hidden p-4 gap-4">
        {sessions.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-stone-200 dark:bg-stone-800 flex items-center justify-center">
                <svg className="w-8 h-8 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-stone-800 dark:text-stone-100 mb-2">
                Waiting for Claude
              </h2>
              <p className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">
                Start a Claude Code session with voice hooks enabled to connect here.
              </p>
            </div>
          </div>
        ) : (
          sessions.map((session) => (
            <SessionColumn
              key={session.id}
              session={session}
              isTargeted={session.id === targetedSessionId}
              isWaiting={waitingSessions.has(session.id)}
              onDeleteMessage={(msgId) => handleDeleteMessage(session.id, msgId)}
              onClearMessages={() => clearMessagesForSession(session.id)}
            />
          ))
        )}
      </div>

      {/* Voice input - shared across all sessions */}
      {sessions.length > 0 && (
        <div className="bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800">
          {sessions.length > 1 && (
            <div className="px-6 pt-3 text-xs text-stone-500 dark:text-stone-400">
              Say a trigger word to route: <span className="font-medium text-stone-700 dark:text-stone-300">{triggerHints}</span>
            </div>
          )}
          <VoiceInput
            onSendMessage={handleSendMessage}
            isListening={isListening}
            interimTranscript={interimTranscript}
            pendingTranscript={pendingTranscript}
            onToggleListening={handleToggleListening}
            sendMode="automatic"
            triggerWord=""
            onSendModeChange={() => {}}
            onTriggerWordChange={() => {}}
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
      )}
    </div>
  );
};
