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
import { writeFileSync, unlinkSync } from 'fs';
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

// Collect this process's PID, parent PID, and grandparent PID.
// Hooks run as direct children of Claude Code, so their $PPID is Claude Code's PID.
// The MCP server may be a child (npx exec'd) or grandchild (npx spawned node) of Claude Code.
// Registering all ancestor PIDs ensures at least one matches the hook's $PPID.
async function getAncestorPids(): Promise<number[]> {
  const pids = [process.pid, process.ppid];
  try {
    const { stdout } = await execAsync(`ps -o ppid= -p ${process.ppid}`);
    const grandparentPid = parseInt(stdout.trim());
    if (grandparentPid > 1 && !pids.includes(grandparentPid)) {
      pids.push(grandparentPid);
    }
  } catch {
    // Ignore - grandparent lookup is best-effort
  }
  return pids;
}

// Write session ID to PID-keyed files so hooks can read it via $(cat /tmp/mcp-voice-session-$PPID).
// Returns the file paths written (for cleanup on exit).
function writeSessionFiles(sessionId: string, pids: number[]): string[] {
  const paths: string[] = [];
  for (const pid of pids) {
    const filePath = `/tmp/mcp-voice-session-${pid}`;
    try {
      writeFileSync(filePath, sessionId);
      paths.push(filePath);
    } catch {
      // Best-effort
    }
  }
  return paths;
}

function cleanupSessionFiles(paths: string[]) {
  for (const p of paths) {
    try { unlinkSync(p); } catch { /* already gone */ }
  }
}

// Session manager singleton (source of truth for primary instance)
const sessionManager = new SessionManager();

/**
 * Centralized session client for MCP instances.
 * Routes to local session manager if primary, or HTTP if secondary.
 * This ensures all session state goes through the shared HTTP server.
 */
class McpSessionClient {
  private sessionId: string | null = null;
  private triggerWord: string | null = null;
  private sessionFilePaths: string[] = [];

  /** Register a new session and get assigned a unique trigger word */
  async register(): Promise<{ sessionId: string; triggerWord: string }> {
    if (this.sessionId) {
      return { sessionId: this.sessionId, triggerWord: this.triggerWord! };
    }

    // Always register via HTTP to ensure shared state handles uniqueness
    const ownerPids = await getAncestorPids();
    const response = await fetch(`http://localhost:${HTTP_PORT}/api/sessions/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerPids }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to register session');
    }

    const data = await response.json();
    this.sessionId = data.sessionId;
    this.triggerWord = data.triggerWord;

    // Write session ID to PID-keyed files so hooks can resolve it
    this.sessionFilePaths = writeSessionFiles(data.sessionId, ownerPids);
    console.error(`[McpSessionClient] Registered session: ${this.sessionId} with trigger: ${this.triggerWord}`);
    return { sessionId: data.sessionId as string, triggerWord: data.triggerWord as string };
  }

  /** Force re-registration, clearing any stale session state */
  async reconnect(): Promise<{ sessionId: string; triggerWord: string }> {
    cleanupSessionFiles(this.sessionFilePaths);
    this.sessionFilePaths = [];
    this.sessionId = null;
    this.triggerWord = null;
    return this.register();
  }

  /** Get session ID, registering if needed */
  async getSessionId(): Promise<string> {
    if (!this.sessionId) {
      await this.register();
    }
    return this.sessionId!;
  }

  /** Get session info */
  async getSessionInfo(): Promise<any> {
    const sessionId = await this.getSessionId();
    const [sessionRes, statusRes] = await Promise.all([
      fetch(`http://localhost:${HTTP_PORT}/api/sessions/${sessionId}`),
      fetch(`http://localhost:${HTTP_PORT}/api/utterances/status?sessionId=${sessionId}`),
    ]);

    if (!sessionRes.ok) {
      throw new Error('Session not found');
    }

    const sessionData = await sessionRes.json();
    const statusData = statusRes.ok ? await statusRes.json() : { pending: 0, delivered: 0, total: 0 };

    return {
      sessionId: sessionData.session.sessionId,
      triggerWord: sessionData.session.triggerWord,
      triggerAliases: sessionData.session.triggerAliases || [],
      voiceResponsesEnabled: sessionData.session.voiceResponsesEnabled,
      voiceInputActive: sessionData.session.voiceInputActive,
      pendingMessages: statusData.pending,
      deliveredMessages: statusData.delivered,
      totalMessages: statusData.total,
      createdAt: sessionData.session.createdAt,
      lastActivityAt: sessionData.session.lastActivityAt,
    };
  }

  /** Get pending messages (without marking as delivered) */
  async getPendingMessages(): Promise<{ count: number; messages: any[] }> {
    const sessionId = await this.getSessionId();
    const response = await fetch(`http://localhost:${HTTP_PORT}/api/utterances?sessionId=${sessionId}&limit=100`);

    if (!response.ok) {
      throw new Error('Failed to get messages');
    }

    const data = await response.json();
    const pending = (data.utterances || [])
      .filter((u: any) => u.status === 'pending')
      .map((u: any) => ({ id: u.id, text: u.text, timestamp: u.timestamp }));

    return { count: pending.length, messages: pending };
  }

  /** Dequeue pending messages (marks them as delivered) */
  async dequeueMessages(): Promise<{ utterances: any[] }> {
    const sessionId = await this.getSessionId();
    const response = await fetch(`http://localhost:${HTTP_PORT}/api/dequeue-utterances?sessionId=${sessionId}`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('Failed to dequeue messages');
    }

    return await response.json();
  }

  /** Wait for new utterances (blocking with timeout) */
  async waitForUtterance(timeoutSeconds: number = 60): Promise<any> {
    const sessionId = await this.getSessionId();
    const response = await fetch(`http://localhost:${HTTP_PORT}/api/wait-for-utterances?sessionId=${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeout: timeoutSeconds }),
    });

    return await response.json();
  }

  /** Speak text via TTS */
  async speak(text: string): Promise<any> {
    const sessionId = await this.getSessionId();
    const response = await fetch(`http://localhost:${HTTP_PORT}/api/speak?sessionId=${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to speak');
    }

    return await response.json();
  }

  /** Get conversation history */
  async getConversationHistory(limit: number = 50): Promise<any[]> {
    const sessionId = await this.getSessionId();
    const response = await fetch(`http://localhost:${HTTP_PORT}/api/conversation?sessionId=${sessionId}&limit=${limit}`);

    if (!response.ok) {
      throw new Error('Failed to get conversation history');
    }

    const data = await response.json();
    return data.messages || [];
  }

  /** Set voice input active/inactive */
  async setVoiceInput(active: boolean): Promise<{ voiceInputActive: boolean }> {
    const sessionId = await this.getSessionId();
    const response = await fetch(`http://localhost:${HTTP_PORT}/api/voice-input-state?sessionId=${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });

    if (!response.ok) {
      throw new Error('Failed to set voice input state');
    }

    return await response.json();
  }
}

// Helper function to get session from request
function getSessionFromRequest(req: Request): SessionState | null {
  const sessionId = req.query.sessionId as string || req.headers['x-session-id'] as string;

  if (sessionId) {
    const session = sessionManager.getSession(sessionId);
    if (session) sessionManager.updateActivity(sessionId);
    return session;
  }

  // PID-based lookup: hooks pass their $PPID (Claude Code's PID),
  // which matches one of the ownerPids registered during MCP session creation.
  const callerPpid = req.headers['x-caller-ppid'] as string;
  if (callerPpid) {
    const pid = parseInt(callerPpid);
    if (!isNaN(pid)) {
      const session = sessionManager.getSessionByOwnerPid(pid);
      if (session) {
        sessionManager.updateActivity(session.sessionId);
        return session;
      }
    }
  }

  // Fallback: if only one session exists, return it
  const sessions = sessionManager.getAllSessions();
  if (sessions.length === 1) return sessions[0];
  return null;
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

    // Auto-wait for utterances (only if voice input is active).
    // Loops until an utterance arrives or voice input is deactivated,
    // so Claude never goes idle while the mic is on.
    if (voiceInputActive) {
      return (async () => {
        try {
          while (session.voiceInputActive) {
            debugLog(`[Stop Hook] Auto-calling wait_for_utterance for session ${session.sessionId}...`);
            const data = await waitForUtteranceCore(session);
            debugLog(`[Stop Hook] wait_for_utterance response: ${JSON.stringify(data)}`);

            // If error (voice input not active), let Claude stop
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

            // Timeout reached but voice still active -- keep waiting
            debugLog(`[Stop Hook] Wait timed out, voice still active for session ${session.sessionId}, re-entering wait...`);
          }

          // Voice was deactivated during the wait
          return {
            decision: 'approve' as const,
            reason: 'Voice input deactivated'
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
  const message = JSON.stringify({ type: 'message', text });
  const sessionClients = ttsClients.get(sessionId);
  if (sessionClients) {
    debugLog(`[SSE] Sending message to ${sessionClients.size} client(s) for session ${sessionId}: "${text.substring(0, 50)}..."`);
    sessionClients.forEach(client => {
      client.write(`data: ${message}\n\n`);
    });
  } else {
    debugLog(`[SSE] No clients connected for session ${sessionId}, message not sent`);
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

// Helper function to notify ALL connected clients (across all sessions) about global events
function notifyAllClients(data: Record<string, unknown>) {
  const message = JSON.stringify(data);
  ttsClients.forEach((sessionClients) => {
    sessionClients.forEach(client => {
      client.write(`data: ${message}\n\n`);
    });
  });
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

// POST /api/sessions - Create a new session (browser UI shortcut)
app.post('/api/sessions', async (req: Request, res: Response) => {
  console.log('[API /api/sessions] POST request received (browser UI create)');
  console.log('[API /api/sessions] Request body:', JSON.stringify(req.body));

  try {
    const session = await sessionManager.createSession({
      triggerWord: req.body?.triggerWord,
      triggerAliases: req.body?.triggerAliases
    });

    console.log(`[API /api/sessions] SUCCESS - Created session: ${session.sessionId} with trigger: ${session.triggerWord}`);
    debugLog(`[Sessions] Created new session via POST /api/sessions: ${session.sessionId}`);

    res.json({
      id: session.sessionId,
      name: session.triggerWord,
      triggerWord: session.triggerWord,
      messages: [],
      isActive: false,
      messageCount: 0,
      lastActivity: session.lastActivityAt,
      sendMode: 'automatic',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[API /api/sessions] ERROR creating session: ${errorMessage}`);

    if (errorMessage.includes('already in use')) {
      res.status(400).json({ error: errorMessage });
      return;
    }

    res.status(500).json({
      error: 'Failed to create session',
      details: errorMessage
    });
  }
});

// GET /api/sessions - List all sessions (for browser UI)
app.get('/api/sessions', (_req: Request, res: Response) => {
  console.log('[API /api/sessions] GET request received');
  try {
    const sessions = sessionManager.getActiveSessions();
    console.log(`[API /api/sessions] Found ${sessions.length} sessions in SessionManager`);
    sessions.forEach((s, i) => {
      console.log(`[API /api/sessions] Session ${i}: id=${s.sessionId}, trigger=${s.triggerWord}, voiceInputActive=${s.voiceInputActive}`);
    });

    const activeSession = sessions.find(s => s.voiceInputActive) || sessions[0];
    console.log(`[API /api/sessions] Active session: ${activeSession?.sessionId || 'none'}`);

    const sessionData = sessions.map(session => ({
      id: session.sessionId,
      name: session.triggerWord,
      triggerWord: session.triggerWord,
      messages: session.queue.getRecentMessages(50).map(m => ({
        id: m.id,
        role: m.role,
        text: m.text,
        timestamp: m.timestamp,
        status: m.status,
      })),
      isActive: session.voiceInputActive,
      messageCount: session.queue.messages.length,
      lastActivity: session.lastActivityAt,
      sendMode: 'automatic' as const,
    }));

    console.log(`[API /api/sessions] Returning ${sessionData.length} sessions to client`);
    res.json({
      sessions: sessionData,
      activeSessionId: activeSession?.sessionId || null,
    });
  } catch (error) {
    console.error(`[API /api/sessions] ERROR: ${error}`);
    debugLog(`[Sessions] Failed to list sessions: ${error}`);
    res.status(500).json({
      error: 'Failed to list sessions',
      sessions: [],
      activeSessionId: null,
    });
  }
});

// GET /api/debug/status - Debug endpoint for troubleshooting
app.get('/api/debug/status', (_req: Request, res: Response) => {
  try {
    const sessions = sessionManager.getActiveSessions();

    res.json({
      server: {
        port: HTTP_PORT,
        uptime: process.uptime(),
        nodeVersion: process.version,
      },
      sessions: {
        count: sessions.length,
        list: sessions.map(s => ({
          id: s.sessionId,
          triggerWord: s.triggerWord,
          voiceInputActive: s.voiceInputActive,
          voiceResponsesEnabled: s.voiceResponsesEnabled,
          pendingCount: s.getPendingCount(),
          isWaiting: s.isWaiting,
          createdAt: s.createdAt,
          lastActivityAt: s.lastActivityAt,
        })),
      },
      endpoints: [
        'GET /api/sessions - List all sessions',
        'GET /api/sessions/active - Get active sessions',
        'GET /api/sessions/:id - Get single session',
        'POST /api/sessions/register - Register new session',
        'DELETE /api/sessions/:id - Delete session',
        'GET /api/debug/status - This endpoint',
        'GET /api/debug/pipeline/:sessionId - Trace message pipeline',
        'GET /api/utterances - Get utterances',
        'GET /api/conversation - Get conversation',
      ],
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get debug status',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /api/debug/pipeline/:sessionId - Trace full message pipeline for a session
app.get('/api/debug/pipeline/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;

  try {
    const session = sessionManager.getSession(sessionId);

    if (!session) {
      res.status(404).json({
        error: 'Session not found',
        sessionId,
        hint: 'This session may have been created by browser auto-create (orphan) or has been cleaned up',
      });
      return;
    }

    const utterances = session.queue.utterances;
    const messages = session.queue.messages;

    res.json({
      session: {
        id: session.sessionId,
        triggerWord: session.triggerWord,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
        voiceInputActive: session.voiceInputActive,
        voiceResponsesEnabled: session.voiceResponsesEnabled,
        isWaiting: session.isWaiting,
      },
      pipeline: {
        pending: utterances.filter(u => u.status === 'pending').map(u => ({
          id: u.id,
          text: u.text,
          timestamp: u.timestamp,
          stage: '1. Waiting for Claude to dequeue',
        })),
        delivered: utterances.filter(u => u.status === 'delivered').map(u => ({
          id: u.id,
          text: u.text,
          timestamp: u.timestamp,
          stage: '2. Delivered to Claude, awaiting response',
        })),
        responded: utterances.filter(u => u.status === 'responded').map(u => ({
          id: u.id,
          text: u.text,
          timestamp: u.timestamp,
          stage: '3. Claude has responded',
        })),
      },
      counts: {
        pending: utterances.filter(u => u.status === 'pending').length,
        delivered: utterances.filter(u => u.status === 'delivered').length,
        responded: utterances.filter(u => u.status === 'responded').length,
        totalMessages: messages.length,
      },
      conversationHistory: messages.slice(-10).map(m => ({
        id: m.id,
        role: m.role,
        text: m.text.substring(0, 100) + (m.text.length > 100 ? '...' : ''),
        timestamp: m.timestamp,
        status: m.status,
      })),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to trace pipeline',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// POST /api/sessions/register - Register a new session
app.post('/api/sessions/register', async (req: Request, res: Response) => {
  console.log('[API /api/sessions/register] POST request received');
  console.log('[API /api/sessions/register] Request body:', JSON.stringify(req.body));
  const { triggerWord, triggerAliases, ownerPids } = req.body;

  try {
    console.log(`[API /api/sessions/register] Creating session with triggerWord=${triggerWord}, aliases=${triggerAliases}, ownerPids=${ownerPids}`);
    const session = await sessionManager.createSession({
      triggerWord,
      triggerAliases,
      ownerPids: ownerPids || [],
    });

    console.log(`[API /api/sessions/register] SUCCESS - Created session: ${session.sessionId} with trigger: ${session.triggerWord}`);
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

// POST /api/sessions/:sessionId/activate - Activate/switch to a session
app.post('/api/sessions/:sessionId/activate', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  console.log(`[API /api/sessions/:id/activate] POST request for session: ${sessionId}`);

  try {
    const session = sessionManager.getSession(sessionId);

    if (!session) {
      console.log(`[API /api/sessions/:id/activate] Session not found: ${sessionId}`);
      res.status(404).json({
        error: 'Session not found',
        sessionId
      });
      return;
    }

    // Update activity timestamp
    sessionManager.updateActivity(sessionId);
    console.log(`[API /api/sessions/:id/activate] Activated session: ${sessionId} (${session.triggerWord})`);

    res.json({
      success: true,
      sessionId: session.sessionId,
      triggerWord: session.triggerWord
    });
  } catch (error) {
    console.error(`[API /api/sessions/:id/activate] ERROR: ${error}`);
    res.status(500).json({
      error: 'Failed to activate session',
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

// DELETE /api/sessions/:sessionId/messages - Clear all messages in session
app.delete('/api/sessions/:sessionId/messages', (req: Request, res: Response) => {
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

    const clearedCount = session.queue.utterances.length;
    session.queue.clear();

    debugLog(`[Sessions] Cleared ${clearedCount} messages from session: ${sessionId}`);

    res.json({
      success: true,
      message: 'Messages cleared successfully',
      sessionId,
      clearedCount
    });
  } catch (error) {
    debugLog(`[Sessions] Failed to clear messages for ${sessionId}: ${error}`);
    res.status(500).json({
      error: 'Failed to clear messages',
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

// Track if we're the primary HTTP server (first instance to bind)
let isPrimaryHttpServer = false;

// Start HTTP server with error handling for multiple instances
const httpServer = app.listen(HTTP_PORT, async () => {
  isPrimaryHttpServer = true;
  if (!IS_MCP_MANAGED) {
    console.log(`[HTTP] Server listening on http://localhost:${HTTP_PORT}`);
    console.log(`[Mode] Running in ${IS_MCP_MANAGED ? 'MCP-managed' : 'standalone'} mode`);
  } else {
    // In MCP mode, write to stderr to avoid interfering with protocol
    console.error(`[HTTP] Server listening on http://localhost:${HTTP_PORT}`);
    console.error(`[Mode] Running in MCP-managed mode (primary server)`);
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

httpServer.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    // Port already in use - another instance has the HTTP server running
    // This is expected when multiple Claude instances connect
    console.error(`[HTTP] Port ${HTTP_PORT} already in use - connecting to existing server`);
    console.error(`[Mode] Running in MCP-managed mode (secondary instance)`);
    // Continue with MCP setup - we'll use the existing HTTP server for registration
  } else {
    console.error(`[HTTP] Server error:`, error);
    process.exit(1);
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
  console.error('[MCP] IS_MCP_MANAGED=true, setting up MCP protocol handlers');

  // Centralized session client - handles all session operations via HTTP
  const sessionClient = new McpSessionClient();

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
    console.error('[MCP] ListToolsRequestSchema called - Claude is requesting available tools');

    // Auto-register session via centralized client
    try {
      const { sessionId, triggerWord } = await sessionClient.register();
      console.error(`[MCP] Session registered: ${sessionId} with trigger: ${triggerWord}`);
    } catch (error) {
      console.error(`[MCP] Failed to register session: ${error}`);
    }
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
        },
        {
          name: 'get_session_info',
          description: 'Get information about your current voice session including trigger word, pending messages, and conversation history',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_pending_messages',
          description: 'Check for any pending voice messages from the user that need to be processed',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'wait_for_utterance',
          description: 'Wait for new voice input from the user. Blocks until a message arrives or timeout. Use this when you want to listen for voice commands.',
          inputSchema: {
            type: 'object',
            properties: {
              timeout_seconds: {
                type: 'number',
                description: 'Maximum time to wait in seconds (default: 60, max: 300)',
              },
            },
          },
        },
        {
          name: 'dequeue_utterances',
          description: 'Get all pending voice messages and mark them as delivered. Non-blocking - returns immediately with any available messages.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_conversation_history',
          description: 'Get the full conversation history for your voice session',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Maximum number of messages to return (default: 50)',
              },
            },
          },
        },
        {
          name: 'reconnect_session',
          description: 'Force re-register the voice session. Use this if other voice tools return "Session not found" errors.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'set_voice_input',
          description: 'Enable or disable voice input listening for this session. When enabled, the stop hook will keep Claude in a listening loop. When disabled, Claude can stop normally.',
          inputSchema: {
            type: 'object',
            properties: {
              active: {
                type: 'boolean',
                description: 'Whether voice input should be active (true) or inactive (false)',
              },
            },
            required: ['active'],
          },
        },
      ]
    };
  });

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      // All tools use the centralized sessionClient for HTTP-based operations
      if (name === 'speak') {
        const text = args?.text as string;
        if (!text || !text.trim()) {
          return {
            content: [{ type: 'text', text: 'Error: Text is required for speak tool' }],
            isError: true,
          };
        }

        await sessionClient.speak(text);
        return { content: [{ type: 'text', text: '' }] };
      }

      if (name === 'get_session_info') {
        const info = await sessionClient.getSessionInfo();
        return {
          content: [{ type: 'text', text: JSON.stringify(info, null, 2) }],
        };
      }

      if (name === 'get_pending_messages') {
        const { count, messages } = await sessionClient.getPendingMessages();
        return {
          content: [{
            type: 'text',
            text: count > 0
              ? JSON.stringify({ count, messages }, null, 2)
              : 'No pending messages',
          }],
        };
      }

      if (name === 'wait_for_utterance') {
        const timeoutSeconds = Math.min(args?.timeout_seconds as number || 60, WAIT_TIMEOUT_SECONDS);
        const result = await sessionClient.waitForUtterance(timeoutSeconds);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === 'dequeue_utterances') {
        const { utterances } = await sessionClient.dequeueMessages();
        if (!utterances || utterances.length === 0) {
          return { content: [{ type: 'text', text: 'No pending messages to dequeue' }] };
        }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: utterances.length,
              messages: utterances,
            }, null, 2),
          }],
        };
      }

      if (name === 'get_conversation_history') {
        const limit = args?.limit as number || 50;
        const messages = await sessionClient.getConversationHistory(limit);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ count: messages.length, messages }, null, 2),
          }],
        };
      }

      if (name === 'reconnect_session') {
        const { sessionId, triggerWord } = await sessionClient.reconnect();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ reconnected: true, sessionId, triggerWord }, null, 2),
          }],
        };
      }

      if (name === 'set_voice_input') {
        const active = args?.active as boolean;
        const result = await sessionClient.setVoiceInput(active);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2),
          }],
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  });

  // Connect via stdio
  const transport = new StdioServerTransport();
  mcpServer.connect(transport);
  // Use stderr in MCP mode to avoid interfering with protocol
  console.error('[MCP] Server connected via stdio');

  // Clean up session files on exit
  const cleanup = () => cleanupSessionFiles(sessionClient['sessionFilePaths']);
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
} else {
  // Only log in standalone mode
  if (!IS_MCP_MANAGED) {
    console.log('[MCP] Skipping MCP server initialization (not in MCP-managed mode)');
  }
}