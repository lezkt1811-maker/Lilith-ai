/**
 * lilith-worker.js
 * ------------------------------------------------------------------
 * Cloudflare Worker — the ONLY place the Gemini API key exists.
 *
 * This file is deployed to Cloudflare, not to GitHub Pages. The key is
 * set as an encrypted secret in the Cloudflare dashboard (see
 * docs/SETUP-ANDROID.md) — never committed to any repo, never sent to
 * the browser.
 *
 * WHY GEMINI + THIS MODEL
 *   gemini-2.5-flash is a stable (non-preview) model with a genuinely
 *   free tier, confirmed directly against Google's official pricing
 *   docs (ai.google.dev/gemini-api/docs/pricing) at build time: free
 *   input/output tokens, no billing account required. The free tier is
 *   QUOTA-based (limited requests per minute/day), not spend-based —
 *   there is no dollar cost to overrun, only a daily quota that can be
 *   temporarily exhausted. If that happens, this Worker returns a
 *   clear "quota_exceeded" error rather than failing silently, and the
 *   frontend drops to offline demo mode automatically.
 *
 * WHAT THIS FILE DOES
 *   1. Accepts a POST request from the Lilith frontend containing the
 *      user's new message + a short slice of recent conversation.
 *   2. Attaches Lilith's fixed persona (system instruction) plus a
 *      separate, empty slot for project-specific context.
 *   3. Calls the Gemini API using the secret key from env.
 *   4. Returns just the reply text (or a clear error) to the browser.
 * ------------------------------------------------------------------
 */

// ---- Tunable limits (quota-safety controls, not cost controls — this
//      tier is free, but still finite) ----
const MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_REPLY_TOKENS = 400;        // keeps replies concise and quota-friendly
const MAX_HISTORY_MESSAGES = 12;     // ~6 exchanges; older messages are dropped
const MAX_MESSAGE_CHARS = 4000;      // defensive guard against oversized input

// ---- Lilith's fixed persona (Section 9 of docs/lilith-persona.md) ----
// This is intentionally the ONLY place her core personality lives for the
// live version. If you revise docs/lilith-persona.md, copy the updated
// syst
