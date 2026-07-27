/**
 * lilith-voice-sliders.js
 * Adds a fully adjustable voice control panel with manual adjustment sliders.
 */

(function() {
    'use strict';

    const DEFAULT_SETTINGS = {
        pitch: 1.0,
        rate: 0.95,
        volume: 1.0,
        voiceIndex: 0
    };

    let voices = [];

    function loadVoices() {
        if (!('speechSynthesis' in window)) return;
        voices = window.speechSynthesis.getVoices();
    }

    if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
        loadVoices();
    }

    function createVoiceControlPanel() {
        if (document.getElementById('lilith-voice-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'lilith-voice-panel';
        panel.style.cssText = `
            background: rgba(20, 10, 30, 0.95);
            border: 1px solid #a855f7;
            border-radius: 12px;
            padding: 16px;
            margin: 16px 0;
            color: #f3e8ff;
            font-family: monospace;
            box-shadow: 0 0 15px rgba(168, 85, 247, 0.3);
        `;

        panel.innerHTML = `
            <h3 style="margin-top: 0; color: #c084fc; font-size: 16px;">🎙️ Voice Calibration Dials</h3>
            
            <div style="margin-bottom: 12px;">
                <label style="display: block; font-size: 12px; margin-bottom: 4px;">Voice Profile:</label>
                <select id="lilith-voice-select" style="width: 100%; background: #2e1065; color: #f3e8ff; border: 1px solid #7e22ce; padding: 6px; border-radius: 6px;"></select>
            </div>

            <div style="margin-bottom: 12px;">
                <label style="display: block; font-size: 12px; margin-bottom: 4px;">Pitch (<span id="val-pitch">1.0</span>):</label>
                <input type="range" id="slider-pitch" min="0.5" max="1.5" step="0.05" value="1.0" style="width: 100%; accent-color: #a855f7;">
            </div>

            <div style="margin-bottom: 12px;">
                <label style="display: block; font-size: 12px; margin-bottom: 4px;">Speed / Rate (<span id="val-rate">0.95</span>):</label>
                <input type="range" id="slider-rate" min="0.5" max="1.5" step="0.05" value="0.95" style="width: 100%; accent-color: #a855f7;">
            </div>

            <div style="margin-bottom: 12px;">
                <label style="display: block; font-size: 12px; margin-bottom: 4px;">Volume (<span id="val-volume">1.0</span>):</label>
                <input type="range" id="slider-volume" min="0.1" max="1" step="0.1" value="1.0" style="width: 100%; accent-color: #a855f7;">
            </div>
            
            <button id="btn-test-voice" style="background: #7e22ce; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; width: 100%; font-weight: bold;">Test Voice</button>
        `;

        // Inject into Settings tab or main container if available
        const settingsTab = document.getElementById('Settings') || document.querySelector('.settings-container') || document.body;
        settingsTab.appendChild(panel);

        // Populate voices dropdown
        const selectEl = document.getElementById('lilith-voice-select');
        voices.forEach((v, index) => {
            const opt = document.createElement('option');
            opt.value = index;
            opt.textContent = `${v.name} (${v.lang})`;
            selectEl.appendChild(opt);
        });

        // Event listeners for sliders
        ['pitch', 'rate', 'volume'].forEach(prop => {
            const slider = document.getElementById(`slider-${prop}`);
            const valSpan = document.getElementById(`val-${prop}`);
            slider.addEventListener('input', (e) => {
                valSpan.textContent = e.target.value;
                localStorage.setItem(`lilith_voice_${prop}`, e.target.value);
            });
            if (localStorage.getItem(`lilith_voice_${prop}`)) {
                slider.value = localStorage.getItem(`lilith_voice_${prop}`);
                valSpan.textContent = slider.value;
            }
        });

        selectEl.addEventListener('change', (e) => {
            localStorage.setItem('lilith_voice_index', e.target.value);
        });
        if (localStorage.getItem('lilith_voice_index')) {
            selectEl.value = localStorage.getItem('lilith_voice_index');
        }

        document.getElementById('btn-test-voice').addEventListener('click', () => {
            if (!('speechSynthesis' in window)) return;
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance("I heard you. I'm just deciding how much of the truth you want.");
            utterance.pitch = parseFloat(document.getElementById('slider-pitch').value);
            utterance.rate = parseFloat(document.getElementById('slider-rate').value);
            utterance.volume = parseFloat(document.getElementById('slider-volume').value);
            const vIdx = document.getElementById('lilith-voice-select').value;
            if (voices[vIdx]) utterance.voice = voices[vIdx];
            window.speechSynthesis.speak(utterance);
        });
    }

    window.addEventListener('DOMContentLoaded', () => {
        setTimeout(createVoiceControlPanel, 1000);
    });
})();
