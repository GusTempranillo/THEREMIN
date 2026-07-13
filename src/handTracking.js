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
    this.deviceId = "";
    this._tracks = { left: null, right: null };
    this.fps = 0;
    this._lastFrameClock = 0;
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
  async startCamera(deviceId = "") {
    if (this.stream) this.stream.getTracks().forEach((track) => track.stop());
    this.deviceId = deviceId || "";
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" }),
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 60, max: 60 },
      },
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

  async listCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === "videoinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Cámara ${index + 1}`,
      }));
  }

  async switchCamera(deviceId) {
    const wasRunning = this.running;
    this.stop(false);
    await this.startCamera(deviceId);
    this._lastVideoTime = -1;
    this._tracks = { left: null, right: null };
    if (wasRunning) this.start();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._loop();
  }

  stop(releaseStream = true) {
    this.running = false;
    if (this._rafId != null) {
      if (this.video.cancelVideoFrameCallback && this._usingRVFC) {
        this.video.cancelVideoFrameCallback(this._rafId);
      } else {
        cancelAnimationFrame(this._rafId);
      }
      this._rafId = null;
    }
    if (releaseStream && this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }

  close() {
    this.stop(true);
    try { this.landmarker?.close(); } catch (_) { /* API no disponible */ }
    this.landmarker = null;
    this._tracks = { left: null, right: null };
  }

  // Bucle de detección: usa requestVideoFrameCallback si está disponible
  // (sincronizado con frames de vídeo reales) y si no requestAnimationFrame.
  _loop() {
    const useRVFC = typeof this.video.requestVideoFrameCallback === "function";
    this._usingRVFC = useRVFC;

    const tick = (frameTimestampMs) => {
      if (!this.running) return;
      this._processFrame(frameTimestampMs);
      this._rafId = useRVFC
        ? this.video.requestVideoFrameCallback(tick)
        : requestAnimationFrame(tick);
    };

    this._rafId = useRVFC
      ? this.video.requestVideoFrameCallback(tick)
      : requestAnimationFrame(tick);
  }

  _processFrame(frameTimestampMs = performance.now()) {
    if (!this.landmarker || this.video.readyState < 2) return;

    // Evita procesar el mismo frame dos veces (rVFC ya lo garantiza, rAF no).
    if (this.video.currentTime === this._lastVideoTime) return;
    this._lastVideoTime = this.video.currentTime;
    const frameClock = Number.isFinite(frameTimestampMs)
      ? frameTimestampMs : performance.now();
    if (this._lastFrameClock) {
      const instantFps = 1000 / Math.max(1, frameClock - this._lastFrameClock);
      this.fps = this.fps ? this.fps * 0.9 + instantFps * 0.1 : instantFps;
    }
    this._lastFrameClock = frameClock;

    let result;
    let timestamp = frameClock;
    try {
      if (timestamp <= this._lastTimestamp) timestamp = this._lastTimestamp + 1;
      this._lastTimestamp = timestamp;
      result = this.landmarker.detectForVideo(this.video, timestamp);
    } catch (err) {
      // Un frame ocasional puede fallar si el GPU pipeline aún no está listo.
      if (this.onResults) {
        this.onResults(
          { left: null, right: null },
          { timestampSeconds: timestamp / 1000, inferenceError: true }
        );
      }
      return;
    }

    const hands = this._interpretHands(result);
    if (this.onResults) {
      this.onResults(hands, { timestampSeconds: timestamp / 1000 });
    }
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
        handedness: handedness?.categoryName ?? "Unknown",
      };

      detected.push(payload);
    }
    this._assignTrackedHands(detected, out);
    return out;
  }

  _assignTrackedHands(detected, out) {
    if (!detected.length) {
      for (const side of ["left", "right"]) {
        if (this._tracks[side]) this._tracks[side].missing++;
        if (this._tracks[side]?.missing > 12) this._tracks[side] = null;
      }
      return;
    }

    const distance = (hand, track) => {
      if (!track) return 1e6;
      const predictedX = track.x + track.vx;
      const predictedY = track.y + track.vy;
      return Math.hypot(hand.palm.x - predictedX, hand.palm.y - predictedY);
    };

    if (detected.length >= 2 && this._tracks.left && this._tracks.right) {
      const a = detected[0], b = detected[1];
      const direct = distance(a, this._tracks.left) + distance(b, this._tracks.right);
      const swapped = distance(a, this._tracks.right) + distance(b, this._tracks.left);
      if (direct <= swapped) { out.left = a; out.right = b; }
      else { out.left = b; out.right = a; }
    } else if (detected.length >= 2) {
      detected.sort((a, b) => a.palm.x - b.palm.x);
      out.right = detected[0];
      out.left = detected[detected.length - 1];
    } else {
      const hand = detected[0];
      const leftCost = distance(hand, this._tracks.left);
      const rightCost = distance(hand, this._tracks.right);
      let side;
      if (Math.min(leftCost, rightCost) < 0.32) side = leftCost <= rightCost ? "left" : "right";
      else side = hand.palm.x < 0.5 ? "right" : "left";
      out[side] = hand;
    }

    for (const side of ["left", "right"]) {
      const hand = out[side];
      if (!hand) {
        if (this._tracks[side]) this._tracks[side].missing++;
        continue;
      }
      const previous = this._tracks[side];
      this._tracks[side] = {
        x: hand.palm.x,
        y: hand.palm.y,
        vx: previous ? (hand.palm.x - previous.x) * 0.65 + previous.vx * 0.35 : 0,
        vy: previous ? (hand.palm.y - previous.y) * 0.65 + previous.vy * 0.35 : 0,
        missing: 0,
      };
    }
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
