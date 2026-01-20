# Session Design Additions: Trigger Words & Multi-Session UI

This document extends the core session architecture with two additional features:
1. Per-session trigger words for voice routing
2. Multi-session browser UI

---

## 1. Per-Session Trigger Words

### Problem

With multiple Claude sessions active, how does the user direct voice input to the correct session?

### Solution

Each session has a unique **trigger word** that the user must say to route the message.

```
Session "alpha" (frontend work)
  Trigger: "alpha" or "frontend"
  User says: "Hey alpha, add a loading spinner"

Session "beta" (backend work)
  Trigger: "beta" or "backend"
  User says: "Beta, check the API logs"
```

### Data Model Changes

**File: `src/session-manager.ts`**

```typescript
interface SessionState {
  sessionId: string;

  // NEW: Trigger word configuration
  triggerWord: string;           // Primary trigger (e.g., "alpha")
  triggerAliases: string[];      // Alternative triggers (e.g., ["frontend", "ui"])

  queue: UtteranceQueue;
  voicePreferences: {
    voiceResponsesEnabled: boolean;
    voiceInputActive: boolean;
  };
  isSpeaking: boolean;
  speakQueue: SpeakRequest[];
  lastToolUseTimestamp: Date | null;
  lastSpeakTimestamp: Date | null;
  createdAt: Date;
  lastActivityAt: Date;
}
```

### Session Registration with Trigger Word

**Endpoint: `POST /api/sessions/register`**

```typescript
app.post('/api/sessions/register', (req: Request, res: Response) => {
  const { triggerWord, triggerAliases } = req.body;

  // Validate trigger word is unique across sessions
  const existingTriggers = getAllTriggerWords();
  if (existingTriggers.includes(triggerWord?.toLowerCase())) {
    res.status(400).json({
      error: 'Trigger word already in use',
      suggestion: generateUniqueTrigger() // e.g., "alpha", "beta", "gamma"
    });
    return;
  }

  const sessionId = sessionManager.createSession({
    triggerWord: triggerWord || generateUniqueTrigger(),
    triggerAliases: triggerAliases || []
  });

  res.json({
    success: true,
    sessionId,
    triggerWord: sessionManager.getSession(sessionId).triggerWord,
    serverUrl: `http://localhost:${HTTP_PORT}`
  });
});
```

### Auto-Generated Trigger Words

When Claude registers without specifying a trigger word, generate one automatically:

```typescript
const TRIGGER_SEQUENCE = [
  'alpha', 'beta', 'gamma', 'delta', 'epsilon',
  'one', 'two', 'three', 'four', 'five',
  'red', 'blue', 'green', 'yellow', 'purple'
];

function generateUniqueTrigger(): string {
  const usedTriggers = getAllTriggerWords();

  for (const trigger of TRIGGER_SEQUENCE) {
    if (!usedTriggers.includes(trigger)) {
      return trigger;
    }
  }

  // Fallback: use random word
  return `session-${randomUUID().substring(0, 4)}`;
}
```

### Browser Voice Routing Logic

**File: `public/app.js`**

```javascript
class MessengerClient {
  constructor() {
    // ...existing code...
    this.sessions = new Map(); // sessionId -> session metadata
    this.activeSessionId = null;
  }

  // Check if utterance contains any session's trigger word
  findTargetSession(text) {
    const words = text.toLowerCase().split(/\s+/);

    for (const [sessionId, session] of this.sessions) {
      const triggers = [session.triggerWord, ...(session.triggerAliases || [])];

      for (const trigger of triggers) {
        if (words.includes(trigger.toLowerCase())) {
          return {
            sessionId,
            trigger,
            textWithoutTrigger: this.removeTriggerWord(text, trigger)
          };
        }
      }
    }

    return null; // No trigger found
  }

  // Handle speech recognition result
  handleSpeechResult(transcript, isFinal) {
    if (!isFinal) {
      // Show interim text in active session's input
      this.showInterimText(this.activeSessionId, transcript);
      return;
    }

    // Find target session from trigger word
    const target = this.findTargetSession(transcript);

    if (target) {
      // Route to specific session
      this.sendToSession(target.sessionId, target.textWithoutTrigger);
      this.highlightSession(target.sessionId);
    } else if (this.sessions.size === 1) {
      // Only one session - send without trigger
      const onlySession = this.sessions.keys().next().value;
      this.sendToSession(onlySession, transcript);
    } else {
      // Multiple sessions, no trigger - show disambiguation UI
      this.showSessionPicker(transcript);
    }
  }

  removeTriggerWord(text, trigger) {
    // Remove trigger word and common prefixes like "hey", "hi"
    const prefixes = ['hey', 'hi', 'hello', 'ok', 'okay'];
    let result = text;

    // Remove prefix + trigger (e.g., "Hey alpha, " -> "")
    for (const prefix of prefixes) {
      const pattern = new RegExp(`^${prefix}\\s+${trigger}[,:]?\\s*`, 'i');
      result = result.replace(pattern, '');
    }

    // Remove standalone trigger
    const standalonePattern = new RegExp(`^${trigger}[,:]?\\s*`, 'i');
    result = result.replace(standalonePattern, '');

    return result.trim();
  }

  async sendToSession(sessionId, text) {
    if (!text.trim()) return;

    try {
      await fetch(`${this.baseUrl}/api/potential-utterances?sessionId=${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, timestamp: new Date().toISOString() })
      });

      this.loadSessionData(sessionId);
    } catch (error) {
      console.error(`Failed to send to session ${sessionId}:`, error);
    }
  }
}
```

### Trigger Word Feedback

When a trigger word is detected, provide visual/audio feedback:

```javascript
highlightSession(sessionId) {
  // Visual: Flash the session tab/panel
  const sessionEl = document.querySelector(`[data-session="${sessionId}"]`);
  sessionEl?.classList.add('triggered');
  setTimeout(() => sessionEl?.classList.remove('triggered'), 500);

  // Audio: Optional confirmation beep
  if (this.triggerFeedbackEnabled) {
    this.playTriggerSound();
  }
}
```

---

## 2. Multi-Session Browser UI

### Layout Design

```
+------------------------------------------------------------------+
|  MCP Voice Hooks                              [Settings] [Help]  |
+------------------------------------------------------------------+
|  Sessions:  [Alpha *] [Beta *] [Gamma o]  [+ Add Session]        |
+---------------------------------+--------------------------------+
|                                 |                                |
|  ALPHA                          |  BETA                          |
|  Trigger: "alpha"               |  Trigger: "beta"               |
|  Status: Listening              |  Status: Idle                  |
|  -----------------------------  |  ----------------------------  |
|                                 |                                |
|  You: Add dark mode             |  You: Check the logs           |
|  [DELIVERED]                    |  [RESPONDED]                   |
|                                 |                                |
|  Claude: I'll add a             |  Claude: Found 3 errors in     |
|  dark mode toggle to            |  the authentication module...  |
|  the settings page...           |                                |
|                                 |                                |
|  [Waiting for input... mic]     |                                |
|                                 |                                |
+---------------------------------+--------------------------------+
|  mic Say "alpha" + message      |  mic Say "beta" + message      |
|  or type here...                |  or type here...               |
+---------------------------------+--------------------------------+
```

### HTML Structure

**File: `public/index.html`** (additions)

```html
<!-- Session tabs bar -->
<div id="sessionTabs" class="session-tabs">
  <div class="session-tab-list" id="sessionTabList">
    <!-- Dynamically populated using DOM methods -->
  </div>
  <button id="addSessionBtn" class="add-session-btn" title="Connect to another Claude">
    + Add Session
  </button>
</div>

<!-- Session panels container (split view) -->
<div id="sessionPanels" class="session-panels">
  <!-- Dynamically populated per session using DOM methods -->
</div>

<!-- Session picker modal (for disambiguation) -->
<div id="sessionPickerModal" class="modal hidden">
  <div class="modal-content">
    <h3>Which session?</h3>
    <p id="sessionPickerText"></p>
    <div id="sessionPickerOptions"></div>
    <button id="sessionPickerCancel">Cancel</button>
  </div>
</div>
```

### JavaScript: Multi-Session Management (Safe DOM Methods)

**File: `public/app.js`** (additions)

```javascript
class MessengerClient {
  constructor() {
    // Session management
    this.sessions = new Map();        // sessionId -> SessionData
    this.activeSessionId = null;      // Currently focused session
    this.eventSources = new Map();    // sessionId -> EventSource

    // Layout preferences
    this.layoutMode = 'split';        // 'split', 'tabs', 'focus'
    this.maxVisiblePanels = 3;

    this.initializeFromUrl();
    this.setupMultiSessionUI();
  }

  initializeFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('sessionId');

    if (sessionId) {
      this.connectToSession(sessionId);
    } else {
      this.discoverSessions();
    }
  }

  async discoverSessions() {
    try {
      const response = await fetch(`${this.baseUrl}/api/sessions/active`);
      const data = await response.json();

      if (data.sessions.length === 0) {
        this.showNoSessionsMessage();
      } else if (data.sessions.length === 1) {
        this.connectToSession(data.sessions[0].sessionId);
      } else {
        this.showSessionDiscovery(data.sessions);
      }
    } catch (error) {
      console.error('Failed to discover sessions:', error);
      this.showConnectionError();
    }
  }

  async connectToSession(sessionId) {
    try {
      const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}`);
      if (!response.ok) throw new Error('Session not found');

      const session = await response.json();

      this.sessions.set(sessionId, { ...session, connected: true });
      this.createSessionPanel(sessionId, session);
      this.connectSSE(sessionId);

      if (!this.activeSessionId) {
        this.setActiveSession(sessionId);
      }

      this.updateSessionTabs();
    } catch (error) {
      console.error(`Failed to connect to session ${sessionId}:`, error);
    }
  }

  createSessionPanel(sessionId, session) {
    const panel = document.createElement('div');
    panel.className = 'session-panel';
    panel.dataset.session = sessionId;

    // Create header
    const header = document.createElement('div');
    header.className = 'session-header';

    const nameEl = document.createElement('div');
    nameEl.className = 'session-name';
    nameEl.textContent = (session.triggerWord || sessionId.substring(0, 8)).toUpperCase();

    const triggerEl = document.createElement('div');
    triggerEl.className = 'session-trigger';
    triggerEl.textContent = `Trigger: "${session.triggerWord || 'none'}"`;

    const statusEl = document.createElement('div');
    statusEl.className = 'session-status';
    statusEl.textContent = 'Connected';

    header.appendChild(nameEl);
    header.appendChild(triggerEl);
    header.appendChild(statusEl);

    // Create conversation container
    const convContainer = document.createElement('div');
    convContainer.className = 'conversation-container';
    convContainer.id = `conversation-${sessionId}`;

    const messagesEl = document.createElement('div');
    messagesEl.className = 'conversation-messages';

    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    const emptyText = document.createElement('p');
    emptyText.textContent = `Say "${session.triggerWord}" followed by your message`;
    emptyState.appendChild(emptyText);
    messagesEl.appendChild(emptyState);

    const waitingIndicator = document.createElement('div');
    waitingIndicator.className = 'waiting-indicator';
    waitingIndicator.style.display = 'none';
    waitingIndicator.textContent = 'Waiting for voice input...';

    convContainer.appendChild(messagesEl);
    convContainer.appendChild(waitingIndicator);

    // Create input container
    const inputContainer = document.createElement('div');
    inputContainer.className = 'input-container';

    const textarea = document.createElement('textarea');
    textarea.className = 'message-input';
    textarea.placeholder = `Say "${session.triggerWord}" + message or type here...`;
    textarea.dataset.session = sessionId;

    const micBtn = document.createElement('button');
    micBtn.className = 'mic-btn';
    micBtn.textContent = '\uD83C\uDFA4'; // microphone emoji
    micBtn.dataset.session = sessionId;

    inputContainer.appendChild(textarea);
    inputContainer.appendChild(micBtn);

    // Assemble panel
    panel.appendChild(header);
    panel.appendChild(convContainer);
    panel.appendChild(inputContainer);

    document.getElementById('sessionPanels').appendChild(panel);

    // Setup input handlers
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendTypedMessage(sessionId, textarea.value);
        textarea.value = '';
      }
    });
  }

  updateSessionTabs() {
    const tabList = document.getElementById('sessionTabList');
    tabList.replaceChildren(); // Clear safely

    for (const [sessionId, session] of this.sessions) {
      const tab = document.createElement('div');
      tab.className = `session-tab ${sessionId === this.activeSessionId ? 'active' : ''}`;
      tab.dataset.session = sessionId;

      const statusDot = document.createElement('span');
      const statusClass = session.voiceInputActive ? 'listening' :
                          session.connected ? 'connected' : 'disconnected';
      statusDot.className = `status-dot ${statusClass}`;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'session-name';
      nameSpan.textContent = (session.triggerWord || sessionId.substring(0, 4)).toUpperCase();

      tab.appendChild(statusDot);
      tab.appendChild(nameSpan);
      tab.addEventListener('click', () => this.setActiveSession(sessionId));
      tabList.appendChild(tab);
    }
  }

  setActiveSession(sessionId) {
    this.activeSessionId = sessionId;
    this.updateSessionTabs();

    const input = document.querySelector(`[data-session="${sessionId}"].message-input`);
    input?.focus();
  }

  // Disambiguation UI when no trigger word detected
  showSessionPicker(text) {
    const modal = document.getElementById('sessionPickerModal');
    const textEl = document.getElementById('sessionPickerText');
    const optionsEl = document.getElementById('sessionPickerOptions');

    textEl.textContent = `"${text}"`;
    optionsEl.replaceChildren(); // Clear safely

    for (const [sessionId, session] of this.sessions) {
      const btn = document.createElement('button');
      btn.className = 'session-picker-option';
      btn.textContent = `Send to ${(session.triggerWord || sessionId.substring(0, 8)).toUpperCase()}`;
      btn.addEventListener('click', () => {
        this.sendToSession(sessionId, text);
        modal.classList.add('hidden');
      });
      optionsEl.appendChild(btn);
    }

    modal.classList.remove('hidden');
  }
}
```

---

## 3. API Additions

### New Endpoints

**GET /api/sessions/active**
Returns all active sessions with metadata.

```typescript
app.get('/api/sessions/active', (req: Request, res: Response) => {
  const sessions = sessionManager.getAllSessions().map(session => ({
    sessionId: session.sessionId,
    triggerWord: session.triggerWord,
    triggerAliases: session.triggerAliases,
    createdAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
    voiceInputActive: session.voicePreferences.voiceInputActive,
    voiceResponsesEnabled: session.voicePreferences.voiceResponsesEnabled,
    pendingCount: session.queue.utterances.filter(u => u.status === 'pending').length,
    isWaiting: session.isWaiting
  }));

  res.json({ sessions });
});
```

**GET /api/sessions/:sessionId**
Returns single session metadata.

**PATCH /api/sessions/:sessionId/trigger**
Updates session trigger word.

---

## 4. Implementation Checklist

### Trigger Words
- [ ] Add `triggerWord` and `triggerAliases` to SessionState interface
- [ ] Update session registration endpoint to accept trigger word
- [ ] Implement `generateUniqueTrigger()` function
- [ ] Add `getAllTriggerWords()` helper
- [ ] Update browser to detect trigger words in speech
- [ ] Implement `removeTriggerWord()` in browser
- [ ] Add disambiguation UI for ambiguous input
- [ ] Add trigger word feedback (visual/audio)

### Multi-Session UI
- [ ] Add session tabs HTML structure
- [ ] Add session panels container (split view)
- [ ] Implement CSS for tabs, panels, and animations
- [ ] Create `discoverSessions()` method
- [ ] Create `connectToSession()` method
- [ ] Implement per-session SSE connections
- [ ] Create `createSessionPanel()` method (using safe DOM methods)
- [ ] Implement `updateSessionTabs()` method
- [ ] Add session switching logic
- [ ] Implement session picker modal
- [ ] Add layout mode switching (split/tabs/focus)

### API Endpoints
- [ ] GET /api/sessions/active
- [ ] GET /api/sessions/:sessionId
- [ ] PATCH /api/sessions/:sessionId/trigger

---

## 5. User Experience Flow

### New User (Single Session)

1. Claude starts, registers session with auto-generated trigger "alpha"
2. Browser opens with `?sessionId=abc-123`
3. UI shows single panel, no tabs needed
4. User can speak without trigger word (only one session)

### Power User (Multiple Sessions)

1. Claude A starts, registers "alpha"
2. Claude B starts, registers "beta"
3. User opens browser, sees session discovery
4. Selects both sessions -> split view
5. Says "Alpha, add the feature" -> routes to A
6. Says "Beta, run the tests" -> routes to B
7. TTS responses only play for focused session (or all if enabled)

### Trigger Word Best Practices

Displayed in UI:
```
Tips for trigger words:
- Say the trigger clearly at the start: "Alpha, do the thing"
- You can use "Hey alpha" or "OK alpha"
- Trigger words are case-insensitive
- Set custom triggers in session settings
```
