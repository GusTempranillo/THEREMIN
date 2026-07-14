// =============================================================================
// ui.js — Overlay de landmarks, lecturas, barras y enlazado de controles
// =============================================================================
// Toda la manipulación del DOM y el dibujado del canvas vive aquí, separada de
// la lógica de audio/visión. main.js le pasa datos ya calculados.
// =============================================================================

import { freqToNoteName } from "./scale.js";
import { NOTE_NAMES_ES } from "./config.js";

// Conexiones entre landmarks de la mano (esqueleto) para el overlay.
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],          // pulgar
  [0, 5], [5, 6], [6, 7], [7, 8],          // índice
  [5, 9], [9, 10], [10, 11], [11, 12],     // medio
  [9, 13], [13, 14], [14, 15], [15, 16],   // anular
  [13, 17], [17, 18], [18, 19], [19, 20],  // meñique
  [0, 17],                                  // base de la palma
];

const SIDE_COLORS = { left: "#7aa2ff", right: "#ff8db4" };

export class UI {
  constructor() {
    this.video = document.getElementById("video");
    this.canvas = document.getElementById("overlay");
    this.cctx = this.canvas.getContext("2d");

    this.el = {
      startScreen: document.getElementById("startScreen"),
      startBtn: document.getElementById("startBtn"),
      startStatus: document.getElementById("startStatus"),
      app: document.getElementById("app"),
      diagnostics: document.getElementById("diagnostics"),
      sessionStatus: document.getElementById("sessionStatus"),
      cameraSelect: document.getElementById("cameraSelect"),
      restartBtn: document.getElementById("restartBtn"),
      stopBtn: document.getElementById("stopBtn"),
      modeToggle: document.getElementById("modeToggle"),
      scaleSelect: document.getElementById("scaleSelect"),
      tonicSelect: document.getElementById("tonicSelect"),
      soundPresetSelect: document.getElementById("soundPresetSelect"),
      reverbRange: document.getElementById("reverbRange"),
      performancePresetSelect: document.getElementById("performancePresetSelect"),
      pitchMinHz: document.getElementById("pitchMinHz"),
      pitchMaxHz: document.getElementById("pitchMaxHz"),
      octaveSpanRange: document.getElementById("octaveSpanRange"),
      octaveSpanValue: document.getElementById("octaveSpanValue"),
      octaveDownBtn: document.getElementById("octaveDownBtn"),
      octaveUpBtn: document.getElementById("octaveUpBtn"),
      pitchGlideRange: document.getElementById("pitchGlideRange"),
      pitchGlideValue: document.getElementById("pitchGlideValue"),
      volumeResponseRange: document.getElementById("volumeResponseRange"),
      volumeResponseValue: document.getElementById("volumeResponseValue"),
      performanceDescription: document.getElementById("performanceDescription"),
      performanceStatus: document.getElementById("performanceStatus"),
      performanceSummary: document.getElementById("performanceSummary"),
      calibrateBtn: document.getElementById("calibrateBtn"),
      trainingChk: document.getElementById("trainingChk"),
      resetSettingsBtn: document.getElementById("resetSettingsBtn"),
      cabinetChk: document.getElementById("cabinetChk"),
      cabinetIrInput: document.getElementById("cabinetIrInput"),
      trainingPanel: document.getElementById("trainingPanel"),
      trainingCents: document.getElementById("trainingCents"),
      trainingStability: document.getElementById("trainingStability"),
      trainingVibrato: document.getElementById("trainingVibrato"),
      creativeX: document.getElementById("creativeX"),
      creativeY: document.getElementById("creativeY"),
      droneBtn: document.getElementById("droneBtn"),
      gestureRecBtn: document.getElementById("gestureRecBtn"),
      gesturePlayBtn: document.getElementById("gesturePlayBtn"),
      gestureExportBtn: document.getElementById("gestureExportBtn"),
      gestureImportInput: document.getElementById("gestureImportInput"),
      calibrationDialog: document.getElementById("calibrationDialog"),
      calibrationInstruction: document.getElementById("calibrationInstruction"),
      calibrationProgress: document.getElementById("calibrationProgress"),
      calibrationCaptureBtn: document.getElementById("calibrationCaptureBtn"),
      calibrationCancelBtn: document.getElementById("calibrationCancelBtn"),
      recBtn: document.getElementById("recBtn"),
      recIcon: document.getElementById("recIcon"),
      recLabel: document.getElementById("recLabel"),
      recTimer: document.getElementById("recTimer"),
      recStatus: document.getElementById("recStatus"),
      recResult: document.getElementById("recResult"),
      recPlayer: document.getElementById("recPlayer"),
      dlWav: document.getElementById("dlWav"),
    };

    // Lecturas por lado (cacheadas).
    this.readouts = {};
    for (const side of ["left", "right"]) {
      this.readouts[side] = {
        card: document.getElementById(`readout-${side}`),
        state: document.getElementById(`state-${side}`),
        note: document.getElementById(`note-${side}`),
        freq: document.getElementById(`freq-${side}`),
        pitchbar: document.getElementById(`pitchbar-${side}`),
        volbar: document.getElementById(`volbar-${side}`),
        vol: document.getElementById(`vol-${side}`),
      };
    }

    this._populateTonics();
    this.guideConfig = null;
  }

  _populateTonics() {
    NOTE_NAMES_ES.forEach((name, pc) => {
      const opt = document.createElement("option");
      opt.value = String(pc);
      opt.textContent = name;
      if (pc === 0) opt.selected = true; // Do por defecto
      this.el.tonicSelect.appendChild(opt);
    });
  }

  // Ajusta el canvas al tamaño real renderizado del vídeo.
  resizeCanvas() {
    const rect = this.video.getBoundingClientRect();
    if (rect.width && rect.height) {
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      if (this.canvas.width !== width) this.canvas.width = width;
      if (this.canvas.height !== height) this.canvas.height = height;
    }
  }

  showApp() {
    this.el.startScreen.classList.add("hidden");
    this.el.app.classList.remove("hidden");
    this.resizeCanvas();
  }

  setStartStatus(text, isError = false) {
    this.el.startStatus.textContent = text;
    this.el.startStatus.classList.toggle("error", isError);
  }

  setSessionStatus(text, isError = false) {
    this.el.sessionStatus.textContent = text;
    this.el.sessionStatus.classList.toggle("error", isError);
  }

  setPerformanceSummary(text) { this.el.performanceSummary.textContent = text || ""; }

  setPerformancePanel(presetKey, preset) {
    this.el.performancePresetSelect.value = presetKey;
    this.el.pitchMinHz.value = preset.minHz.toFixed(2);
    this.el.pitchMaxHz.value = preset.maxHz.toFixed(2);
    const octaves = Math.log2(preset.maxHz / preset.minHz);
    this.el.octaveSpanRange.value = String(Math.round(octaves * 2) / 2);
    this.el.octaveSpanValue.textContent = `${octaves.toFixed(1).replace(".", ",")} oct`;
    this.el.pitchGlideRange.value = String(preset.pitchGlideMs);
    this.el.volumeResponseRange.value = String(preset.volumeResponseMs);
    this.el.pitchGlideValue.textContent = `${preset.pitchGlideMs} ms`;
    this.el.volumeResponseValue.textContent = `${preset.volumeResponseMs} ms`;
    this.el.performanceDescription.textContent = preset.description;
  }

  setPerformanceStatus(text, isError = false) {
    this.el.performanceStatus.textContent = text || "";
    this.el.performanceStatus.classList.toggle("error", isError);
  }

  setCameras(cameras, selectedId = "") {
    this.el.cameraSelect.textContent = "";
    cameras.forEach((camera) => {
      const option = document.createElement("option");
      option.value = camera.deviceId;
      option.textContent = camera.label;
      option.selected = camera.deviceId === selectedId;
      this.el.cameraSelect.appendChild(option);
    });
  }

  setTraining({ enabled, cents = 0, stabilityCents = null, vibratoHz = null }) {
    this.el.trainingPanel.classList.toggle("hidden", !enabled);
    if (!enabled) return;
    this.el.trainingCents.textContent = `${cents >= 0 ? "+" : ""}${cents.toFixed(0)} ¢`;
    this.el.trainingStability.textContent = stabilityCents == null
      ? "estabilidad —"
      : `estabilidad ±${stabilityCents.toFixed(1)} ¢`;
    this.el.trainingVibrato.textContent = vibratoHz == null
      ? "vibrato —"
      : `vibrato ${vibratoHz.toFixed(1)} Hz`;
  }

  setDiagnostics(fps, latencySeconds) {
    const latencyMs = Number.isFinite(latencySeconds) && latencySeconds > 0
      ? `${Math.round(latencySeconds * 1000)} ms` : "—";
    this.el.diagnostics.textContent = `FPS ${fps ? fps.toFixed(0) : "—"} · latencia ${latencyMs}`;
  }

  // --- Dibujo del overlay ----------------------------------------------------
  clearOverlay() {
    this.cctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  setGuideConfig(config) { this.guideConfig = config; }

  drawGuides(mode) {
    if (mode !== "classic" || !this.guideConfig) return;
    const ctx = this.cctx, W = this.canvas.width, H = this.canvas.height;
    const { pitchLow, pitchHigh, volumeSilent, volumeLoud } = this.guideConfig;
    ctx.save();
    ctx.setLineDash([8, 7]);
    ctx.lineWidth = 2;
    for (const [value, color] of [[pitchLow, "#7aa2ff"], [pitchHigh, "#ff8db4"]]) {
      const y = (1 - value) * H;
      ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    for (const [value, color] of [[volumeSilent, "#ff5a6a"], [volumeLoud, "#5ee6c5"]]) {
      const y = (1 - value) * H;
      ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W * 0.34, y); ctx.stroke();
    }
    ctx.restore();
  }

  drawHand(side, landmarks, palm) {
    const ctx = this.cctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const color = SIDE_COLORS[side];

    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    // Conexiones (esqueleto).
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.moveTo(landmarks[a].x * W, landmarks[a].y * H);
      ctx.lineTo(landmarks[b].x * W, landmarks[b].y * H);
    }
    ctx.stroke();

    // Puntos.
    for (const lm of landmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * W, lm.y * H, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Resalta la pinza pulgar(4)–índice(8).
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(landmarks[4].x * W, landmarks[4].y * H);
    ctx.lineTo(landmarks[8].x * W, landmarks[8].y * H);
    ctx.stroke();
    ctx.setLineDash([]);

    // Centroide de palma (punto de control del tono).
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(palm.x * W, palm.y * H, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Lecturas --------------------------------------------------------------
  updateReadout(side, data) {
    const r = this.readouts[side];
    if (!data || !data.active) {
      r.card.classList.remove("active");
      r.state.textContent = "—";
      r.state.classList.remove("on");
      r.note.textContent = "—";
      r.freq.textContent = "— Hz";
      r.pitchbar.style.width = "0%";
      r.volbar.style.width = "0%";
      r.vol.textContent = "0%";
      return;
    }
    r.card.classList.add("active");
    r.state.textContent = "activa";
    r.state.classList.add("on");
    r.note.textContent = freqToNoteName(data.frequency);
    r.freq.textContent = `${data.frequency.toFixed(1)} Hz`;
    r.pitchbar.style.width = `${(data.yNorm * 100).toFixed(1)}%`;
    r.volbar.style.width = `${(data.volume * 100).toFixed(1)}%`;
    r.vol.textContent = `${Math.round(data.volume * 100)}%`;
  }

  // --- Grabación -------------------------------------------------------------
  setRecording(isRec) {
    this.el.recBtn.classList.toggle("recording", isRec);
    this.el.recIcon.textContent = isRec ? "■" : "●";
    this.el.recLabel.textContent = isRec ? "Detener" : "Grabar";
    this.el.recStatus.textContent = isRec ? "Grabando…" : "";
  }

  setRecTimer(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = Math.floor(seconds % 60).toString().padStart(2, "0");
    this.el.recTimer.textContent = `${m}:${s}`;
  }

  setRecError(msg) {
    this.el.recStatus.textContent = msg;
    this.el.recStatus.classList.add("error");
    this.el.recBtn.disabled = true;
  }

  showRecResult({ webmUrl, wavUrl, durationSeconds }) {
    this.el.recResult.classList.remove("hidden");
    this.el.recPlayer.src = webmUrl;
    this.el.recStatus.textContent = `Grabación lista · ${this.formatDuration(durationSeconds)}`;
    if (wavUrl) {
      this.el.dlWav.href = wavUrl;
      this.el.dlWav.classList.remove("hidden");
    } else {
      this.el.dlWav.classList.add("hidden");
    }
  }

  formatDuration(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }
}
