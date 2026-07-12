// =============================================================================
// thereminVoice.js — voz RCA/Rockmore y voz Sci‑Fi band-limited
// =============================================================================
// La voz RCA usa seis PeriodicWave en paralelo, medidas conceptualmente por
// registro. Las ondas graves son ricas y de balance tipo pulso redondeado; las
// agudas pierden armónicos hasta aproximarse a una senoide. El crossfade entre
// anclas es equal-power y conserva la continuidad de fase/frecuencia.
// =============================================================================

import { DEFAULT_SOUND_PRESET, SOUND_PRESETS } from "./config.js";

const RCA_ANCHORS = [
  { frequency: 65.41,  duty: 0.28, richness: 1.00, rolloff: 14 }, // C2
  { frequency: 130.81, duty: 0.30, richness: 0.88, rolloff: 12 }, // C3
  { frequency: 261.63, duty: 0.34, richness: 0.66, rolloff: 9 },  // C4
  { frequency: 523.25, duty: 0.39, richness: 0.42, rolloff: 7 },  // C5
  { frequency: 1046.5, duty: 0.45, richness: 0.18, rolloff: 5 },  // C6
  { frequency: 2093.0, duty: 0.49, richness: 0.05, rolloff: 3 },  // C7
];

const clamp01 = (value) => Math.min(1, Math.max(0, value));

function gaussianLogFrequency(frequency, center, widthOctaves) {
  const distance = Math.log2(frequency / center) / widthOctaves;
  return Math.exp(-0.5 * distance * distance);
}

function buildRcaWave(ctx, anchor) {
  const harmonics = 32;
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  const fundamental = Math.abs(Math.sin(Math.PI * anchor.duty) / Math.PI) || 1;

  for (let n = 1; n <= harmonics; n++) {
    const pulse = Math.sin(Math.PI * n * anchor.duty) / (Math.PI * n);
    const normalizedPulse = pulse / fundamental;
    const spectralRolloff = Math.exp(-Math.pow((n - 1) / anchor.rolloff, 1.35));
    const partialHz = n * anchor.frequency;
    // Resonancias anchas y moderadas: aportan el centro vocal sin convertir la
    // voz en un formant synth explícito.
    const formants = 1
      + 0.20 * gaussianLogFrequency(partialHz, 720, 0.62)
      + 0.12 * gaussianLogFrequency(partialHz, 1450, 0.68);
    const harmonicMix = n === 1 ? 1 : anchor.richness;
    imag[n] = normalizedPulse * spectralRolloff * formants * harmonicMix;
  }
  imag[1] = 1;
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

function buildSciFiWave(ctx) {
  const harmonics = 40;
  const duty = 0.31;
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  const fundamental = Math.abs(Math.sin(Math.PI * duty) / Math.PI) || 1;
  for (let n = 1; n <= harmonics; n++) {
    const pulse = Math.sin(Math.PI * n * duty) / (Math.PI * n * fundamental);
    const roundedEdge = Math.exp(-Math.pow((n - 1) / 16, 1.3));
    imag[n] = pulse * roundedEdge;
  }
  imag[1] = 1;
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

function buildExperimentalWave(ctx) {
  const real = new Float32Array(25);
  const imag = new Float32Array(25);
  // Serie deliberadamente discontinua: fundamental sólida, segundo armónico
  // contenido y "islas" en 4º/7º/11º que producen un brillo hueco, no metálico.
  const partials = [0, 1, 0.10, -0.04, 0.24, 0.03, -0.08, 0.16, 0.02, -0.05, 0.08, 0.11];
  for (let n = 1; n < imag.length; n++) {
    const specified = partials[n] ?? (0.055 / Math.pow(n / 12, 1.35));
    imag[n] = specified * Math.exp(-Math.pow(n / 22, 1.7));
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

export class ThereminVoice {
  constructor(audioCtx, destination, options = {}) {
    this.ctx = audioCtx;
    this.destination = destination;
    this.maxGain = options.maxGain ?? 0.82;
    this.targetFreq = options.baseFreq ?? 220;
    this.targetAmp = 0;
    this.presetKey = DEFAULT_SOUND_PRESET;
    this.started = false;
    this.vibratoActive = false;
    this.filterEnabled = true;
    this.controlResponse = {
      pitchGlideSeconds: null,
      volumeResponseSeconds: null,
    };

    this.mixGain = audioCtx.createGain();
    this.mixGain.gain.value = 0.58;

    this.shaper = audioCtx.createWaveShaper();
    this.shaper.oversample = "4x";
    this.shaper.curve = this._asymmetricCurve(1.55, 1.22, 0.91);

    this.dcBlock = audioCtx.createBiquadFilter();
    this.dcBlock.type = "highpass";
    this.dcBlock.frequency.value = 18;
    this.dcBlock.Q.value = 0.707;

    this.formantLow = audioCtx.createBiquadFilter();
    this.formantLow.type = "peaking";
    this.formantLow.frequency.value = 720;
    this.formantLow.Q.value = 0.72;
    this.formantLow.gain.value = 1.8;

    this.formantHigh = audioCtx.createBiquadFilter();
    this.formantHigh.type = "peaking";
    this.formantHigh.frequency.value = 1450;
    this.formantHigh.Q.value = 0.85;
    this.formantHigh.gain.value = 1.1;

    this.lowpass = audioCtx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 4600;
    this.lowpass.Q.value = 0.64;

    this.voiceGain = audioCtx.createGain();
    this.voiceGain.gain.value = 0;

    this.mixGain
      .connect(this.shaper)
      .connect(this.dcBlock)
      .connect(this.formantLow)
      .connect(this.formantHigh)
      .connect(this.lowpass)
      .connect(this.voiceGain)
      .connect(destination);

    this.rcaSources = [];
    this.sciFiSource = null;
    this.sciFiDrive = audioCtx.createWaveShaper();
    this.sciFiDrive.curve = this._asymmetricCurve(2.25, 1.65, 0.94);
    this.sciFiDrive.oversample = "4x";
    this.sciFiGain = null;
    this.experimentalSources = [];
    this.experimentalProfileGain = null;
    this.orbitLfo = null;
    this.orbitDepth = null;
    this.lfo = null;
    this.vibratoDepth = null;
  }

  _asymmetricCurve(positiveDrive, negativeDrive, negativeLevel) {
    const curve = new Float32Array(4096);
    const positiveNorm = Math.tanh(positiveDrive);
    const negativeNorm = Math.tanh(negativeDrive);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = x >= 0
        ? Math.tanh(positiveDrive * x) / positiveNorm
        : negativeLevel * Math.tanh(negativeDrive * x) / negativeNorm;
    }
    return curve;
  }

  start() {
    if (this.started) return;
    const now = this.ctx.currentTime;

    this.lfo = this.ctx.createOscillator();
    this.lfo.type = "sine";
    this.vibratoDepth = this.ctx.createGain();
    this.vibratoDepth.gain.value = 0;
    this.lfo.connect(this.vibratoDepth);

    for (const anchor of RCA_ANCHORS) {
      const oscillator = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      oscillator.setPeriodicWave(buildRcaWave(this.ctx, anchor));
      oscillator.frequency.setValueAtTime(this.targetFreq, now);
      gain.gain.value = 0;
      oscillator.connect(gain).connect(this.mixGain);
      this.vibratoDepth.connect(oscillator.detune);
      oscillator.start(now);
      this.rcaSources.push({ oscillator, gain, anchor });
    }

    const sciFiOscillator = this.ctx.createOscillator();
    sciFiOscillator.setPeriodicWave(buildSciFiWave(this.ctx));
    sciFiOscillator.frequency.setValueAtTime(this.targetFreq, now);
    this.sciFiGain = this.ctx.createGain();
    this.sciFiGain.gain.value = 0;
    sciFiOscillator.connect(this.sciFiDrive).connect(this.sciFiGain).connect(this.mixGain);
    this.vibratoDepth.connect(sciFiOscillator.detune);
    sciFiOscillator.start(now);
    this.sciFiSource = sciFiOscillator;

    const experimentalBus = this.ctx.createGain();
    experimentalBus.gain.value = 0.82;
    this.experimentalProfileGain = this.ctx.createGain();
    this.experimentalProfileGain.gain.value = 0;
    experimentalBus.connect(this.experimentalProfileGain).connect(this.mixGain);

    const experimentalMain = this.ctx.createOscillator();
    experimentalMain.setPeriodicWave(buildExperimentalWave(this.ctx));
    const experimentalMainGain = this.ctx.createGain();
    experimentalMainGain.gain.value = 0.86;
    experimentalMain.connect(experimentalMainGain).connect(experimentalBus);

    const experimentalFifth = this.ctx.createOscillator();
    experimentalFifth.type = "sine";
    const experimentalFifthGain = this.ctx.createGain();
    experimentalFifthGain.gain.value = 0.13;
    experimentalFifth.connect(experimentalFifthGain).connect(experimentalBus);

    const experimentalOctave = this.ctx.createOscillator();
    experimentalOctave.type = "sine";
    const experimentalOctaveGain = this.ctx.createGain();
    experimentalOctaveGain.gain.value = 0.075;
    experimentalOctave.connect(experimentalOctaveGain).connect(experimentalBus);

    this.orbitLfo = this.ctx.createOscillator();
    this.orbitLfo.type = "sine";
    this.orbitLfo.frequency.value = 0.19;
    this.orbitDepth = this.ctx.createGain();
    this.orbitDepth.gain.value = 0.038;
    this.orbitLfo.connect(this.orbitDepth).connect(experimentalFifthGain.gain);

    for (const source of [experimentalMain, experimentalFifth, experimentalOctave]) {
      this.vibratoDepth.connect(source.detune);
      source.start(now);
    }
    this.orbitLfo.start(now);
    this.experimentalSources = [
      { oscillator: experimentalMain, ratio: 1 },
      { oscillator: experimentalFifth, ratio: 1.5 },
      { oscillator: experimentalOctave, ratio: 2.006 },
    ];

    this.lfo.start(now);
    this.started = true;
    this.setPreset(this.presetKey, true);
    this.setFrequency(this.targetFreq, true);
  }

  stop() {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    this.voiceGain.gain.cancelScheduledValues(now);
    this.voiceGain.gain.setTargetAtTime(0, now, 0.025);
    const stopAt = now + 0.3;
    for (const { oscillator } of this.rcaSources) {
      try { oscillator.stop(stopAt); } catch (_) { /* ya detenido */ }
    }
    for (const { oscillator } of this.experimentalSources) {
      try { oscillator.stop(stopAt); } catch (_) { /* ya detenido */ }
    }
    for (const source of [this.sciFiSource, this.lfo, this.orbitLfo]) {
      try { source?.stop(stopAt); } catch (_) { /* ya detenido */ }
    }
    this.started = false;
  }

  setPreset(presetKey, immediate = false) {
    const preset = SOUND_PRESETS[presetKey] ?? SOUND_PRESETS[DEFAULT_SOUND_PRESET];
    this.presetKey = SOUND_PRESETS[presetKey] ? presetKey : DEFAULT_SOUND_PRESET;
    if (!this.started) return;

    const now = this.ctx.currentTime;
    const timeConstant = immediate ? 0.001 : 0.035;
    this.lfo.frequency.setTargetAtTime(preset.vibratoRateHz ?? 5.5, now, timeConstant);
    this.sciFiGain.gain.setTargetAtTime(
      preset.voiceProfile === "scifi" ? 1 : 0, now, timeConstant
    );
    this.experimentalProfileGain.gain.setTargetAtTime(
      preset.voiceProfile === "experimental" ? 1 : 0, now, timeConstant
    );

    this.formantLow.gain.setTargetAtTime(preset.voiceProfile === "rca" ? 1.8 : 0.6, now, 0.04);
    this.formantHigh.gain.setTargetAtTime(preset.voiceProfile === "rca" ? 1.1 : 2.1, now, 0.04);
    this._updateRcaWeights(this.targetFreq, immediate);
    this._updateFilter(this.targetFreq, immediate);
    this._updateVibrato(true);
  }

  setFrequency(hz, immediate = false) {
    if (!Number.isFinite(hz) || hz <= 0) return;
    this.targetFreq = hz;
    if (!this.started) return;
    const preset = SOUND_PRESETS[this.presetKey];
    const now = this.ctx.currentTime;
    const glide = immediate
      ? 0.001
      : (this.controlResponse.pitchGlideSeconds ?? preset.glideTimeConstant);
    for (const { oscillator } of this.rcaSources) {
      oscillator.frequency.setTargetAtTime(hz, now, glide);
    }
    this.sciFiSource.frequency.setTargetAtTime(hz, now, glide);
    for (const { oscillator, ratio } of this.experimentalSources) {
      oscillator.frequency.setTargetAtTime(hz * ratio, now, glide);
    }
    this._updateRcaWeights(hz, immediate);
    this._updateFilter(hz, immediate);
  }

  _updateRcaWeights(hz, immediate = false) {
    if (!this.started) return;
    const preset = SOUND_PRESETS[this.presetKey];
    const active = preset.voiceProfile === "rca";
    const now = this.ctx.currentTime;
    const smooth = immediate ? 0.001 : 0.018;
    const logHz = Math.log2(hz);
    let lower = 0;
    while (
      lower < RCA_ANCHORS.length - 2
      && logHz > Math.log2(RCA_ANCHORS[lower + 1].frequency)
    ) lower++;
    const lowLog = Math.log2(RCA_ANCHORS[lower].frequency);
    const highLog = Math.log2(RCA_ANCHORS[lower + 1].frequency);
    const mix = clamp01((logHz - lowLog) / (highLog - lowLog));

    for (let i = 0; i < this.rcaSources.length; i++) {
      let target = 0;
      if (active && i === lower) target = Math.cos(mix * Math.PI * 0.5);
      if (active && i === lower + 1) target = Math.sin(mix * Math.PI * 0.5);
      this.rcaSources[i].gain.gain.setTargetAtTime(target, now, smooth);
    }
  }

  _updateFilter(hz, immediate = false) {
    const preset = SOUND_PRESETS[this.presetKey];
    const now = this.ctx.currentTime;
    const smooth = immediate ? 0.001 : 0.025;
    let cutoff;
    if (!this.filterEnabled) cutoff = 20000;
    else if (preset.voiceProfile === "scifi") cutoff = 9200;
    else if (preset.voiceProfile === "experimental") cutoff = 7200;
    else {
      const octavesAboveC2 = Math.max(0, Math.log2(hz / 65.41));
      cutoff = Math.max(2700, 5600 - octavesAboveC2 * 650);
    }
    this.lowpass.frequency.setTargetAtTime(cutoff, now, smooth);
  }

  setAmplitude(value) {
    this.targetAmp = clamp01(Number(value) || 0);
    if (!this.started) return;
    const preset = SOUND_PRESETS[this.presetKey];
    let gain;
    if (this.targetAmp < 0.003) gain = 0;
    else if (preset.voiceProfile === "rca") {
      const decibels = -48 * (1 - Math.sqrt(this.targetAmp));
      gain = Math.pow(10, decibels / 20);
    } else gain = Math.pow(this.targetAmp, 1.12);

    const now = this.ctx.currentTime;
    const response = this.controlResponse.volumeResponseSeconds ?? preset.gainTimeConstant;
    this.voiceGain.gain.setTargetAtTime(gain * this.maxGain, now, response);
    this._updateVibrato(false);
  }

  _updateVibrato(forceRestart) {
    if (!this.started) return;
    const preset = SOUND_PRESETS[this.presetKey];
    const audible = this.targetAmp > 0.008;
    const shouldRun = preset.automaticVibrato && audible;
    if (!forceRestart && shouldRun === this.vibratoActive) return;

    const now = this.ctx.currentTime;
    this.vibratoActive = shouldRun;
    this.vibratoDepth.gain.cancelScheduledValues(now);
    this.vibratoDepth.gain.setTargetAtTime(0, now, 0.025);
    if (shouldRun) {
      const onset = now + (preset.vibratoOnsetDelay ?? 0.45);
      this.vibratoDepth.gain.setTargetAtTime(
        preset.vibratoDepthCents ?? 34,
        onset,
        preset.vibratoOnsetTimeConstant ?? 0.24
      );
    }
  }

  setFilterEnabled(enabled) {
    this.filterEnabled = Boolean(enabled);
    if (this.started) this._updateFilter(this.targetFreq, false);
  }

  setControlResponse({ pitchGlideMs, volumeResponseMs }) {
    if (Number.isFinite(pitchGlideMs)) {
      this.controlResponse.pitchGlideSeconds = Math.min(0.15, Math.max(0.003, pitchGlideMs / 1000));
    }
    if (Number.isFinite(volumeResponseMs)) {
      this.controlResponse.volumeResponseSeconds = Math.min(
        0.2, Math.max(0.005, volumeResponseMs / 1000)
      );
    }
  }

  resetControlResponse() {
    this.controlResponse.pitchGlideSeconds = null;
    this.controlResponse.volumeResponseSeconds = null;
  }

  // Compatibilidad con controles antiguos; los presets gobiernan la fuente.
  setCarrierType() {}
  setWarmthEnabled() {}
}
