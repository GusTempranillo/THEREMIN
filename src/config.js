// =============================================================================
// config.js — Constantes ajustables centralizadas (el "tacto" del instrumento)
// =============================================================================
// Todo lo que conviene afinar a oído vive aquí. Los demás módulos importan de
// este archivo, de modo que no hay valores mágicos dispersos por el código.
// Los valores marcados como "validado" son el punto de partida recomendado en
// la especificación del proyecto.
// =============================================================================

// --- Versión de MediaPipe Tasks Vision (FIJADA, nunca @latest en producción) ---
export const MEDIAPIPE_VERSION = "0.10.35";
export const WASM_BASE_URL =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
export const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// --- Filtro One Euro (suavizado de entrada: jitter vs latencia) --------------
// minCutoff bajo => más suavizado en reposo (mata el temblor al sostener nota).
// beta alto => deja pasar mejor el movimiento rápido (menos latencia al moverse).
export const ONE_EURO = {
  position: { minCutoff: 1.2, beta: 0.012, dCutoff: 1.0 }, // posición Y (tono)
  aperture: { minCutoff: 1.5, beta: 0.010, dCutoff: 1.0 }, // apertura (volumen)
};

// --- Rangos de tono (mapeo logarítmico, 2 octavas por mano) ------------------
// freq = fBase * 2^(yNorm * octavas), con yNorm in [0,1] (abajo=0, arriba=1).
export const PITCH_RANGE = {
  // Modo Dúo:
  right: { fBase: 261.63, octaves: 2 }, // C4 → C6 (mano derecha real = aguda)
  left:  { fBase: 65.41,  octaves: 2 }, // C2 → C4 (mano izquierda real = grave)
  // Modo Clásico: una sola voz de tono con rango amplio C3 → C6 (3 octavas).
  classic: { fBase: 130.81, octaves: 3 },
};

// --- Mapeo de volumen (pinza pulgar–índice) ----------------------------------
export const VOLUME = {
  // Distancia pinza normalizada por escala invariante al tamaño de la mano
  // (distancia muñeca 0 ↔ MCP medio 9). Estos límites mapean a [0,1].
  closedRatio: 0.18, // <= esto => volumen 0 (pinza cerrada)
  openRatio:   1.05, // >= esto => volumen 1 (pinza muy abierta)
  curve: 1.3,        // curva perceptual v^1.3 (más control en volúmenes bajos)
};

// --- Modo escala: "afina al parar" -------------------------------------------
// La afinación NO es cuantización dura: solo atrae a la nota cuando la mano se
// detiene. velFull/velFree son el umbral de velocidad (en unidades de yNorm/seg).
export const SCALE_TUNE = {
  velFree: 1.6,  // por encima => libre (s≈0), glissando auténtico
  velFull: 0.25, // por debajo => pegado a la nota (s≈1)
  attractTimeConstant: 0.045, // suavizado del factor s (histéresis, ~80–150 ms efectivos)
};

// --- Motor de audio: defaults VALIDADOS de la voz ----------------------------
export const VOICE = {
  carrier: { type: "sine", gain: 0.82 },         // oscilador portador
  warmth:  { type: "triangle", detuneCents: -4, mix: 0.22, enabled: true }, // 2.º osc (calidez)
  vibrato: {
    rateHz: 5.5,        // frecuencia del LFO
    depthCents: 22,     // profundidad (se convierte a Hz multiplicativamente)
    onsetDelay: 0.55,   // entrada retardada (s) tras superar el umbral de silencio
    onsetTimeConstant: 0.25, // suavidad de la subida/bajada de la profundidad
  },
  filter: { frequency: 2200, Q: 0.7, enabled: true }, // BiquadFilter paso-bajo
  glideTimeConstant: 0.06,  // perilla fluidez/latencia del tono (setTargetAtTime)
  gainTimeConstant: 0.05,   // suavizado de la envolvente (sin clics)
  silenceThreshold: 0.001,  // por debajo, la voz se considera en silencio
  masterGain: 0.9,          // ganancia maestra de mezcla
};

// --- Notas (español) y constantes de afinación -------------------------------
export const NOTE_NAMES_ES = [
  "Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si",
];
export const A4_FREQ = 440;     // referencia de afinación
export const A4_MIDI = 69;      // nota MIDI de La4
