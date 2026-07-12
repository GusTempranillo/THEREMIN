// =============================================================================
// oneEuro.js — Filtro "1€" (One Euro) — Casiez, Roussel & Vogel (2012)
// =============================================================================
// Suaviza una señal ruidosa con poca latencia: filtra fuerte cuando la señal
// está casi quieta (mata el temblor al sostener una nota) y deja pasar el
// movimiento rápido con poco retardo. Sin dependencias.
//
// Uso:
//   const f = new OneEuroFilter({ minCutoff: 1.0, beta: 0.01, dCutoff: 1.0 });
//   const y = f.filter(rawValue, timestampSeconds);
// =============================================================================

// Filtro paso-bajo exponencial de un polo con alfa variable.
class LowPassFilter {
  constructor() {
    this.hatXPrev = null; // último valor filtrado
    this.initialized = false;
  }

  filter(x, alpha) {
    const hatX = this.initialized ? alpha * x + (1 - alpha) * this.hatXPrev : x;
    this.hatXPrev = hatX;
    this.initialized = true;
    return hatX;
  }

  reset() {
    this.hatXPrev = null;
    this.initialized = false;
  }
}

// Convierte una frecuencia de corte (Hz) y un periodo de muestreo (s) en alfa.
function smoothingAlpha(cutoff, dt) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

export class OneEuroFilter {
  constructor({ minCutoff = 1.0, beta = 0.0, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff; // corte mínimo (a velocidad baja => muy suave)
    this.beta = beta;           // ganancia de velocidad (sube el corte al moverse)
    this.dCutoff = dCutoff;     // corte del filtro de la derivada
    this.xFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter();
    this.tPrev = null;
  }

  // value: muestra cruda. timestamp: segundos (p. ej. performance.now()/1000).
  filter(value, timestamp) {
    if (this.tPrev != null && timestamp > this.tPrev) {
      const dt = timestamp - this.tPrev;
      this.tPrev = timestamp;

      // Estimación de la derivada, filtrada con corte fijo dCutoff.
      const dxRaw = (value - (this.xFilter.hatXPrev ?? value)) / dt;
      const edx = this.dxFilter.filter(dxRaw, smoothingAlpha(this.dCutoff, dt));

      // Corte adaptativo: cuanto más rápido cambia, mayor el corte (menos suavizado).
      const cutoff = this.minCutoff + this.beta * Math.abs(edx);
      return this.xFilter.filter(value, smoothingAlpha(cutoff, dt));
    }

    // Primera muestra (o reloj sin avanzar): inicializa sin filtrar.
    this.tPrev = timestamp;
    this.dxFilter.filter(0, 1);
    return this.xFilter.filter(value, 1);
  }

  reset() {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.tPrev = null;
  }
}
