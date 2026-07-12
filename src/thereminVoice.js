// =============================================================================
// thereminVoice.js — voz híbrida: cuerpo, armónico, vibrato y saturación suave
// =============================================================================
import { VOICE } from "./config.js";

export class ThereminVoice {
  constructor(audioCtx, destination, options = {}) {
    this.ctx = audioCtx;
    this.maxGain = options.maxGain ?? 0.85;
    this.triLevel = options.triLevel ?? 0.18;
    this.harmLevel = options.harmLevel ?? 0.07;
    this.vibratoCents = options.vibratoCents ?? VOICE.vibrato.depthCents;
    this.cutoffRange = options.cutoffRange ?? [600, 7500];
    this.cutoffTracking = options.cutoffTracking ?? 7;
    this.targetFreq = options.baseFreq ?? 220;
    this.started = false;
    this.targetAmp = 0;
    this.vibratoActive = false;
    this.carrierType = VOICE.carrier.type;

    this.mixGain = audioCtx.createGain();
    this.mixGain.gain.value = 0.5;
    this.shaper = audioCtx.createWaveShaper();
    this.shaper.curve = this._saturationCurve(2.2);
    this.shaper.oversample = "4x";
    this.filter = audioCtx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.Q.value = VOICE.filter.Q;
    this.voiceGain = audioCtx.createGain();
    this.voiceGain.gain.value = 0;

    this.mixGain.connect(this.shaper).connect(this.filter).connect(this.voiceGain).connect(destination);
    this.osc = this.warmth = this.harmonic = this.lfo = null;
    this.warmthGain = this.harmonicGain = this.vibratoDepth = null;
  }

  _saturationCurve(drive) {
    const curve = new Float32Array(2048);
    const norm = Math.tanh(drive);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(drive * x) / norm;
    }
    return curve;
  }

  start() {
    if (this.started) return;
    const now = this.ctx.currentTime;
    this.osc = this.ctx.createOscillator();
    this.osc.type = this.carrierType;
    this.warmth = this.ctx.createOscillator();
    this.warmth.type = VOICE.warmth.type;
    this.harmonic = this.ctx.createOscillator();
    this.harmonic.type = "sine";

    const carrierGain = this.ctx.createGain();
    carrierGain.gain.value = VOICE.carrier.gain;
    this.warmthGain = this.ctx.createGain();
    this.warmthGain.gain.value = this.triLevel;
    this.harmonicGain = this.ctx.createGain();
    this.harmonicGain.gain.value = this.harmLevel;
    this.osc.connect(carrierGain).connect(this.mixGain);
    this.warmth.connect(this.warmthGain).connect(this.mixGain);
    this.harmonic.connect(this.harmonicGain).connect(this.mixGain);

    this.lfo = this.ctx.createOscillator();
    this.lfo.frequency.value = VOICE.vibrato.rateHz;
    this.vibratoDepth = this.ctx.createGain();
    this.vibratoDepth.gain.value = 0;
    this.lfo.connect(this.vibratoDepth);
    this.vibratoDepth.connect(this.osc.detune);
    this.vibratoDepth.connect(this.warmth.detune);
    this.vibratoDepth.connect(this.harmonic.detune);

    this.osc.frequency.setValueAtTime(this.targetFreq, now);
    this.warmth.frequency.setValueAtTime(this.targetFreq, now);
    this.harmonic.frequency.setValueAtTime(this.targetFreq * 2, now);
    this.filter.frequency.setValueAtTime(this._cutoffFor(this.targetFreq), now);
    this.osc.start(now);
    this.warmth.start(now);
    this.harmonic.start(now);
    this.lfo.start(now);
    this.started = true;
  }

  stop() {
    if (!this.started) return;
    const stopAt = this.ctx.currentTime + 1.7;
    this.voiceGain.gain.setTargetAtTime(0, this.ctx.currentTime, VOICE.gainTimeConstant);
    for (const node of [this.osc, this.warmth, this.harmonic, this.lfo]) {
      try { node.stop(stopAt); } catch (_) { /* ya detenido */ }
    }
    this.started = false;
  }

  setFrequency(hz) {
    if (!Number.isFinite(hz) || hz <= 0) return;
    this.targetFreq = hz;
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const glide = VOICE.glideTimeConstant;
    this.osc.frequency.setTargetAtTime(hz, t, glide);
    this.warmth.frequency.setTargetAtTime(hz, t, glide);
    this.harmonic.frequency.setTargetAtTime(hz * 2, t, glide);
    this.filter.frequency.setTargetAtTime(this._cutoffFor(hz), t, glide);
  }

  setAmplitude(value) {
    this.targetAmp = Math.min(1, Math.max(0, Number(value) || 0));
    if (!this.started) return;
    const t = this.ctx.currentTime;
    this.voiceGain.gain.setTargetAtTime(this.targetAmp * this.maxGain, t, VOICE.gainTimeConstant);
    const audible = this.targetAmp > VOICE.silenceThreshold;
    if (audible && !this.vibratoActive) {
      this.vibratoActive = true;
      const onset = t + VOICE.vibrato.onsetDelay;
      this.vibratoDepth.gain.cancelScheduledValues(t);
      this.vibratoDepth.gain.setValueAtTime(0, t);
      this.vibratoDepth.gain.setTargetAtTime(this.vibratoCents, onset, VOICE.vibrato.onsetTimeConstant);
    } else if (!audible && this.vibratoActive) {
      this.vibratoActive = false;
      this.vibratoDepth.gain.cancelScheduledValues(t);
      this.vibratoDepth.gain.setTargetAtTime(0, t, VOICE.vibrato.onsetTimeConstant);
    }
  }

  setCarrierType(type) {
    if (type === "sine" || type === "triangle" || type === "sawtooth" || type === "square") {
      this.carrierType = type;
      if (this.osc) this.osc.type = type;
    }
  }

  setWarmthEnabled(enabled) {
    if (!this.warmthGain) return;
    this.warmthGain.gain.setTargetAtTime(enabled ? this.triLevel : 0, this.ctx.currentTime, 0.05);
  }

  setFilterEnabled(enabled) {
    this.filter.frequency.setTargetAtTime(enabled ? this._cutoffFor(this.targetFreq) : 20000, this.ctx.currentTime, 0.05);
  }

  _cutoffFor(freq) {
    return Math.min(this.cutoffRange[1], Math.max(this.cutoffRange[0], freq * this.cutoffTracking));
  }
}
