import { useState, useCallback, useEffect } from 'react';
import { Message } from '../components/MessageBubble';

const MILITARY_ALPHABET = [
  'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel',
  'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa',
  'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey',
  'X-ray', 'Yankee', 'Zulu',
];

interface Session {
  id: string;
  name?: string;
  messages: Message[];
  isActive: boolean;
  messageCount: number;
  lastActivity?: Date;
  sendMode: 'automatic' | 'trigger';
  triggerWord: string;
}

interface UseSessionResult {
  sessions: Session[];
  activeSession: Session | null;
  activeSessionId: string | null;
  createSession: () => void;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  addMessageToSession: (sessionId: string, message: Omit<Message, 'id' | 'timestamp'>) => void;
  deleteMessage: (messageId: string) => void;
  clearMessages: () => void;
  clearMessagesForSession: (sessionId: string) => void;
  updateSendMode: (mode: 'automatic' | 'trigger') => void;
  updateTriggerWord: (word: string) => void;
  updateVoiceSettings: (settings: { voiceResponsesEnabled?: boolean; voiceInputActive?: boolean }) => void;
  findSessionByTrigger: (text: string) => { session: Session; textWithoutTrigger: string } | null;
  refreshMessages: (sessionId?: string) => Promise<void>;
  refreshAllSessions: () => Promise<void>;
}

export const useSession = (baseUrl: string): UseSessionResult => {
  const [sessions, setSessions] = useState<Map<string, Session>>(new Map());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const response = await fetch(`${baseUrl}/api/sessions`);
        if (response.ok) {
          const data = await response.json();
          const sessionMap = new Map<string, Session>();

          data.sessions.forEach((session: any, index: number) => {
            const messages = (session.messages || []).map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp),
            }));
            sessionMap.set(session.id, {
              id: session.id,
              name: session.name,
              messages,
              isActive: session.isActive,
              messageCount: messages.length,
              lastActivity: session.lastActivity ? new Date(session.lastActivity) : undefined,
              sendMode: session.sendMode || 'automatic',
              triggerWord: session.triggerWord || MILITARY_ALPHABET[index % MILITARY_ALPHABET.length],
            });
          });

          setSessions(sessionMap);
          if (data.activeSessionId) {
            setActiveSessionId(data.activeSessionId);
          } else if (sessionMap.size > 0) {
            // Set first session as active if none specified
            const firstSession = sessionMap.values().next().value;
            if (firstSession) {
              setActiveSessionId(firstSession.id);
            }
          }
          // NOTE: We do NOT auto-create sessions here anymore.
          // Sessions are created by Claude instances via MCP registration.
          // If no sessions exist, the UI will show an empty state until Claude connects.
        }
      } catch (error) {
        console.error('[useSession] Failed to fetch sessions:', error);
      }
    };

    fetchSessions();

    // Poll for new sessions periodically (in case Claude connects)
    // Using 5 second interval to reduce noise
    const pollInterval = setInterval(fetchSessions, 5000);

    return () => clearInterval(pollInterval);
  }, [baseUrl]);

  const createSession = useCallback(async () => {
    try {
      const response = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const serverSession = await response.json();
        setSessions((prev) => {
          const sessionIndex = prev.size;
          const messages = (serverSession.messages || []).map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
          }));
          const newSession: Session = {
            ...serverSession,
            messages,
            messageCount: messages.length,
            sendMode: serverSession.sendMode || 'automatic',
            triggerWord: serverSession.triggerWord || MILITARY_ALPHABET[sessionIndex % MILITARY_ALPHABET.length],
          };
          return new Map(prev).set(newSession.id, newSession);
        });
        setActiveSessionId(serverSession.id);
      }
    } catch (error) {
      console.error('[useSession] Failed to create session:', error);
    }
  }, [baseUrl]);

  const switchSession = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`${baseUrl}/api/sessions/${sessionId}/activate`, {
        method: 'POST',
      });

      if (response.ok) {
        setActiveSessionId(sessionId);
        setSessions((prev) => {
          const updated = new Map(prev);
          updated.forEach((session) => {
            session.isActive = session.id === sessionId;
          });
          return updated;
        });
      }
    } catch (error) {
      console.error('Failed to switch session:', error);
    }
  }, [baseUrl]);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`${baseUrl}/api/sessions/${sessionId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSessions((prev) => {
          const updated = new Map(prev);
          updated.delete(sessionId);
          return updated;
        });

        if (activeSessionId === sessionId) {
          const remainingSessions = Array.from(sessions.keys()).filter((id) => id !== sessionId);
          setActiveSessionId(remainingSessions[0] || null);
        }
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  }, [baseUrl, activeSessionId, sessions]);

  const addMessage = useCallback(async (message: Omit<Message, 'id' | 'timestamp'>) => {
    console.log('[addMessage] Called with:', message.text, 'activeSessionId:', activeSessionId);

    if (!activeSessionId) {
      console.log('[addMessage] ERROR: No activeSessionId, message not added!');
      return;
    }

    const newMessage: Message = {
      ...message,
      id: `msg-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
    };

    console.log('[addMessage] Creating message:', newMessage.id);

    // Update local state immediately for optimistic UI
    setSessions((prev) => {
      const updated = new Map(prev);
      const session = updated.get(activeSessionId);
      console.log('[addMessage] Found session:', session?.id, 'current messages:', session?.messages.length);
      if (session) {
        // Create a NEW session object with NEW messages array to trigger React re-render
        const updatedSession: Session = {
          ...session,
          messages: [...session.messages, newMessage],
          messageCount: session.messages.length + 1,
          lastActivity: new Date(),
        };
        updated.set(activeSessionId, updatedSession);
        console.log('[addMessage] Message added, new count:', updatedSession.messages.length);
      } else {
        console.log('[addMessage] ERROR: Session not found in map!');
      }
      return updated;
    });

    // Send user messages to the server so Claude can receive them
    if (message.role === 'user') {
      try {
        console.log('[addMessage] Sending to server:', message.text);
        const response = await fetch(`${baseUrl}/api/potential-utterances?sessionId=${activeSessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: message.text,
            timestamp: new Date().toISOString(),
          }),
        });

        if (!response.ok) {
          console.error('[addMessage] Server rejected message:', await response.text());
        } else {
          console.log('[addMessage] Message sent to server successfully');
        }
      } catch (error) {
        console.error('[addMessage] Failed to send message to server:', error);
      }
    }
  }, [activeSessionId, baseUrl]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!activeSessionId) return;

    try {
      const response = await fetch(
        `${baseUrl}/api/sessions/${activeSessionId}/messages/${messageId}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        setSessions((prev) => {
          const updated = new Map(prev);
          const session = updated.get(activeSessionId);
          if (session) {
            session.messages = session.messages.filter((msg) => msg.id !== messageId);
            session.messageCount = session.messages.length;
          }
          return updated;
        });
      }
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  }, [baseUrl, activeSessionId]);

  const clearMessages = useCallback(async () => {
    if (!activeSessionId) return;

    try {
      const response = await fetch(`${baseUrl}/api/sessions/${activeSessionId}/messages`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSessions((prev) => {
          const updated = new Map(prev);
          const session = updated.get(activeSessionId);
          if (session) {
            session.messages = [];
            session.messageCount = 0;
          }
          return updated;
        });
      }
    } catch (error) {
      console.error('Failed to clear messages:', error);
    }
  }, [baseUrl, activeSessionId]);

  const updateSendMode = useCallback((mode: 'automatic' | 'trigger') => {
    if (!activeSessionId) return;

    setSessions((prev) => {
      const updated = new Map(prev);
      const session = updated.get(activeSessionId);
      if (session) {
        session.sendMode = mode;
      }
      return updated;
    });
    // Note: sendMode is a local-only setting (controls browser behavior)
  }, [activeSessionId]);

  const updateTriggerWord = useCallback(async (word: string) => {
    if (!activeSessionId) return;

    // Update local state immediately
    setSessions((prev) => {
      const updated = new Map(prev);
      const session = updated.get(activeSessionId);
      if (session) {
        session.triggerWord = word;
      }
      return updated;
    });

    // Sync to server
    try {
      const response = await fetch(`${baseUrl}/api/sessions/${activeSessionId}/trigger`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerWord: word }),
      });

      if (!response.ok) {
        console.error('[useSession] Failed to update trigger word on server:', await response.text());
      }
    } catch (error) {
      console.error('[useSession] Failed to sync trigger word:', error);
    }
  }, [activeSessionId, baseUrl]);

  const updateVoiceSettings = useCallback(async (settings: {
    voiceResponsesEnabled?: boolean;
    voiceInputActive?: boolean;
  }) => {
    if (!activeSessionId) return;

    try {
      // Update voice responses setting
      if (settings.voiceResponsesEnabled !== undefined) {
        await fetch(`${baseUrl}/api/voice-preferences?sessionId=${activeSessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voiceResponsesEnabled: settings.voiceResponsesEnabled }),
        });
      }

      // Update voice input active setting
      if (settings.voiceInputActive !== undefined) {
        await fetch(`${baseUrl}/api/voice-input-state?sessionId=${activeSessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: settings.voiceInputActive }),
        });
      }
    } catch (error) {
      console.error('[useSession] Failed to sync voice settings:', error);
    }
  }, [activeSessionId, baseUrl]);

  const addMessageToSession = useCallback(async (sessionId: string, message: Omit<Message, 'id' | 'timestamp'>) => {
    const newMessage: Message = {
      ...message,
      id: `msg-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
    };

    setSessions((prev) => {
      const updated = new Map(prev);
      const session = updated.get(sessionId);
      if (session) {
        const updatedSession: Session = {
          ...session,
          messages: [...session.messages, newMessage],
          messageCount: session.messages.length + 1,
          lastActivity: new Date(),
        };
        updated.set(sessionId, updatedSession);
      }
      return updated;
    });

    if (message.role === 'user') {
      try {
        await fetch(`${baseUrl}/api/potential-utterances?sessionId=${sessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: message.text,
            timestamp: new Date().toISOString(),
          }),
        });
      } catch (error) {
        console.error('[addMessageToSession] Failed to send message:', error);
      }
    }
  }, [baseUrl]);

  const clearMessagesForSession = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`${baseUrl}/api/sessions/${sessionId}/messages`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSessions((prev) => {
          const updated = new Map(prev);
          const session = updated.get(sessionId);
          if (session) {
            updated.set(sessionId, { ...session, messages: [], messageCount: 0 });
          }
          return updated;
        });
      }
    } catch (error) {
      console.error('Failed to clear messages:', error);
    }
  }, [baseUrl]);

  const findSessionByTrigger = useCallback((text: string): { session: Session; textWithoutTrigger: string } | null => {
    const words = text.toLowerCase().split(/\s+/);
    const sessionList = Array.from(sessions.values());

    for (const session of sessionList) {
      const trigger = session.triggerWord.toLowerCase();
      if (words.includes(trigger)) {
        const prefixes = ['hey', 'hi', 'hello', 'ok', 'okay'];
        let result = text;

        for (const prefix of prefixes) {
          const pattern = new RegExp(`^${prefix}\\s+${trigger}[,:]?\\s*`, 'i');
          result = result.replace(pattern, '');
        }

        const standalonePattern = new RegExp(`\\b${trigger}[,:]?\\s*`, 'gi');
        result = result.replace(standalonePattern, '').trim();

        return { session, textWithoutTrigger: result };
      }
    }

    return null;
  }, [sessions]);

  /** Refresh messages for a specific session from the server */
  const refreshMessages = useCallback(async (sessionId?: string) => {
    const targetSessionId = sessionId || activeSessionId;
    if (!targetSessionId) return;

    try {
      console.log('[refreshMessages] Fetching messages for session:', targetSessionId);
      const response = await fetch(`${baseUrl}/api/conversation?sessionId=${targetSessionId}&limit=100`);

      if (response.ok) {
        const data = await response.json();
        const messages: Message[] = (data.messages || []).map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          text: msg.text,
          timestamp: new Date(msg.timestamp),
          status: msg.status,
        }));

        setSessions((prev) => {
          const updated = new Map(prev);
          const session = updated.get(targetSessionId);
          if (session) {
            updated.set(targetSessionId, {
              ...session,
              messages,
              messageCount: messages.length,
            });
            console.log('[refreshMessages] Updated session with', messages.length, 'messages');
          }
          return updated;
        });
      }
    } catch (error) {
      console.error('[refreshMessages] Failed to refresh:', error);
    }
  }, [baseUrl, activeSessionId]);

  /** Refresh all sessions and their messages from the server */
  const refreshAllSessions = useCallback(async () => {
    try {
      console.log('[refreshAllSessions] Fetching all sessions...');
      const response = await fetch(`${baseUrl}/api/sessions`);

      if (response.ok) {
        const data = await response.json();
        const sessionMap = new Map<string, Session>();

        // Fetch messages for each session
        await Promise.all(data.sessions.map(async (session: any, index: number) => {
          const convResponse = await fetch(`${baseUrl}/api/conversation?sessionId=${session.id}&limit=100`);
          let messages: Message[] = [];

          if (convResponse.ok) {
            const convData = await convResponse.json();
            messages = (convData.messages || []).map((msg: any) => ({
              id: msg.id,
              role: msg.role,
              text: msg.text,
              timestamp: new Date(msg.timestamp),
              status: msg.status,
            }));
          }

          sessionMap.set(session.id, {
            id: session.id,
            name: session.name,
            messages,
            isActive: session.isActive,
            messageCount: messages.length,
            lastActivity: session.lastActivity ? new Date(session.lastActivity) : undefined,
            sendMode: session.sendMode || 'automatic',
            triggerWord: session.triggerWord || MILITARY_ALPHABET[index % MILITARY_ALPHABET.length],
          });
        }));

        setSessions(sessionMap);
        console.log('[refreshAllSessions] Refreshed', sessionMap.size, 'sessions');

        if (data.activeSessionId) {
          setActiveSessionId(data.activeSessionId);
        }
      }
    } catch (error) {
      console.error('[refreshAllSessions] Failed to refresh:', error);
    }
  }, [baseUrl]);

  const activeSession = activeSessionId ? sessions.get(activeSessionId) || null : null;

  return {
    sessions: Array.from(sessions.values()),
    activeSession,
    activeSessionId,
    createSession,
    switchSession,
    deleteSession,
    addMessage,
    addMessageToSession,
    deleteMessage,
    clearMessages,
    clearMessagesForSession,
    updateSendMode,
    updateTriggerWord,
    updateVoiceSettings,
    findSessionByTrigger,
    refreshMessages,
    refreshAllSessions,
  };
};
