// =============================================================================
// main.js — Orquestación: une visión, mapeo, escala, audio, grabación y UI
// =============================================================================
// Flujo: clic EMPEZAR → resume audio + cámara → init MediaPipe → por frame:
//   landmarks → One Euro (en mapping) → frecuencia/volumen → afinación →
//   voice.setFrequency/setAmplitude → actualiza UI.
// =============================================================================

import { HandTracking } from "./handTracking.js";
import { HandMapper } from "./mapping.js";
import { ScaleTuner, freqToMidi, freqToNoteName } from "./scale.js";
import { AudioEngine } from "./audioEngine.js";
import { AudioRecorder, blobToWav } from "./recorder.js";
import { UI } from "./ui.js";
import { loadSettings, normalizeCalibrated, resetSettings, saveSettings } from "./settings.js";
import {
  DEFAULT_PERFORMANCE_PRESET,
  DEFAULT_SOUND_PRESET,
  PERFORMANCE_PRESETS,
  SOUND_PRESETS,
} from "./config.js";

let persistedSettings = loadSettings();
const state = {
  mode: persistedSettings.mode ?? "duo",
  scale: persistedSettings.scale ?? "free",
  tonicPc: persistedSettings.tonicPc ?? 0,
  soundPreset: SOUND_PRESETS[persistedSettings.soundPreset]
    ? persistedSettings.soundPreset : DEFAULT_SOUND_PRESET,
  performancePreset: PERFORMANCE_PRESETS[persistedSettings.performancePreset]
    ? persistedSettings.performancePreset : DEFAULT_PERFORMANCE_PRESET,
  started: false,
  drone: false,
  frozenFrequency: null,
  latestPerformedFrequency: null,
  gestureRecording: false,
  gestureStart: 0,
  gestureEvents: [],
  gesturePlaying: false,
};

const ui = new UI();

// Componentes de audio/visión (se crean al pulsar EMPEZAR).
let engine = null;
let tracking = null;
let recorder = null;
let latestHands = { left: null, right: null };
let controlsWired = false;
let calibrationStep = -1;
let pitchHistory = [];
const HAND_DROPOUT_GRACE_SECONDS = 0.11;
const TRACKING_WATCHDOG_TIMEOUT_MS = 260;
const missingSince = { left: null, right: null };
let lastClassicVolume = 0;
let trackingWatchdogId = null;
let lastTrackingCallbackWallTime = 0;
let trackingTimedOut = false;

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
ui.el.soundPresetSelect.value = state.soundPreset;
ui.el.scaleSelect.value = state.scale;
ui.el.tonicSelect.value = String(state.tonicPc);
ui.el.trainingChk.checked = Boolean(persistedSettings.trainingEnabled);
ui.el.cabinetChk.checked = Boolean(persistedSettings.cabinetEnabled);
ui.el.reverbRange.value = String(Math.round(persistedSettings.reverb * 100));
ui.el.modeToggle.querySelectorAll(".seg-btn").forEach((button) => {
  button.classList.toggle("active", button.dataset.mode === state.mode);
});
ui.setTraining({ enabled: Boolean(persistedSettings.trainingEnabled) });
for (const [id, value] of [
  ["pitchMinHz", persistedSettings.pitch.minHz],
  ["pitchMaxHz", persistedSettings.pitch.maxHz],
  ["pitchGlideRange", persistedSettings.pitch.glideMs],
  ["volumeResponseRange", persistedSettings.pitch.volumeResponseMs],
]) ui.el[id].value = String(value);
applyPerformanceConfig(false);
updateContextualUi();

let lastFrameT = null;
let recTimerId = null;

// --- Arranque ----------------------------------------------------------------
ui.el.startBtn.addEventListener("click", onStart);

async function onStart() {
  if (state.started) return;
  ui.el.startBtn.disabled = true;
  try {
    ui.setStartStatus("Iniciando audio…");
    ui.setSessionStatus("Iniciando audio…");
    engine = new AudioEngine();
    await engine.resume();
    await engine.setupVoices();
    applyPerformanceConfig(false);

    ui.setStartStatus("Cargando modelo de manos…");
    ui.setSessionStatus("Cargando seguimiento…");
    tracking = new HandTracking(ui.video);
    await tracking.init();

    ui.setStartStatus("Pidiendo cámara…");
    ui.setSessionStatus("Solicitando cámara…");
    await tracking.startCamera(persistedSettings.cameraDeviceId);
    const cameras = await tracking.listCameras();
    const activeDevice = tracking.stream?.getVideoTracks()?.[0]?.getSettings()?.deviceId ?? "";
    ui.setCameras(cameras, activeDevice);

    // Aplica el perfil completo (voz, cabinet y efectos) antes de abrir el loop.
    const preset = engine.setSoundPreset(ui.el.soundPresetSelect.value, true);
    state.soundPreset = ui.el.soundPresetSelect.value;
    engine.setReverbAmount(persistedSettings.reverb ?? preset.reverb);
    engine.setCabinetEnabled(Boolean(persistedSettings.cabinetEnabled), true);
    ui.el.reverbRange.value = String(Math.round((persistedSettings.reverb ?? preset.reverb) * 100));

    // Grabación (solo audio) desde la mezcla maestra.
    recorder = new AudioRecorder(engine.recordDestination.stream);
    if (!recorder.isSupported()) {
      ui.setRecError("Grabación no soportada en este navegador");
    }

    tracking.onResults = onHands;
    resetHandContinuity();
    tracking.start();

    state.started = true;
    startTrackingWatchdog();
    ui.showApp();
    ui.setSessionStatus("Cámara y audio listos");
    if (!controlsWired) { wireControls(); controlsWired = true; }
    window.addEventListener("resize", () => ui.resizeCanvas());
  } catch (err) {
    console.error(err);
    ui.setStartStatus(
      err && err.name === "NotAllowedError"
        ? "Permiso de cámara denegado. Habilítalo y recarga."
        : `Error al iniciar: ${err?.message ?? err}`,
      true
    );
    ui.setSessionStatus("No se pudo iniciar la sesión", true);
    ui.el.startBtn.disabled = false;
  }
}

async function stopApp({ showStart = false } = {}) {
  state.started = false;
  state.gesturePlaying = false;
  state.drone = false;
  state.frozenFrequency = null;
  state.latestPerformedFrequency = null;
  if (controlsWired) {
    ui.el.droneBtn.classList.remove("active");
    ui.el.droneBtn.textContent = "Congelar nota";
  }
  stopTrackingWatchdog();
  resetHandContinuity();
  if (recTimerId) clearInterval(recTimerId);
  if (recorder?.recorder?.state === "recording") {
    try { await recorder.stop(); } catch (_) { /* cierre de emergencia */ }
  }
  tracking?.close();
  tracking = null;
  recorder = null;
  await engine?.close();
  engine = null;
  if (showStart) {
    ui.el.app.classList.add("hidden");
    ui.el.startScreen.classList.remove("hidden");
  }
  ui.setSessionStatus("Sesión detenida");
  ui.el.startBtn.disabled = false;
}

async function restartApp() {
  await stopApp();
  await onStart();
}

async function restartSession() {
  const shouldResetSettings = window.confirm(
    "¿También quieres restablecer los ajustes predeterminados?\n\nAceptar: reiniciar y restablecer ajustes.\nCancelar: reiniciar solo la sesión."
  );
  if (shouldResetSettings) {
    resetSettings();
    window.location.reload();
    return;
  }
  await restartApp();
}

// --- Bucle por frame (callback de detección) ---------------------------------
function onHands(hands, frameInfo = {}) {
  lastTrackingCallbackWallTime = performance.now();
  trackingTimedOut = false;
  if (state.gesturePlaying) return;
  latestHands = hands;
  const fallbackTime = performance.now() / 1000;
  const t = Number.isFinite(frameInfo.timestampSeconds)
    ? frameInfo.timestampSeconds : fallbackTime;
  const dt = lastFrameT != null && t > lastFrameT
    ? Math.min(0.25, Math.max(1 / 240, t - lastFrameT))
    : 1 / Math.max(24, tracking?.fps || 30);
  lastFrameT = t;

  if (state.mode === "duo") {
    processSide("left", hands.left, t, dt);
    processSide("right", hands.right, t, dt);
  } else {
    processClassic(hands, t, dt);
  }

  // El audio queda programado antes de cualquier trabajo de canvas/DOM que
  // pueda introducir jitter en un dispositivo lento.
  ui.resizeCanvas();
  ui.clearOverlay();
  ui.drawGuides(state.mode);
  if (hands.left) ui.drawHand("left", hands.left.landmarks, hands.left.palm);
  if (hands.right) ui.drawHand("right", hands.right.landmarks, hands.right.palm);
  ui.setDiagnostics(
    tracking?.fps ?? 0,
    (engine?.ctx?.baseLatency ?? 0) + (engine?.ctx?.outputLatency ?? 0)
  );
}

function handAvailability(side, hand, timestamp) {
  if (hand) {
    missingSince[side] = null;
    return "present";
  }
  if (missingSince[side] == null) missingSince[side] = timestamp;
  return timestamp - missingSince[side] <= HAND_DROPOUT_GRACE_SECONDS
    ? "grace" : "expired";
}

function resetHandContinuity() {
  missingSince.left = null;
  missingSince.right = null;
  lastClassicVolume = 0;
  lastFrameT = null;
}

function silenceForTrackingGap() {
  engine?.silence("left");
  engine?.silence("right");
  Object.values(mappers).forEach((mapper) => mapper.reset());
  Object.values(tuners).forEach((tuner) => tuner.reset());
  ui.updateReadout("left", { active: false });
  ui.updateReadout("right", { active: false });
  ui.clearOverlay();
  resetHandContinuity();
}

function startTrackingWatchdog() {
  stopTrackingWatchdog();
  lastTrackingCallbackWallTime = performance.now();
  trackingTimedOut = false;
  trackingWatchdogId = setInterval(() => {
    if (!state.started || state.gesturePlaying || trackingTimedOut) return;
    if (performance.now() - lastTrackingCallbackWallTime <= TRACKING_WATCHDOG_TIMEOUT_MS) return;
    trackingTimedOut = true;
    silenceForTrackingGap();
  }, 100);
}

function stopTrackingWatchdog() {
  if (trackingWatchdogId != null) clearInterval(trackingWatchdogId);
  trackingWatchdogId = null;
  trackingTimedOut = false;
}

// Modo Dúo: cada mano controla su propia voz (tono Y + volumen pinza).
function processSide(side, hand, t, dt) {
  const voice = engine.getVoice(side);
  const availability = handAvailability(side, hand, t);
  if (availability !== "present") {
    if (availability === "expired") {
      engine.silence(side);
      mappers[side].reset();
      ui.updateReadout(side, { active: false });
    }
    return;
  }

  const m = mappers[side].process(hand, t);
  const tunedFreq = tuners[side].apply(
    m.frequency, m.velocity, state.scale, state.tonicPc, dt
  );
  const performedFrequency = side === "right" && state.drone && state.frozenFrequency
    ? state.frozenFrequency : tunedFreq;
  if (side === "right") state.latestPerformedFrequency = performedFrequency;
  voice.setFrequency(performedFrequency, false, dt);
  voice.setAmplitude(m.volume);

  ui.updateReadout(side, {
    active: true, frequency: performedFrequency, volume: m.volume, yNorm: m.yNorm,
  });
  if (side === "right") {
    updateTraining(performedFrequency, t);
    recordGestureFrame(performedFrequency, m.volume, t);
  }
}

// Modo Clásico: mano derecha = tono (rango amplio); mano izquierda = volumen
// por su posición vertical. Una sola voz audible (la izquierda se silencia).
function processClassic(hands, t, dt) {
  const right = hands.right;
  const left = hands.left;
  const voice = engine.getVoice("right");
  const rightAvailability = handAvailability("right", right, t);
  const leftAvailability = handAvailability("left", left, t);

  engine.silence("left"); // en clásico solo suena una voz

  // Volumen a partir de la altura de la mano izquierda (arriba = más fuerte).
  let volume = leftAvailability === "grace" ? lastClassicVolume : 0;
  if (leftAvailability === "present") {
    const lm = mappers.left.process(left, t);
    volume = normalizeCalibrated(
      lm.yNorm,
      persistedSettings.volumeCalibration.silent,
      persistedSettings.volumeCalibration.loud
    );
    lastClassicVolume = volume;
    ui.updateReadout("left", {
      active: true, frequency: 0, volume, yNorm: lm.yNorm, volOnly: true,
    });
    ui.readouts.left.note.textContent = "VOL";
    ui.readouts.left.freq.textContent = "control de volumen";
  } else if (leftAvailability === "expired") {
    mappers.left.reset();
    ui.updateReadout("left", { active: false });
    lastClassicVolume = 0;
  }

  if (rightAvailability === "present") {
    const m = mappers.classic.process(right, t);
    const voiceProfile = SOUND_PRESETS[state.soundPreset].voiceProfile;
    const rcaPerformance = voiceProfile === "rca" || voiceProfile === "rockmore";
    const tunedFreq = tuners.classic.apply(
      m.frequency, m.velocity, state.scale, state.tonicPc, dt
    );
    const performedFrequency = state.drone && state.frozenFrequency
      ? state.frozenFrequency : tunedFreq;
    state.latestPerformedFrequency = performedFrequency;
    voice.setFrequency(performedFrequency, false, dt);
    // RCA/Rockmore exige la mano de volumen: no se inventa una envolvente con
    // la pinza derecha cuando la izquierda desaparece.
    const hasVolumeHand = leftAvailability === "present" || leftAvailability === "grace";
    const amplitude = hasVolumeHand ? volume : (rcaPerformance ? 0 : m.volume);
    voice.setAmplitude(amplitude);
    ui.updateReadout("right", {
      active: true, frequency: performedFrequency,
      volume: amplitude, yNorm: m.yNorm,
    });
    updateTraining(performedFrequency, t);
    recordGestureFrame(performedFrequency, amplitude, t);
  } else if (rightAvailability === "expired") {
    engine.silence("right");
    mappers.classic.reset();
    ui.updateReadout("right", { active: false });
  } else {
    // Aunque el tono se mantenga durante un dropout breve, la antena de
    // volumen debe conservar toda su rapidez para staccato y silencio.
    const hasVolumeHand = leftAvailability === "present" || leftAvailability === "grace";
    voice.setAmplitude(hasVolumeHand ? volume : 0);
  }
}

// --- Controles ---------------------------------------------------------------
function wireControls() {
  ui.el.stopBtn.addEventListener("click", () => stopApp({ showStart: true }));
  ui.el.restartBtn.addEventListener("click", restartSession);
  ui.el.cameraSelect.addEventListener("change", async (event) => {
    if (!tracking) return;
    trackingTimedOut = true;
    silenceForTrackingGap();
    await tracking.switchCamera(event.target.value);
    lastTrackingCallbackWallTime = performance.now();
    trackingTimedOut = false;
    persistedSettings.cameraDeviceId = event.target.value;
    persistCurrentSettings();
  });
  // Modo Dúo/Clásico.
  ui.el.modeToggle.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      ui.el.modeToggle.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.mode = btn.dataset.mode;
      updateContextualUi();
      applyPerformanceConfig(false);
      // Silencia todo al cambiar de modo para evitar voces colgadas.
      engine.silence("left");
      engine.silence("right");
      Object.values(mappers).forEach((m) => m.reset());
      Object.values(tuners).forEach((tn) => tn.reset());
      resetHandContinuity();
      persistCurrentSettings();
    });
  });

  ui.el.scaleSelect.addEventListener("change", (e) => {
    state.scale = e.target.value; persistCurrentSettings();
  });
  ui.el.tonicSelect.addEventListener("change", (e) => {
    state.tonicPc = parseInt(e.target.value, 10); persistCurrentSettings();
  });
  ui.el.soundPresetSelect.addEventListener("change", (e) => {
    state.soundPreset = e.target.value;
    const preset = engine.setSoundPreset(state.soundPreset);
    ui.el.cabinetChk.checked = Boolean(preset.cabinet);
    persistedSettings.cabinetEnabled = Boolean(preset.cabinet);
    engine.setCabinetEnabled(persistedSettings.cabinetEnabled);
    ui.el.reverbRange.value = String(Math.round(preset.reverb * 100));
    persistCurrentSettings();
  });
  ui.el.reverbRange.addEventListener("input", (e) => {
    engine.setReverbAmount(Number(e.target.value) / 100);
    persistCurrentSettings();
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
  ui.el.pitchGlideRange.addEventListener("input", applyCustomPerformance);
  ui.el.volumeResponseRange.addEventListener("input", applyCustomPerformance);

  ui.el.calibrateBtn.addEventListener("click", startCalibration);
  ui.el.calibrationCaptureBtn.addEventListener("click", captureCalibrationStep);
  ui.el.calibrationCancelBtn.addEventListener("click", () => {
    calibrationStep = -1;
    ui.el.calibrationDialog.close();
  });
  ui.el.trainingChk.addEventListener("change", () => {
    persistedSettings.trainingEnabled = ui.el.trainingChk.checked;
    ui.setTraining({ enabled: persistedSettings.trainingEnabled });
    persistCurrentSettings();
  });
  ui.el.resetSettingsBtn.addEventListener("click", () => {
    resetSettings();
    window.location.reload();
  });
  ui.el.cabinetChk.addEventListener("change", () => {
    persistedSettings.cabinetEnabled = ui.el.cabinetChk.checked;
    engine?.setCabinetEnabled(persistedSettings.cabinetEnabled);
    persistCurrentSettings();
  });
  ui.el.cabinetIrInput.addEventListener("change", async () => {
    const file = ui.el.cabinetIrInput.files?.[0];
    if (!file || !engine) return;
    try {
      const info = await engine.loadCabinetImpulse(await file.arrayBuffer());
      ui.setPerformanceStatus(`IR cargada: ${info.duration.toFixed(2)} s · ${info.channels} canal(es)`);
      ui.el.cabinetChk.checked = true;
      persistedSettings.cabinetEnabled = true;
      engine.setCabinetEnabled(true);
    } catch (error) {
      ui.setPerformanceStatus(`No se pudo cargar la IR: ${error.message}`, true);
    }
  });

  const updateCreative = () => engine?.setCreativeMorph(
    Number(ui.el.creativeX.value) / 100,
    Number(ui.el.creativeY.value) / 100
  );
  ui.el.creativeX.addEventListener("input", updateCreative);
  ui.el.creativeY.addEventListener("input", updateCreative);
  ui.el.droneBtn.addEventListener("click", () => {
    if (!state.drone) {
      if (!Number.isFinite(state.latestPerformedFrequency)) {
        ui.setPerformanceStatus("Muestra la mano de tono antes de congelar una nota.", true);
        return;
      }
      state.drone = true;
      state.frozenFrequency = state.latestPerformedFrequency;
      ui.setPerformanceStatus(`Nota congelada en ${state.frozenFrequency.toFixed(2)} Hz.`);
    } else {
      state.drone = false;
      state.frozenFrequency = null;
      ui.setPerformanceStatus("Nota liberada.");
    }
    ui.el.droneBtn.classList.toggle("active", state.drone);
    ui.el.droneBtn.textContent = state.drone ? "Liberar nota" : "Congelar nota";
  });
  ui.el.gestureRecBtn.addEventListener("click", toggleGestureRecording);
  ui.el.gesturePlayBtn.addEventListener("click", playGestureRecording);
  ui.el.gestureExportBtn.addEventListener("click", exportGestureRecording);
  ui.el.gestureImportInput.addEventListener("change", importGestureRecording);

  // Grabación.
  ui.el.recBtn.addEventListener("click", toggleRecording);
}

function applyPerformanceConfig(showStatus = true) {
  const minHz = Number(ui.el.pitchMinHz.value);
  const maxHz = Number(ui.el.pitchMaxHz.value);
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

  mappers.classic.setPitchConfig({
    minHz,
    maxHz,
    inputLow: persistedSettings.pitch.inputLow,
    inputHigh: persistedSettings.pitch.inputHigh,
  });
  ui.setGuideConfig({
    pitchLow: persistedSettings.pitch.inputLow,
    pitchHigh: persistedSettings.pitch.inputHigh,
    volumeSilent: persistedSettings.volumeCalibration.silent,
    volumeLoud: persistedSettings.volumeCalibration.loud,
  });
  if (engine) {
    if (state.mode === "classic") {
      engine.resetControlResponse();
      engine.setControlResponse({ pitchGlideMs, volumeResponseMs }, "right");
    } else engine.resetControlResponse();
  }

  if (showStatus) {
    const octaves = Math.log2(maxHz / minHz);
    ui.setPerformanceStatus(
      `${freqToNoteName(minHz)}–${freqToNoteName(maxHz)} · ${octaves.toFixed(2)} octavas · campo vertical continuo`
    );
  } else ui.setPerformanceStatus("");
  if (showStatus) persistCurrentSettings();
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

function persistCurrentSettings() {
  updateContextualUi();
  persistedSettings = {
    ...persistedSettings,
    soundPreset: state.soundPreset,
    performancePreset: state.performancePreset,
    mode: state.mode,
    scale: state.scale,
    tonicPc: state.tonicPc,
    reverb: Number(ui.el.reverbRange.value) / 100,
    trainingEnabled: ui.el.trainingChk.checked,
    cameraDeviceId: ui.el.cameraSelect.value || persistedSettings.cameraDeviceId,
    cabinetEnabled: ui.el.cabinetChk.checked,
    pitch: {
      ...persistedSettings.pitch,
      minHz: Number(ui.el.pitchMinHz.value),
      maxHz: Number(ui.el.pitchMaxHz.value),
      glideMs: Number(ui.el.pitchGlideRange.value),
      volumeResponseMs: Number(ui.el.volumeResponseRange.value),
    },
  };
  saveSettings(persistedSettings);
}

function updateContextualUi() {
  const modeLabel = state.mode === "classic" ? "Clásico" : "Dúo";
  const soundLabel = {
    rca: "RCA", rockmore: "Rockmore", cabinet1929: "RCA Cabinet",
    scifi: "Ciencia ficción", experimental: "Órbita",
  }[state.soundPreset] ?? "Sonido";
  const performanceLabel = {
    concertFull: "Do1–Do7", rca1929: "RCA 1929", rockmore: "Do2–Do7",
    comfortable: "Webcam cómoda", custom: "Personalizado",
  }[state.performancePreset] ?? "Perfil";
  const scaleLabel = ui.el.scaleSelect.options[ui.el.scaleSelect.selectedIndex]?.textContent ?? "Libre";
  ui.setPerformanceSummary(`${modeLabel} · ${soundLabel} · ${performanceLabel} · ${scaleLabel}`);
}

const CALIBRATION_STEPS = [
  { hand: "right", key: "pitchLow", text: "Coloca la mano derecha en la posición de la nota más grave." },
  { hand: "right", key: "pitchHigh", text: "Coloca la mano derecha en la posición de la nota más aguda." },
  { hand: "left", key: "volumeSilent", text: "Coloca la mano izquierda en silencio, cerca de la antena de volumen." },
  { hand: "left", key: "volumeLoud", text: "Coloca la mano izquierda en la posición de volumen máximo." },
];
let calibrationValues = {};
let calibrationCaptureBusy = false;

function startCalibration() {
  if (!applyPerformanceConfig(false)) return;
  calibrationStep = 0;
  calibrationValues = {};
  updateCalibrationDialog();
  ui.el.calibrationDialog.showModal();
}

function updateCalibrationDialog() {
  const step = CALIBRATION_STEPS[calibrationStep];
  ui.el.calibrationInstruction.textContent = step?.text ?? "Calibración completada.";
  ui.el.calibrationProgress.textContent = `${calibrationStep + 1} / ${CALIBRATION_STEPS.length}`;
}

async function captureCalibrationStep() {
  if (calibrationCaptureBusy || calibrationStep < 0) return;
  const step = CALIBRATION_STEPS[calibrationStep];
  const stepIndex = calibrationStep;
  calibrationCaptureBusy = true;
  ui.el.calibrationCaptureBtn.disabled = true;
  ui.el.calibrationProgress.textContent = "Midiendo posición estable…";

  const samples = [];
  const startedAt = performance.now();
  while (
    performance.now() - startedAt < 340
    && calibrationStep === stepIndex
    && ui.el.calibrationDialog.open
  ) {
    const hand = latestHands[step.hand];
    if (hand) samples.push(1 - hand.palm.y);
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  calibrationCaptureBusy = false;
  ui.el.calibrationCaptureBtn.disabled = false;
  if (calibrationStep !== stepIndex || !ui.el.calibrationDialog.open) return;
  if (samples.length < 6) {
    ui.el.calibrationProgress.textContent = `No se detecta la mano ${step.hand === "right" ? "derecha" : "izquierda"}.`;
    return;
  }
  samples.sort((a, b) => a - b);
  calibrationValues[step.key] = samples[Math.floor(samples.length / 2)];

  calibrationStep++;
  if (calibrationStep < CALIBRATION_STEPS.length) {
    updateCalibrationDialog();
    return;
  }
  const octaves = Math.log2(
    Number(ui.el.pitchMaxHz.value) / Number(ui.el.pitchMinHz.value)
  );
  const minimumPitchSpan = Math.min(0.55, Math.max(0.22, octaves * 0.075));
  if (Math.abs(calibrationValues.pitchHigh - calibrationValues.pitchLow) < minimumPitchSpan) {
    calibrationStep = 0;
    calibrationValues = {};
    ui.el.calibrationInstruction.textContent = CALIBRATION_STEPS[0].text;
    ui.el.calibrationProgress.textContent = `El recorrido de tono es demasiado corto para ${octaves.toFixed(1)} octavas. Usa al menos el ${Math.round(minimumPitchSpan * 100)} % de la altura.`;
    return;
  }
  if (Math.abs(calibrationValues.volumeLoud - calibrationValues.volumeSilent) < 0.12) {
    calibrationStep = 0;
    calibrationValues = {};
    ui.el.calibrationInstruction.textContent = CALIBRATION_STEPS[0].text;
    ui.el.calibrationProgress.textContent = "Las posiciones de volumen están demasiado próximas. Repite con un recorrido mayor.";
    return;
  }
  persistedSettings.pitch.inputLow = calibrationValues.pitchLow;
  persistedSettings.pitch.inputHigh = calibrationValues.pitchHigh;
  persistedSettings.volumeCalibration = {
    silent: calibrationValues.volumeSilent,
    loud: calibrationValues.volumeLoud,
  };
  saveSettings(persistedSettings);
  applyPerformanceConfig(true);
  calibrationStep = -1;
  ui.el.calibrationDialog.close();
}

function updateTraining(frequency, timestamp) {
  const enabled = ui.el.trainingChk.checked;
  if (!enabled || !Number.isFinite(frequency)) {
    ui.setTraining({ enabled: false });
    return;
  }
  const midi = freqToMidi(frequency);
  const cents = (midi - Math.round(midi)) * 100;
  pitchHistory.push({ t: timestamp, cents, frequency });
  pitchHistory = pitchHistory.filter((point) => timestamp - point.t <= 1.2);
  const mean = pitchHistory.reduce((sum, point) => sum + point.cents, 0) / pitchHistory.length;
  const variance = pitchHistory.reduce((sum, point) => sum + (point.cents - mean) ** 2, 0) / pitchHistory.length;
  let crossings = 0;
  for (let i = 1; i < pitchHistory.length; i++) {
    if ((pitchHistory[i - 1].cents - mean) * (pitchHistory[i].cents - mean) < 0) crossings++;
  }
  const duration = pitchHistory.length > 1 ? timestamp - pitchHistory[0].t : 0;
  const vibratoHz = duration > 0.5 && crossings >= 3 ? crossings / (2 * duration) : null;
  ui.setTraining({
    enabled: true,
    cents,
    stabilityCents: Math.sqrt(variance),
    vibratoHz,
  });
}

function recordGestureFrame(frequency, amplitude, timestamp) {
  if (!state.gestureRecording) return;
  const elapsed = timestamp - state.gestureStart;
  const last = state.gestureEvents[state.gestureEvents.length - 1];
  if (last && elapsed - last.t < 1 / 30) return;
  state.gestureEvents.push({
    t: elapsed,
    frequency,
    amplitude,
    preset: state.soundPreset,
  });
}

function toggleGestureRecording() {
  state.gestureRecording = !state.gestureRecording;
  if (state.gestureRecording) {
    state.gestureEvents = [];
    state.gestureStart = performance.now() / 1000;
  }
  ui.el.gestureRecBtn.classList.toggle("active", state.gestureRecording);
  ui.el.gestureRecBtn.textContent = state.gestureRecording ? "Detener gestos" : "Grabar gestos";
  ui.el.gesturePlayBtn.disabled = state.gestureRecording || !state.gestureEvents.length;
  ui.el.gestureExportBtn.disabled = state.gestureRecording || !state.gestureEvents.length;
}

function playGestureRecording() {
  if (!engine || !state.gestureEvents.length || state.gesturePlaying) return;
  state.gesturePlaying = true;
  engine.silence("left");
  const voice = engine.getVoice("right");
  const startedAt = performance.now() / 1000;
  let index = 0;
  const tick = () => {
    if (!state.gesturePlaying) return;
    const elapsed = performance.now() / 1000 - startedAt;
    while (index < state.gestureEvents.length && state.gestureEvents[index].t <= elapsed) {
      const event = state.gestureEvents[index++];
      if (event.preset !== state.soundPreset) {
        state.soundPreset = event.preset;
        engine.setSoundPreset(event.preset);
      }
      voice.setFrequency(event.frequency);
      voice.setAmplitude(event.amplitude);
    }
    if (index < state.gestureEvents.length) requestAnimationFrame(tick);
    else {
      voice.setAmplitude(0);
      state.gesturePlaying = false;
    }
  };
  requestAnimationFrame(tick);
}

function exportGestureRecording() {
  if (!state.gestureEvents.length) return;
  const blob = new Blob([JSON.stringify({ version: 1, events: state.gestureEvents }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "theremin-gestos.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importGestureRecording() {
  const file = ui.el.gestureImportInput.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed.events) || parsed.events.length > 18000) {
      throw new Error("Formato o duración no válidos");
    }
    state.gestureEvents = parsed.events.filter((event) =>
      Number.isFinite(event.t) && Number.isFinite(event.frequency) && Number.isFinite(event.amplitude)
    );
    ui.el.gesturePlayBtn.disabled = !state.gestureEvents.length;
    ui.el.gestureExportBtn.disabled = !state.gestureEvents.length;
    ui.setPerformanceStatus(`${state.gestureEvents.length} eventos de gesto importados.`);
  } catch (error) {
    ui.setPerformanceStatus(`No se pudo importar: ${error.message}`, true);
  }
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
  const durationSeconds = recorder.elapsedSeconds();
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
  ui.showRecResult({ webmUrl, wavUrl, durationSeconds });
}
