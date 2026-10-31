/**
 * * lilith-voice.js
 * *
 * Voice layer. Wraps the browser's SpeechSynthesis (text-to-speech)
 * and, where available, SpeechRecognition (speech-to-text) behind a
 * small provider interface so a higher-quality voice (e.g.
 * ElevenLabs) can be dropped in without touching lilith-core.js.
 * *
 * FUTURE EXPANSION HOOK:
 * * LilithVoice.setSpeechProvider({ speak(text, opts), stop() })
 * * to replace BrowserTTSProvider with e.g. an ElevenLabs client.
 */

(function (global) {
'use strict';

/* The one clip that is playing or loading right now. Stop and Mute cancel it. */
let currentAudio = null;
let currentRequest = 0; // bumped on every speak/stop, so a late reply never plays over newer speech

function stopCurrentAudio() {
    currentRequest++;
    if (currentAudio) {
        currentAudio.onended = null;
        currentAudio.onerror = null;
        currentAudio.pause();
        if (currentAudio.src && currentAudio.src.startsWith('blob:')) URL.revokeObjectURL(currentAudio.src);
        currentAudio = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

/** Fallback when the Worker voice is unavailable: the browser's own voice. */
function browserSpeak(text, opts, callbacks, requestId) {
    if (!('speechSynthesis' in window)) {
        if (callbacks && callbacks.onend) callbacks.onend();
        return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.onend = () => { if (requestId === currentRequest && callbacks && callbacks.onend) callbacks.onend(); };
    utterance.onerror = () => { if (callbacks && callbacks.onend) callbacks.onend(); };
    window.speechSynthesis.speak(utterance);
}

const WorkerAudioProvider = {
    speak(text, opts, callbacks) {
        stopCurrentAudio();
        const requestId = currentRequest;
        if (callbacks && callbacks.onstart) callbacks.onstart();

        fetch(global.LILITH_CONFIG.WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'speak',
                text: text,
                voice: (opts && opts.voiceName) || 'Kore',
                style: (opts && opts.style) || {}
            })
        })
        .then(res => res.json())
        .then(data => {
            if (requestId !== currentRequest) return; // stopped or superseded while loading
            if (!data || !data.audio) throw new Error(data && data.message ? data.message : 'no audio field');

            const mime = data.mimeType || 'audio/wav';
            const bytes = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
            const fileBytes = data.mimeType
                ? bytes // already a playable file (MP3 from ElevenLabs)
                : pcmToWav(bytes, data.sampleRate || 24000, data.channels || 1, data.bitsPerSample || 16);
            const url = URL.createObjectURL(new Blob([fileBytes], { type: mime }));

            const audio = new Audio(url);
            currentAudio = audio;
            audio.onended = () => {
                URL.revokeObjectURL(url);
                if (currentAudio === audio) currentAudio = null;
                if (callbacks && callbacks.onend) callbacks.onend();
            };
            audio.onerror = () => {
                if (callbacks && callbacks.onend) callbacks.onend();
            };
            return audio.play();
        })
        .catch(err => {
            if (requestId !== currentRequest) return;
            console.error('Lilith voice: Worker voice failed, using browser voice instead', err);
            browserSpeak(text, opts, callbacks, requestId);
        });
    },
    stop() { stopCurrentAudio(); }
};

/**
 * Wraps raw PCM samples (what Gemini TTS actually returns) in a
 * standard 44-byte RIFF/WAV header so browsers can decode and play it.
 * Without this header, browsers silently refuse to play the audio.
 */
function pcmToWav(pcmBytes, sampleRate, numChannels, bitsPerSample) {
    const blockAlign = numChannels * (bitsPerSample / 8);
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcmBytes.length;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    function writeString(offset, str) {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);           // fmt chunk size
    view.setUint16(20, 1, true);            // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const wavBytes = new Uint8Array(buffer);
    wavBytes.set(pcmBytes, 44);
    return wavBytes;
}

let activeProvider = WorkerAudioProvider;
function setSpeechProvider(provider) { activeProvider = provider; }

function getVoices() {
    return [];
}

function speak(text, opts = {}, callbacks = {}) {
    return activeProvider.speak(text, opts, callbacks);
}

function stopSpeaking() {
    if (activeProvider.stop) activeProvider.stop();
}

/* ---------------- Speech recognition (optional mic input) ------------- */
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
    synthAvailable: true
};

})(window);
