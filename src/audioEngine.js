// =============================================================================
// audioEngine.js — AudioContext, mezcla maestra y gestión de voces
// =============================================================================
// Crea el AudioContext, la ganancia maestra y un MediaStreamDestination para la
// grabación (solo audio). Mantiene las voces: en modo Dúo hay dos voces
// independientes (izquierda/derecha); en modo Clásico, una sola voz de tono.
// =============================================================================

import { ThereminVoice } from "./thereminVoice.js";
import { VOICE } from "./config.js";

export class AudioEngine {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Bus de suma → señal directa + reverb → limitador → master.
    this.sumBus = this.ctx.createGain();
    this.dryGain = this.ctx.createGain();
    this.wetGain = this.ctx.createGain();
    this.dryGain.gain.value = 0.9;
    this.wetGain.gain.value = 0.28;
    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = this._buildImpulseResponse(2.6, 2.2);
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.18;

    this.master = this.ctx.createGain();
    this.master.gain.setValueAtTime(VOICE.masterGain, this.ctx.currentTime);
    this.sumBus.connect(this.dryGain);
    this.sumBus.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.dryGain.connect(this.limiter);
    this.wetGain.connect(this.limiter);
    this.limiter.connect(this.master);
    this.master.connect(this.ctx.destination);

    // Nodo para grabar SOLO el audio sintetizado (nunca la webcam).
    this.recordDestination = this.ctx.createMediaStreamDestination();
    this.master.connect(this.recordDestination);

    // Voces: se crean en setupVoices().
    this.voices = { left: null, right: null };
  }

  async resume() {
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  // Crea las dos voces y arranca sus osciladores (suenan en silencio hasta que
  // se les da amplitud). Llamar una sola vez tras el gesto del usuario.
  setupVoices() {
    this.voices.left = new ThereminVoice(this.ctx, this.sumBus, {
      baseFreq: 65.41, triLevel: 0.22, harmLevel: 0.09,
      cutoffRange: [350, 4200], cutoffTracking: 9, maxGain: 0.9, vibratoCents: 6,
    });
    this.voices.right = new ThereminVoice(this.ctx, this.sumBus, {
      baseFreq: 261.63, triLevel: 0.16, harmLevel: 0.06,
      cutoffRange: [800, 9000], cutoffTracking: 6, maxGain: 0.8, vibratoCents: 7,
    });
    this.voices.left.start();
    this.voices.right.start();
  }

  getVoice(side) {
    return this.voices[side];
  }

  // Silencia una voz suavemente (cuando no se detecta su mano).
  silence(side) {
    const v = this.voices[side];
    if (v) v.setAmplitude(0);
  }

  // Aplica un toggle de timbre a ambas voces.
  setCarrierType(type) {
    this.voices.left?.setCarrierType(type);
    this.voices.right?.setCarrierType(type);
  }
  setWarmthEnabled(enabled) {
    this.voices.left?.setWarmthEnabled(enabled);
    this.voices.right?.setWarmthEnabled(enabled);
  }
  setFilterEnabled(enabled) {
    this.voices.left?.setFilterEnabled(enabled);
    this.voices.right?.setFilterEnabled(enabled);
  }

  setReverbAmount(value) {
    const wet = Math.min(1, Math.max(0, value));
    this.wetGain.gain.setTargetAtTime(wet, this.ctx.currentTime, 0.05);
    this.dryGain.gain.setTargetAtTime(1 - wet * 0.4, this.ctx.currentTime, 0.05);
  }

  _buildImpulseResponse(seconds, decay) {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const ir = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = ir.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const fadeIn = Math.min(1, i / (this.ctx.sampleRate * 0.005));
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * fadeIn;
      }
    }
    return ir;
  }
}
