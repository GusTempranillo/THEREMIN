# Handoff — THEREMIN3

## Objetivo

Continuar el desarrollo de `C:\CLAUDE\THEREMIN3`, una aplicación web estática que convierte el movimiento de las manos detectadas por webcam en un theremin de dos voces mediante MediaPipe Tasks Vision y Web Audio API.

El siguiente modelo debe revisar primero el código real de `src/` y conservar la separación entre tracking, mapeo, audio, grabación y UI.

## Estado actual

- Funciona localmente en `http://localhost:8000`.
- Está publicado en GitHub en `GusTempranillo/THEREMIN`, rama `main`.
- Está desplegado en Vercel; la URL inicial fue `https://theremin-web.vercel.app/`.
- Debe probarse todavía exhaustivamente en la URL HTTPS pública con webcam, MediaPipe, audio y grabación.
- No hay backend ni build: es HTML, CSS y JavaScript vanilla estático.

### Motor de sonido actualizado

- `Clásico — RCA/Rockmore`: seis `PeriodicWave` band-limited interpoladas por
  registro, saturación asimétrica, formantes suaves y pérdida progresiva de
  armónicos en agudos. No usa vibrato automático.
- `RCA + Cabinet 1929`: misma voz RCA mediante una ruta modelada de filtros,
  saturación y compresión de altavoz. Debe considerarse aproximación hasta
  sustituirla por una IR medida de un RCA 106 real.
- `Ciencia ficción moderna`: pulso redondeado brillante, vibrato automático
  retardado, hall amortiguada con pre-delay y eco con feedback filtrado.
- `Órbita prismática — experimental`: PeriodicWave de parciales discontinuos,
  quinta a 3:2, octava ligeramente ensanchada, modulación lenta de la quinta y
  eco a 243 ms. Es insólito pero conserva centro tonal y control dinámico.
- El cambio de fuente y cabinet usa crossfades mediante automatización de
  `AudioParam`; no se destruyen nodos mientras suenan.
- En modo Clásico con perfil RCA, la afinación es libre y la ausencia de la
  mano izquierda silencia la voz: no se usa la pinza derecha como fallback.
- El panel `Configuración interpretativa` separa timbre de extensión y tacto:
  RCA 1929 (Si2–Fa6, ≈3,5 oct), Rockmore (Do2–Do7, 5 oct), Webcam cómoda
  (Do3–Do6) y rango personalizado. También configura eje horizontal/vertical,
  glide de pitch y tiempo de respuesta de volumen. La extensión dispone de
  deslizador y botones −/+ en pasos de media octava; mantiene el grave y
  recalcula el límite agudo.
- Los overrides de respuesta sólo se aplican a la voz derecha en modo Clásico;
  al volver a Dúo, ambas voces recuperan los tiempos propios del preset sonoro.
- AudioWorklet aditivo como fuente preferida, con fallback automático al motor
  nativo existente.
- RCA y Rockmore son perfiles separados; Cabinet es independiente y acepta una
  IR externa mediante `decodeAudioData`.
- Calibración de cuatro poses, preferencias locales, selector de cámara,
  detener/reiniciar con liberación de recursos y asociación temporal de manos.
- Entrenamiento de cents/estabilidad/vibrato, laboratorio XY, drone y captura
  de gestos exportable a JSON.
- `npm test` cubre rangos, calibración y cruce de manos; `npm run check` valida
  la sintaxis de todos los módulos.

## Estructura

```text
THEREMIN3/
├── index.html
├── styles.css
├── README.md
├── HANDOFF.md
├── .gitignore
└── src/
    ├── main.js
    ├── handTracking.js
    ├── mapping.js
    ├── oneEuro.js
    ├── scale.js
    ├── thereminVoice.js
    ├── audioEngine.js
    ├── recorder.js
    ├── ui.js
    └── config.js
```

## Flujo de ejecución

1. El usuario pulsa `EMPEZAR`.
2. `main.js` crea `AudioEngine`, reanuda el `AudioContext`, crea voces y carga `HandTracking`.
3. `handTracking.js` carga MediaPipe, WASM y el modelo de manos desde CDN/Google Storage.
4. Se intenta GPU y se hace fallback a CPU si falla.
5. La webcam se procesa mediante `requestVideoFrameCallback` si existe y, si no, con `requestAnimationFrame`.
6. Las manos se asignan por posición horizontal sobre el vídeo original, que se muestra espejado: `x` menor → voz aguda; `x` mayor → voz grave.
7. `HandMapper` aplica One Euro a posición y apertura.
8. La altura se convierte en frecuencia logarítmica y la pinza pulgar–índice en amplitud.
9. `ScaleTuner` puede atraer suavemente el tono a una escala al detenerse.
10. `ThereminVoice` interpola el perfil espectral, aplica glide, saturación,
    formantes, vibrato según preset y VCA.
11. `AudioEngine` suma las voces, selecciona directo/Cabinet, añade hall y eco,
    limita sólo los picos accidentales y envía audio a altavoces y grabación.

## Funciones actuales

- Modo Dúo: cada mano controla una voz independiente.
- Modo Clásico: mano derecha controla tono y mano izquierda controla volumen.
- Rangos: izquierda C2–C4; derecha C4–C6.
- Escalas: Libre, Cromática, Pentatónica, Mayor y menor.
- Tónica seleccionable.
- Presets RCA/Rockmore, Cabinet 1929 y Ciencia ficción moderna.
- Reverb ajustable.
- Grabación sólo del audio sintetizado, nunca de la webcam.
- Exportación WebM/Opus y conversión opcional a WAV.
- Web Share API cuando está disponible.

## Decisiones técnicas

La asignación de manos se hace por posición y no por `handedness` de MediaPipe para evitar diferencias entre cámaras y espejado. Si hay dos manos, se ordenan por `palm.x` para no perder una aunque estén en la misma mitad del encuadre.

El tono es logarítmico en octavas. El volumen usa distancia pulgar–índice normalizada por la escala de la mano.

Grafo de cada voz RCA:

```text
6 × PeriodicWave por registro + crossfade equal-power
→ mezcla → WaveShaper asimétrico 4x → DC blocker
→ formantes → paso bajo dependiente del registro → VCA → bus
```

Grafo global:

```text
sumBus → directo ───────────────────────────┐
       → Cabinet 1929 modelado ─────────────┤
                                            ↓
                                       effectsBus
                         ├── dry ───────────┤
                         ├── hall ──────────┤→ limiter → master
                         └── echo feedback ─┘              ├── altavoces
                                                          └── grabación
```

## Riesgos y revisiones pendientes

1. Probar en Vercel que cámara, modelo, audio y grabación funcionan con HTTPS.
2. Comprobar en consola errores de CORS, red, WASM o descarga del modelo.
3. `HandTracking.stop()` debería cerrar explícitamente el landmarker si se añade una función de detener/reiniciar.
4. Los reintentos de arranque deben liberar streams, detectores y contextos parcialmente creados.
5. La latencia extremo a extremo todavía no se mide objetivamente.
6. La conversión WebM/Opus a WAV puede variar en Firefox y Safari.
7. La URL del bundle de MediaPipe podría centralizarse completamente en `config.js`.
8. Si se quiere identidad estable, hay que resolver el intercambio de roles al cruzarse las manos.

## Mejoras recomendadas

### Prioridad alta

- Añadir errores visibles para fallos de cámara, audio, MediaPipe y modelo.
- Añadir botón de detener/reiniciar que libere correctamente webcam, detector y AudioContext.
- Probar el despliegue público en Chrome, Edge, Firefox y Safari.
- Medir FPS, latencia y consumo de CPU/GPU.

### Prioridad media

- Calibración de apertura por usuario.
- Controles de vibrato, glide, volumen master y rangos.
- Persistencia de preferencias con `localStorage`.
- Mejoras responsive para móvil.
- Tests unitarios de `oneEuro.js`, `mapping.js` y `scale.js`.

### Prioridad baja

- Presets de sonido.
- Visualizador de espectro u osciloscopio.
- Releases GitHub con tags como `v3.0.0`.

## Ejecutar localmente

```powershell
cd C:\CLAUDE\THEREMIN3
python -m http.server 8000
```

Abrir `http://localhost:8000`. No abrir `index.html` directamente con `file://`.

## Actualizar producción

```powershell
cd C:\CLAUDE\THEREMIN3
git status
git add .
git commit -m "Describe the change"
git push origin main
```

Vercel debe desplegar automáticamente los nuevos commits de `main` si el proyecto sigue conectado al repositorio.

## Instrucción para el siguiente modelo

No rehacer el proyecto desde cero. THEREMIN3 es la versión híbrida de THEREMIN y THEREMIN2. Antes de modificar audio o tracking, revisar `src/audioEngine.js`, `src/thereminVoice.js`, `src/handTracking.js` y `src/main.js`, y conservar las decisiones descritas en este documento.
