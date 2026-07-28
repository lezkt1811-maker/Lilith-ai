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
            body: JSON.stringify({ message: text })
        })
        .then(res => res.json())
        .then(data => {
            if (data && data.audio) {
                const audioBytes = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
                const blob = new Blob([audioBytes], { type: 'audio/wav' });
                const audio = new Audio(URL.createObjectURL(blob));
                if (callbacks && callbacks.onend) audio.onended = callbacks.onend;
                audio.play();
            } else if (callbacks && callbacks.onend) {
                callbacks.onend();
            }
        })
        .catch(err => {
            console.error('Audio stream error:', err);
            if (callbacks && callbacks.onend) callbacks.onend();
        });
    },
    stop() {}
};

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
