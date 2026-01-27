import { randomUUID } from 'crypto';

/**
 * Represents an utterance in the conversation queue
 */
interface Utterance {
  id: string;
  text: string;
  timestamp: Date;
  status: 'pending' | 'delivered' | 'responded';
}

/**
 * Represents a message in the conversation history
 */
interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  status?: 'pending' | 'delivered' | 'responded';
}

/**
 * Queue for managing utterances and conversation history
 */
class UtteranceQueue {
  utterances: Utterance[] = [];
  messages: ConversationMessage[] = [];

  add(text: string, timestamp?: Date): Utterance {
    const utterance: Utterance = {
      id: randomUUID(),
      text: text.trim(),
      timestamp: timestamp || new Date(),
      status: 'pending'
    };

    this.utterances.push(utterance);
    this.messages.push({
      id: utterance.id,
      role: 'user',
      text: utterance.text,
      timestamp: utterance.timestamp,
      status: utterance.status
    });

    return utterance;
  }

  addAssistantMessage(text: string): ConversationMessage {
    const message: ConversationMessage = {
      id: randomUUID(),
      role: 'assistant',
      text: text.trim(),
      timestamp: new Date()
    };
    this.messages.push(message);
    return message;
  }

  getRecentMessages(limit: number = 50): ConversationMessage[] {
    return this.messages
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .slice(-limit);
  }

  getRecent(limit: number = 10): Utterance[] {
    return this.utterances
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  markDelivered(id: string): void {
    const utterance = this.utterances.find(u => u.id === id);
    if (utterance) {
      utterance.status = 'delivered';
      const message = this.messages.find(m => m.id === id && m.role === 'user');
      if (message) {
        message.status = 'delivered';
      }
    }
  }

  delete(id: string): boolean {
    const utterance = this.utterances.find(u => u.id === id);
    if (utterance && utterance.status === 'pending') {
      this.utterances = this.utterances.filter(u => u.id !== id);
      this.messages = this.messages.filter(m => m.id !== id);
      return true;
    }
    return false;
  }

  clear(): void {
    this.utterances = [];
    this.messages = [];
  }
}

/**
 * Represents a speak request in the queue
 */
interface SpeakRequest {
  text: string;
  resolve: () => void;
}

/**
 * Voice preferences configuration
 */
interface VoicePreferences {
  voiceResponsesEnabled: boolean;
  voiceInputActive: boolean;
}

/**
 * Session state containing all session-specific data
 */
export interface SessionState {
  sessionId: string;
  triggerWord: string;
  triggerAliases: string[];
  ownerPids: number[];
  queue: UtteranceQueue;
  voicePreferences: VoicePreferences;
  isSpeaking: boolean;
  speakQueue: SpeakRequest[];
  lastToolUseTimestamp: Date | null;
  lastSpeakTimestamp: Date | null;
  createdAt: Date;
  lastActivityAt: Date;
  isWaiting: boolean;
  voiceInputActive: boolean;
  voiceResponsesEnabled: boolean;
  getPendingCount(): number;
}

/**
 * Configuration options for creating a new session
 */
interface SessionConfig {
  triggerWord?: string;
  triggerAliases?: string[];
  ownerPids?: number[];
}

/**
 * Greek alphabet sequence for generating unique trigger words
 */
const GREEK_ALPHABET = [
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
  'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi',
  'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega'
];

/**
 * Manages multiple voice input sessions with unique trigger words
 */
export class SessionManager {
  private sessions: Map<string, SessionState> = new Map();
  private cleanupIntervalId: NodeJS.Timeout | null = null;
  private nextTriggerIndex = 0;

  /**
   * Creates a new session with a unique session ID and trigger word
   * @param config Optional configuration for trigger word and aliases
   * @returns The created session state
   */
  async createSession(config?: SessionConfig): Promise<SessionState> {
    const sessionId = randomUUID();
    const triggerWord = config?.triggerWord || this.generateUniqueTrigger();
    const triggerAliases = config?.triggerAliases || [];

    // Check if trigger word is already in use
    const existingTriggers = this.getAllTriggerWords();
    if (existingTriggers.includes(triggerWord) || triggerAliases.some(alias => existingTriggers.includes(alias))) {
      throw new Error(`Trigger word "${triggerWord}" is already in use by another session`);
    }

    const session: SessionState = {
      sessionId,
      triggerWord,
      triggerAliases,
      ownerPids: config?.ownerPids || [],
      queue: new UtteranceQueue(),
      voicePreferences: {
        voiceResponsesEnabled: false,
        voiceInputActive: false
      },
      isSpeaking: false,
      speakQueue: [],
      lastToolUseTimestamp: null,
      lastSpeakTimestamp: null,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      isWaiting: false,
      voiceInputActive: false,
      voiceResponsesEnabled: false,
      getPendingCount(): number {
        return this.queue.utterances.filter(u => u.status === 'pending').length;
      }
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Retrieves a session by its ID
   * @param sessionId The session ID to retrieve
   * @returns The session state or null if not found
   */
  getSession(sessionId: string): SessionState | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Gets all active sessions
   * @returns Array of all session states
   */
  getAllSessions(): SessionState[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Updates the last activity timestamp for a session
   * @param sessionId The session ID to update
   */
  updateActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivityAt = new Date();
    }
  }

  /**
   * Deletes a session by its ID
   * @param sessionId The session ID to delete
   * @returns True if session was deleted, false if not found
   */
  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Cleans up sessions that have been inactive beyond the timeout
   * @param inactiveTimeoutMs Timeout in milliseconds for considering a session inactive
   */
  cleanupInactiveSessions(inactiveTimeoutMs: number): void {
    const now = Date.now();
    const sessionsToDelete: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      const inactiveTime = now - session.lastActivityAt.getTime();
      if (inactiveTime > inactiveTimeoutMs) {
        sessionsToDelete.push(sessionId);
      }
    }

    sessionsToDelete.forEach(sessionId => {
      this.deleteSession(sessionId);
    });
  }

  /**
   * Starts a periodic cleanup task that runs at the specified interval
   * @param intervalMs Interval in milliseconds between cleanup runs
   */
  startCleanupTask(intervalMs: number): void {
    if (this.cleanupIntervalId) {
      this.stopCleanupTask();
    }

    this.cleanupIntervalId = setInterval(() => {
      this.cleanupInactiveSessions(intervalMs);
    }, intervalMs);
  }

  /**
   * Stops the periodic cleanup task
   */
  stopCleanupTask(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }

  /**
   * Generates a unique trigger word using the Greek alphabet sequence
   * @returns A unique trigger word
   */
  generateUniqueTrigger(): string {
    const existingTriggers = this.getAllTriggerWords();
    let trigger: string;

    do {
      trigger = GREEK_ALPHABET[this.nextTriggerIndex % GREEK_ALPHABET.length];
      if (this.nextTriggerIndex >= GREEK_ALPHABET.length) {
        const suffix = Math.floor(this.nextTriggerIndex / GREEK_ALPHABET.length);
        trigger = `${trigger}${suffix}`;
      }
      this.nextTriggerIndex++;
    } while (existingTriggers.includes(trigger));

    return trigger;
  }

  /**
   * Gets all trigger words from all sessions
   * @param excludeSessionId Optional session ID to exclude from results
   * @returns Array of all trigger words
   */
  getAllTriggerWords(excludeSessionId?: string): string[] {
    const triggers: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (excludeSessionId && sessionId === excludeSessionId) {
        continue;
      }
      triggers.push(session.triggerWord);
      triggers.push(...session.triggerAliases);
    }

    return triggers;
  }

  /**
   * Finds a session by an owner PID
   */
  getSessionByOwnerPid(pid: number): SessionState | null {
    for (const session of this.sessions.values()) {
      if (session.ownerPids.includes(pid)) {
        return session;
      }
    }
    return null;
  }

  /**
   * Gets all active sessions (alias for getAllSessions)
   * @returns Array of all session states
   */
  getActiveSessions(): SessionState[] {
    return this.getAllSessions();
  }

  /**
   * Updates the trigger word for a session
   * @param sessionId The session ID to update
   * @param triggerWord The new trigger word
   * @param triggerAliases Optional trigger aliases
   * @returns The updated session state or null if not found
   */
  updateTriggerWord(sessionId: string, triggerWord: string, triggerAliases?: string[]): SessionState | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    // Check if new trigger word is already in use (excluding this session)
    const existingTriggers = this.getAllTriggerWords(sessionId);
    if (existingTriggers.includes(triggerWord)) {
      throw new Error(`Trigger word "${triggerWord}" is already in use by another session`);
    }

    if (triggerAliases && triggerAliases.some(alias => existingTriggers.includes(alias))) {
      const conflictingAlias = triggerAliases.find(alias => existingTriggers.includes(alias));
      throw new Error(`Trigger alias "${conflictingAlias}" is already in use by another session`);
    }

    session.triggerWord = triggerWord;
    session.triggerAliases = triggerAliases || [];
    session.lastActivityAt = new Date();

    return session;
  }
}
