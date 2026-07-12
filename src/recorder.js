// =============================================================================
// recorder.js — Grabación SOLO de audio (MediaRecorder) + export a WAV
// =============================================================================
// Graba el stream del MediaStreamDestination de la mezcla maestra. Nunca toca
// la webcam: solo el audio sintetizado. Produce WebM/Opus y, opcionalmente,
// recodifica a WAV (PCM 16-bit) decodificando el WebM y re-muestreando vía
// OfflineAudioContext.
// =============================================================================

// Devuelve el primer mimeType de audio soportado, o null si no hay soporte.
export function pickAudioMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

export class AudioRecorder {
  constructor(stream) {
    this.stream = stream;
    this.mimeType = pickAudioMimeType();
    this.supported = this.mimeType != null;
    this.recorder = null;
    this.chunks = [];
    this.startTime = 0;
    this.lastBlob = null;
  }

  isSupported() {
    return this.supported;
  }

  start() {
    if (!this.supported) throw new Error("MediaRecorder no soportado");
    this.chunks = [];
    this.lastBlob = null;
    this.recorder = new MediaRecorder(this.stream, { mimeType: this.mimeType });
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(100); // recolecta en trozos de 100 ms
    this.startTime = performance.now();
  }

  // Resuelve con el Blob grabado (WebM/Opus) al detener.
  stop() {
    return new Promise((resolve) => {
      if (!this.recorder || this.recorder.state === "inactive") {
        resolve(null);
        return;
      }
      this.recorder.onstop = () => {
        this.lastBlob = new Blob(this.chunks, { type: this.mimeType });
        resolve(this.lastBlob);
      };
      this.recorder.stop();
    });
  }

  elapsedSeconds() {
    return this.recorder && this.recorder.state === "recording"
      ? (performance.now() - this.startTime) / 1000
      : 0;
  }
}

// --- Conversión a WAV --------------------------------------------------------
// Decodifica el blob grabado a PCM y lo codifica como WAV 16-bit. Usa el mismo
// AudioContext para decodificar (no añade dependencias).
export async function blobToWav(blob, audioCtx) {
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  return encodeWav(audioBuffer);
}

function encodeWav(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const numFrames = audioBuffer.length;

  // Entrelaza los canales.
  const channels = [];
  for (let c = 0; c < numChannels; c++) channels.push(audioBuffer.getChannelData(c));

  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  // Cabecera RIFF/WAVE.
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);          // tamaño del subchunk fmt
  view.setUint16(20, 1, true);           // formato PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true);      // bits por muestra
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // Muestras PCM 16-bit entrelazadas.
  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      let s = Math.max(-1, Math.min(1, channels[c][i]));
      s = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(offset, s, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: "audio/wav" });
}
