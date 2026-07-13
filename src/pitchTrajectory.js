// =============================================================================
// pitchTrajectory.js — puente continuo entre cámara discreta y Web Audio
// =============================================================================
// La cámara entrega posiciones a 30/60 Hz. Cada muestra se convierte en una
// rampa exponencial (lineal en octavas/cents) que ocupa el intervalo previsto
// hasta el siguiente frame. Así no hay tramos de sample-and-hold perceptibles.
// =============================================================================

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const scheduledTrajectories = new WeakMap();

function trajectoryValueAt(state, time) {
  if (!state) return null;
  if (time <= state.startTime) return state.startValue;
  if (state.mode === "target") {
    return state.targetValue
      + (state.startValue - state.targetValue)
        * Math.exp(-(time - state.startTime) / state.timeConstant);
  }
  if (time >= state.endTime) return state.targetValue;
  const progress = (time - state.startTime) / (state.endTime - state.startTime);
  return state.startValue * Math.pow(state.targetValue / state.startValue, progress);
}

export function updateFrameIntervalEstimate(previousSeconds, observedSeconds) {
  const previous = Number.isFinite(previousSeconds) && previousSeconds > 0
    ? clamp(previousSeconds, 1 / 120, 1 / 12)
    : 1 / 30;
  if (!Number.isFinite(observedSeconds) || observedSeconds <= 0) return previous;
  const observed = clamp(observedSeconds, 1 / 120, 1 / 12);
  // Sube de inmediato ante un frame perdido; desciende despacio cuando vuelve
  // la cadencia normal. Así una oscilación 60→30 FPS no deja una meseta.
  return observed >= previous
    ? observed
    : previous * 0.94 + observed * 0.06;
}

export function continuousPitchTransition(configuredSeconds, controlIntervalSeconds) {
  const expressiveGlide = Number.isFinite(configuredSeconds)
    ? clamp(configuredSeconds, 0.003, 0.15)
    : 0.010;
  const frameInterval = Number.isFinite(controlIntervalSeconds) && controlIntervalSeconds > 0
    ? clamp(controlIntervalSeconds, 1 / 120, 1 / 12)
    : 1 / 30;

  // El pequeño solape absorbe el jitter de inferencia sin convertir el control
  // en un portamento lento. El tope de 80 ms también cubre cámaras a 15 FPS.
  const cameraBridge = clamp(frameInterval * 1.15, 0.012, 0.080);
  return Math.max(expressiveGlide, cameraBridge);
}

export function scheduleContinuousFrequency(
  audioParam,
  target,
  now,
  transitionSeconds,
  immediate = false
) {
  if (!audioParam || !Number.isFinite(target) || target <= 0 || !Number.isFinite(now)) return;

  if (immediate) {
    audioParam.cancelScheduledValues(now);
    audioParam.setValueAtTime(target, now);
    scheduledTrajectories.set(audioParam, {
      startTime: now,
      endTime: now,
      startValue: target,
      targetValue: target,
      mode: "constant",
    });
    return;
  }

  const duration = clamp(Number(transitionSeconds) || 0.012, 0.003, 0.15);
  const previous = scheduledTrajectories.get(audioParam);
  const heldValue = Math.max(
    1e-6,
    (trajectoryValueAt(previous, now) ?? Number(audioParam.value)) || target
  );
  let nextState = {
    startTime: now,
    endTime: now + duration,
    startValue: heldValue,
    targetValue: target,
    mode: "ramp",
  };
  if (
    typeof audioParam.cancelAndHoldAtTime === "function"
    && typeof audioParam.exponentialRampToValueAtTime === "function"
  ) {
    // cancelAndHold conserva el valor exacto que estaba sonando en mitad de una
    // rampa; la siguiente trayectoria empieza ahí, sin discontinuidad C0.
    audioParam.cancelAndHoldAtTime(now);
    audioParam.exponentialRampToValueAtTime(target, now + duration);
  } else {
    // Safari/WebViews antiguos: reconstruimos el valor que debía estar sonando
    // en este instante antes de cancelar la rampa. Nunca volvemos al valor
    // intrínseco antiguo del AudioParam.
    audioParam.cancelScheduledValues(now);
    audioParam.setValueAtTime(heldValue, now);
    if (typeof audioParam.exponentialRampToValueAtTime === "function") {
      audioParam.exponentialRampToValueAtTime(target, now + duration);
    } else {
      const timeConstant = Math.max(0.003, duration / 3);
      audioParam.setTargetAtTime(target, now, timeConstant);
      nextState = {
        startTime: now,
        endTime: Infinity,
        startValue: heldValue,
        targetValue: target,
        timeConstant,
        mode: "target",
      };
    }
  }
  scheduledTrajectories.set(audioParam, nextState);
}
