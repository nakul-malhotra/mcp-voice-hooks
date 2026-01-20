# Visual Design Guide

## Component Visuals

### SessionTabs
```
┌─────────────────────────────────────────────────────────┐
│  [Session 1] [Session 2] [Session 3] [+]                │
│   emerald     gray        gray                          │
└─────────────────────────────────────────────────────────┘
```
- Pill-shaped tabs with emerald active state
- Plus button for new session
- Small red dot for unread messages

### MessageBubble (User)
```
                                    ┌─────────────────────┐
                                    │ Hello, how are you? │
                                    │ ─────────────────── │
                                    │ PENDING    10:30 AM │
                                    └─────────────────────┘
                                       emerald bg, white text
```

### MessageBubble (Assistant)
```
┌─────────────────────┐
│ I'm doing great!    │
│ Thanks for asking.  │
│ ─────────────────── │
│ 10:31 AM           │
└─────────────────────┘
   gray bg, dark text
```

### ConversationView (Empty)
```
┌──────────────────────────────────────────────────────────┐
│                                                           │
│                         [icon]                            │
│                   No messages yet                         │
│         Start a conversation by typing                    │
│              or using voice input below                   │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

### WaitingIndicator
```
● ● ●  Listening for voice input...
bounce animation, staggered
```

### VoiceInput
```
┌──────────────────────────────────────────────────────────┐
│ ○ Auto-send on pause  ○ Wait for trigger word           │
│                                          Trigger: [send]  │
│ ┌────────────────────────────────────────────────────┐   │
│ │ Type a message or use voice...                  [●] │  │
│ └────────────────────────────────────────────────────┘   │
│      textarea with mic button (emerald when active)      │
└──────────────────────────────────────────────────────────┘
```

### SettingsPanel (Collapsed)
```
┌──────────────────────────────────────────────────────────┐
│ Voice Settings                                        ▼   │
└──────────────────────────────────────────────────────────┘
```

### SettingsPanel (Expanded)
```
┌──────────────────────────────────────────────────────────┐
│ Voice Settings                                        ▲   │
│ ┌────────────────────────────────────────────────────┐   │
│ │ Voice Responses                              [ON]  │   │
│ └────────────────────────────────────────────────────┘   │
│                                                           │
│ Language: [en-US ▼]                                       │
│                                                           │
│ Voice: [Mac System Voice ▼]                               │
│ ℹ️  Download high-quality voices in Mac System Settings   │
│                                                           │
│ Speaking Rate: 1.0x                                       │
│ ━━━━━●━━━━━━━━━━━━                                        │
│ 0.5x                                              3.0x    │
│                                                           │
│ [Test Voice]                                              │
└──────────────────────────────────────────────────────────┘
```

### SessionPicker Modal
```
        ┌────────────────────────────────────┐
        │ Select a Session               [×] │
        ├────────────────────────────────────┤
        │ ┌──────────────────────────────┐   │
        │ │ Session 1                    │   │
        │ │ 12 messages          2h ago  │   │
        │ │ ● Active                     │   │
        │ └──────────────────────────────┘   │
        │ ┌──────────────────────────────┐   │
        │ │ Session 2                    │   │
        │ │ 8 messages           5d ago  │   │
        │ └──────────────────────────────┘   │
        │ ┌──────────────────────────────┐   │
        │ │    + Create New Session      │   │
        │ └──────────────────────────────┘   │
        └────────────────────────────────────┘
```

## Color Palette

### Light Mode
```
Background:    #ffffff (white)
Surface:       #fafafa (zinc-50)
Border:        #e4e4e7 (zinc-200)
Text Primary:  #18181b (zinc-900)
Text Secondary:#71717a (zinc-500)
Accent:        #10b981 (emerald-500)
```

### Dark Mode
```
Background:    #09090b (zinc-950)
Surface:       #18181b (zinc-900)
Border:        #3f3f46 (zinc-700)
Text Primary:  #fafafa (zinc-50)
Text Secondary:#a1a1aa (zinc-400)
Accent:        #10b981 (emerald-500)
```

## Animation Timeline

### Message Entry
```
0ms     ────────>     200ms
opacity: 0            opacity: 1
translateY: 8px       translateY: 0
```

### Mic Button (Active)
```
Pulse cycle: 2000ms
0ms ──> 1000ms ──> 2000ms ──> repeat
scale: 1   scale: 1.05   scale: 1
```

### Settings Expand
```
0ms     ────────>     200ms
height: 0             height: auto
opacity: 0            opacity: 1
```

### Modal Open
```
0ms     ────────>     200ms
opacity: 0            opacity: 1
scale: 0.95           scale: 1
```

## Responsive Breakpoints

### Desktop (>768px)
- Max width: 1200px centered
- Full feature set
- Two-column potential layouts

### Tablet (768px)
- Reduced padding
- Single column
- Touch-optimized buttons

### Mobile (<480px)
- Minimal padding
- Stacked layouts
- Large touch targets (44px min)
- Input font-size: 16px (prevents iOS zoom)

## Interaction States

### Button States
```
Default:  bg-emerald-500
Hover:    bg-emerald-600
Active:   bg-emerald-600 + scale(0.95)
Disabled: bg-zinc-300 opacity-50
Focus:    ring-2 ring-emerald-500
```

### Input States
```
Default:  border-zinc-200
Focus:    border-emerald-500 ring-2 ring-emerald-500
Error:    border-red-500
Disabled: bg-zinc-100 opacity-50
```

### Toggle Switch
```
Off:  bg-zinc-300, knob left
On:   bg-emerald-500, knob right
      Smooth 200ms transition
```

## Typography

### Font Stack
```
System Font Stack:
-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
```

### Scale
```
Heading 1:  24px, font-black, uppercase
Heading 2:  18px, font-semibold
Heading 3:  15px, font-semibold
Body:       15px, font-normal
Small:      13px, font-normal
Tiny:       11px, font-medium (uppercase for labels)
```

### Line Heights
```
Tight:    1.2  (headings)
Normal:   1.4  (body)
Relaxed:  1.6  (long-form)
```

## Spacing System

```
xs:  4px   (0.5 unit)
sm:  8px   (1 unit)
md:  12px  (1.5 units)
lg:  16px  (2 units)
xl:  20px  (2.5 units)
2xl: 24px  (3 units)
```

## Shadow System

```
sm:   0 1px 2px rgba(0,0,0,0.05)
md:   0 4px 6px rgba(0,0,0,0.1)
lg:   0 10px 15px rgba(0,0,0,0.1)
xl:   0 20px 25px rgba(0,0,0,0.15)
accent: 0 4px 6px emerald-500/25%
```
