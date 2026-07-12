// =============================================================================
// main.js — Orquestación: une visión, mapeo, escala, audio, grabación y UI
// =============================================================================
// Flujo: clic EMPEZAR → resume audio + cámara → init MediaPipe → por frame:
//   landmarks → One Euro (en mapping) → frecuencia/volumen → afinación →
//   voice.setFrequency/setAmplitude → actualiza UI.
// =============================================================================

import { HandTracking } from "./handTracking.js";
import { HandMapper } from "./mapping.js";
import { ScaleTuner, freqToNoteName } from "./scale.js";
import { AudioEngine } from "./audioEngine.js";
import { AudioRecorder, blobToWav } from "./recorder.js";
import { UI } from "./ui.js";
import {
  DEFAULT_PERFORMANCE_PRESET,
  DEFAULT_SOUND_PRESET,
  PERFORMANCE_PRESETS,
  SOUND_PRESETS,
} from "./config.js";

const state = {
  mode: "duo",            // "duo" | "classic"
  scale: "free",
  tonicPc: 0,             // 0 = Do
  soundPreset: DEFAULT_SOUND_PRESET,
  performancePreset: DEFAULT_PERFORMANCE_PRESET,
  started: false,
};

const ui = new UI();

// Componentes de audio/visión (se crean al pulsar EMPEZAR).
let engine = null;
let tracking = null;
let recorder = null;

// Mapeadores: en Dúo, una por mano; en Clásico, una de tono + control de vol.
const mappers = {
  left: new HandMapper("left"),
  right: new HandMapper("right"),
  classic: new HandMapper("classic"),
};
const tuners = {
  left: new ScaleTuner(),
  right: new ScaleTuner(),
  classic: new ScaleTuner(),
};

ui.setPerformancePanel(
  state.performancePreset,
  PERFORMANCE_PRESETS[state.performancePreset]
);
applyPerformanceConfig(false);

let lastFrameT = performance.now() / 1000;
let recTimerId = null;

// --- Arranque ----------------------------------------------------------------
ui.el.startBtn.addEventListener("click", onStart);

async function onStart() {
  if (state.started) return;
  ui.el.startBtn.disabled = true;
  try {
    ui.setStartStatus("Iniciando audio…");
    engine = new AudioEngine();
    await engine.resume();
    engine.setupVoices();
    applyPerformanceConfig(false);

    ui.setStartStatus("Cargando modelo de manos…");
    tracking = new HandTracking(ui.video);
    await tracking.init();

    ui.setStartStatus("Pidiendo cámara…");
    await tracking.startCamera();

    // Aplica el perfil completo (voz, cabinet y efectos) antes de abrir el loop.
    const preset = engine.setSoundPreset(ui.el.soundPresetSelect.value, true);
    state.soundPreset = ui.el.soundPresetSelect.value;
    ui.el.reverbRange.value = String(Math.round(preset.reverb * 100));
    ui.setPresetDescription(preset.description);

    // Grabación (solo audio) desde la mezcla maestra.
    recorder = new AudioRecorder(engine.recordDestination.stream);
    if (!recorder.isSupported()) {
      ui.setRecError("Grabación no soportada en este navegador");
    }

    tracking.onResults = onHands;
    tracking.start();

    state.started = true;
    ui.showApp();
    wireControls();
    window.addEventListener("resize", () => ui.resizeCanvas());
  } catch (err) {
    console.error(err);
    ui.setStartStatus(
      err && err.name === "NotAllowedError"
        ? "Permiso de cámara denegado. Habilítalo y recarga."
        : `Error al iniciar: ${err?.message ?? err}`,
      true
    );
    ui.el.startBtn.disabled = false;
  }
}

// --- Bucle por frame (callback de detección) ---------------------------------
function onHands(hands) {
  const t = performance.now() / 1000;
  const dt = Math.max(1e-3, t - lastFrameT);
  lastFrameT = t;

  ui.resizeCanvas();
  ui.clearOverlay();

  if (state.mode === "duo") {
    processSide("left", hands.left, t, dt);
    processSide("right", hands.right, t, dt);
  } else {
    processClassic(hands, t, dt);
  }
}

// Modo Dúo: cada mano controla su propia voz (tono Y + volumen pinza).
function processSide(side, hand, t, dt) {
  const voice = engine.getVoice(side);
  if (!hand) {
    engine.silence(side);
    mappers[side].reset();
    ui.updateReadout(side, { active: false });
    return;
  }
  ui.drawHand(side, hand.landmarks, hand.palm);

  const m = mappers[side].process(hand, t);
  const tunedFreq = tuners[side].apply(
    m.frequency, m.velocity, state.scale, state.tonicPc, dt
  );
  voice.setFrequency(tunedFreq);
  voice.setAmplitude(m.volume);

  ui.updateReadout(side, {
    active: true, frequency: tunedFreq, volume: m.volume, yNorm: m.yNorm,
  });
}

// Modo Clásico: mano derecha = tono (rango amplio); mano izquierda = volumen
// por su posición vertical. Una sola voz audible (la izquierda se silencia).
function processClassic(hands, t, dt) {
  const right = hands.right;
  const left = hands.left;
  const voice = engine.getVoice("right");

  engine.silence("left"); // en clásico solo suena una voz

  // Volumen a partir de la altura de la mano izquierda (arriba = más fuerte).
  let volume = 0;
  if (left) {
    const lm = mappers.left.process(left, t);
    volume = lm.yNorm; // posición vertical → volumen
    ui.drawHand("left", left.landmarks, left.palm);
    ui.updateReadout("left", {
      active: true, frequency: 0, volume, yNorm: lm.yNorm, volOnly: true,
    });
    ui.readouts.left.note.textContent = "VOL";
    ui.readouts.left.freq.textContent = "control de volumen";
  } else {
    mappers.left.reset();
    ui.updateReadout("left", { active: false });
  }

  if (right) {
    ui.drawHand("right", right.landmarks, right.palm);
    const m = mappers.classic.process(right, t);
    const rcaPerformance = SOUND_PRESETS[state.soundPreset].voiceProfile === "rca";
    const tunedFreq = tuners.classic.apply(
      m.frequency, m.velocity, rcaPerformance ? "free" : state.scale, state.tonicPc, dt
    );
    voice.setFrequency(tunedFreq);
    // RCA/Rockmore exige la mano de volumen: no se inventa una envolvente con
    // la pinza derecha cuando la izquierda desaparece.
    const amplitude = left ? volume : (rcaPerformance ? 0 : m.volume);
    voice.setAmplitude(amplitude);
    ui.updateReadout("right", {
      active: true, frequency: tunedFreq,
      volume: amplitude, yNorm: m.yNorm,
    });
  } else {
    engine.silence("right");
    mappers.classic.reset();
    ui.updateReadout("right", { active: false });
  }
}

// --- Controles ---------------------------------------------------------------
function wireControls() {
  // Modo Dúo/Clásico.
  ui.el.modeToggle.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      ui.el.modeToggle.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.mode = btn.dataset.mode;
      applyPerformanceConfig(false);
      // Silencia todo al cambiar de modo para evitar voces colgadas.
      engine.silence("left");
      engine.silence("right");
      Object.values(mappers).forEach((m) => m.reset());
      Object.values(tuners).forEach((tn) => tn.reset());
    });
  });

  ui.el.scaleSelect.addEventListener("change", (e) => { state.scale = e.target.value; });
  ui.el.tonicSelect.addEventListener("change", (e) => { state.tonicPc = parseInt(e.target.value, 10); });
  ui.el.soundPresetSelect.addEventListener("change", (e) => {
    state.soundPreset = e.target.value;
    const preset = engine.setSoundPreset(state.soundPreset);
    ui.el.reverbRange.value = String(Math.round(preset.reverb * 100));
    ui.setPresetDescription(preset.description);
    if (preset.voiceProfile === "rca") {
      state.scale = "free";
      ui.el.scaleSelect.value = "free";
      Object.values(tuners).forEach((tuner) => tuner.reset());
    }
  });
  ui.el.reverbRange.addEventListener("input", (e) => {
    engine.setReverbAmount(Number(e.target.value) / 100);
  });

  ui.el.performancePresetSelect.addEventListener("change", (event) => {
    const key = event.target.value;
    state.performancePreset = key;
    const preset = PERFORMANCE_PRESETS[key];
    if (key !== "custom") ui.setPerformancePanel(key, preset);
    else ui.el.performanceDescription.textContent = preset.description;
    applyPerformanceConfig(true);
  });

  const applyCustomPerformance = () => {
    state.performancePreset = "custom";
    ui.el.performancePresetSelect.value = "custom";
    ui.el.performanceDescription.textContent = PERFORMANCE_PRESETS.custom.description;
    applyPerformanceConfig(true);
  };
  const applyFrequencyEdit = () => {
    syncOctaveControlFromFrequencies();
    applyCustomPerformance();
  };
  const applyOctaveSpan = (octaves) => {
    const minHz = Number(ui.el.pitchMinHz.value);
    if (!Number.isFinite(minHz) || minHz <= 0) return;
    const boundedOctaves = Math.min(7, Math.max(1, octaves));
    const maxHz = Math.min(5000, minHz * Math.pow(2, boundedOctaves));
    ui.el.pitchMaxHz.value = maxHz.toFixed(2);
    syncOctaveControlFromFrequencies();
    applyCustomPerformance();
  };
  ui.el.pitchMinHz.addEventListener("input", applyFrequencyEdit);
  ui.el.pitchMaxHz.addEventListener("input", applyFrequencyEdit);
  ui.el.octaveSpanRange.addEventListener("input", () => {
    applyOctaveSpan(Number(ui.el.octaveSpanRange.value));
  });
  ui.el.octaveDownBtn.addEventListener("click", () => {
    applyOctaveSpan(Number(ui.el.octaveSpanRange.value) - 0.5);
  });
  ui.el.octaveUpBtn.addEventListener("click", () => {
    applyOctaveSpan(Number(ui.el.octaveSpanRange.value) + 0.5);
  });
  ui.el.pitchAxisSelect.addEventListener("change", applyCustomPerformance);
  ui.el.pitchGlideRange.addEventListener("input", applyCustomPerformance);
  ui.el.volumeResponseRange.addEventListener("input", applyCustomPerformance);

  // Grabación.
  ui.el.recBtn.addEventListener("click", toggleRecording);
}

function applyPerformanceConfig(showStatus = true) {
  const minHz = Number(ui.el.pitchMinHz.value);
  const maxHz = Number(ui.el.pitchMaxHz.value);
  const axis = ui.el.pitchAxisSelect.value;
  const pitchGlideMs = Number(ui.el.pitchGlideRange.value);
  const volumeResponseMs = Number(ui.el.volumeResponseRange.value);

  syncOctaveControlFromFrequencies();
  ui.el.pitchGlideValue.textContent = `${pitchGlideMs} ms`;
  ui.el.volumeResponseValue.textContent = `${volumeResponseMs} ms`;

  if (
    !Number.isFinite(minHz) || !Number.isFinite(maxHz)
    || minHz < 16 || maxHz > 5000 || maxHz <= minHz * 1.05
  ) {
    ui.setPerformanceStatus(
      "Rango no válido: mínimo ≥ 16 Hz, máximo ≤ 5000 Hz y máximo mayor que mínimo.",
      true
    );
    return false;
  }

  mappers.classic.setPitchConfig({ minHz, maxHz, axis });
  if (engine) {
    if (state.mode === "classic") {
      engine.resetControlResponse();
      engine.setControlResponse({ pitchGlideMs, volumeResponseMs }, "right");
    } else engine.resetControlResponse();
  }

  if (showStatus) {
    const octaves = Math.log2(maxHz / minHz);
    const direction = axis === "x" ? "horizontal" : "vertical";
    ui.setPerformanceStatus(
      `${freqToNoteName(minHz)}–${freqToNoteName(maxHz)} · ${octaves.toFixed(2)} octavas · campo ${direction}`
    );
  } else ui.setPerformanceStatus("");
  return true;
}

function syncOctaveControlFromFrequencies() {
  const minHz = Number(ui.el.pitchMinHz.value);
  const maxHz = Number(ui.el.pitchMaxHz.value);
  if (!Number.isFinite(minHz) || !Number.isFinite(maxHz) || minHz <= 0 || maxHz <= minHz) {
    ui.el.octaveSpanValue.textContent = "— oct";
    return;
  }
  const octaves = Math.log2(maxHz / minHz);
  const sliderOctaves = Math.min(7, Math.max(1, Math.round(octaves * 2) / 2));
  ui.el.octaveSpanRange.value = String(sliderOctaves);
  ui.el.octaveSpanValue.textContent = `${octaves.toFixed(1).replace(".", ",")} oct`;
}

// --- Grabación ---------------------------------------------------------------
function toggleRecording() {
  if (!recorder || !recorder.isSupported()) return;
  if (recorder.recorder && recorder.recorder.state === "recording") {
    stopRecording();
  } else {
    startRecording();
  }
}

function startRecording() {
  ui.el.recResult.classList.add("hidden");
  recorder.start();
  ui.setRecording(true);
  recTimerId = setInterval(() => ui.setRecTimer(recorder.elapsedSeconds()), 200);
}

async function stopRecording() {
  clearInterval(recTimerId);
  const webmBlob = await recorder.stop();
  ui.setRecording(false);
  if (!webmBlob) return;

  const webmUrl = URL.createObjectURL(webmBlob);
  let wavUrl = null, wavBlob = null;
  try {
    wavBlob = await blobToWav(webmBlob, engine.ctx);
    wavUrl = URL.createObjectURL(wavBlob);
  } catch (err) {
    console.warn("No se pudo generar WAV:", err);
  }
  ui.showRecResult({ webmUrl, wavUrl, webmBlob, wavBlob });
}
