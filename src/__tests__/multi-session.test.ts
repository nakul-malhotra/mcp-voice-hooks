import { SessionManager, SessionState } from '../session-manager.js';

describe('Multi-Session Integration Tests', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager();
  });

  afterEach(() => {
    sessionManager.stopCleanupTask();
  });

  describe('Session Management', () => {
    it('should create unique session with trigger word', async () => {
      const session = await sessionManager.createSession();

      expect(session.sessionId).toBeDefined();
      expect(session.triggerWord).toBeDefined();
      expect(session.queue).toBeDefined();
      expect(session.voicePreferences).toBeDefined();
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.lastActivityAt).toBeInstanceOf(Date);
    });

    it('should create multiple sessions with different trigger words', async () => {
      const session1 = await sessionManager.createSession();
      const session2 = await sessionManager.createSession();
      const session3 = await sessionManager.createSession();

      expect(session1.sessionId).not.toBe(session2.sessionId);
      expect(session2.sessionId).not.toBe(session3.sessionId);
      expect(session1.triggerWord).not.toBe(session2.triggerWord);
      expect(session2.triggerWord).not.toBe(session3.triggerWord);
    });

    it('should reject duplicate trigger words', async () => {
      const session1 = await sessionManager.createSession({ triggerWord: 'test' });

      await expect(
        sessionManager.createSession({ triggerWord: 'test' })
      ).rejects.toThrow('already in use');
    });

    it('should retrieve session by ID', async () => {
      const session = await sessionManager.createSession();
      const retrieved = sessionManager.getSession(session.sessionId);

      expect(retrieved).toBe(session);
    });

    it('should return null for non-existent session', () => {
      const retrieved = sessionManager.getSession('non-existent-id');
      expect(retrieved).toBeNull();
    });

    it('should delete session successfully', async () => {
      const session = await sessionManager.createSession();
      const deleted = sessionManager.deleteSession(session.sessionId);

      expect(deleted).toBe(true);
      expect(sessionManager.getSession(session.sessionId)).toBeNull();
    });

    it('should return false when deleting non-existent session', () => {
      const deleted = sessionManager.deleteSession('non-existent-id');
      expect(deleted).toBe(false);
    });

    it('should clean up inactive sessions', async () => {
      const session1 = await sessionManager.createSession();
      const session2 = await sessionManager.createSession();

      // Manually set session1 to be old
      session1.lastActivityAt = new Date(Date.now() - 2000);

      // Clean up sessions older than 1 second
      sessionManager.cleanupInactiveSessions(1000);

      expect(sessionManager.getSession(session1.sessionId)).toBeNull();
      expect(sessionManager.getSession(session2.sessionId)).not.toBeNull();
    });

    it('should update last activity timestamp', async () => {
      const session = await sessionManager.createSession();
      const initialTimestamp = session.lastActivityAt;

      await new Promise(resolve => setTimeout(resolve, 10));

      sessionManager.updateActivity(session.sessionId);

      expect(session.lastActivityAt.getTime()).toBeGreaterThan(initialTimestamp.getTime());
    });
  });

  describe('Session Isolation', () => {
    it('should isolate messages between sessions', async () => {
      const session1 = await sessionManager.createSession();
      const session2 = await sessionManager.createSession();

      session1.queue.add('Message for session 1');
      session2.queue.add('Message for session 2');

      expect(session1.queue.utterances.length).toBe(1);
      expect(session2.queue.utterances.length).toBe(1);
      expect(session1.queue.utterances[0].text).toBe('Message for session 1');
      expect(session2.queue.utterances[0].text).toBe('Message for session 2');
    });

    it('should isolate voice preferences per session', async () => {
      const session1 = await sessionManager.createSession();
      const session2 = await sessionManager.createSession();

      session1.voiceResponsesEnabled = true;
      session1.voiceInputActive = true;

      expect(session2.voiceResponsesEnabled).toBe(false);
      expect(session2.voiceInputActive).toBe(false);
    });

    it('should isolate speaking state per session', async () => {
      const session1 = await sessionManager.createSession();
      const session2 = await sessionManager.createSession();

      session1.isSpeaking = true;

      expect(session2.isSpeaking).toBe(false);
    });

    it('should isolate TTS queue per session', async () => {
      const session1 = await sessionManager.createSession();
      const session2 = await sessionManager.createSession();

      session1.speakQueue.push({ text: 'Test 1', resolve: () => {} });
      session2.speakQueue.push({ text: 'Test 2', resolve: () => {} });

      expect(session1.speakQueue.length).toBe(1);
      expect(session2.speakQueue.length).toBe(1);
      expect(session1.speakQueue[0].text).toBe('Test 1');
      expect(session2.speakQueue[0].text).toBe('Test 2');
    });

    it('should isolate waiting state per session', async () => {
      const session1 = await sessionManager.createSession();
      const session2 = await sessionManager.createSession();

      session1.isWaiting = true;

      expect(session2.isWaiting).toBe(false);
    });

    it('should isolate timestamp tracking per session', async () => {
      const session1 = await sessionManager.createSession();
      const session2 = await sessionManager.createSession();

      session1.lastToolUseTimestamp = new Date();
      session1.lastSpeakTimestamp = new Date();

      expect(session2.lastToolUseTimestamp).toBeNull();
      expect(session2.lastSpeakTimestamp).toBeNull();
    });
  });

  describe('Trigger Words', () => {
    it('should auto-generate unique trigger words using Greek alphabet', async () => {
      const sessions = await Promise.all([
        sessionManager.createSession(),
        sessionManager.createSession(),
        sessionManager.createSession()
      ]);

      const greekWords = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'];
      const triggerWords = sessions.map(s => s.triggerWord);

      triggerWords.forEach(word => {
        expect(greekWords).toContain(word);
      });
    });

    it('should update trigger word successfully', async () => {
      const session = await sessionManager.createSession();
      const updated = sessionManager.updateTriggerWord(session.sessionId, 'custom', ['alias1']);

      expect(updated).not.toBeNull();
      expect(updated!.triggerWord).toBe('custom');
      expect(updated!.triggerAliases).toEqual(['alias1']);
    });

    it('should reject updating to an in-use trigger word', async () => {
      const session1 = await sessionManager.createSession({ triggerWord: 'test1' });
      const session2 = await sessionManager.createSession({ triggerWord: 'test2' });

      expect(() => {
        sessionManager.updateTriggerWord(session2.sessionId, 'test1');
      }).toThrow('already in use');
    });

    it('should reject updating to an in-use trigger alias', async () => {
      const session1 = await sessionManager.createSession({
        triggerWord: 'test1',
        triggerAliases: ['alias1']
      });
      const session2 = await sessionManager.createSession({ triggerWord: 'test2' });

      expect(() => {
        sessionManager.updateTriggerWord(session2.sessionId, 'test3', ['alias1']);
      }).toThrow('already in use');
    });

    it('should get all trigger words from all sessions', async () => {
      await sessionManager.createSession({ triggerWord: 'test1', triggerAliases: ['alias1'] });
      await sessionManager.createSession({ triggerWord: 'test2', triggerAliases: ['alias2'] });

      const allTriggers = sessionManager.getAllTriggerWords();

      expect(allTriggers).toContain('test1');
      expect(allTriggers).toContain('test2');
      expect(allTriggers).toContain('alias1');
      expect(allTriggers).toContain('alias2');
      expect(allTriggers.length).toBe(4);
    });

    it('should exclude session when getting trigger words', async () => {
      const session1 = await sessionManager.createSession({ triggerWord: 'test1' });
      const session2 = await sessionManager.createSession({ triggerWord: 'test2' });

      const triggers = sessionManager.getAllTriggerWords(session1.sessionId);

      expect(triggers).toContain('test2');
      expect(triggers).not.toContain('test1');
    });
  });

  describe('Session State', () => {
    it('should track pending count correctly', async () => {
      const session = await sessionManager.createSession();

      expect(session.getPendingCount()).toBe(0);

      session.queue.add('Message 1');
      session.queue.add('Message 2');

      expect(session.getPendingCount()).toBe(2);

      session.queue.markDelivered(session.queue.utterances[0].id);

      expect(session.getPendingCount()).toBe(1);
    });

    it('should initialize with default state', async () => {
      const session = await sessionManager.createSession();

      expect(session.voiceResponsesEnabled).toBe(false);
      expect(session.voiceInputActive).toBe(false);
      expect(session.isSpeaking).toBe(false);
      expect(session.isWaiting).toBe(false);
      expect(session.speakQueue).toEqual([]);
      expect(session.lastToolUseTimestamp).toBeNull();
      expect(session.lastSpeakTimestamp).toBeNull();
    });

    it('should support custom trigger word and aliases', async () => {
      const session = await sessionManager.createSession({
        triggerWord: 'custom',
        triggerAliases: ['alias1', 'alias2']
      });

      expect(session.triggerWord).toBe('custom');
      expect(session.triggerAliases).toEqual(['alias1', 'alias2']);
    });
  });

  describe('Cleanup Task', () => {
    it('should start and stop cleanup task', async () => {
      const session = await sessionManager.createSession();

      sessionManager.startCleanupTask(100);

      // Manually set session to be old
      session.lastActivityAt = new Date(Date.now() - 200);

      // Wait for cleanup to run
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(sessionManager.getSession(session.sessionId)).toBeNull();

      sessionManager.stopCleanupTask();
    });

    it('should restart cleanup task if already running', async () => {
      sessionManager.startCleanupTask(1000);
      sessionManager.startCleanupTask(2000);

      sessionManager.stopCleanupTask();
    });

    it('should not error when stopping non-running cleanup task', () => {
      expect(() => {
        sessionManager.stopCleanupTask();
      }).not.toThrow();
    });
  });

  describe('Get All Sessions', () => {
    it('should return empty array when no sessions exist', () => {
      const sessions = sessionManager.getAllSessions();
      expect(sessions).toEqual([]);
    });

    it('should return all active sessions', async () => {
      const session1 = await sessionManager.createSession();
      const session2 = await sessionManager.createSession();
      const session3 = await sessionManager.createSession();

      const sessions = sessionManager.getAllSessions();

      expect(sessions.length).toBe(3);
      expect(sessions).toContain(session1);
      expect(sessions).toContain(session2);
      expect(sessions).toContain(session3);
    });

    it('should return same result from getActiveSessions', async () => {
      await sessionManager.createSession();
      await sessionManager.createSession();

      const allSessions = sessionManager.getAllSessions();
      const activeSessions = sessionManager.getActiveSessions();

      expect(activeSessions).toEqual(allSessions);
    });
  });

  describe('Trigger Word Generation', () => {
    it('should generate sequential Greek alphabet words', async () => {
      const session1 = await sessionManager.createSession();
      const session2 = await sessionManager.createSession();
      const session3 = await sessionManager.createSession();

      expect(session1.triggerWord).toBe('alpha');
      expect(session2.triggerWord).toBe('beta');
      expect(session3.triggerWord).toBe('gamma');
    });

    it('should skip to next available trigger when one is taken', async () => {
      await sessionManager.createSession({ triggerWord: 'alpha' });
      await sessionManager.createSession({ triggerWord: 'beta' });

      const session = await sessionManager.createSession();

      expect(session.triggerWord).toBe('gamma');
    });

    it('should generate numbered suffixes after exhausting Greek alphabet', async () => {
      // Create sessions for all Greek alphabet words
      const greekAlphabet = [
        'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
        'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi',
        'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega'
      ];

      for (const word of greekAlphabet) {
        await sessionManager.createSession({ triggerWord: word });
      }

      const session1 = await sessionManager.createSession();
      const session2 = await sessionManager.createSession();

      expect(session1.triggerWord).toBe('alpha1');
      expect(session2.triggerWord).toBe('beta1');
    });
  });

  describe('Clear Messages', () => {
    it('should clear all messages in a session', async () => {
      const session = await sessionManager.createSession();

      session.queue.add('Message 1');
      session.queue.add('Message 2');
      session.queue.addAssistantMessage('Response 1');

      expect(session.queue.utterances.length).toBe(2);
      expect(session.queue.messages.length).toBe(3);

      session.queue.clear();

      expect(session.queue.utterances.length).toBe(0);
      expect(session.queue.messages.length).toBe(0);
    });

    it('should not affect other sessions when clearing messages', async () => {
      const session1 = await sessionManager.createSession();
      const session2 = await sessionManager.createSession();

      session1.queue.add('Session 1 message');
      session2.queue.add('Session 2 message');

      session1.queue.clear();

      expect(session1.queue.utterances.length).toBe(0);
      expect(session2.queue.utterances.length).toBe(1);
      expect(session2.queue.utterances[0].text).toBe('Session 2 message');
    });

    it('should handle clearing already empty session', async () => {
      const session = await sessionManager.createSession();

      expect(session.queue.utterances.length).toBe(0);

      session.queue.clear();

      expect(session.queue.utterances.length).toBe(0);
    });
  });

  describe('Conversation History', () => {
    it('should maintain separate conversation history per session', async () => {
      const session1 = await sessionManager.createSession();
      const session2 = await sessionManager.createSession();

      session1.queue.add('User message 1');
      session1.queue.addAssistantMessage('Assistant response 1');

      session2.queue.add('User message 2');
      session2.queue.addAssistantMessage('Assistant response 2');

      const messages1 = session1.queue.getRecentMessages();
      const messages2 = session2.queue.getRecentMessages();

      expect(messages1.length).toBe(2);
      expect(messages2.length).toBe(2);
      expect(messages1[0].text).toBe('User message 1');
      expect(messages2[0].text).toBe('User message 2');
    });

    it('should sync utterance status in conversation history', async () => {
      const session = await sessionManager.createSession();

      const utterance = session.queue.add('Test message');
      const messages = session.queue.getRecentMessages();

      expect(messages[0].status).toBe('pending');

      session.queue.markDelivered(utterance.id);

      expect(messages[0].status).toBe('delivered');
    });
  });

  describe('Activity Tracking', () => {
    it('should not update activity for non-existent session', () => {
      expect(() => {
        sessionManager.updateActivity('non-existent-id');
      }).not.toThrow();
    });

    it('should preserve session after activity update', async () => {
      const session = await sessionManager.createSession();

      session.lastActivityAt = new Date(Date.now() - 2000);

      sessionManager.updateActivity(session.sessionId);
      sessionManager.cleanupInactiveSessions(1000);

      expect(sessionManager.getSession(session.sessionId)).not.toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty trigger aliases', async () => {
      const session = await sessionManager.createSession({
        triggerWord: 'test',
        triggerAliases: []
      });

      expect(session.triggerAliases).toEqual([]);
    });

    it('should handle undefined config', async () => {
      const session = await sessionManager.createSession(undefined);

      expect(session.triggerWord).toBeDefined();
      expect(session.triggerAliases).toEqual([]);
    });

    it('should return null when updating non-existent session trigger', () => {
      const result = sessionManager.updateTriggerWord('non-existent', 'test');
      expect(result).toBeNull();
    });

    it('should handle deleting session multiple times', async () => {
      const session = await sessionManager.createSession();

      const deleted1 = sessionManager.deleteSession(session.sessionId);
      const deleted2 = sessionManager.deleteSession(session.sessionId);

      expect(deleted1).toBe(true);
      expect(deleted2).toBe(false);
    });
  });
});
