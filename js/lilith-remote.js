/**
 * lilith-remote.js
 * ------------------------------------------------------------------
 * Talks to the Cloudflare Worker (never directly to Google/Gemini — the
 * browser never sees an API key). If this fails for any reason,
 * lilith-core.js catches it and falls back to the offline demo brain
 * in lilith-brain.js, showing a clear "offline mode" indicator rather
 * than pretending to be the real thing.
 * ------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  const TIMEOUT_MS = 20000;

  function configured() {
    return !!(global.LILITH_CONFIG && global.LILITH_CONFIG.WORKER_URL && global.LILITH_CONFIG.WORKER_URL.trim());
  }

  /**
   * @param {string} message - the user's new message
   * @param {Array<{role:'user'|'assistant', content:string}>} history - recent turns only (already trimmed by caller)
   * @returns {Promise<string>} the reply text
   * @throws {Error} with a .code on failure, so callers can show a specific message
   */
  async function sendMessage(message, history) {
    if (!configured()) {
      const err = new Error('Lilith is not connected to a Worker yet — WORKER_URL is empty in lilith-config.js.');
      err.code = 'not_configured';
      throw err;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res;
    try {
      res = await fetch(global.LILITH_CONFIG.WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      const err = new Error(e.name === 'AbortError'
        ? 'The connection to Lilith timed out.'
        : 'Could not reach the Lilith backend (network error).');
      err.code = e.name === 'AbortError' ? 'timeout' : 'network_error';
      throw err;
    }
    clearTimeout(timer);

    let data;
    try {
      data = await res.json();
    } catch (e) {
      const err = new Error('The backend returned an unreadable response.');
      err.code = 'bad_response';
      throw err;
    }

    if (!res.ok || data.error) {
      const err = new Error(data.message || `Backend error (status ${res.status}).`);
      err.code = data.error || 'unknown_error';
      throw err;
    }

    if (!data.reply) {
      const err = new Error('The backend responded with no reply text.');
      err.code = 'empty_reply';
      throw err;
    }

    return data.reply;
  }

  global.LilithRemote = { sendMessage, configured };

})(window);
