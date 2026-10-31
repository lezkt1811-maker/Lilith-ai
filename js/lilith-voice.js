/**
 * lilith-voice.js
 * ------------------------------------------------------------------
 * Lilith's voice. One voice, one path: the Worker generates speech with
 * Gemini (the "Sulafat" voice) and this file plays it. Stop and Mute
 * cancel whatever is playing.
 *
 * Also holds the optional mic input (browser speech recognition), where
 * the browser supports it.
 * ------------------------------------------------------------------
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
}

/**
 * Wraps raw PCM samples (what Gemini TTS returns) in a standard 44-byte
 * RIFF/WAV header so browsers can decode and play it.
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

/** Asks the Worker for speech and plays it. */
function speak(text, opts = {}, callbacks = {}) {
    stopCurrentAudio();
    const requestId = currentRequest;
    if (callbacks.onstart) callbacks.onstart();

    fetch(global.LILITH_CONFIG.WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'speak', text })
    })
    .then(res => res.json())
    .then(data => {
        if (requestId !== currentRequest) return; // stopped or superseded while loading
        if (!data || !data.audio) throw new Error(data && data.message ? data.message : 'no audio returned');

        const bytes = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
        const wav = pcmToWav(bytes, data.sampleRate || 24000, data.channels || 1, data.bitsPerSample || 16);
        const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));

        const audio = new Audio(url);
        currentAudio = audio;
        const finish = () => {
            URL.revokeObjectURL(url);
            if (currentAudio === audio) currentAudio = null;
            if (callbacks.onend) callbacks.onend();
        };
        audio.onended = finish;
        audio.onerror = finish;
        return audio.play();
    })
    .catch(err => {
        // Voice is optional: if it fails, the text is still in the chat.
        console.error('Lilith voice: could not play speech', err);
        if (requestId === currentRequest && callbacks.onend) callbacks.onend();
    });
}

function stopSpeaking() {
    stopCurrentAudio();
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
    speak,
    stopSpeaking,
    isRecognitionSupported,
    startListening,
    stopListening,
    isListening
};

})(window);
