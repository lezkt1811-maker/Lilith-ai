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
    voiceName: 'Kore',
    warmth: 50,
    energy: 50,
    pace: 50,
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
  const els = {
    tabs: document.querySelectorAll('.tab-btn'),
    panels: document.querySelectorAll('.tab-panel'),
    statusPill: $('#status-pill'),
    statusText: $('#status-text'),
    awakenBtn: $('#awaken-btn'),
    greetingLine: $('#greeting-line'),
    eyeWrap: $('#eye-wrap'),
    modeSelect: $('#mode-select'),
    chatWindow: $('#chat-window'),
    chatMessages: $('#chat-messages'),
    typingIndicator: $('#typing-indicator'),
    waveform: $('#waveform'),
    chatForm: $('#chat-form'),
    chatInput: $('#chat-input'),
    micBtn: $('#mic-btn'),
    muteBtn: $('#mute-btn'),
    stopBtn: $('#stop-btn'),
    ambientToast: $('#ambient-toast'),
    // settings
    voiceSelect: $('#voice-select'),
    warmthSlider: $('#warmth-slider'), warmthValue: $('#warmth-value'),
    energySlider: $('#energy-slider'), energyValue: $('#energy-value'),
    paceSlider: $('#pace-slider'), paceValue: $('#pace-value'),
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
    els.statusPill.classList.add('awake');
    els.eyeWrap.classList.add('blinking');
    els.eyeWrap.classList.remove('asleep');

    const line = LilithBrain.wakeGreeting(settings.wakeGreeting);
    els.greetingLine.textContent = line;
    speakIfEnabled(line);
    scheduleNextRandomThought();
    updateStatusLabel();
  }

  function goToSleep() {
    awake = false;
    els.awakenBtn.classList.remove('is-awake');
    els.awakenBtn.querySelector('.awaken-btn-label').textContent = 'Awaken Lilith';
    els.statusPill.classList.remove('awake', 'speaking');
    els.eyeWrap.classList.remove('blinking');
    els.eyeWrap.classList.add('asleep');

    const line = LilithBrain.sleepGreeting(settings.sleepGreeting);
    els.greetingLine.textContent = line;
    LilithVoice.stopSpeaking();
    clearTimeout(randomThoughtTimer);
    updateStatusLabel();
  }

  function updateStatusLabel() {
    if (!awake) { els.statusText.textContent = 'Dormant'; return; }
    if (!LilithRemote.configured()) { els.statusText.textContent = 'Awake · Demo mode'; return; }
    els.statusText.textContent = usingOfflineFallback ? 'Awake · Offline demo' : 'Awake · Connected';
  }

  /* =========================================================
   * CHAT
   * ========================================================= */
  const sessionHistory = []; // in-memory only; resets on reload. Not persistent memory.
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
        reply = await LilithRemote.sendMessage(text, sessionHistory.slice(-MAX_SESSION_HISTORY));
        setConnectionState(true);
      } catch (err) {
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
      return;
    }

    await typeOutBubble(reply);
    speakIfEnabled(reply);
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
      default: return code || 'unknown error';
    }
  }

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

  /* ---------------- mic input (progressive enhancement) ---------------- */
  if (LilithVoice.isRecognitionSupported()) {
    els.micBtn.addEventListener('click', () => {
      if (LilithVoice.isListening()) { LilithVoice.stopListening(); return; }
      els.micBtn.classList.add('listening');
      LilithVoice.startListening(
        (text) => { els.chatInput.value = text; handleUserMessage(text); },
        () => els.micBtn.classList.remove('listening')
      );
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

    LilithVoice.speak(text, {
      voiceName: settings.voiceName,
      style: { warmth: settings.warmth, energy: settings.energy, pace: settings.pace },
      muted
    }, {
      onend: () => { els.statusPill.classList.remove('speaking'); els.waveform.classList.remove('active'); },
      onerror: () => { els.statusPill.classList.remove('speaking'); els.waveform.classList.remove('active'); }
    });
  }

  els.muteBtn.addEventListener('click', () => {
    muted = !muted;
    els.muteBtn.setAttribute('aria-pressed', String(muted));
    els.muteBtn.textContent = muted ? '🔇 Muted' : '🔊 Mute';
    if (muted) LilithVoice.stopSpeaking();
  });

  els.stopBtn.addEventListener('click', () => {
    LilithVoice.stopSpeaking();
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
  els.voiceSelect.value = settings.voiceName;
  els.voiceSelect.addEventListener('change', () => { settings.voiceName = els.voiceSelect.value; saveSettings(); });

  bindSlider(els.warmthSlider, els.warmthValue, 'warmth', v => Math.round(v) + '%');
  bindSlider(els.energySlider, els.energyValue, 'energy', v => Math.round(v) + '%');
  bindSlider(els.paceSlider, els.paceValue, 'pace', v => Math.round(v) + '%');
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

  els.clearMemoryBtn.addEventListener('click', () => {
    LilithBrain.memory.clear();
    refreshMemorySummary();
    addBubble("Done. A clean slate — for now.", 'lilith');
  });

  function refreshMemorySummary() {
    els.memorySummary.textContent = LilithBrain.memory.summaryText();
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

  /* initial UI state */
  els.eyeWrap.classList.add('asleep');
  refreshMemorySummary();

  /* =========================================================
   * EXTENSION POINTS
   * Documented, no-op by default. A future integration can call
   * these without editing this file.
   * ========================================================= */
  window.LilithExtensions = {
    /** Swap in a real AI backend for text replies. */
    registerAIProvider: (fn) => LilithBrain.setResponseProvider(fn),
    /** Swap in a higher-quality voice engine (e.g. ElevenLabs). */
    registerVoiceProvider: (provider) => LilithVoice.setSpeechProvider(provider),
    /** Read current settings object (read-only copy). */
    getSettings: () => Object.assign({}, settings)
  };

})();
