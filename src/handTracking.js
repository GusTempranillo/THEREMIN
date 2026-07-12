// =============================================================================
// handTracking.js — MediaPipe Tasks Vision (HandLandmarker) + bucle de detección
// =============================================================================
// Carga el HandLandmarker desde CDN (versión fijada), abre la webcam y emite,
// por cada frame, las dos manos detectadas ya etiquetadas como "izquierda" /
// "derecha" REALES del usuario (corrigiendo la lateralidad por el espejado).
// =============================================================================

// NOTA: la URL del módulo debe ser un literal de cadena estático (los import
// estáticos no admiten variables). La versión 0.10.35 está fijada también en
// config.js (MEDIAPIPE_VERSION); mantener ambas sincronizadas.
const MEDIAPIPE_VERSION = "0.10.35";
const MP_BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;

import { WASM_BASE_URL, HAND_MODEL_URL } from "./config.js";

// Índices de landmarks que forman la palma (para el centroide estable del tono).
const PALM_LANDMARKS = [0, 5, 9, 13, 17];

export class HandTracking {
  constructor(videoEl) {
    this.video = videoEl;
    this.landmarker = null;
    this.stream = null;
    this.running = false;
    this._rafId = null;
    this._lastVideoTime = -1;
    this._lastTimestamp = 0;
    this.onResults = null; // callback(framePayload)
  }

  // Crea el HandLandmarker (descarga WASM + modelo). Llamar una sola vez.
  async init() {
    const { FilesetResolver, HandLandmarker } = await import(MP_BUNDLE);
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
    const options = {
      baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: "GPU" },
      numHands: 2,
      runningMode: "VIDEO",
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    };
    try {
      this.landmarker = await HandLandmarker.createFromOptions(vision, options);
    } catch (gpuError) {
      console.warn("GPU no disponible; usando CPU", gpuError);
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: "CPU" },
      });
    }
  }

  // Pide la cámara y empieza a reproducir el vídeo (sin audio).
  async startCamera() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    // Espera a tener dimensiones reales antes de procesar.
    if (!this.video.videoWidth) {
      await new Promise((res) => {
        this.video.onloadedmetadata = () => res();
      });
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._loop();
  }

  stop() {
    this.running = false;
    if (this._rafId != null) {
      if (this.video.cancelVideoFrameCallback && this._usingRVFC) {
        this.video.cancelVideoFrameCallback(this._rafId);
      } else {
        cancelAnimationFrame(this._rafId);
      }
      this._rafId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }

  // Bucle de detección: usa requestVideoFrameCallback si está disponible
  // (sincronizado con frames de vídeo reales) y si no requestAnimationFrame.
  _loop() {
    const useRVFC = typeof this.video.requestVideoFrameCallback === "function";
    this._usingRVFC = useRVFC;

    const tick = () => {
      if (!this.running) return;
      this._processFrame();
      this._rafId = useRVFC
        ? this.video.requestVideoFrameCallback(tick)
        : requestAnimationFrame(tick);
    };

    this._rafId = useRVFC
      ? this.video.requestVideoFrameCallback(tick)
      : requestAnimationFrame(tick);
  }

  _processFrame() {
    if (!this.landmarker || this.video.readyState < 2) return;

    // Evita procesar el mismo frame dos veces (rVFC ya lo garantiza, rAF no).
    if (this.video.currentTime === this._lastVideoTime) return;
    this._lastVideoTime = this.video.currentTime;

    let result;
    try {
      let timestamp = performance.now();
      if (timestamp <= this._lastTimestamp) timestamp = this._lastTimestamp + 1;
      this._lastTimestamp = timestamp;
      result = this.landmarker.detectForVideo(this.video, timestamp);
    } catch (err) {
      // Un frame ocasional puede fallar si el GPU pipeline aún no está listo.
      return;
    }

    const hands = this._interpretHands(result);
    if (this.onResults) this.onResults(hands);
  }

  // Devuelve { left, right } donde cada uno es null o un objeto con landmarks,
  // centroide de palma y score. La lateralidad se INVIERTE respecto a MediaPipe
  // porque el feed está espejado (selfie): así la mano derecha REAL del usuario
  // controla el rango agudo.
  _interpretHands(result) {
    const out = { left: null, right: null };
    if (!result || !result.landmarks) return out;

    const detected = [];
    for (let i = 0; i < result.landmarks.length; i++) {
      const landmarks = result.landmarks[i];
      const handedness = result.handednesses?.[i]?.[0];

      const palm = this._palmCentroid(landmarks);
      const payload = {
        landmarks,
        palm,
        score: handedness?.score ?? 1,
      };

      detected.push(payload);
    }
    detected.sort((a, b) => a.palm.x - b.palm.x);
    if (detected.length === 1) {
      // x menor aparece a la derecha de la pantalla tras el espejo CSS.
      out[detected[0].palm.x < 0.5 ? "right" : "left"] = detected[0];
    } else if (detected.length >= 2) {
      // No se pierde una mano aunque ambas estén en la misma mitad del frame.
      out.right = detected[0];
      out.left = detected[detected.length - 1];
    }
    return out;
  }

  _palmCentroid(landmarks) {
    let x = 0, y = 0;
    for (const idx of PALM_LANDMARKS) {
      x += landmarks[idx].x;
      y += landmarks[idx].y;
    }
    return { x: x / PALM_LANDMARKS.length, y: y / PALM_LANDMARKS.length };
  }
}
