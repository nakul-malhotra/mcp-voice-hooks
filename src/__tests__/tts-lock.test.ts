import { TestServer } from '../test-utils/test-server.js';

describe('TTS Lock System Tests', () => {
  let server: TestServer;

  beforeEach(async () => {
    server = new TestServer();
    await server.start();

    // Enable voice responses for TTS testing
    await fetch(`${server.url}/api/voice-responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true })
    });
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('When not speaking', () => {
    it('should allow speak request to proceed immediately', async () => {
      const response = await fetch(`${server.url}/api/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'First message' })
      });

      const data = await response.json() as any;

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Text spoken successfully');
    });
  });

  describe('When speaking', () => {
    it('should queue speak request when already speaking', async () => {
      // First request - should proceed immediately
      const firstPromise = fetch(`${server.url}/api/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'First message' })
      });

      // Wait a bit to ensure first request is in progress
      await new Promise(resolve => setTimeout(resolve, 10));

      // Second request - should be queued
      const secondPromise = fetch(`${server.url}/api/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Second message' })
      });

      // First should complete immediately
      const first = await firstPromise;
      expect(first.status).toBe(200);
      const firstData = await first.json() as any;
      expect(firstData.success).toBe(true);

      // Call speak-done to process queue
      await fetch(`${server.url}/api/speak-done`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      // Second should now complete
      const second = await secondPromise;
      expect(second.status).toBe(200);
      const secondData = await second.json() as any;
      expect(secondData.success).toBe(true);
    });
  });

  describe('When speak-done is called', () => {
    it('should process next queued item', async () => {
      // Start first speak request
      const firstPromise = fetch(`${server.url}/api/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'First message' })
      });

      // Wait a bit to ensure first request is in progress
      await new Promise(resolve => setTimeout(resolve, 10));

      // Queue second speak request
      const secondPromise = fetch(`${server.url}/api/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Second message' })
      });

      // Complete first speak
      await firstPromise;

      // Call speak-done to trigger next in queue
      const doneResponse = await fetch(`${server.url}/api/speak-done`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      expect(doneResponse.status).toBe(200);

      // Second should complete
      const secondResponse = await secondPromise;
      expect(secondResponse.status).toBe(200);
    });
  });

  describe('Queue processing in FIFO order', () => {
    it('should process queued requests in first-in-first-out order', async () => {
      const processedOrder: number[] = [];

      // Helper to track when each message completes
      const trackMessage = async (text: string, index: number) => {
        const response = await fetch(`${server.url}/api/speak`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        const data = await response.json() as any;
        if (data.success) {
          processedOrder.push(index);
        }
        return response;
      };

      // Send multiple requests rapidly
      const promise1 = trackMessage('Message 1', 1);

      // Wait a bit to ensure first is in progress
      await new Promise(resolve => setTimeout(resolve, 10));

      const promise2 = trackMessage('Message 2', 2);
      const promise3 = trackMessage('Message 3', 3);

      // Wait for first to complete
      await promise1;
      expect(processedOrder[0]).toBe(1);

      // Trigger processing of queue
      await fetch(`${server.url}/api/speak-done`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      await promise2;
      expect(processedOrder[1]).toBe(2);

      await fetch(`${server.url}/api/speak-done`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      await promise3;
      expect(processedOrder[2]).toBe(3);

      // Verify FIFO order
      expect(processedOrder).toEqual([1, 2, 3]);
    });
  });

  describe('Multiple queued requests', () => {
    it('should process all queued requests sequentially', async () => {
      const messageCount = 5;
      const promises: Promise<Response>[] = [];

      // Start first request
      promises.push(
        fetch(`${server.url}/api/speak`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'Message 1' })
        })
      );

      // Wait a bit to ensure first is in progress
      await new Promise(resolve => setTimeout(resolve, 10));

      // Queue remaining messages
      for (let i = 2; i <= messageCount; i++) {
        promises.push(
          fetch(`${server.url}/api/speak`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: `Message ${i}` })
          })
        );
      }

      // Wait for first to complete
      const first = await promises[0];
      expect(first.status).toBe(200);

      // Trigger speak-done for each queued item
      for (let i = 1; i < messageCount; i++) {
        await fetch(`${server.url}/api/speak-done`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // All promises should resolve successfully
      const responses = await Promise.all(promises);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Call speak-done one more time to clear the lock
      await fetch(`${server.url}/api/speak-done`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    });
  });

  describe('Empty queue after speak-done', () => {
    it('should set isSpeaking to false when queue is empty', async () => {
      // Send single speak request
      const response = await fetch(`${server.url}/api/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Only message' })
      });

      expect(response.status).toBe(200);

      // Call speak-done with empty queue
      const doneResponse = await fetch(`${server.url}/api/speak-done`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      expect(doneResponse.status).toBe(200);
      const doneData = await doneResponse.json() as any;
      expect(doneData.success).toBe(true);

      // Next speak request should proceed immediately (not queued)
      const nextResponse = await fetch(`${server.url}/api/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Next message' })
      });

      expect(nextResponse.status).toBe(200);
      const nextData = await nextResponse.json() as any;
      expect(nextData.success).toBe(true);
    });
  });

  describe('Conversation history tracking', () => {
    it('should add assistant messages to conversation history when speaking', async () => {
      const text1 = 'First response';
      const text2 = 'Second response';

      // Send first speak request
      await fetch(`${server.url}/api/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text1 })
      });

      // Call speak-done
      await fetch(`${server.url}/api/speak-done`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      // Send second speak request
      await fetch(`${server.url}/api/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text2 })
      });

      // Get conversation history
      const convResponse = await fetch(`${server.url}/api/conversation`);
      const convData = await convResponse.json() as any;

      // Find assistant messages
      const assistantMessages = convData.messages.filter((m: any) => m.role === 'assistant');
      expect(assistantMessages.length).toBeGreaterThanOrEqual(2);

      const messages = assistantMessages.map((m: any) => m.text);
      expect(messages).toContain(text1);
      expect(messages).toContain(text2);
    });
  });

  describe('Utterance response marking', () => {
    it('should mark delivered utterances as responded when speaking', async () => {
      // Enable voice input
      await fetch(`${server.url}/api/voice-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: true })
      });

      // Add an utterance
      await fetch(`${server.url}/api/potential-utterances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'User said something' })
      });

      // Dequeue to mark as delivered
      await fetch(`${server.url}/api/dequeue-utterances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      // Speak to mark as responded
      const speakResponse = await fetch(`${server.url}/api/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Response to user' })
      });

      const speakData = await speakResponse.json() as any;
      expect(speakData.success).toBe(true);
      expect(speakData.respondedCount).toBe(1);

      // Check status
      const statusResponse = await fetch(`${server.url}/api/utterances/status`);
      const statusData = await statusResponse.json() as any;

      // Utterance should be marked as responded (no longer delivered)
      expect(statusData.delivered).toBe(0);
    });
  });
});
