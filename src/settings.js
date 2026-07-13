// =============================================================================
// settings.js — preferencias y calibración local (nunca salen del dispositivo)
// =============================================================================

const STORAGE_KEY = "theremin-web:settings:v4";

export const DEFAULT_SETTINGS = Object.freeze({
  soundPreset: "rca",
  performancePreset: "rca1929",
  mode: "duo",
  scale: "free",
  tonicPc: 0,
  reverb: 0.04,
  pitch: {
    minHz: 123.47,
    maxHz: 1396.91,
    axis: "x",
    glideMs: 14,
    volumeResponseMs: 55,
    inputLow: 0,
    inputHigh: 1,
  },
  volumeCalibration: { silent: 0, loud: 1 },
  trainingEnabled: false,
  cameraDeviceId: "",
  cabinetEnabled: false,
});

function mergeDefaults(saved = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    pitch: { ...DEFAULT_SETTINGS.pitch, ...(saved.pitch ?? {}) },
    volumeCalibration: {
      ...DEFAULT_SETTINGS.volumeCalibration,
      ...(saved.volumeCalibration ?? {}),
    },
  };
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return mergeDefaults(raw ? JSON.parse(raw) : {});
  } catch (_) {
    return mergeDefaults();
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mergeDefaults(settings)));
    return true;
  } catch (_) {
    return false;
  }
}

export function resetSettings() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* almacenamiento bloqueado */ }
  return mergeDefaults();
}

export function normalizeCalibrated(value, low, high) {
  if (![value, low, high].every(Number.isFinite) || Math.abs(high - low) < 1e-5) return 0;
  return Math.min(1, Math.max(0, (value - low) / (high - low)));
}
