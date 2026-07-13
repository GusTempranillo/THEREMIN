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
  position: { minCutoff: 1.8, beta: 0.32, dCutoff: 1.2 }, // posición Y (tono)
  aperture: { minCutoff: 1.5, beta: 0.010, dCutoff: 1.0 }, // apertura (volumen)
};

// --- Rangos de tono (Dúo: 2 octavas por mano; Clásico: rango configurable) ---
// freq = fBase * 2^(yNorm * octavas), con yNorm in [0,1] (abajo=0, arriba=1).
export const PITCH_RANGE = {
  // Modo Dúo:
  right: { fBase: 261.63, octaves: 2 }, // C4 → C6 (mano derecha real = aguda)
  left:  { fBase: 65.41,  octaves: 2 }, // C2 → C4 (mano izquierda real = grave)
  // Modo Clásico: extensión completa medida en el RCA modificado de Rockmore.
  classic: { fBase: 32.70319566, octaves: 6 }, // C1 → C7
};

// --- Extensión y respuesta del modo Clásico --------------------------------
// RCA documentó unas 3,5 octavas y un límite superior próximo a 1400 Hz. El
// límite inferior de 123,47 Hz se deriva de esa extensión (aprox. Si2–Fa6).
// El instrumento personal de Clara Rockmore ofrecía cinco octavas de concierto.
// El examen del ejemplar restaurado midió unas seis (algo menos de C1 a algo más
// de C7), aunque sus extremos eran menos estables; conservamos ambos perfiles.
export const PERFORMANCE_PRESETS = {
  concertFull: {
    label: "Concierto completo · Do1–Do7 (6 oct)",
    minHz: 32.70319566,
    maxHz: 2093.004522,
    pitchGlideMs: 10,
    volumeResponseMs: 18,
    description: "Extensión completa medida en el RCA de Clara Rockmore restaurado; arriba es agudo y abajo es grave.",
  },
  rca1929: {
    label: "RCA 1929 · Si2–Fa6 (≈3,5 oct)",
    minHz: 123.47,
    maxHz: 1396.91,
    pitchGlideMs: 14,
    volumeResponseMs: 55,
    description: "Extensión del RCA de serie documentada, adaptada al recorrido vertical de la cámara.",
  },
  rockmore: {
    label: "Rockmore estable · Do2–Do7 (5 oct)",
    minHz: 65.41,
    maxHz: 2093.0,
    pitchGlideMs: 10,
    volumeResponseMs: 18,
    description: "Cinco octavas de concierto estables y articulación rápida para legato, vibrato manual y staccato.",
  },
  comfortable: {
    label: "Webcam cómoda · Do3–Do6 (3 oct)",
    minHz: 130.81,
    maxHz: 1046.5,
    pitchGlideMs: 24,
    volumeResponseMs: 35,
    description: "Menor sensibilidad espacial y control vertical, más fácil con cámaras ruidosas.",
  },
  custom: {
    label: "Personalizado",
    minHz: 32.70319566,
    maxHz: 2093.004522,
    pitchGlideMs: 10,
    volumeResponseMs: 18,
    description: "Extensión e inercia definidas por el intérprete; el tono siempre se controla en vertical.",
  },
};

export const DEFAULT_PERFORMANCE_PRESET = "concertFull";

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

// --- Perfiles de sonido -----------------------------------------------------
// El cabinet es una etapa de salida: "cabinet1929" reutiliza la voz RCA y
// añade la coloración del amplificador, altavoz y caja históricos modelados.
export const SOUND_PRESETS = {
  rca: {
    label: "Clásico — RCA/Rockmore",
    description: "Grave de cello, medio vocal y agudo casi sinusoidal.",
    voiceProfile: "rca",
    cabinet: false,
    automaticVibrato: false,
    glideTimeConstant: 0.012,
    gainTimeConstant: 0.018,
    reverb: 0.04,
    delay: 0,
  },
  rockmore: {
    label: "Theremin clásico de concierto — Rockmore",
    description: "Voz Rockmore vocal y cálida, altavoz de época y sala de concierto discreta.",
    voiceProfile: "rockmore",
    cabinet: true,
    automaticVibrato: false,
    glideTimeConstant: 0.010,
    gainTimeConstant: 0.018,
    gainAttackTimeConstant: 0.012,
    gainReleaseTimeConstant: 0.024,
    reverb: 0.12,
    preDelay: 0.017,
    delay: 0,
  },
  cabinet1929: {
    label: "RCA + Cabinet 1929",
    description: "Voz RCA a través de amplificador, altavoz y caja modelados.",
    voiceProfile: "rca",
    cabinet: true,
    automaticVibrato: false,
    glideTimeConstant: 0.012,
    gainTimeConstant: 0.022,
    reverb: 0.10,
    delay: 0,
  },
  scifi: {
    label: "Ciencia ficción moderna",
    description: "Pulso brillante, vibrato retardado, hall y eco espacial.",
    voiceProfile: "scifi",
    cabinet: false,
    automaticVibrato: true,
    vibratoRateHz: 5.8,
    vibratoDepthCents: 34,
    vibratoOnsetDelay: 0.45,
    vibratoOnsetTimeConstant: 0.24,
    glideTimeConstant: 0.065,
    gainTimeConstant: 0.045,
    reverb: 0.34,
    delay: 0.16,
  },
  experimental: {
    label: "Órbita prismática — experimental",
    description: "Voz hueca con quinta, octava flotante, movimiento tímbrico lento y eco musical.",
    voiceProfile: "experimental",
    cabinet: false,
    automaticVibrato: false,
    glideTimeConstant: 0.036,
    gainTimeConstant: 0.03,
    reverb: 0.30,
    delay: 0.13,
    preDelay: 0.021,
    echoTime: 0.243,
    echoFeedback: 0.27,
  },
};

export const DEFAULT_SOUND_PRESET = "rockmore";

// --- Notas (español) y constantes de afinación -------------------------------
export const NOTE_NAMES_ES = [
  "Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si",
];
export const A4_FREQ = 440;     // referencia de afinación
export const A4_MIDI = 69;      // nota MIDI de La4
