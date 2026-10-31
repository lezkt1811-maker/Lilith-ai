/**
 * lilith-core.js
 * ------------------------------------------------------------------
 * Wires the DOM to LilithBrain (personality/knowledge/memory) and
 * LilithVoice (speech). Owns app state: awake/asleep, active mode,
 * settings, and the ambient random-thought scheduler.
 *
 * This file intentionally knows nothing about *how* Lilith thinks or
 * speaks — it only calls into LilithBrain / LilithVoice. Swap either
 * of those out and this file keeps working unchanged.
 * ------------------------------------------------------------------
 */

(function () {
  'use strict';

  const SETTINGS_KEY = 'lilith_settings_v1';

  const defaultSettings = {
    mode: 'default',
    enableVoice: true,
    autoSpeak: true,
    enableRandomComments: true,
    talkFrequencyMinutes: 4,
    randomness: 50,
    glitchIntensity: 50,
    wakeGreeting: '',
    sleepGreeting: ''
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? Object.assign({}, defaultSettings, JSON.parse(raw)) : Object.assign({}, defaultSettings);
    } catch (e) {
      return Object.assign({}, defaultSettings);
    }
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }

  const settings = loadSettings();

  /* ---------------- state ---------------- */
  let awake = false;
  let muted = false;
  let randomThoughtTimer = null;

  /* ---------------- element refs ---------------- */
  const $ = (sel) => document.querySelector(sel);
  const each = (sel) => document.querySelectorAll(sel);
  const els = {
    tabs: document.querySelectorAll('.tab-btn'),
    panels: document.querySelectorAll('.tab-panel'),
    statusPill: $('#status-pill'),
    statusText: $('#status-text'),
    awakenBtn: $('#awaken-btn'),
    restBtn: $('#rest-btn'),
    greetingLine: $('#greeting-line'),
    eyeWrap: $('#eye-wrap'),
    modeSelect: $('#mode-select'),
    chatWindow: $('#chat-window'),
    chatMessages: $('#chat-messages'),
    typingIndicator: $('#typing-indicator'),
    waveform: $('#waveform'),
    chatForm: $('#chat-form'),
    chatInput: $('#chat-input'),
    attachBtn: $('#attach-btn'),
    fileInput: $('#file-input'),
    attachHint: $('#attach-hint'),
    micBtn: $('#mic-btn'),
    muteBtn: $('#mute-btn'),
    stopBtn: $('#stop-btn'),
    ambientToast: $('#ambient-toast'),
    // settings
    enableVoiceToggle: $('#enable-voice-toggle'),
    autoSpeakToggle: $('#auto-speak-toggle'),
    enableRandomToggle: $('#enable-random-toggle'),
    freqSlider: $('#freq-slider'), freqValue: $('#freq-value'),
    randomnessSlider: $('#randomness-slider'), randomnessValue: $('#randomness-value'),
    glitchSlider: $('#glitch-slider'), glitchValue: $('#glitch-value'),
    wakeGreetingInput: $('#wake-greeting-input'),
    sleepGreetingInput: $('#sleep-greeting-input'),
    memorySummary: $('#memory-summary'),
    clearMemoryBtn: $('#clear-memory-btn')
  };

  /* =========================================================
   * TABS
   * ========================================================= */
  els.tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      els.tabs.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
      const target = btn.dataset.tab;
      els.panels.forEach(p => p.classList.toggle('active', p.id === `tab-${target}`));
      if (target === 'settings') refreshMemorySummary();
      if (target === 'chat') scrollChatToBottom();
    });
  });

  /* =========================================================
   * MODE CHIPS
   * ========================================================= */
  document.querySelectorAll('.mode-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.mode-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      settings.mode = chip.dataset.mode;
      saveSettings();
    });
  });

  /* =========================================================
   * AWAKEN / SLEEP
   * ========================================================= */
  els.awakenBtn.addEventListener('click', () => {
    awake ? goToSleep() : awaken();
  });

  function awaken() {
    awake = true;
    els.awakenBtn.classList.add('is-awake');
    els.awakenBtn.querySelector('.awaken-btn-label').textContent = 'Return Lilith to Sleep';
    els.restBtn.textContent = '☾ Let her rest';
    els.statusPill.classList.add('awake');
    els.eyeWrap.classList.add('blinking');
    els.eyeWrap.classList.remove('asleep');
    each('.face-wrap').forEach((w) => w.classList.remove('asleep'));

    const line = LilithBrain.wakeGreeting(settings.wakeGreeting);
    els.greetingLine.textContent = line;
    speakIfEnabled(line);
    scheduleNextRandomThought();
    updateStatusLabel();
  }

  /**
   * Puts her to rest. With silent=false she says a goodnight line out loud
   * (used by the Home button). With silent=true she has already said her
   * goodbye in chat, so nothing more is spoken.
   */
  function goToSleep(silent) {
    awake = false;
    handsFree = false;
    clearTimeout(listenTimer);
    if (LilithVoice.isListening()) LilithVoice.stopListening();
    els.micBtn.classList.remove('listening');

    els.awakenBtn.classList.remove('is-awake');
    els.awakenBtn.querySelector('.awaken-btn-label').textContent = 'Awaken Lilith';
    els.restBtn.textContent = '☀ Wake Lilith';
    els.statusPill.classList.remove('awake', 'speaking');
    els.eyeWrap.classList.remove('blinking');
    els.eyeWrap.classList.add('asleep');
    each('.face-wrap').forEach((w) => w.classList.add('asleep'));

    const line = LilithBrain.sleepGreeting(settings.sleepGreeting);
    els.greetingLine.textContent = line;
    clearTimeout(randomThoughtTimer);
    if (!silent) {
      LilithVoice.stopSpeaking();
      speakIfEnabled(line);
    }
    updateStatusLabel();
  }

  els.awakenBtn.addEventListener('click', () => {
    awake ? goToSleep(false) : awaken();
  });

  /* Wake / Rest button on the Chat screen. Rest is a proper goodnight:
     she is told, she answers, and then she goes to sleep. */
  const FAREWELL = "I'm going to rest now. Goodnight, Lilith.";
  let restAfterReply = false;

  els.restBtn.addEventListener('click', () => {
    if (!awake) { awaken(); return; }
    restAfterReply = true;
    handleUserMessage(FAREWELL);
  });

  /** Puts her to rest once her goodbye has been said (and spoken, if voice is on). */
  function finishRest() {
    if (!restAfterReply) return;
    restAfterReply = false;
    goToSleep(true);
  }

  function updateStatusLabel() {
    if (!awake) { els.statusText.textContent = 'Resting'; return; }
    if (!LilithRemote.configured()) { els.statusText.textContent = 'Awake · Demo mode'; return; }
    els.statusText.textContent = usingOfflineFallback ? 'Awake · Offline demo' : 'Awake · Connected';
  }

  /* =========================================================
   * CHAT
   * ========================================================= */
  const CONTENT_ERROR_CODES = new Set(['message_too_long', 'empty_message', 'blocked_response', 'empty_reply']);
  const sessionHistory = []; // this tab's recent turns; the server keeps the long-term memory.
  const MAX_SESSION_HISTORY = 12; // ~6 exchanges, mirrors the Worker's own cap
  let usingOfflineFallback = false;
  let offlineNoticeShown = false;

  els.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = els.chatInput.value.trim();
    if (!text) return;
    els.chatInput.value = '';
    handleUserMessage(text);
  });

  function addBubble(text, who) {
    const div = document.createElement('div');
    div.className = `bubble ${who}`;
    div.textContent = text;
    els.chatMessages.appendChild(div);
    scrollChatToBottom();
    return div;
  }

  function scrollChatToBottom() {
    requestAnimationFrame(() => { els.chatWindow.scrollTop = els.chatWindow.scrollHeight; });
  }

  async function handleUserMessage(text) {
    if (!awake) awaken(); // typing to her wakes her, naturally
    addBubble(text, 'user');
    els.typingIndicator.hidden = false;
    scrollChatToBottom();

    const thinkDelay = 300 + Math.random() * 500;
    await sleep(thinkDelay);

    let reply;
    let source = 'remote';

    if (LilithRemote.configured()) {
      try {
        reply = await LilithRemote.sendMessage(text, sessionHistory.slice(-MAX_SESSION_HISTORY), settings.mode);
        setConnectionState(true);
      } catch (err) {
        // Content problems (too long, blocked, empty) are not outages: show them
        // as Lilith's words and stay connected. Only real connection failures
        // should switch to offline demo mode.
        if (CONTENT_ERROR_CODES.has(err.code)) {
          els.typingIndicator.hidden = true;
          addBubble(err.message, 'ambient');
          return;
        }
        setConnectionState(false, err);
        source = 'offline';
      }
    } else {
      source = 'offline';
    }

    if (source === 'offline') {
      reply = await LilithBrain.respond(text, { mode: settings.mode });
    } else {
      // keep session history in sync only for the real backend path —
      // the offline demo brain manages its own memory separately.
      sessionHistory.push({ role: 'user', content: text });
      sessionHistory.push({ role: 'assistant', content: reply });
      while (sessionHistory.length > MAX_SESSION_HISTORY) sessionHistory.shift();
    }

    els.typingIndicator.hidden = true;

    if (settings.mode === 'silent') {
      addBubble(reply, 'lilith');
      finishRest();
      return;
    }

    // Ask for her voice right away, so it's ready as the words appear
    // (before, it waited for the text animation to finish first).
    speakIfEnabled(reply);
    // Start the mouth and words after the voice request is made (that request resets the face).
    if (window.LilithFace) LilithFace.talk(reply);
    await typeOutBubble(reply);
    if (!lilithSpeaking) finishRest(); // if her voice already ended or never started
  }

  /** Tracks whether we're on the real backend or the offline demo brain, and surfaces it once, clearly. */
  function setConnectionState(connected, err) {
    const wasOffline = usingOfflineFallback;
    usingOfflineFallback = !connected;
    els.statusPill.classList.toggle('offline-mode', usingOfflineFallback);

    if (usingOfflineFallback && !offlineNoticeShown) {
      offlineNoticeShown = true;
      const reason = err ? ` (${humanizeErrorCode(err.code)})` : '';
      addBubble(`Lilith is using limited offline mode${reason}. Replies below are the local demo, not the full AI.`, 'ambient');
    }
    if (connected && wasOffline) {
      offlineNoticeShown = false; // allow a fresh notice if it drops again later
      addBubble('Lilith reconnected — you\'re talking to the real thing again.', 'ambient');
    }
    updateStatusLabel();
  }

  function humanizeErrorCode(code) {
    switch (code) {
      case 'not_configured': return 'no Worker URL set yet';
      case 'timeout': return 'connection timed out';
      case 'network_error': return 'network unreachable';
      case 'missing_api_key': return 'server misconfigured';
      case 'gemini_error': return 'Gemini API error';
      case 'quota_exceeded': return 'free quota exhausted';
      case 'blocked_response': return 'response blocked by safety filter';
      case 'memory_unavailable': return 'server memory not set up yet';
      case 'bad_memory_id': return 'browser memory ID is invalid';
      case 'no_storage': return 'browser storage is blocked';
      default: return code || 'unknown error';
    }
  }

  // Shows why her voice didn't play, at most once a minute, so it isn't silent.
  let lastVoiceNoticeAt = 0;
  window.addEventListener('lilith-voice-error', (e) => {
    if (Date.now() - lastVoiceNoticeAt < 60000) return;
    lastVoiceNoticeAt = Date.now();
    addBubble(`Her voice didn't play: ${e.detail}`, 'ambient');
  });

  function typeOutBubble(fullText) {
    return new Promise((resolve) => {
      const bubble = addBubble('', 'lilith');
      let i = 0;
      const step = Math.max(1, Math.floor(fullText.length / 60)); // scale speed to length
      const interval = setInterval(() => {
        i += step;
        bubble.textContent = fullText.slice(0, i);
        scrollChatToBottom();
        if (i >= fullText.length) {
          bubble.textContent = fullText;
          clearInterval(interval);
          resolve();
        }
      }, 16);
    });
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ---------------- file attach (text files only, client-side) ----------------
   * Reads a plain-text file (.txt/.md) and sends its contents as a chat
   * message, the same way pasted text already works. There is no backend
   * support yet for images or PDFs — the Worker only accepts { message,
   * history } as JSON text, so a real "look at this photo" feature needs
   * changes on that side (Gemini's multimodal API) before it can work here.
   * ---------------------------------------------------------------- */
  const ATTACHABLE_EXT = /\.(txt|md|markdown)$/i;
  const ATTACHABLE_MIME = /^text\//;

  els.attachBtn.addEventListener('click', () => els.fileInput.click());

  els.fileInput.addEventListener('change', () => {
    const file = els.fileInput.files && els.fileInput.files[0];
    els.fileInput.value = ''; // allow picking the same file again later
    if (!file) return;

    const looksLikeText = ATTACHABLE_MIME.test(file.type) || ATTACHABLE_EXT.test(file.name) || file.type === '';
    if (!looksLikeText) {
      showAttachHint(`Lilith can only read plain text files right now (.txt, .md) — "${file.name}" looks like something else (${file.type || 'unknown type'}). Image/PDF support needs a Worker update.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '').trim();
      if (!content) { showAttachHint(`"${file.name}" appears to be empty.`); return; }
      showAttachHint('');
      handleUserMessage(`[Shared file: ${file.name}]\n\n${content}`);
    };
    reader.onerror = () => showAttachHint(`Couldn't read "${file.name}".`);
    reader.readAsText(file);
  });

  function showAttachHint(text) {
    if (!text) { els.attachHint.style.display = 'none'; els.attachHint.textContent = ''; return; }
    els.attachHint.textContent = text;
    els.attachHint.style.display = 'block';
  }

  /* ---------------- hands-free conversation (progressive enhancement) ----------------
   * Press the mic once to turn on hands-free talk: Lilith listens, sends each thing you
   * say, and pauses listening while she speaks so she doesn't hear herself.
   * Press the mic again to turn it off.
   * ---------------------------------------------------------------- */
  let handsFree = false;      // what you asked for: conversation on or off
  let lilithSpeaking = false; // true while her voice is playing (listening is paused)
  let listenTimer = null;

  function startListeningLoop() {
    if (!handsFree || lilithSpeaking || LilithVoice.isListening()) return;
    els.micBtn.classList.add('listening');
    LilithVoice.startListening(
      (text) => { if (text && text.trim()) handleUserMessage(text.trim()); },
      (errorCode) => {
        if (errorCode === 'not-allowed' || errorCode === 'service-not-allowed') {
          handsFree = false;
          els.micBtn.classList.remove('listening');
          addBubble("I can't hear you: the microphone is blocked. Allow microphone access for this site in your browser settings, then press the mic again.", 'ambient');
          return;
        }
        if (handsFree && !lilithSpeaking) {
          clearTimeout(listenTimer);
          listenTimer = setTimeout(startListeningLoop, 250);
        } else {
          els.micBtn.classList.remove('listening');
        }
      }
    );
  }

  /** Called as soon as her voice starts: stop listening so she doesn't hear herself. */
  function pauseHandsFree() {
    lilithSpeaking = true;
    clearTimeout(listenTimer);
    if (LilithVoice.isListening()) LilithVoice.stopListening();
  }

  /** Called when her voice ends or is cut off: listen again, after a short pause for echo to fade. */
  function resumeHandsFree() {
    lilithSpeaking = false;
    if (handsFree) {
      clearTimeout(listenTimer);
      listenTimer = setTimeout(startListeningLoop, 500);
    }
  }

  if (LilithVoice.isRecognitionSupported()) {
    els.micBtn.addEventListener('click', () => {
      if (handsFree) {
        handsFree = false;
        clearTimeout(listenTimer);
        LilithVoice.stopListening();
        els.micBtn.classList.remove('listening');
        return;
      }
      handsFree = true;
      if (!awake) awaken(); // talking to her wakes her, same as typing
      startListeningLoop();
    });
  } else {
    els.micBtn.disabled = true;
    els.micBtn.title = 'Voice input not supported in this browser';
    els.micBtn.style.opacity = 0.35;
  }

  /* =========================================================
   * VOICE OUTPUT
   * ========================================================= */
  function speakIfEnabled(text) {
    if (!settings.enableVoice || !settings.autoSpeak || muted || settings.mode === 'silent') return;

    els.statusPill.classList.add('speaking');
    els.waveform.classList.add('active');
    pauseHandsFree();

    LilithVoice.speak(text, {}, {
      onend: () => { els.statusPill.classList.remove('speaking'); els.waveform.classList.remove('active'); resumeHandsFree(); finishRest(); },
      onerror: () => { els.statusPill.classList.remove('speaking'); els.waveform.classList.remove('active'); resumeHandsFree(); finishRest(); }
    });
  }

  els.muteBtn.addEventListener('click', () => {
    muted = !muted;
    els.muteBtn.setAttribute('aria-pressed', String(muted));
    els.muteBtn.textContent = muted ? '🔇 Muted' : '🔊 Mute';
    if (muted) { LilithVoice.stopSpeaking(); resumeHandsFree(); }
  });

  els.stopBtn.addEventListener('click', () => {
    LilithVoice.stopSpeaking();
    resumeHandsFree();
    els.statusPill.classList.remove('speaking');
    els.waveform.classList.remove('active');
  });

  /* =========================================================
   * RANDOM THOUGHTS (ambient presence)
   * ========================================================= */
  function scheduleNextRandomThought() {
    clearTimeout(randomThoughtTimer);
    if (!awake || !settings.enableRandomComments || settings.mode === 'silent') return;

    const baseMs = settings.talkFrequencyMinutes * 60 * 1000;
    const jitter = (settings.randomness / 100) * baseMs; // randomness widens the spread
    const delay = Math.max(15000, baseMs + (Math.random() * 2 - 1) * jitter);

    randomThoughtTimer = setTimeout(() => {
      if (awake) fireRandomThought();
      scheduleNextRandomThought();
    }, delay);
  }

  function fireRandomThought() {
    const thought = LilithBrain.randomThought();
    // Log it into chat history so it's there when the user opens the tab
    const bubble = document.createElement('div');
    bubble.className = 'bubble ambient';
    bubble.textContent = thought;
    els.chatMessages.appendChild(bubble);
    scrollChatToBottom();

    const chatVisible = document.getElementById('tab-chat').classList.contains('active');
    if (!chatVisible) showAmbientToast(thought);
    speakIfEnabled(thought);
  }

  let toastTimer = null;
  function showAmbientToast(text) {
    els.ambientToast.textContent = text;
    els.ambientToast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.ambientToast.classList.remove('show'), 5200);
  }

  /* =========================================================
   * SETTINGS PANEL
   * ========================================================= */
  bindSlider(els.freqSlider, els.freqValue, 'talkFrequencyMinutes', v => `${Math.max(1, v - 1)}–${v + 2}`);
  bindSlider(els.randomnessSlider, els.randomnessValue, 'randomness', v => Math.round(v) + '%');
  bindSlider(els.glitchSlider, els.glitchValue, 'glitchIntensity', v => Math.round(v) + '%', (v) => {
    document.documentElement.style.setProperty('--glitch-amt', (v / 100).toFixed(2));
  });

  function bindSlider(slider, valueEl, key, formatFn, sideEffect) {
    slider.value = settings[key];
    valueEl.textContent = formatFn(Number(settings[key]));
    slider.addEventListener('input', () => {
      const v = Number(slider.value);
      settings[key] = v;
      valueEl.textContent = formatFn(v);
      if (sideEffect) sideEffect(v);
      saveSettings();
      if (key === 'talkFrequencyMinutes' || key === 'randomness') scheduleNextRandomThought();
    });
  }

  els.enableVoiceToggle.checked = settings.enableVoice;
  els.enableVoiceToggle.addEventListener('change', () => { settings.enableVoice = els.enableVoiceToggle.checked; saveSettings(); });

  els.autoSpeakToggle.checked = settings.autoSpeak;
  els.autoSpeakToggle.addEventListener('change', () => { settings.autoSpeak = els.autoSpeakToggle.checked; saveSettings(); });

  els.enableRandomToggle.checked = settings.enableRandomComments;
  els.enableRandomToggle.addEventListener('change', () => {
    settings.enableRandomComments = els.enableRandomToggle.checked;
    saveSettings();
    scheduleNextRandomThought();
  });

  els.wakeGreetingInput.value = settings.wakeGreeting;
  els.wakeGreetingInput.addEventListener('input', () => { settings.wakeGreeting = els.wakeGreetingInput.value; saveSettings(); });
  els.sleepGreetingInput.value = settings.sleepGreeting;
  els.sleepGreetingInput.addEventListener('input', () => { settings.sleepGreeting = els.sleepGreetingInput.value; saveSettings(); });

  els.clearMemoryBtn.addEventListener('click', async () => {
    LilithBrain.memory.clear();
    sessionHistory.length = 0;
    try {
      await LilithRemote.forgetMemory();
      addBubble("Done. A clean slate — for now.", 'lilith');
    } catch (err) {
      addBubble(`I couldn't clear my memory on the server (${humanizeErrorCode(err.code)}). Local memory is cleared.`, 'ambient');
    }
    refreshMemorySummary();
  });

  async function refreshMemorySummary() {
    const local = LilithBrain.memory.summaryText();
    if (!LilithRemote.configured()) {
      els.memorySummary.textContent = local;
      return;
    }
    els.memorySummary.textContent = 'Checking what I remember…';
    try {
      const mem = await LilithRemote.getMemory();
      const count = mem.exchanges || 0;
      const head = mem.summary
        ? mem.summary
        : 'Nothing summarized yet.';
      els.memorySummary.textContent =
        `${head} (${count} recent exchange${count === 1 ? '' : 's'} kept.)`;
    } catch (err) {
      els.memorySummary.textContent = `Couldn't reach my memory right now (${humanizeErrorCode(err.code)}). ${local}`;
    }
  }

  // restore active mode chip on load
  document.querySelectorAll('.mode-chip').forEach(c => c.classList.toggle('active', c.dataset.mode === settings.mode));
  document.documentElement.style.setProperty('--glitch-amt', (settings.glitchIntensity / 100).toFixed(2));

  /* =========================================================
   * AMBIENT PARTICLE BACKGROUND (canvas, lightweight)
   * ========================================================= */
  (function particles() {
    const canvas = document.getElementById('particles-canvas');
    const ctx = canvas.getContext('2d');
    let w, h, points;
    const COLORS = ['#9d3bff', '#ff2e97', '#23f4ea'];

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    function init() {
      resize();
      const count = Math.min(70, Math.floor((w * h) / 18000));
      points = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.6 + 0.4,
        vy: Math.random() * 0.15 + 0.03,
        c: COLORS[Math.floor(Math.random() * COLORS.length)],
        tw: Math.random() * Math.PI * 2
      }));
    }
    function tick() {
      ctx.clearRect(0, 0, w, h);
      points.forEach(p => {
        p.y -= p.vy;
        p.tw += 0.02;
        if (p.y < -5) p.y = h + 5;
        const alpha = 0.35 + Math.sin(p.tw) * 0.25;
        ctx.beginPath();
        ctx.fillStyle = p.c;
        ctx.globalAlpha = Math.max(0.1, alpha);
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      requestAnimationFrame(tick);
    }
    window.addEventListener('resize', () => { resize(); });
    init();
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) tick();
  })();

  /* initial UI state: she starts asleep until you wake her */
  els.eyeWrap.classList.add('asleep');
  each('.face-wrap').forEach((w) => w.classList.add('asleep'));
  // Memory is fetched from the server only when the Settings tab opens,
  // so page load makes no extra network calls.
  els.memorySummary.textContent = 'Open this tab to see what Lilith remembers.';

  /* =========================================================
   * EXTENSION POINTS
   * Documented, no-op by default. A future integration can call
   * these without editing this file.
   * ========================================================= */
  window.LilithExtensions = {
    /** Swap in a real AI backend for text replies. */
    registerAIProvider: (fn) => LilithBrain.setResponseProvider(fn),
    /** Read current settings object (read-only copy). */
    getSettings: () => Object.assign({}, settings)
  };

})();
