/**
 * lilith-voice.js
 * ------------------------------------------------------------------
 * Voice layer. Wraps the browser's SpeechSynthesis (text-to-speech)
 * and, where available, SpeechRecognition (speech-to-text) behind a
 * small provider interface so a future higher-quality voice (e.g.
 * ElevenLabs) can be dropped in without touching lilith-core.js.
 *
 * FUTURE EXPANSION HOOK:
 *   LilithVoice.setSpeechProvider({ speak(text, opts), stop() })
 *   to replace BrowserTTSProvider with e.g. an ElevenLabs client.
 * ------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  const synth = window.speechSynthesis || null;

  /* ---------------- Browser TTS provider (default) ---------------- */
  const BrowserTTSProvider = {
    voices: [],
    loadVoices() {
      if (!synth) return [];
      this.voices = synth.getVoices();
      return this.voices;
    },
    speak(text, opts, callbacks) {
      if (!synth) {
        callbacks && callbacks.onend && callbacks.onend();
        return null;
      }
      const utter = new SpeechSynthesisUtterance(text);
      if (opts.voice) utter.voice = opts.voice;
      utter.rate = opts.rate ?? 1;
      utter.pitch = opts.pitch ?? 1;
      utter.volume = opts.muted ? 0 : (opts.volume ?? 1);
      if (callbacks) {
        if (callbacks.onstart) utter.onstart = callbacks.onstart;
        if (callbacks.onend) utter.onend = callbacks.onend;
        if (callbacks.onerror) utter.onerror = callbacks.onerror;
      }
      synth.speak(utter);
      return utter;
    },
    stop() { if (synth) synth.cancel(); },
    pause() { if (synth) synth.pause(); },
    resume() { if (synth) synth.resume(); }
  };

  /*
   * STUB for future ElevenLabs (or other) provider. Not implemented —
   * kept here as the shape a real integration should match so it's a
   * drop-in replacement via setSpeechProvider().
   *
   * const ElevenLabsProvider = {
   *   speak(text, opts, callbacks) {
   *     fetch('https://api.elevenlabs.io/v1/text-to-speech/VOICE_ID', {...})
   *       .then(res => res.blob())
   *       .then(blob => { const audio = new Audio(URL.createObjectURL(blob));
   *         callbacks.onstart && callbacks.onstart();
   *         audio.onended = callbacks.onend;
   *         audio.play(); });
   *   },
   *   stop() { ... }
   * };
   */

  let activeProvider = BrowserTTSProvider;
  function setSpeechProvider(provider) { activeProvider = provider; }

  function getVoices() {
    if (!synth) return [];
    const voices = synth.getVoices();
    return voices && voices.length ? voices : BrowserTTSProvider.loadVoices();
  }

  function speak(text, opts = {}, callbacks = {}) {
    return activeProvider.speak(text, opts, callbacks);
  }
  function stopSpeaking() { activeProvider.stop(); }

  /* ---------------- Speech recognition (optional mic input) ---------------- */
  const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  let recognizer = null;
  let listening = false;

  function isRecognitionSupported() { return !!SpeechRecognitionImpl; }

  function startListening(onResult, onEnd) {
    if (!SpeechRecognitionImpl) return false;
    recognizer = new SpeechRecognitionImpl();
    recognizer.lang = 'en-US';
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 1;
    recognizer.onresult = (e) => {
      const text = e.results[0][0].transcript;
      onResult && onResult(text);
    };
    recognizer.onend = () => { listening = false; onEnd && onEnd(); };
    recognizer.onerror = () => { listening = false; onEnd && onEnd(); };
    recognizer.start();
    listening = true;
    return true;
  }

  function stopListening() {
    if (recognizer && listening) recognizer.stop();
    listening = false;
  }

  function isListening() { return listening; }

  global.LilithVoice = {
    getVoices,
    speak,
    stopSpeaking,
    setSpeechProvider,
    isRecognitionSupported,
    startListening,
    stopListening,
    isListening,
    synthAvailable: !!synth
  };

})(window);
