# Voice Hooks UI Components - File Structure

## Component Architecture

```
src/client/
├── App.tsx                          # Main application component
├── components/
│   ├── index.ts                     # Component exports
│   ├── SessionTabs.tsx              # Session tab bar with pill-shaped tabs
│   ├── MessageBubble.tsx            # Individual message with status badges
│   ├── ConversationView.tsx         # Main chat area with messages
│   ├── WaitingIndicator.tsx         # Animated listening indicator
│   ├── VoiceInput.tsx               # Input area with mic button
│   ├── SettingsPanel.tsx            # Collapsible voice settings
│   └── SessionPicker.tsx            # Modal for session selection
├── hooks/
│   ├── index.ts                     # Hook exports
│   ├── useSession.ts                # Session state management
│   ├── useSpeechRecognition.ts      # Browser speech recognition
│   ├── useSpeechSynthesis.ts        # Browser speech synthesis
│   └── useSSE.ts                    # Server-sent events
└── styles/
    └── globals.css                  # Global styles and animations
```

## Component Hierarchy

```
App
├── Header
├── SessionTabs (conditional)
└── Main Container
    ├── ConversationView
    │   ├── Empty State / Messages
    │   └── WaitingIndicator (conditional)
    ├── VoiceInput
    │   ├── Send Mode Controls
    │   └── Textarea + Mic Button
    ├── SettingsPanel
    │   ├── Voice Toggle
    │   ├── Voice Selection
    │   └── Speech Rate Slider
    └── SessionPicker (modal)
```

## Key Features by Component

### SessionTabs
- Pill-shaped design with emerald active state
- Auto-hide when single session
- Smooth transitions
- Unread indicators

### MessageBubble
- User messages: emerald background, right-aligned
- Assistant messages: gray background, left-aligned
- Status badges: pending, delivered, responded
- Hover to show timestamp
- Delete button for pending messages

### ConversationView
- Beautiful empty state with icon
- Auto-scroll to latest message
- Custom scrollbar styling
- Clear conversation button in header

### WaitingIndicator
- Three bouncing dots with staggered animation
- "Listening..." italic text
- Optional timeout countdown

### VoiceInput
- Auto-growing textarea (max 120px)
- Mic button with pulse animation when listening
- Send mode radio buttons (auto/trigger)
- Trigger word input (conditional)
- Emerald accent colors

### SettingsPanel
- Smooth expand/collapse with arrow rotation
- Voice response toggle switch
- Language selection dropdown
- Voice selection with grouped options
- Speech rate slider with numeric value
- Info boxes for system voice tips
- Warning for Google voices
- Test voice button

### SessionPicker
- Modal with backdrop blur
- Card-based session list
- Last activity timestamps
- Active session highlighting
- Create new session option
- Smooth zoom-in animation

## Styling System

### Colors
- **Primary**: emerald-500, emerald-600
- **Neutral Dark**: zinc-900, zinc-950
- **Neutral Light**: zinc-50, zinc-100
- **Borders**: zinc-200, zinc-700
- **Text**: zinc-900, zinc-100
- **Error**: red-500
- **Warning**: amber-500

### Animations
- `slide-in-from-bottom-2`: Message entry (200ms)
- `slide-in-from-top-2`: Settings expand (200ms)
- `fade-in`: Modal backdrop (200ms)
- `zoom-in-95`: Modal content (200ms)
- `pulse-slow`: Mic button active (2s infinite)
- `bounce`: Waiting dots (staggered)

### Responsive Breakpoints
- `768px`: Tablet adjustments
- `480px`: Mobile optimizations

## Custom Hooks

### useSession
Manages all session-related state and API calls:
- Session CRUD operations
- Message management
- Send mode configuration
- Trigger word updates

### useSpeechRecognition
Web Speech API wrapper for voice input:
- Start/stop listening
- Continuous recognition
- Interim results
- Error handling

### useSpeechSynthesis
Web Speech Synthesis wrapper:
- Text-to-speech with voice selection
- Rate, pitch, volume control
- Mac system voice support via API
- Speaking state management

### useSSE
Server-Sent Events connection manager:
- Auto-reconnect on disconnect
- Message handling
- Connection state tracking
- Error recovery

## Design Principles Applied

1. **Simplicity First**: Clean interfaces, minimal clutter
2. **Clear Hierarchy**: Visual weight guides attention
3. **Smooth Transitions**: 200ms standard, respects prefers-reduced-motion
4. **Accessible**: ARIA labels, keyboard nav, focus states
5. **Mobile-Ready**: Touch-friendly, responsive design
6. **Dark Mode**: Full dark mode support throughout
7. **Performance**: Optimized animations, lazy loading where appropriate

## Integration Points

The components integrate with the backend via:
- REST API: `/api/sessions/*` endpoints
- SSE: `/api/events` for real-time updates
- TTS API: `/api/speak` for system voice

All components are fully typed with TypeScript for type safety and excellent IDE support.
