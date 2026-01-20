#!/usr/bin/env node

import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { debugLog } from './debug.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SessionManager, SessionState } from './session-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const WAIT_TIMEOUT_SECONDS = 300;
const HTTP_PORT = process.env.MCP_VOICE_HOOKS_PORT ? parseInt(process.env.MCP_VOICE_HOOKS_PORT) : 5111;

// Promisified exec for async/await
const execAsync = promisify(exec);

// Function to play a sound notification
async function playNotificationSound() {
  try {
    // Use macOS system sound
    await execAsync('afplay /System/Library/Sounds/Funk.aiff');
    debugLog('[Sound] Played notification sound');
  } catch (error) {
    debugLog(`[Sound] Failed to play sound: ${error}`);
    // Don't throw - sound is not critical
  }
}

// Determine if we're running in MCP-managed mode
const IS_MCP_MANAGED = process.argv.includes('--mcp-managed');

// Session manager singleton
const sessionManager = new SessionManager();

// Helper function to get session from request
function getSessionFromRequest(req: Request): SessionState | null {
  const sessionId = req.query.sessionId as string || req.headers['x-session-id'] as string;

  if (!sessionId) {
    const sessions = sessionManager.getAllSessions();
    if (sessions.length === 1) return sessions[0];
    return null;
  }

  const session = sessionManager.getSession(sessionId);
  if (session) sessionManager.updateActivity(sessionId);
  return session;
}

// HTTP Server Setup (always created)
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.post('/api/potential-utterances', (req: Request, res: Response) => {
  const session = getSessionFromRequest(req);

  if (!session) {
    res.status(400).json({
      error: 'Session not found',
      message: 'Valid sessionId required to add utterances'
    });
    return;
  }

  const { text, timestamp } = req.body;

  if (!text || !text.trim()) {
    res.status(400).json({ error: 'Text is required' });
    return;
  }

  const parsedTimestamp = timestamp ? new Date(timestamp) : undefined;
  const utterance = session.queue.add(text, parsedTimestamp);
  res.json({
    success: true,
    utterance: {
      id: utterance.id,
      text: utterance.text,
      timestamp: utterance.timestamp,
      status: utterance.status,
    },
  });
});

app.get('/api/utterances', (req: Request, res: Response) => {
  const session = getSessionFromRequest(req);

  if (!session) {
    res.status(400).json({
      error: 'Session not found',
      message: 'Valid sessionId required to get utterances'
    });
    return;
  }

  const limit = parseInt(req.query.limit as string) || 10;
  const utterances = session.queue.getRecent(limit);

  res.json({
    utterances: utterances.map(u => ({
      id: u.id,
      text: u.text,
      timestamp: u.timestamp,
      status: u.status,
    })),
  });
});

// GET /api/conversation - Returns full conversation history
app.get('/api/conversation', (req: Request, res: Response) => {
  const session = getSessionFromRequest(req);

  if (!session) {
    res.status(400).json({
      error: 'Session not found',
      message: 'Valid sessionId required to get conversation'
    });
    return;
  }

  const limit = parseInt(req.query.limit as string) || 50;
  const messages = session.queue.getRecentMessages(limit);

  res.json({
    messages: messages.map(m => ({
      id: m.id,
      role: m.role,
      text: m.text,
      timestamp: m.timestamp,
      status: m.status // Only present for user messages
    }))
  });
});

app.get('/api/utterances/status', (req: Request, res: Response) => {
  const session = getSessionFromRequest(req);

  if (!session) {
    res.status(400).json({
      error: 'Session not found',
      message: 'Valid sessionId required to get utterance status'
    });
    return;
  }

  const total = session.queue.utterances.length;
  const pending = session.queue.utterances.filter(u => u.status === 'pending').length;
  const delivered = session.queue.utterances.filter(u => u.status === 'delivered').length;

  res.json({
    total,
    pending,
    delivered,
  });
});

// Shared dequeue logic
function dequeueUtterancesCore(session: SessionState) {
  // Always dequeue pending utterances regardless of voiceInputActive
  // This allows both typed and spoken messages to be dequeued
  const pendingUtterances = session.queue.utterances
    .filter(u => u.status === 'pending')
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Mark as delivered
  pendingUtterances.forEach(u => {
    session.queue.markDelivered(u.id);
  });

  return {
    success: true,
    utterances: pendingUtterances.map(u => ({
      text: u.text,
      timestamp: u.timestamp,
    })),
  };
}

// MCP server integration
app.post('/api/dequeue-utterances', (req: Request, res: Response) => {
  const session = getSessionFromRequest(req);

  if (!session) {
    res.status(400).json({
      error: 'Session not found',
      message: 'Valid sessionId required to dequeue utterances'
    });
    return;
  }

  const result = dequeueUtterancesCore(session);
  res.json(result);
});

// Shared wait for utterance logic
async function waitForUtteranceCore(session: SessionState) {
  // Check if voice input is active
  if (!session.voiceInputActive) {
    return {
      success: false,
      error: 'Voice input is not active. Cannot wait for utterances when voice input is disabled.'
    };
  }

  const secondsToWait = WAIT_TIMEOUT_SECONDS;
  const maxWaitMs = secondsToWait * 1000;
  const startTime = Date.now();

  debugLog(`[WaitCore] Starting wait_for_utterance (${secondsToWait}s) for session ${session.sessionId}`);

  // Notify frontend that wait has started
  session.isWaiting = true;
  notifyWaitStatus(session.sessionId, true);

  let firstTime = true;

  // Poll for utterances
  while (Date.now() - startTime < maxWaitMs) {
    // Check if voice input is still active
    if (!session.voiceInputActive) {
      debugLog(`[WaitCore] Voice input deactivated during wait_for_utterance for session ${session.sessionId}`);
      session.isWaiting = false;
      notifyWaitStatus(session.sessionId, false); // Notify wait has ended
      return {
        success: true,
        utterances: [],
        message: 'Voice input was deactivated',
        waitTime: Date.now() - startTime,
      };
    }

    const pendingUtterances = session.queue.utterances.filter(
      u => u.status === 'pending'
    );

    if (pendingUtterances.length > 0) {
      // Found utterances

      // Sort by timestamp (oldest first)
      const sortedUtterances = pendingUtterances
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      // Mark utterances as delivered
      sortedUtterances.forEach(u => {
        session.queue.markDelivered(u.id);
      });

      session.isWaiting = false;
      notifyWaitStatus(session.sessionId, false); // Notify wait has ended
      return {
        success: true,
        utterances: sortedUtterances.map(u => ({
          id: u.id,
          text: u.text,
          timestamp: u.timestamp,
          status: 'delivered', // They are now delivered
        })),
        count: pendingUtterances.length,
        waitTime: Date.now() - startTime,
      };
    }

    if (firstTime) {
      firstTime = false;
      // Play notification sound since we're about to start waiting
      await playNotificationSound();
    }

    // Wait 100ms before checking again
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Timeout reached - no utterances found
  session.isWaiting = false;
  notifyWaitStatus(session.sessionId, false); // Notify wait has ended
  return {
    success: true,
    utterances: [],
    message: `No utterances found after waiting ${secondsToWait} seconds.`,
    waitTime: maxWaitMs,
  };
}

// Wait for utterance endpoint
app.post('/api/wait-for-utterances', async (req: Request, res: Response) => {
  const session = getSessionFromRequest(req);

  if (!session) {
    res.status(400).json({
      error: 'Session not found',
      message: 'Valid sessionId required to wait for utterances'
    });
    return;
  }

  const result = await waitForUtteranceCore(session);

  // If error response, return 400 status
  if (!result.success && result.error) {
    res.status(400).json(result);
    return;
  }

  res.json(result);
});


// API for pre-tool hook to check for pending utterances
app.get('/api/has-pending-utterances', (req: Request, res: Response) => {
  const session = getSessionFromRequest(req);

  if (!session) {
    res.status(400).json({
      error: 'Session not found',
      message: 'Valid sessionId required to check pending utterances'
    });
    return;
  }

  const pendingCount = session.queue.utterances.filter(u => u.status === 'pending').length;
  const hasPending = pendingCount > 0;

  res.json({
    hasPending,
    pendingCount
  });
});

// Unified action validation endpoint
app.post('/api/validate-action', (req: Request, res: Response) => {
  const session = getSessionFromRequest(req);

  if (!session) {
    res.status(400).json({
      error: 'Session not found',
      message: 'Valid sessionId required to validate action'
    });
    return;
  }

  const { action } = req.body;
  const voiceResponsesEnabled = session.voiceResponsesEnabled;

  if (!action || !['tool-use', 'stop'].includes(action)) {
    res.status(400).json({ error: 'Invalid action. Must be "tool-use" or "stop"' });
    return;
  }

  // Only check for pending utterances if voice input is active
  if (session.voiceInputActive) {
    const pendingUtterances = session.queue.utterances.filter(u => u.status === 'pending');
    if (pendingUtterances.length > 0) {
      res.json({
        allowed: false,
        requiredAction: 'dequeue_utterances',
        reason: `${pendingUtterances.length} pending utterance(s) must be dequeued first. Please use dequeue_utterances to process them.`
      });
      return;
    }
  }

  // Check for delivered but unresponded utterances (when voice enabled)
  if (voiceResponsesEnabled) {
    const deliveredUtterances = session.queue.utterances.filter(u => u.status === 'delivered');
    if (deliveredUtterances.length > 0) {
      res.json({
        allowed: false,
        requiredAction: 'speak',
        reason: `${deliveredUtterances.length} delivered utterance(s) require voice response. Please use the speak tool to respond before proceeding.`
      });
      return;
    }
  }

  // For stop action, check if we should wait (only if voice input is active)
  if (action === 'stop' && session.voiceInputActive) {
    if (session.queue.utterances.length > 0) {
      res.json({
        allowed: false,
        requiredAction: 'wait_for_utterance',
        reason: 'Assistant tried to end its response. Stopping is not allowed without first checking for voice input. Assistant should now use wait_for_utterance to check for voice input'
      });
      return;
    }
  }

  // All checks passed - action is allowed
  res.json({
    allowed: true
  });
});

// Unified hook handler
function handleHookRequest(session: SessionState, attemptedAction: 'tool' | 'speak' | 'stop' | 'post-tool'): { decision: 'approve' | 'block', reason?: string } | Promise<{ decision: 'approve' | 'block', reason?: string }> {
  const voiceResponsesEnabled = session.voiceResponsesEnabled;
  const voiceInputActive = session.voiceInputActive;

  // 1. Check for pending utterances and auto-dequeue
  // Always check for pending utterances regardless of voiceInputActive
  // This allows typed messages to be dequeued even when mic is off
  const pendingUtterances = session.queue.utterances.filter(u => u.status === 'pending');
  if (pendingUtterances.length > 0) {
    // Dequeue pending utterances
    const sortedUtterances = pendingUtterances
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Mark as delivered
    sortedUtterances.forEach(u => {
      session.queue.markDelivered(u.id);
    });

    const utterances = sortedUtterances.map(u => ({
      text: u.text,
      timestamp: u.timestamp,
    }));

    return {
      decision: 'block',
      reason: formatVoiceUtterances(utterances)
    };
  }

  // 2. Check for delivered utterances (when voice enabled)
  if (voiceResponsesEnabled) {
    const deliveredUtterances = session.queue.utterances.filter(u => u.status === 'delivered');
    if (deliveredUtterances.length > 0) {
      // Only allow speak to proceed
      if (attemptedAction === 'speak') {
        return { decision: 'approve' };
      }
      return {
        decision: 'block',
        reason: `${deliveredUtterances.length} delivered utterance(s) require voice response. Please use the speak tool to respond before proceeding.`
      };
    }
  }

  // 3. Handle tool and post-tool actions
  if (attemptedAction === 'tool' || attemptedAction === 'post-tool') {
    session.lastToolUseTimestamp = new Date();
    return { decision: 'approve' };
  }

  // 4. Handle speak
  if (attemptedAction === 'speak') {
    return { decision: 'approve' };
  }

  // 5. Handle stop
  if (attemptedAction === 'stop') {
    // Check if must speak after tool use
    if (voiceResponsesEnabled && session.lastToolUseTimestamp &&
      (!session.lastSpeakTimestamp || session.lastSpeakTimestamp < session.lastToolUseTimestamp)) {
      return {
        decision: 'block',
        reason: 'Assistant must speak after using tools. Please use the speak tool to respond before proceeding.'
      };
    }

    // Auto-wait for utterances (only if voice input is active)
    if (voiceInputActive) {
      return (async () => {
        try {
          debugLog(`[Stop Hook] Auto-calling wait_for_utterance for session ${session.sessionId}...`);
          const data = await waitForUtteranceCore(session);
          debugLog(`[Stop Hook] wait_for_utterance response: ${JSON.stringify(data)}`);

          // If error (voice input not active), treat as no utterances found
          if (!data.success && data.error) {
            return {
              decision: 'approve' as const,
              reason: data.error
            };
          }

          // If utterances were found, block and return them
          if (data.utterances && data.utterances.length > 0) {
            return {
              decision: 'block' as const,
              reason: formatVoiceUtterances(data.utterances)
            };
          }

          // If no utterances found (including when voice was deactivated), approve stop
          return {
            decision: 'approve' as const,
            reason: data.message || 'No utterances found during wait'
          };
        } catch (error) {
          debugLog(`[Stop Hook] Error calling wait_for_utterance: ${error}`);
          // Fail open on errors
          return {
            decision: 'approve' as const,
            reason: 'Auto-wait encountered an error, proceeding'
          };
        }
      })();
    }

    return {
      decision: 'approve',
      reason: 'No utterances since last timeout'
    };
  }

  // Default to approve (shouldn't reach here)
  return { decision: 'approve' };
}

// Dedicated hook endpoints that return in Claude's expected format
app.post('/api/hooks/stop', async (req: Request, res: Response) => {
  const session = getSessionFromRequest(req);

  if (!session) {
    res.status(400).json({
      error: 'Session not found',
      message: 'Valid sessionId required for hook endpoints'
    });
    return;
  }

  const result = await handleHookRequest(session, 'stop');
  res.json(result);
});

// Pre-speak hook endpoint
app.post('/api/hooks/pre-speak', (req: Request, res: Response) => {
  const session = getSessionFromRequest(req);

  if (!session) {
    res.status(400).json({
      error: 'Session not found',
      message: 'Valid sessionId required for hook endpoints'
    });
    return;
  }

  const result = handleHookRequest(session, 'speak');
  res.json(result);
});

// Post-tool hook endpoint
app.post('/api/hooks/post-tool', (req: Request, res: Response) => {
  const session = getSessionFromRequest(req);

  if (!session) {
    res.status(400).json({
      error: 'Session not found',
      message: 'Valid sessionId required for hook endpoints'
    });
    return;
  }

  // Use the unified handler with 'post-tool' action
  const result = handleHookRequest(session, 'post-tool');
  res.json(result);
});

// API to clear all utterances
// Delete specific utterance by ID
app.delete('/api/utterances/:id', (req: Request, res: Response) => {
  const session = getSessionFromRequest(req);

  if (!session) {
    res.status(400).json({
      error: 'Session not found',
      message: 'Valid sessionId required to delete utterances'
    });
    return;
  }

  const { id } = req.params;

  const deleted = session.queue.delete(id);

  if (deleted) {
    res.json({
      success: true,
      message: 'Message deleted'
    });
  } else {
    res.status(400).json({
      error: 'Only pending messages can be deleted',
      success: false
    });
  }
});

// Delete all utterances
app.delete('/api/utterances', (req: Request, res: Response) => {
  const session = getSessionFromRequest(req);

  if (!session) {
    res.status(400).json({
      error: 'Session not found',
      message: 'Valid sessionId required to clear utterances'
    });
    return;
  }

  const clearedCount = session.queue.utterances.length;
  session.queue.clear();

  res.json({
    success: true,
    message: `Cleared ${clearedCount} utterances`,
    clearedCount
  });
});

// Server-Sent Events for TTS notifications - now per-session
const ttsClients = new Map<string, Set<Response>>();

app.get('/api/tts-events', (req: Request, res: Response) => {
  const session = getSessionFromRequest(req);

  if (!session) {
    res.status(400).json({
      error: 'Session not found',
      message: 'Valid sessionId required for TTS events'
    });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Send initial connection message
  res.write('data: {"type":"connected"}\n\n');

  // Add client to session's set
  if (!ttsClients.has(session.sessionId)) {
    ttsClients.set(session.sessionId, new Set());
  }
  ttsClients.get(session.sessionId)!.add(res);

  // Remove client on disconnect
  res.on('close', () => {
    const sessionClients = ttsClients.get(session.sessionId);
    if (sessionClients) {
      sessionClients.delete(res);

      // If no clients remain for this session, disable voice features
      if (sessionClients.size === 0) {
        debugLog(`[SSE] Last browser disconnected for session ${session.sessionId}, disabling voice features`);
        if (session.voiceInputActive || session.voiceResponsesEnabled) {
          debugLog(`[SSE] Voice features disabled - Input: ${session.voiceInputActive} -> false, Responses: ${session.voiceResponsesEnabled} -> false`);
          session.voiceInputActive = false;
          session.voiceResponsesEnabled = false;
          session.voicePreferences.voiceInputActive = false;
          session.voicePreferences.voiceResponsesEnabled = false;
        }
        ttsClients.delete(session.sessionId);
      } else {
        debugLog(`[SSE] Browser disconnected for session ${session.sessionId}, ${sessionClients.size} client(s) remaining`);
      }
    }
  });
});

// Helper function to notify all connected TTS clients for a specific session
function notifyTTSClients(sessionId: string, text: string) {
  const message = JSON.stringify({ type: 'speak', text });
  const sessionClients = ttsClients.get(sessionId);
  if (sessionClients) {
    sessionClients.forEach(client => {
      client.write(`data: ${message}\n\n`);
    });
  }
}

// Process next item in speak queue for a specific session
function processNextInQueue(session: SessionState) {
  if (session.speakQueue.length === 0) {
    session.isSpeaking = false;
    return;
  }

  const nextRequest = session.speakQueue.shift();
  if (nextRequest) {
    notifyTTSClients(session.sessionId, nextRequest.text);
    nextRequest.resolve();
  }
}

// Helper function to notify all connected clients about wait status for a specific session
function notifyWaitStatus(sessionId: string, isWaiting: boolean) {
  const message = JSON.stringify({ type: 'waitStatus', isWaiting });
  const sessionClients = ttsClients.get(sessionId);
  if (sessionClients) {
    sessionClients.forEach(client => {
      client.write(`data: ${message}\n\n`);
    });
  }
}

// Helper function to format voice utterances for display
function formatVoiceUtterances(utterances: any[]): string {
  const utteranceTexts = utterances
    .map(u => `"${u.text}"`)
    .join('\n');

  return `Assistant received voice input from the user (${utterances.length} utterance${utterances.length !== 1 ? 's' : ''}):\n\n${utteranceTexts}${getVoiceResponseReminder()}`;
}

// API for voice preferences
app.post('/api/voice-preferences', (req: Request, res: Response) => {
  const session = getSessionFromRequest(req);

  if (!session) {
    res.status(400).json({
      error: 'Session not found',
      message: 'Valid sessionId required to update voice preferences'
    });
    return;
  }

  const { voiceResponsesEnabled } = req.body;

  // Update preferences
  session.voiceResponsesEnabled = !!voiceResponsesEnabled;
  session.voicePreferences.voiceResponsesEnabled = !!voiceResponsesEnabled;

  debugLog(`[Preferences] Updated for session ${session.sessionId}: voiceResponses=${session.voiceResponsesEnabled}`);

  res.json({
    success: true,
    preferences: session.voicePreferences
  });
});

// API for voice input state
app.post('/api/voice-input-state', (req: Request, res: Response) => {
  const session = getSessionFromRequest(req);

  if (!session) {
    res.status(400).json({
      error: 'Session not found',
      message: 'Valid sessionId required to update voice input state'
    });
    return;
  }

  const { active } = req.body;

  // Update voice input state
  session.voiceInputActive = !!active;
  session.voicePreferences.voiceInputActive = !!active;

  debugLog(`[Voice Input] Session ${session.sessionId} ${session.voiceInputActive ? 'Started' : 'Stopped'} listening`);

  res.json({
    success: true,
    voiceInputActive: session.voiceInputActive
  });
});

// API for text-to-speech
app.post('/api/speak', async (req: Request, res: Response) => {
  const session = getSessionFromRequest(req);

  if (!session) {
    res.status(400).json({
      error: 'Session not found',
      message: 'Valid sessionId required to speak'
    });
    return;
  }

  const { text } = req.body;

  if (!text || !text.trim()) {
    res.status(400).json({ error: 'Text is required' });
    return;
  }

  // Check if voice responses are enabled
  if (!session.voiceResponsesEnabled) {
    debugLog(`[Speak] Voice responses disabled for session ${session.sessionId}, returning error`);
    res.status(400).json({
      error: 'Voice responses are disabled',
      message: 'Cannot speak when voice responses are disabled'
    });
    return;
  }

  try {
    // If already speaking, queue this request
    if (session.isSpeaking) {
      debugLog(`[Speak] Session ${session.sessionId} already speaking, queuing request: "${text}"`);
      await new Promise<void>((resolve) => {
        session.speakQueue.push({ text, resolve });
      });
    } else {
      // Not speaking, proceed immediately
      session.isSpeaking = true;
      notifyTTSClients(session.sessionId, text);
      debugLog(`[Speak] Session ${session.sessionId} sent text to browser for TTS: "${text}"`);
    }

    // Store assistant's response in conversation history
    session.queue.addAssistantMessage(text);

    // Mark all delivered utterances as responded
    const deliveredUtterances = session.queue.utterances.filter(u => u.status === 'delivered');
    deliveredUtterances.forEach(u => {
      u.status = 'responded';
      debugLog(`[Queue] marked as responded: "${u.text}"	[id: ${u.id}]`);

      // Sync status in messages array
      const message = session.queue.messages.find(m => m.id === u.id && m.role === 'user');
      if (message) {
        message.status = 'responded';
      }
    });

    session.lastSpeakTimestamp = new Date();

    res.json({
      success: true,
      message: 'Text spoken successfully',
      respondedCount: deliveredUtterances.length
    });
  } catch (error) {
    debugLog(`[Speak] Failed to speak text: ${error}`);
    res.status(500).json({
      error: 'Failed to speak text',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// API for browser to notify when TTS completes
app.post('/api/speak-done', (req: Request, res: Response) => {
  const session = getSessionFromRequest(req);

  if (!session) {
    res.status(400).json({
      error: 'Session not found',
      message: 'Valid sessionId required to mark speak done'
    });
    return;
  }

  debugLog(`[Speak] TTS completed for session ${session.sessionId}, processing next in queue`);
  processNextInQueue(session);
  res.json({ success: true });
});

// API for system text-to-speech (always uses Mac say command)
app.post('/api/speak-system', async (req: Request, res: Response) => {
  const { text, rate = 150 } = req.body;

  if (!text || !text.trim()) {
    res.status(400).json({ error: 'Text is required' });
    return;
  }

  try {
    // Execute text-to-speech using macOS say command
    // Note: Mac say command doesn't support volume control
    await execAsync(`say -r ${rate} "${text.replace(/"/g, '\\"')}"`);
    debugLog(`[Speak System] Spoke text using macOS say: "${text}" (rate: ${rate})`);

    res.json({
      success: true,
      message: 'Text spoken successfully via system voice'
    });
  } catch (error) {
    debugLog(`[Speak System] Failed to speak text: ${error}`);
    res.status(500).json({
      error: 'Failed to speak text via system voice',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Session Management Endpoints

// POST /api/sessions/register - Register a new session
app.post('/api/sessions/register', async (req: Request, res: Response) => {
  const { triggerWord, triggerAliases } = req.body;

  try {
    const session = await sessionManager.createSession({
      triggerWord,
      triggerAliases
    });

    debugLog(`[Sessions] Registered new session: ${session.sessionId} with trigger word: ${session.triggerWord}`);

    // Auto-open browser with sessionId
    const autoOpenBrowser = process.env.MCP_VOICE_HOOKS_AUTO_OPEN_BROWSER !== 'false';
    if (autoOpenBrowser) {
      setTimeout(async () => {
        try {
          const open = (await import('open')).default;
          await open(`http://localhost:${HTTP_PORT}?sessionId=${session.sessionId}`);
          debugLog(`[Sessions] Opened browser for session: ${session.sessionId}`);
        } catch (error) {
          debugLog(`[Sessions] Failed to open browser: ${error}`);
        }
      }, 100);
    }

    res.json({
      success: true,
      sessionId: session.sessionId,
      triggerWord: session.triggerWord,
      serverUrl: `http://localhost:${HTTP_PORT}`
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if trigger word is already in use
    if (errorMessage.includes('already in use')) {
      res.status(400).json({
        error: errorMessage,
        suggestion: 'Please choose a different trigger word or use an existing session'
      });
      return;
    }

    debugLog(`[Sessions] Failed to register session: ${error}`);
    res.status(500).json({
      error: 'Failed to register session',
      details: errorMessage
    });
  }
});

// GET /api/sessions/active - Get all active sessions
app.get('/api/sessions/active', (_req: Request, res: Response) => {
  try {
    const sessions = sessionManager.getActiveSessions();

    const sessionData = sessions.map(session => ({
      sessionId: session.sessionId,
      triggerWord: session.triggerWord,
      triggerAliases: session.triggerAliases,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      voiceInputActive: session.voiceInputActive,
      voiceResponsesEnabled: session.voiceResponsesEnabled,
      pendingCount: session.getPendingCount(),
      isWaiting: session.isWaiting
    }));

    res.json({
      success: true,
      sessions: sessionData,
      count: sessionData.length
    });
  } catch (error) {
    debugLog(`[Sessions] Failed to get active sessions: ${error}`);
    res.status(500).json({
      error: 'Failed to get active sessions',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET /api/sessions/:sessionId - Get single session metadata
app.get('/api/sessions/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;

  try {
    const session = sessionManager.getSession(sessionId);

    if (!session) {
      res.status(404).json({
        error: 'Session not found',
        sessionId
      });
      return;
    }

    res.json({
      success: true,
      session: {
        sessionId: session.sessionId,
        triggerWord: session.triggerWord,
        triggerAliases: session.triggerAliases,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
        voiceInputActive: session.voiceInputActive,
        voiceResponsesEnabled: session.voiceResponsesEnabled,
        pendingCount: session.getPendingCount(),
        isWaiting: session.isWaiting
      }
    });
  } catch (error) {
    debugLog(`[Sessions] Failed to get session ${sessionId}: ${error}`);
    res.status(500).json({
      error: 'Failed to get session',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// DELETE /api/sessions/:sessionId - Delete session
app.delete('/api/sessions/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;

  try {
    const deleted = sessionManager.deleteSession(sessionId);

    if (!deleted) {
      res.status(404).json({
        error: 'Session not found',
        sessionId
      });
      return;
    }

    debugLog(`[Sessions] Deleted session: ${sessionId}`);

    res.json({
      success: true,
      message: 'Session deleted successfully',
      sessionId
    });
  } catch (error) {
    debugLog(`[Sessions] Failed to delete session ${sessionId}: ${error}`);
    res.status(500).json({
      error: 'Failed to delete session',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// PATCH /api/sessions/:sessionId/trigger - Update trigger word
app.patch('/api/sessions/:sessionId/trigger', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { triggerWord, triggerAliases } = req.body;

  if (!triggerWord || !triggerWord.trim()) {
    res.status(400).json({
      error: 'Trigger word is required'
    });
    return;
  }

  try {
    const session = sessionManager.updateTriggerWord(sessionId, triggerWord, triggerAliases);

    if (!session) {
      res.status(404).json({
        error: 'Session not found',
        sessionId
      });
      return;
    }

    debugLog(`[Sessions] Updated trigger word for session ${sessionId}: ${triggerWord}`);

    res.json({
      success: true,
      sessionId: session.sessionId,
      triggerWord: session.triggerWord,
      triggerAliases: session.triggerAliases
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if trigger word is already in use
    if (errorMessage.includes('already in use')) {
      res.status(400).json({
        error: errorMessage,
        suggestion: 'Please choose a different trigger word'
      });
      return;
    }

    debugLog(`[Sessions] Failed to update trigger word for session ${sessionId}: ${error}`);
    res.status(500).json({
      error: 'Failed to update trigger word',
      details: errorMessage
    });
  }
});

// UI Routing
app.get('/', (_req: Request, res: Response) => {
  // Default to messenger UI (now index.html, can be overridden with --legacy-ui flag)
  const useLegacyUI = process.env.MCP_VOICE_HOOKS_LEGACY_UI === 'true';
  const htmlFile = useLegacyUI ? 'legacy.html' : 'index.html';
  debugLog(`[HTTP] Serving ${htmlFile} for root route`);
  res.sendFile(path.join(__dirname, '..', 'public', htmlFile));
});

app.get('/legacy', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'legacy.html'));
});

app.get('/messenger', (_req: Request, res: Response) => {
  // Messenger is now the default index.html
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start HTTP server
app.listen(HTTP_PORT, async () => {
  if (!IS_MCP_MANAGED) {
    console.log(`[HTTP] Server listening on http://localhost:${HTTP_PORT}`);
    console.log(`[Mode] Running in ${IS_MCP_MANAGED ? 'MCP-managed' : 'standalone'} mode`);
  } else {
    // In MCP mode, write to stderr to avoid interfering with protocol
    console.error(`[HTTP] Server listening on http://localhost:${HTTP_PORT}`);
    console.error(`[Mode] Running in MCP-managed mode`);
  }

  // Start session cleanup task (cleanup every 5 minutes, sessions inactive for 1 hour)
  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  sessionManager.startCleanupTask(CLEANUP_INTERVAL_MS);
  debugLog('[Sessions] Started cleanup task');

  // Auto-open browser if no frontend connects within 3 seconds
  const autoOpenBrowser = process.env.MCP_VOICE_HOOKS_AUTO_OPEN_BROWSER !== 'false'; // Default to true
  if (IS_MCP_MANAGED && autoOpenBrowser) {
    setTimeout(async () => {
      const totalClients = Array.from(ttsClients.values()).reduce((sum, set) => sum + set.size, 0);
      if (totalClients === 0) {
        debugLog('[Browser] No frontend connected, opening browser...');
        try {
          const open = (await import('open')).default;
          // Open default UI (messenger is now at root)
          await open(`http://localhost:${HTTP_PORT}`);
        } catch (error) {
          debugLog('[Browser] Failed to open browser:', error);
        }
      } else {
        debugLog(`[Browser] Frontend already connected (${totalClients} client(s))`)
      }
    }, 3000);
  }
});

// Helper function to get voice response reminder (uses legacy global state for backward compat)
function getVoiceResponseReminder(): string {
  // Note: This function is used for formatting hook responses
  // It doesn't need session context as the hook handler already has it
  return '\n\nThe user has enabled voice responses, so use the \'speak\' tool to respond to the user\'s voice input before proceeding.';
}

// MCP Server Setup (only if MCP-managed)
if (IS_MCP_MANAGED) {
  // Use stderr in MCP mode to avoid interfering with protocol
  console.error('[MCP] Initializing MCP server...');

  const mcpServer = new Server(
    {
      name: 'voice-hooks',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Tool handlers
  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
    // Only expose the speak tool - voice input is auto-delivered via hooks
    return {
      tools: [
        {
          name: 'speak',
          description: 'Speak text using text-to-speech and mark delivered utterances as responded',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'The text to speak',
              },
            },
            required: ['text'],
          },
        }
      ]
    };
  });

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === 'speak') {
        const text = args?.text as string;

        if (!text || !text.trim()) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Text is required for speak tool',
              },
            ],
            isError: true,
          };
        }

        const response = await fetch(`http://localhost:${HTTP_PORT}/api/speak`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });

        const data = await response.json() as any;

        if (response.ok) {
          return {
            content: [
              {
                type: 'text',
                text: '',  // Return empty string for success
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: `Error speaking text: ${data.error || 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Connect via stdio
  const transport = new StdioServerTransport();
  mcpServer.connect(transport);
  // Use stderr in MCP mode to avoid interfering with protocol
  console.error('[MCP] Server connected via stdio');
} else {
  // Only log in standalone mode
  if (!IS_MCP_MANAGED) {
    console.log('[MCP] Skipping MCP server initialization (not in MCP-managed mode)');
  }
}