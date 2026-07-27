# Lilith AI

A cosmic-companion module — glitch/neon cyberpunk aesthetic (purple / pink / cyan on black) — with a real Gemini-powered brain behind it, connected safely through a Cloudflare Worker so no API key ever touches the browser or GitHub.

This is currently a **standalone project**, not wired into StarChart13. It's structured so it can be dropped into StarChart13 later as its own tab.

## Architecture

```
Browser (GitHub Pages, public, no secrets)
        │  POST { message, history }
        ▼
Cloudflare Worker (holds the API key as an encrypted secret)
        │
        ▼
Gemini API (gemini-2.5-flash)
```

The persona system prompt (`docs/lilith-persona.md`, Section 9) lives inside the Worker (`worker/lilith-worker.js`) — it's sent with every request but kept separate from project-specific context, so either can change independently.

**No persistent memory yet.** Conversation history exists only in the browser tab for the current session (capped to the last ~6 exchanges) and resets on reload. If the Worker is unreachable, the app automatically falls back to a local, keyword-matched offline demo brain and shows a clear "Offline demo" status — it never silently pretends to be the real thing.

## Setup

See **`docs/SETUP-ANDROID.md`** for a full beginner, phone-friendly, step-by-step guide covering:
- Creating a free Google AI Studio account and getting a Gemini API key (no billing required)
- Deploying the Cloudflare Worker and setting your key as a secret
- Pointing the frontend at your Worker via `js/lilith-config.js`

Nothing works out of the box until you complete that setup — before then, Lilith runs entirely in offline demo mode, which is safe to explore with zero cost.

## Run it locally (frontend only, no backend needed to explore the UI)
```
npx serve .
```

## What's in here
- `index.html` — Home / Chat / Settings tabs
- `css/lilith.css` — theme, animations, mobile-first responsive layout
- `js/lilith-config.js` — the one file you edit: your Worker's URL (no secrets)
- `js/lilith-remote.js` — calls the Worker, handles timeouts/errors
- `js/lilith-brain.js` — offline fallback: personality, StarChart13 knowledge base, local memory, random-thought bank
- `js/lilith-voice.js` — speech synthesis (voice/rate/pitch/volume) + optional mic input via the Web Speech API
- `js/lilith-core.js` — UI wiring, connection-state handling, ambient random-thought scheduler, settings persistence, particle background
- `worker/lilith-worker.js` — deploy this to Cloudflare; holds the persona system prompt and calls the Gemini API using your secret key
- `docs/lilith-persona.md` — the full character design document
- `docs/SETUP-ANDROID.md` — step-by-step setup guide

## Current capabilities
- Real Gemini-powered chat (once connected) with typing animation, auto-scroll, session conversation continuity
- Offline demo brain as automatic fallback, with clear status indication
- Voice replies: voice picker, speed/pitch/volume sliders, mute, stop; optional mic input where supported
- Personality modes: Lilith (default), Astronomer, Storyteller, Teacher, Chaos, Silent
- Random ambient thoughts on a timer (frequency + randomness configurable)
- Wake/sleep greetings, glitch-intensity slider, dark cyberpunk theme throughout
- Mobile-first

## Free-tier / quota controls (built into the Worker)
- Uses `gemini-2.5-flash`, a stable model with genuinely free API access (confirmed against Google's official pricing docs) — no billing account needed
- The free tier is quota-based, not spend-based: there's no dollar cost to overrun, only a request quota that can be temporarily exhausted
- Caps reply length (400 tokens) and conversation history (last ~6 exchanges) sent per request, to stay comfortably within quota
- Returns a clear `quota_exceeded` error if the free tier's limit is hit, so the frontend can fall back to offline demo mode instead of failing silently
- Rejects oversized messages before they reach the API

## Built to extend later
```js
// Swap in a higher-quality voice (e.g. ElevenLabs) for speech
LilithExtensions.registerVoiceProvider({
  speak(text, opts, callbacks) { /* your provider */ },
  stop() { /* ... */ }
});
```
Other things designed to slot in later without a rewrite: real persistent memory (a database behind the Worker), live astronomy data, calendar integration, notifications, custom personalities, reader-marketplace hooks.

## Integrating into StarChart13 (later, when you're ready)
When you share your actual StarChart13 files: copy `css/lilith.css`, `js/lilith-*.js`, and `worker/` in unchanged (or namespaced if there are naming collisions), add one nav tab + one section to your existing `index.html`, load the scripts, and leave your chart engine and all other features untouched.

