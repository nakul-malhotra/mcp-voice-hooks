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
  deleteMessage: (messageId: string) => void;
  clearMessages: () => void;
  updateSendMode: (mode: 'automatic' | 'trigger') => void;
  updateTriggerWord: (word: string) => void;
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
            sessionMap.set(session.id, {
              id: session.id,
              name: session.name,
              messages: session.messages || [],
              isActive: session.isActive,
              messageCount: session.messages?.length || 0,
              lastActivity: session.lastActivity ? new Date(session.lastActivity) : undefined,
              sendMode: session.sendMode || 'automatic',
              triggerWord: session.triggerWord || MILITARY_ALPHABET[index % MILITARY_ALPHABET.length],
            });
          });

          setSessions(sessionMap);
          if (data.activeSessionId) {
            setActiveSessionId(data.activeSessionId);
          }
        }
      } catch (error) {
        console.error('Failed to fetch sessions:', error);
      }
    };

    fetchSessions();
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
          const newSession: Session = {
            ...serverSession,
            messages: serverSession.messages || [],
            messageCount: serverSession.messages?.length || 0,
            sendMode: serverSession.sendMode || 'automatic',
            triggerWord: serverSession.triggerWord || MILITARY_ALPHABET[sessionIndex % MILITARY_ALPHABET.length],
          };
          return new Map(prev).set(newSession.id, newSession);
        });
        setActiveSessionId(serverSession.id);
      }
    } catch (error) {
      console.error('Failed to create session:', error);
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

  const addMessage = useCallback((message: Omit<Message, 'id' | 'timestamp'>) => {
    if (!activeSessionId) return;

    const newMessage: Message = {
      ...message,
      id: `msg-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
    };

    setSessions((prev) => {
      const updated = new Map(prev);
      const session = updated.get(activeSessionId);
      if (session) {
        session.messages.push(newMessage);
        session.messageCount = session.messages.length;
        session.lastActivity = new Date();
      }
      return updated;
    });
  }, [activeSessionId]);

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
  }, [activeSessionId]);

  const updateTriggerWord = useCallback((word: string) => {
    if (!activeSessionId) return;

    setSessions((prev) => {
      const updated = new Map(prev);
      const session = updated.get(activeSessionId);
      if (session) {
        session.triggerWord = word;
      }
      return updated;
    });
  }, [activeSessionId]);

  const activeSession = activeSessionId ? sessions.get(activeSessionId) || null : null;

  return {
    sessions: Array.from(sessions.values()),
    activeSession,
    activeSessionId,
    createSession,
    switchSession,
    deleteSession,
    addMessage,
    deleteMessage,
    clearMessages,
    updateSendMode,
    updateTriggerWord,
  };
};
