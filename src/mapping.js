// =============================================================================
// mapping.js — landmarks → frecuencia (log) y volumen (pinza)
// =============================================================================
// Convierte la señal cruda de una mano en frecuencia y volumen. Mantiene el
// estado de suavizado (One Euro) por mano y el cálculo de velocidad vertical
// (necesario para el modo escala "afina al parar").
// =============================================================================

import { OneEuroFilter } from "./oneEuro.js";
import { ONE_EURO, PITCH_RANGE, VOLUME } from "./config.js";

const clamp01 = (v) => Math.min(1, Math.max(0, v));

function dist2D(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

// Estado de mapeo de una mano (uno por "left"/"right" o por la voz clásica).
export class HandMapper {
  // rangeKey: "left" | "right" | "classic"
  constructor(rangeKey) {
    this.range = PITCH_RANGE[rangeKey];
    this.minFrequency = this.range.fBase;
    this.maxFrequency = this.range.fBase * Math.pow(2, this.range.octaves);
    this.inputLow = 0;
    this.inputHigh = 1;
    this.yFilter = new OneEuroFilter(ONE_EURO.position);
    this.apertureFilter = new OneEuroFilter(ONE_EURO.aperture);
    this.velFilter = new OneEuroFilter({ minCutoff: 2.5, beta: 0.0, dCutoff: 1.0 });
    this._prevYNorm = null;
    this._prevT = null;
  }

  reset() {
    this.yFilter.reset();
    this.apertureFilter.reset();
    this.velFilter.reset();
    this._prevYNorm = null;
    this._prevT = null;
  }

  // Configura en caliente la extensión vertical usada por el tono. En cámara,
  // arriba (Y pequeña) es agudo y abajo (Y grande) es grave.
  setPitchConfig({
    minHz,
    maxHz,
    inputLow = this.inputLow,
    inputHigh = this.inputHigh,
  }) {
    if (!Number.isFinite(minHz) || !Number.isFinite(maxHz) || minHz <= 0 || maxHz <= minHz) {
      throw new RangeError("El rango de tono debe cumplir 0 < mínimo < máximo.");
    }
    this.minFrequency = minHz;
    this.maxFrequency = maxHz;
    this.inputLow = Number.isFinite(inputLow) ? inputLow : 0;
    this.inputHigh = Number.isFinite(inputHigh) && Math.abs(inputHigh - this.inputLow) > 1e-4
      ? inputHigh
      : 1;
    this.reset();
  }

  // hand: { landmarks, palm }. tSeconds: marca de tiempo en segundos.
  // Devuelve { frequency, volume, yNorm, velocity }.
  process(hand, tSeconds) {
    // --- Tono: altura de la palma; nunca se cuantiza en modo Libre -----------
    const positionRaw = hand.palm.y;
    const positionFiltered = this.yFilter.filter(positionRaw, tSeconds);
    const pitchCoordinate = 1 - positionFiltered;
    const pitchNorm = clamp01(
      (pitchCoordinate - this.inputLow) / (this.inputHigh - this.inputLow)
    );
    const frequency = this.minFrequency
      * Math.pow(this.maxFrequency / this.minFrequency, pitchNorm);

    // --- Volumen: pinza pulgar(4)–índice(8) normalizada por escala de mano(0-9) ---
    const pinch = dist2D(hand.landmarks[4], hand.landmarks[8]);
    const handScale = dist2D(hand.landmarks[0], hand.landmarks[9]) || 1e-6;
    const ratioRaw = pinch / handScale;
    const ratioFiltered = this.apertureFilter.filter(ratioRaw, tSeconds);
    const norm = clamp01(
      (ratioFiltered - VOLUME.closedRatio) / (VOLUME.openRatio - VOLUME.closedRatio)
    );
    const volume = Math.pow(norm, VOLUME.curve); // curva perceptual v^1.3

    // --- Velocidad en el eje de tono, para el modo escala -------------------
    let velocity = 0;
    if (this._prevYNorm != null && this._prevT != null && tSeconds > this._prevT) {
      const dt = tSeconds - this._prevT;
      const rawVel = Math.abs(pitchNorm - this._prevYNorm) / dt;
      velocity = this.velFilter.filter(rawVel, tSeconds);
    } else {
      this.velFilter.filter(0, tSeconds);
    }
    this._prevYNorm = pitchNorm;
    this._prevT = tSeconds;

    return {
      frequency,
      volume,
      yNorm: pitchNorm,
      pitchNorm,
      velocity,
    };
  }
}
