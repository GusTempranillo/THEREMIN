// =============================================================================
// scale.js — Escalas musicales + afinación "afina al parar"
// =============================================================================
// Define las escalas, convierte frecuencia ↔ nota y aplica la atracción suave
// hacia la nota de la escala más cercana SÓLO cuando la mano se detiene. La
// interpolación se hace en el exponente (espacio musical), no en Hz, para que la
// transición no tenga saltos.
// =============================================================================

import { NOTE_NAMES_ES, A4_FREQ, A4_MIDI, SCALE_TUNE } from "./config.js";

// Intervalos (en semitonos desde la tónica) de cada escala.
export const SCALES = {
  free:       null, // sin afinación (theremin puro)
  chromatic:  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  pentatonic: [0, 2, 4, 7, 9],          // pentatónica mayor
  major:      [0, 2, 4, 5, 7, 9, 11],
  minor:      [0, 2, 3, 5, 7, 8, 10],   // menor natural
};

export const SCALE_LABELS = {
  free: "Libre",
  chromatic: "Cromática",
  pentatonic: "Pentatónica",
  major: "Mayor",
  minor: "menor",
};

// --- Conversión frecuencia ↔ MIDI ↔ nota -------------------------------------
export function freqToMidi(freq) {
  return A4_MIDI + 12 * Math.log2(freq / A4_FREQ);
}
export function midiToFreq(midi) {
  return A4_FREQ * Math.pow(2, (midi - A4_MIDI) / 12);
}

// Nombre de nota en español + octava a partir de una frecuencia.
export function freqToNoteName(freq) {
  const midi = Math.round(freqToMidi(freq));
  const name = NOTE_NAMES_ES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1; // MIDI 12 => C0 (Do0)
  return `${name}${octave}`;
}

// MIDI (puede ser fraccionario) de la nota de la escala más cercana.
// tonicPc: pitch-class de la tónica (0=Do, 1=Do#, ...).
function nearestScaleMidi(freq, scaleIntervals, tonicPc) {
  const midi = freqToMidi(freq);
  let best = null;
  let bestDist = Infinity;
  // Busca en las octavas vecinas a la nota continua.
  const baseOct = Math.floor(midi / 12);
  for (let oct = baseOct - 1; oct <= baseOct + 1; oct++) {
    for (const interval of scaleIntervals) {
      const candidate = oct * 12 + tonicPc + interval;
      const d = Math.abs(candidate - midi);
      if (d < bestDist) {
        bestDist = d;
        best = candidate;
      }
    }
  }
  return best;
}

// Gestiona el factor de mezcla s con histéresis (no parpadea en el umbral).
export class ScaleTuner {
  constructor() {
    this.s = 0; // 0 = libre, 1 = pegado a la nota
  }

  reset() {
    this.s = 0;
  }

  // freqContinua: frecuencia libre (glissando). velocity: |Δy|/Δt suavizada.
  // scaleKey: clave de SCALES. tonicPc: 0..11. dt: segundos desde el frame previo.
  apply(freqContinua, velocity, scaleKey, tonicPc, dt) {
    const intervals = SCALES[scaleKey];
    if (!intervals) {
      this.s = 0;
      return freqContinua; // modo Libre
    }

    // Mapea velocidad → objetivo de s in [0,1] (rápido => 0, lento => 1).
    const { velFree, velFull, attractTimeConstant } = SCALE_TUNE;
    let target;
    if (velocity >= velFree) target = 0;
    else if (velocity <= velFull) target = 1;
    else target = (velFree - velocity) / (velFree - velFull);

    // Suavizado exponencial del propio s (histéresis temporal).
    const alpha = dt > 0 ? 1 - Math.exp(-dt / attractTimeConstant) : 1;
    this.s += (target - this.s) * alpha;

    if (this.s < 1e-4) return freqContinua;

    // Interpola en el EXPONENTE: freqOut = freqCont * (freqEscala/freqCont)^s.
    const targetMidi = nearestScaleMidi(freqContinua, intervals, tonicPc);
    const freqEscala = midiToFreq(targetMidi);
    return freqContinua * Math.pow(freqEscala / freqContinua, this.s);
  }
}
