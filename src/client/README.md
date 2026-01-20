# Client Infrastructure

This directory contains the React + Tailwind CSS client application for mcp-voice-hooks.

## Structure

- `main.tsx` - React application entry point
- `App.tsx` - Root component (placeholder for UI agent)
- `styles.css` - Tailwind CSS entry point

## Development

Build the client:
```bash
npm run build:client
```

Watch for changes during development:
```bash
npm run watch:client
```

## Tailwind Configuration

Custom theme colors for voice UI:
- `voice-active` - Active microphone state (green)
- `voice-idle` - Idle state (gray)
- `voice-background` - Dark background colors
- `voice-surface` - Surface colors

Custom animations:
- `animate-pulse-mic` - Pulsing microphone animation
- `animate-fade-in` - Fade in transition
- `animate-slide-up` - Slide up transition

## Build Output

The build process generates:
- `public/bundle.js` - Bundled React application
- `public/bundle.css` - Processed Tailwind styles

These files are served by the Express server and should not be committed to git.
