// =============================================================================
// audioEngine.js — mezcla, Cabinet 1929 y efectos espaciales
// =============================================================================
// El cabinet es una ruta paralela con crossfade; no forma parte del oscilador.
// De este modo RCA directo y RCA+Cabinet comparten exactamente la misma voz.
// =============================================================================

import { ThereminVoice } from "./thereminVoice.js";
import { DEFAULT_SOUND_PRESET, SOUND_PRESETS } from "./config.js";

export class AudioEngine {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({
      latencyHint: "interactive",
    });
    this.currentPreset = DEFAULT_SOUND_PRESET;

    this.sumBus = this.ctx.createGain();
    this.effectsBus = this.ctx.createGain();

    // Ruta directa.
    this.directToneGain = this.ctx.createGain();
    this.directToneGain.gain.value = 1;
    this.sumBus.connect(this.directToneGain).connect(this.effectsBus);

    // Cabinet 1929 modelado: límites de banda, cuerpo, presencia, no linealidad
    // y compresión mecánica moderada. Es una aproximación hasta disponer de una
    // respuesta al impulso medida de un RCA 106 real.
    this.cabinetHighpass = this.ctx.createBiquadFilter();
    this.cabinetHighpass.type = "highpass";
    this.cabinetHighpass.frequency.value = 68;
    this.cabinetHighpass.Q.value = 0.72;

    this.cabinetBody = this.ctx.createBiquadFilter();
    this.cabinetBody.type = "peaking";
    this.cabinetBody.frequency.value = 215;
    this.cabinetBody.Q.value = 0.82;
    this.cabinetBody.gain.value = 3.1;

    this.cabinetVoice = this.ctx.createBiquadFilter();
    this.cabinetVoice.type = "peaking";
    this.cabinetVoice.frequency.value = 860;
    this.cabinetVoice.Q.value = 0.68;
    this.cabinetVoice.gain.value = 2.0;

    this.cabinetLowpass = this.ctx.createBiquadFilter();
    this.cabinetLowpass.type = "lowpass";
    this.cabinetLowpass.frequency.value = 5000;
    this.cabinetLowpass.Q.value = 0.66;

    this.cabinetDrive = this.ctx.createWaveShaper();
    this.cabinetDrive.curve = this._cabinetCurve();
    // Evita que el cabinet añada otra etapa 4× al presupuesto de audio.
    this.cabinetDrive.oversample = "2x";

    this.cabinetCompression = this.ctx.createDynamicsCompressor();
    this.cabinetCompression.threshold.value = -15;
    this.cabinetCompression.knee.value = 12;
    this.cabinetCompression.ratio.value = 2.2;
    this.cabinetCompression.attack.value = 0.018;
    this.cabinetCompression.release.value = 0.095;

    this.cabinetModelGain = this.ctx.createGain();
    this.cabinetModelGain.gain.value = 1;
    this.cabinetIR = this.ctx.createConvolver();
    this.cabinetIRGain = this.ctx.createGain();
    this.cabinetIRGain.gain.value = 0;

    this.cabinetGain = this.ctx.createGain();
    this.cabinetGain.gain.value = 0;
    this.sumBus
      .connect(this.cabinetHighpass)
      .connect(this.cabinetBody)
      .connect(this.cabinetVoice)
      .connect(this.cabinetLowpass)
      .connect(this.cabinetDrive)
      .connect(this.cabinetCompression);
    this.cabinetCompression.connect(this.cabinetModelGain).connect(this.cabinetGain);
    this.cabinetCompression.connect(this.cabinetIR).connect(this.cabinetIRGain).connect(this.cabinetGain);
    this.cabinetGain.connect(this.effectsBus);

    // Señal seca.
    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.value = 0.98;

    // Hall/plate amortiguada con pre-delay.
    this.preDelay = this.ctx.createDelay(0.1);
    this.preDelay.delayTime.value = 0.018;
    this.convolver = this.ctx.createConvolver();
    // Sala de concierto compacta. El theremin no incorporaba reverb: esta cola
    // representa únicamente la acústica alrededor del altavoz.
    this.convolver.buffer = this._buildSpatialImpulse(1.6, 2.35);
    this.reverbDamping = this.ctx.createBiquadFilter();
    this.reverbDamping.type = "lowpass";
    this.reverbDamping.frequency.value = 6100;
    this.reverbDamping.Q.value = 0.4;
    this.wetGain = this.ctx.createGain();
    this.wetGain.gain.value = 0;

    // Eco para el preset Sci-Fi.
    this.echoDelay = this.ctx.createDelay(0.5);
    this.echoDelay.delayTime.value = 0.158;
    this.echoDamping = this.ctx.createBiquadFilter();
    this.echoDamping.type = "lowpass";
    this.echoDamping.frequency.value = 4800;
    this.echoFeedback = this.ctx.createGain();
    this.echoFeedback.gain.value = 0.17;
    this.echoWet = this.ctx.createGain();
    this.echoWet.gain.value = 0;

    // Limitador de último recurso: el headroom normal evita que trabaje durante
    // una interpretación ordinaria.
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1;
    this.limiter.knee.value = 1.5;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.72;

    this.effectsBus.connect(this.dryGain).connect(this.limiter);
    this.effectsBus
      .connect(this.preDelay)
      .connect(this.convolver)
      .connect(this.reverbDamping)
      .connect(this.wetGain)
      .connect(this.limiter);
    this.effectsBus.connect(this.echoDelay).connect(this.echoDamping);
    this.echoDamping.connect(this.echoWet).connect(this.limiter);
    this.echoDamping.connect(this.echoFeedback).connect(this.echoDelay);

    this.limiter.connect(this.master).connect(this.ctx.destination);

    // Grabación exclusivamente del audio sintetizado.
    this.recordDestination = this.ctx.createMediaStreamDestination();
    this.master.connect(this.recordDestination);

    this.voices = { left: null, right: null };
    this.setSoundPreset(DEFAULT_SOUND_PRESET, true);
  }

  async resume() {
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  async setupVoices() {
    if (this.voices.left || this.voices.right) return;
    let useWorklet = false;
    if (this.ctx.audioWorklet && typeof AudioWorkletNode !== "undefined") {
      try {
        await this.ctx.audioWorklet.addModule(new URL("./theremin-worklet.js", import.meta.url));
        useWorklet = true;
      } catch (error) {
        console.warn("AudioWorklet no disponible; usando osciladores nativos.", error);
      }
    }
    this.voices.left = new ThereminVoice(this.ctx, this.sumBus, {
      baseFreq: 65.41,
      maxGain: 0.72,
      useWorklet,
    });
    this.voices.right = new ThereminVoice(this.ctx, this.sumBus, {
      baseFreq: 261.63,
      maxGain: 0.72,
      useWorklet,
    });
    this.voices.left.start();
    this.voices.right.start();
    this.voices.left.setPreset(this.currentPreset, true);
    this.voices.right.setPreset(this.currentPreset, true);
  }

  getVoice(side) {
    return this.voices[side];
  }

  silence(side) {
    this.voices[side]?.setAmplitude(0);
  }

  async close() {
    this.voices.left?.stop();
    this.voices.right?.stop();
    this.voices = { left: null, right: null };
    if (this.ctx.state !== "closed") await this.ctx.close();
  }

  setSoundPreset(presetKey, immediate = false) {
    const key = SOUND_PRESETS[presetKey] ? presetKey : DEFAULT_SOUND_PRESET;
    const preset = SOUND_PRESETS[key];
    this.currentPreset = key;
    this.voices.left?.setPreset(key, immediate);
    this.voices.right?.setPreset(key, immediate);

    const now = this.ctx.currentTime;
    const smooth = immediate ? 0.001 : 0.055;
    this.setCabinetEnabled(preset.cabinet, immediate);
    const preDelay = preset.preDelay ?? (key === "scifi" ? 0.026 : 0.009);
    const echoTime = preset.echoTime ?? (key === "scifi" ? 0.158 : 0.13);
    const echoFeedback = preset.echoFeedback ?? 0.17;
    this.preDelay.delayTime.setTargetAtTime(preDelay, now, 0.04);
    this.echoDelay.delayTime.setTargetAtTime(echoTime, now, 0.04);
    this.echoFeedback.gain.setTargetAtTime(echoFeedback, now, 0.05);
    this.reverbDamping.frequency.setTargetAtTime(
      preset.voiceProfile === "rockmore"
        ? 4800
        : (preset.voiceProfile === "experimental" ? 5200 : 6100),
      now,
      0.05
    );
    this.setReverbAmount(preset.reverb);
    this.setDelayAmount(preset.delay);
    return preset;
  }

  setReverbAmount(value) {
    const wet = Math.min(1, Math.max(0, Number(value) || 0));
    const now = this.ctx.currentTime;
    this.wetGain.gain.setTargetAtTime(wet, now, 0.05);
    this.dryGain.gain.setTargetAtTime(1 - wet * 0.22, now, 0.05);
  }

  setCabinetEnabled(enabled, immediate = false) {
    const now = this.ctx.currentTime;
    const smooth = immediate ? 0.001 : 0.055;
    this.directToneGain.gain.setTargetAtTime(enabled ? 0 : 1, now, smooth);
    this.cabinetGain.gain.setTargetAtTime(enabled ? 0.92 : 0, now, smooth);
  }

  async loadCabinetImpulse(arrayBuffer) {
    const buffer = await this.ctx.decodeAudioData(arrayBuffer.slice(0));
    this.cabinetIR.buffer = buffer;
    const now = this.ctx.currentTime;
    this.cabinetModelGain.gain.setTargetAtTime(0, now, 0.08);
    this.cabinetIRGain.gain.setTargetAtTime(1, now, 0.08);
    return { duration: buffer.duration, channels: buffer.numberOfChannels };
  }

  setDelayAmount(value) {
    const amount = Math.min(0.4, Math.max(0, Number(value) || 0));
    this.echoWet.gain.setTargetAtTime(amount, this.ctx.currentTime, 0.05);
  }

  setCreativeMorph(character, space) {
    const x = Math.min(1, Math.max(0, Number(character) || 0));
    const y = Math.min(1, Math.max(0, Number(space) || 0));
    this.voices.left?.setCreativeMorph(x);
    this.voices.right?.setCreativeMorph(x);
    const preset = SOUND_PRESETS[this.currentPreset];
    this.setReverbAmount(Math.min(0.72, preset.reverb + y * 0.42));
    this.setDelayAmount(Math.min(0.34, preset.delay + y * 0.18));
  }

  setFilterEnabled(enabled) {
    this.voices.left?.setFilterEnabled(enabled);
    this.voices.right?.setFilterEnabled(enabled);
  }

  setControlResponse(options, side = null) {
    if (side) this.voices[side]?.setControlResponse(options);
    else {
      this.voices.left?.setControlResponse(options);
      this.voices.right?.setControlResponse(options);
    }
  }

  resetControlResponse(side = null) {
    if (side) this.voices[side]?.resetControlResponse();
    else {
      this.voices.left?.resetControlResponse();
      this.voices.right?.resetControlResponse();
    }
  }

  // Compatibilidad con la API anterior: los perfiles gobiernan la fuente.
  setCarrierType(type) {
    this.voices.left?.setCarrierType(type);
    this.voices.right?.setCarrierType(type);
  }
  setWarmthEnabled(enabled) {
    this.voices.left?.setWarmthEnabled(enabled);
    this.voices.right?.setWarmthEnabled(enabled);
  }

  _cabinetCurve() {
    const curve = new Float32Array(4096);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      const drive = x >= 0 ? 1.42 : 1.24;
      const level = x >= 0 ? 1 : 0.95;
      curve[i] = level * Math.tanh(drive * x) / Math.tanh(drive);
    }
    return curve;
  }

  _buildSpatialImpulse(seconds, decay) {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
    // PRNG local determinista: la sala conserva exactamente el mismo carácter
    // entre arranques y dispositivos, a diferencia de Math.random().
    let noiseState = (0x6d2b79f5 ^ length) >>> 0;
    const nextNoise = () => {
      noiseState ^= noiseState << 13;
      noiseState ^= noiseState >>> 17;
      noiseState ^= noiseState << 5;
      return ((noiseState >>> 0) / 0x80000000) - 1;
    };
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      let dampedNoise = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const noise = nextNoise();
        const damping = 0.38 - t * 0.28;
        dampedNoise += (noise - dampedNoise) * damping;
        const envelope = Math.pow(1 - t, decay);
        const fadeIn = Math.min(1, i / (this.ctx.sampleRate * 0.004));
        data[i] = dampedNoise * envelope * fadeIn * 0.72;
      }
      // Primeras reflexiones deterministas para evitar una cola puramente difusa.
      const reflections = [0.011, 0.019, 0.031, 0.047];
      reflections.forEach((time, index) => {
        const sample = Math.floor((time + channel * 0.0017) * this.ctx.sampleRate);
        if (sample < length) data[sample] += (0.38 - index * 0.065) * (index % 2 ? -1 : 1);
      });
    }
    return impulse;
  }
}
