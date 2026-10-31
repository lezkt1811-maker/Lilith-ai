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
  const MEMORY_ID_KEY = 'lilith_memory_id_v1';

  function configured() {
    return !!(global.LILITH_CONFIG && global.LILITH_CONFIG.WORKER_URL && global.LILITH_CONFIG.WORKER_URL.trim());
  }

  /**
   * A random ID for this browser. The Worker uses it to find this browser's
   * stored memory. It is not a login: anyone who has it can read that memory,
   * so it is never shown on screen or sent anywhere else.
   */
  function memoryId() {
    try {
      let id = localStorage.getItem(MEMORY_ID_KEY);
      if (!id || id.length < 16) {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(MEMORY_ID_KEY, id);
      }
      return id;
    } catch (e) {
      return null; // storage blocked: the Worker falls back to session-only history
    }
  }

  async function postWorker(payload) {
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
        body: JSON.stringify(payload),
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
    return data;
  }

  /**
   * @param {string} message - the user's new message
   * @param {Array<{role:'user'|'assistant', content:string}>} history - session turns, used only if memory is unavailable
   * @returns {Promise<string>} the reply text
   * @throws {Error} with a .code on failure, so callers can show a specific message
   */
  async function sendMessage(message, history) {
    const data = await postWorker({ message, history, memoryId: memoryId() });
    if (!data.reply) {
      const err = new Error('The backend responded with no reply text.');
      err.code = 'empty_reply';
      throw err;
    }
    return data.reply;
  }

  /** @returns {Promise<{summary:string, exchanges:number}>} what Lilith remembers on the server */
  async function getMemory() {
    const id = memoryId();
    if (!id) throw Object.assign(new Error('Browser storage is blocked.'), { code: 'no_storage' });
    return postWorker({ action: 'memory', memoryId: id });
  }

  /** Deletes this browser's server-side memory. */
  async function forgetMemory() {
    const id = memoryId();
    if (!id) return;
    await postWorker({ action: 'forget', memoryId: id });
  }

  global.LilithRemote = { sendMessage, getMemory, forgetMemory, configured };

})(window);
