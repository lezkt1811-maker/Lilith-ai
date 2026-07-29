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

const WorkerAudioProvider = {
    speak(text, opts, callbacks) {
        if (callbacks && callbacks.onstart) callbacks.onstart();

        // Calls your worker endpoint for custom audio generation
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
            if (data && data.audio) {
                const pcmBytes = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
                const wavBytes = pcmToWav(
                    pcmBytes,
                    data.sampleRate || 24000,
                    data.channels || 1,
                    data.bitsPerSample || 16
                );
                const blob = new Blob([wavBytes], { type: 'audio/wav' });
                const audio = new Audio(URL.createObjectURL(blob));
                if (callbacks && callbacks.onend) audio.onended = callbacks.onend;
                audio.onerror = (e) => {
                    console.error('Lilith voice: audio playback failed', e);
                    if (callbacks && callbacks.onend) callbacks.onend();
                };
                audio.play().catch(err => {
                    console.error('Lilith voice: audio.play() rejected', err);
                    if (callbacks && callbacks.onend) callbacks.onend();
                });
            } else {
                console.error('Lilith voice: worker response had no audio field', data);
                if (callbacks && callbacks.onend) callbacks.onend();
            }
        })
        .catch(err => {
            console.error('Audio stream error:', err);
            if (callbacks && callbacks.onend) callbacks.onend();
        });
    },
    stop() {}
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
