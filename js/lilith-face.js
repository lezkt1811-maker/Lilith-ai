/**
 * lilith-face.js
 * ------------------------------------------------------------------
 * Lilith's on-screen face while she talks.
 *  - talk(text): starts as soon as a reply appears. The mouth moves and
 *    the words reveal together, whether or not the voice is working.
 *  - attach(audio): when her voice actually plays, the mouth follows
 *    its loudness and the words follow its timing.
 *  - stop(): ends everything (voice cut off, mute, sleep, or finished).
 * ------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  // There is one face on Home and one on Chat. Every copy moves together.
  const each = (sel) => document.querySelectorAll(sel);

  const MOUTH_FRAMES = 10;      // assets/mouth/mouth-0.png (closed) .. mouth-9.png (open)
  let lastMouthFrame = -1;
  const SECONDS_PER_WORD = 0.36; // reading pace used when there is no voice audio
  const MIN_SECONDS = 1.8;

  let audioCtx = null;
  let analyser = null;
  let levels = null;
  let rafId = null;
  let activeAudio = null;   // the voice clip, when it is playing
  let words = [];
  let startedAt = 0;        // for the timed (no-audio) mode
  let duration = 0;         // seconds, for the timed mode
  let talking = false;

  function getAudioContext() {
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  /** Connects the voice clip to an analyser so we can read how loud it is. */
  function connectAnalyser(audio) {
    analyser = null;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const source = ctx.createMediaElementSource(audio);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      levels = new Uint8Array(analyser.frequencyBinCount);
      source.connect(analyser);
      analyser.connect(ctx.destination);
    } catch (e) {
      analyser = null; // the mouth still moves on its own rhythm
    }
  }

  /** Swaps the mouth picture to match how open her mouth should be (0 = closed, 1 = fully open). */
  function setMouth(open) {
    const idx = Math.max(0, Math.min(MOUTH_FRAMES - 1, Math.round(open * (MOUTH_FRAMES - 1))));
    if (idx === lastMouthFrame) return;
    lastMouthFrame = idx;
    each('.face-mouth-img').forEach((m) => { m.src = 'assets/mouth/mouth-' + idx + '.png'; });
  }

  function setCaption(text, visible) {
    each('.face-caption').forEach((c) => {
      c.textContent = text;
      c.classList.toggle('show', visible);
    });
  }

  function loop() {
    rafId = requestAnimationFrame(loop);

    let progress; // 0..1 through the words
    let level;    // how open the mouth is, 0..1

    if (activeAudio && activeAudio.duration) {
      // Voice is playing: follow the real audio.
      progress = activeAudio.currentTime / activeAudio.duration;
      if (analyser) {
        analyser.getByteFrequencyData(levels);
        let sum = 0;
        for (let i = 0; i < levels.length; i++) sum += levels[i];
        level = Math.min(1, (sum / levels.length / 255) * 2.4);
      } else {
        level = 0.5 + 0.4 * Math.sin(Date.now() / 90);
      }
    } else {
      // No voice: move the mouth and reveal the words on a reading pace.
      const elapsed = (Date.now() - startedAt) / 1000;
      progress = Math.min(1, elapsed / duration);
      level = progress < 1 ? 0.45 + 0.45 * Math.sin(Date.now() / 85) : 0;
    }

    const open = Math.max(0, Math.min(1, level));
    setMouth(open);

    const shown = Math.min(words.length, Math.max(1, Math.floor(progress * words.length) + 1));
    setCaption(words.slice(0, shown).join(' '), true);

    if (!activeAudio && progress >= 1) {
      // Timed reading finished: close the mouth and keep the full text on screen.
      setMouth(0);
      cancelAnimationFrame(rafId);
      rafId = null;
      talking = false;
    }
  }

  function begin() {
    if (!rafId) loop();
    each('.face-wrap').forEach((w) => w.classList.add('speaking'));
  }

  /** Call as soon as a reply appears on screen, before any voice audio exists. */
  function talk(text) {
    stop();
    talking = true;
    words = String(text || '').split(/\s+/).filter(Boolean);
    duration = Math.max(MIN_SECONDS, words.length * SECONDS_PER_WORD);
    startedAt = Date.now();
    setCaption('', true);
    begin();
  }

  /** Call when her voice clip actually starts playing. */
  function attach(audio) {
    if (!talking) talking = true;
    activeAudio = audio;
    connectAnalyser(audio);
    begin();
  }

  /** Ends everything: voice cut off, muted, asleep, or finished. */
  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    activeAudio = null;
    analyser = null;
    talking = false;
    setMouth(0);
    each('.face-wrap').forEach((w) => w.classList.remove('speaking'));
    each('.face-caption').forEach((c) => { c.textContent = ''; c.classList.remove('show'); });
  }

  global.LilithFace = { talk, attach, stop };
})(window);
