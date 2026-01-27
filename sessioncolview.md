# Multi-Column Session Layout Plan

## Goal
Transform the UI from tab-based single-session view to a multi-column layout where:
1. All active sessions display as side-by-side columns
2. Columns appear when Claude instances connect, disappear when disconnected
3. Voice input routes messages to the correct column based on trigger word

## Current Architecture

```
┌─────────────────────────────────────────┐
│              Header                     │
├─────────────────────────────────────────┤
│         SessionTabs (horizontal)        │  ← Click to switch
├─────────────────────────────────────────┤
│                                         │
│    ConversationView (single session)    │  ← Only shows activeSession
│                                         │
├─────────────────────────────────────────┤
│           VoiceInput                    │  ← Routes to activeSession
├─────────────────────────────────────────┤
│          SettingsPanel                  │
└─────────────────────────────────────────┘
```

## Proposed Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                              Header                                     │
├──────────────────┬──────────────────┬──────────────────┬───────────────┤
│  Alpha Column    │  Beta Column     │  Charlie Column  │  + Add        │
│ ┌──────────────┐ │ ┌──────────────┐ │ ┌──────────────┐ │               │
│ │ Conversation │ │ │ Conversation │ │ │ Conversation │ │               │
│ │    View      │ │ │    View      │ │ │    View      │ │               │
│ │              │ │ │              │ │ │              │ │               │
│ └──────────────┘ │ └──────────────┘ │ └──────────────┘ │               │
├──────────────────┴──────────────────┴──────────────────┴───────────────┤
│                     Global Voice Input                                  │
│   Say "Alpha <message>" or "Beta <message>" to route to that session   │
├────────────────────────────────────────────────────────────────────────┤
│                        Settings Panel                                   │
└────────────────────────────────────────────────────────────────────────┘
```

## Design Decisions

1. **Column width:** Flex fill - columns divide available space evenly (2 sessions = 50% each, 3 = 33% each)
2. **Typed messages:** Route to "last targeted" session (whichever column last received a voice message)
3. **Visual indicator:** Highlight the last-targeted column so user knows where typed messages will go

## Implementation Steps

### Step 1: Create SessionColumn Component
**File:** `src/client/components/SessionColumn.tsx`

A self-contained column showing one session:
- Header with trigger word name + close button
- ConversationView for that session's messages
- Visual indicator when this session is "active" (receiving voice)

```typescript
interface SessionColumnProps {
  session: Session;
  isReceivingVoice: boolean;  // Highlight when voice is routing here
  onClose: () => void;
  onDeleteMessage: (id: string) => void;
  onClearMessages: () => void;
}
```

### Step 2: Modify App.tsx Layout
**File:** `src/client/App.tsx`

Changes:
1. Remove `SessionTabs` from rendering (or repurpose as add button only)
2. Replace single ConversationView with horizontal flex container
3. Map over all sessions to render SessionColumn for each
4. Keep single global VoiceInput at bottom
5. Keep single global SettingsPanel

```tsx
<div className="flex-1 flex overflow-hidden">
  {/* Horizontal scrolling container for columns */}
  <div className="flex gap-4 p-4 overflow-x-auto">
    {sessions.map(session => (
      <SessionColumn
        key={session.id}
        session={session}
        isReceivingVoice={lastTargetedSessionId === session.id}
        onClose={() => deleteSession(session.id)}
        ...
      />
    ))}
    {/* Add session button */}
    <AddSessionButton onClick={createSession} />
  </div>
</div>
```

### Step 3: Implement Trigger Word Routing
**File:** `src/client/App.tsx` (handleTranscript function)

Current: Routes to `activeSession`
New: Parse transcript to find session trigger word, route to that session

```typescript
const handleTranscript = useCallback((transcript: string, isFinal: boolean) => {
  if (!isFinal) return;

  const words = transcript.toLowerCase().split(/\s+/);

  // Find which session this message is for
  const targetSession = sessions.find(s =>
    words.includes(s.triggerWord.toLowerCase())
  );

  if (targetSession) {
    // Remove trigger word and send to that session
    const messageText = transcript
      .replace(new RegExp(`\\b${targetSession.triggerWord}\\b`, 'gi'), '')
      .trim();

    if (messageText) {
      addMessageToSession(targetSession.id, {
        role: 'user',
        text: messageText,
        status: 'pending'
      });
      setLastTargetedSessionId(targetSession.id);  // For visual highlight
    }
  }
}, [sessions, addMessageToSession]);
```

### Step 4: Modify useSession Hook
**File:** `src/client/hooks/useSession.ts`

Changes:
1. Remove `activeSessionId` concept (or keep for "last targeted")
2. Add `addMessageToSession(sessionId, message)` function
3. Keep `deleteSession(sessionId)` for column close

```typescript
const addMessageToSession = useCallback((sessionId: string, message: Omit<Message, 'id' | 'timestamp'>) => {
  setSessions((prev) => {
    const updated = new Map(prev);
    const session = updated.get(sessionId);
    if (session) {
      const newMessage: Message = {
        ...message,
        id: `msg-${Date.now()}-${Math.random()}`,
        timestamp: new Date(),
      };
      session.messages.push(newMessage);
      session.messageCount = session.messages.length;
      session.lastActivity = new Date();
    }
    return updated;
  });
}, []);
```

### Step 5: Handle SSE Per Session
**File:** `src/client/hooks/useSSE.ts` or create `useMultiSSE.ts`

Options:
A. One SSE connection per session (simpler, current pattern scaled)
B. Single SSE with session routing (more efficient, needs server changes)

Recommend Option A for simplicity:
```typescript
// In App.tsx or SessionColumn
sessions.forEach(session => {
  // Each column manages its own SSE via useSSE hook
});
```

### Step 6: Auto-Remove Columns on Session Cleanup
**File:** `src/client/hooks/useSession.ts`

Add polling or SSE listener to detect when sessions are deleted server-side:
- Server sends session deletion event
- Client removes column from UI

## Files to Modify

| File | Changes |
|------|---------|
| `src/client/components/SessionColumn.tsx` | **NEW** - Self-contained session column |
| `src/client/components/index.ts` | Export SessionColumn |
| `src/client/App.tsx` | Multi-column layout, trigger word routing |
| `src/client/hooks/useSession.ts` | `addMessageToSession()`, remove activeSession focus |
| `src/client/components/SessionTabs.tsx` | Remove or simplify to just "+" button |

## Verification Steps

1. **Build and run:** `npm run build && node dist/unified-server.js`
2. **Open browser:** `http://localhost:5111`
3. **Test column creation:** Click "+" to add sessions - should appear as columns
4. **Test trigger routing:** Say "Alpha hello" - message should appear in Alpha column
5. **Test column removal:** Close a column - should disappear
6. **Test multiple messages:** Route messages to different columns by trigger word
