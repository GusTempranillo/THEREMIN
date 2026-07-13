// =============================================================================
// settings.js — preferencias y calibración local (nunca salen del dispositivo)
// =============================================================================

const STORAGE_KEY = "theremin-web:settings:v5";
const LEGACY_STORAGE_KEYS = ["theremin-web:settings:v4"];

export const DEFAULT_SETTINGS = Object.freeze({
  soundPreset: "rockmore",
  performancePreset: "concertFull",
  mode: "classic",
  scale: "free",
  tonicPc: 0,
  reverb: 0.12,
  pitch: {
    minHz: 32.70319566,
    maxHz: 2093.004522,
    glideMs: 10,
    volumeResponseMs: 18,
    inputLow: 0,
    inputHigh: 1,
  },
  volumeCalibration: { silent: 0, loud: 1 },
  trainingEnabled: false,
  cameraDeviceId: "",
  cabinetEnabled: true,
});

function mergeDefaults(saved = {}) {
  const { axis: _legacyAxis, ...savedPitch } = saved.pitch ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    pitch: { ...DEFAULT_SETTINGS.pitch, ...savedPitch },
    volumeCalibration: {
      ...DEFAULT_SETTINGS.volumeCalibration,
      ...(saved.volumeCalibration ?? {}),
    },
  };
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return mergeDefaults(JSON.parse(raw));

    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      const legacyRaw = localStorage.getItem(legacyKey);
      if (!legacyRaw) continue;
      const migrated = migrateLegacySettings(JSON.parse(legacyRaw));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      localStorage.removeItem(legacyKey);
      return migrated;
    }
    return mergeDefaults();
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
  try {
    localStorage.removeItem(STORAGE_KEY);
    LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch (_) { /* almacenamiento bloqueado */ }
  return mergeDefaults();
}

export function migrateLegacySettings(saved = {}) {
  const legacyPitch = saved?.pitch ?? {};
  const customRange = saved?.performancePreset === "custom"
    && Number.isFinite(legacyPitch.minHz)
    && Number.isFinite(legacyPitch.maxHz)
    && legacyPitch.minHz > 0
    && legacyPitch.maxHz > legacyPitch.minHz;
  const migratedOctaves = customRange
    ? Math.log2(legacyPitch.maxHz / legacyPitch.minHz)
    : 6;
  const requiredSpan = Math.min(0.55, Math.max(0.22, migratedOctaves * 0.075));
  const verticalCalibration = legacyPitch.axis === "y"
    && Number.isFinite(legacyPitch.inputLow)
    && Number.isFinite(legacyPitch.inputHigh)
    && Math.abs(legacyPitch.inputHigh - legacyPitch.inputLow) >= requiredSpan;

  // v4 permitía calibrar el tono sobre X. Esos límites no representan la
  // altura de cámara y se descartan. Se conservan cámara, entrenamiento y la
  // calibración independiente de volumen. Las frecuencias personalizadas se
  // conservan porque no dependen del eje; sus límites espaciales sólo migran
  // cuando ya eran verticales y suficientemente amplios.
  const migrated = {
    ...DEFAULT_SETTINGS,
    cameraDeviceId: typeof saved?.cameraDeviceId === "string" ? saved.cameraDeviceId : "",
    trainingEnabled: Boolean(saved?.trainingEnabled),
    volumeCalibration: {
      ...DEFAULT_SETTINGS.volumeCalibration,
      ...(saved?.volumeCalibration ?? {}),
    },
    pitch: {
      ...DEFAULT_SETTINGS.pitch,
      ...(verticalCalibration ? {
        inputLow: Number.isFinite(legacyPitch.inputLow)
          ? legacyPitch.inputLow : DEFAULT_SETTINGS.pitch.inputLow,
        inputHigh: Number.isFinite(legacyPitch.inputHigh)
          ? legacyPitch.inputHigh : DEFAULT_SETTINGS.pitch.inputHigh,
      } : {}),
      ...(customRange ? {
        minHz: Number.isFinite(legacyPitch.minHz)
          ? legacyPitch.minHz : DEFAULT_SETTINGS.pitch.minHz,
        maxHz: Number.isFinite(legacyPitch.maxHz)
          ? legacyPitch.maxHz : DEFAULT_SETTINGS.pitch.maxHz,
        glideMs: Number.isFinite(legacyPitch.glideMs)
          ? legacyPitch.glideMs : DEFAULT_SETTINGS.pitch.glideMs,
        volumeResponseMs: Number.isFinite(legacyPitch.volumeResponseMs)
          ? legacyPitch.volumeResponseMs : DEFAULT_SETTINGS.pitch.volumeResponseMs,
      } : {}),
    },
  };
  if (customRange) migrated.performancePreset = "custom";
  return mergeDefaults(migrated);
}

export function normalizeCalibrated(value, low, high) {
  if (![value, low, high].every(Number.isFinite) || Math.abs(high - low) < 1e-5) return 0;
  return Math.min(1, Math.max(0, (value - low) / (high - low)));
}
