/**
 * lilith-face.js
 * ------------------------------------------------------------------
 * Lilith's on-screen face while she speaks.
 *  - The mouth opens and closes with the loudness of her voice.
 *  - Captions reveal her words in step with the audio.
 * Driven by lilith-voice.js: LilithFace.start(audio, text) when a clip
 * begins, LilithFace.stop() when it ends or is cut off.
 * ------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  // There is one face on Home and one on Chat. Every copy moves together.
  const each = (sel) => document.querySelectorAll(sel);

  let audioCtx = null;
  let analyser = null;
  let levels = null;
  let rafId = null;
  let activeAudio = null;
  let words = [];

  function getAudioContext() {
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  /** Connects the clip to an analyser so we can read how loud it is. */
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
      // If the browser refuses, the mouth still moves on a simple rhythm.
      analyser = null;
    }
  }

  function loop() {
    rafId = requestAnimationFrame(loop);

    let level;
    if (analyser) {
      analyser.getByteFrequencyData(levels);
      let sum = 0;
      for (let i = 0; i < levels.length; i++) sum += levels[i];
      level = sum / levels.length / 255;
    } else {
      level = 0.25 + 0.2 * Math.sin(Date.now() / 90);
    }

    // Boost quiet speech a little, and cap the opening so the mouth stays natural.
    const open = Math.min(1, level * 2.4);
    each('.face-mouth').forEach((m) => { m.style.height = (open * 3.2).toFixed(2) + '%'; });

    if (activeAudio && activeAudio.duration) {
      const fraction = activeAudio.currentTime / activeAudio.duration;
      const shown = Math.min(words.length, Math.floor(fraction * words.length) + 1);
      const text = words.slice(0, shown).join(' ');
      each('.face-caption').forEach((c) => { c.textContent = text; });
    }
  }

  /** Call just before a clip plays. */
  function start(audio, text) {
    stop();
    activeAudio = audio;
    words = String(text || '').split(/\s+/).filter(Boolean);
    connectAnalyser(audio);

    each('.face-wrap').forEach((w) => w.classList.add('speaking'));
    each('.face-caption').forEach((c) => { c.textContent = ''; c.classList.add('show'); });
    loop();
  }

  /** Call when a clip ends or is cut off. */
  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    activeAudio = null;
    analyser = null;
    each('.face-mouth').forEach((m) => { m.style.height = '0%'; });
    each('.face-wrap').forEach((w) => w.classList.remove('speaking'));
    each('.face-caption').forEach((c) => { c.textContent = ''; c.classList.remove('show'); });
  }

  global.LilithFace = { start, stop };
})(window);
