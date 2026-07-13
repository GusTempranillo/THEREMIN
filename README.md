# Theremin Web 3 🎵 — visión por computador + Web Audio

Un **theremin virtual** que se toca con las manos en el aire. La webcam detecta
ambas manos en tiempo real (MediaPipe Tasks Vision); la **posición vertical** de
cada mano controla el **tono** y la **apertura de la pinza pulgar–índice**
controla el **volumen**. El sonido se sintetiza con la **Web Audio API** nativa,
buscando un timbre cálido y expresivo cercano a un theremin analógico.

- 🎥 **Vídeo 100% on-device.** Nunca se sube nada a ningún servidor.
- 🎚️ **Tono logarítmico continuo** (glissando auténtico) en 2 octavas por mano.
- 🎯 **Modo escala "afina al parar":** mientras mueves la mano el tono es libre;
  cuando te detienes, se atrae suavemente a la nota de la escala más cercana.
- 🔊 **Tres perfiles DSP:** RCA/Rockmore, RCA con Cabinet 1929 modelado y
  Ciencia ficción moderna.
- 🎙️ **Grabación SOLO audio** (WebM/Opus + descarga opcional en WAV).
- 🌌 **Hall amortiguada, eco y limitador de último recurso** con headroom.
- 🌑 Interfaz minimalista en modo oscuro.
- 🎛️ **Calibración por intérprete**, cámaras intercambiables y preferencias
  persistentes exclusivamente en `localStorage`.
- 🧪 **Entrenamiento y laboratorio creativo:** cents, estabilidad, vibrato,
  morph XY, drone y grabación/reproducción de gestos.

## Cómo funciona (controles)

| Acción | Efecto |
| --- | --- |
| Dúo: subir / bajar una mano | Cambia el **tono** (arriba = agudo) |
| Clásico histórico: acercar la derecha a la antena virtual | Sube el **tono** |
| Abrir / cerrar pinza pulgar–índice | Cambia el **volumen** |
| Mano **derecha** | Rango **agudo** (C4–C6) |
| Mano **izquierda** | Rango **grave** (C2–C4) |

- **Modo Dúo** (por defecto): cada mano es una voz independiente (tono + volumen).
- **Modo Clásico**: una sola voz. Mano derecha = tono; mano izquierda = volumen
  según su altura. La extensión y dirección se eligen en Configuración
  interpretativa.
- **Escala**: **Libre** (por defecto) · Cromática · Pentatónica · Mayor · menor,
  con **tónica** seleccionable (Do por defecto).
- **Sonido**:
  - **Clásico — RCA/Rockmore:** banco de ondas interpoladas por registro;
    grave rico tipo cello, medio vocal y agudo progresivamente sinusoidal.
    No añade vibrato automático.
  - **RCA + Cabinet 1929:** la misma voz mediante un modelo de amplificador,
    altavoz electrodinámico y caja. Es una aproximación DSP hasta disponer de
    una respuesta al impulso medida de un RCA 106 real.
  - **Ciencia ficción moderna:** pulso redondeado brillante, vibrato retardado,
    hall con pre-delay y eco amortiguado.
  - **Órbita prismática:** perfil experimental con espectro hueco, quinta y
    octava flotantes, modulación tímbrica lenta y eco musical. Permanece
    afinable y sensible a la dinámica de las manos.

### Configuración interpretativa

El modo Clásico ofrece perfiles de ejecución independientes del timbre:

- **RCA 1929:** Si2–Fa6, aproximadamente 3,5 octavas, control horizontal tipo
  antena, 14 ms de suavizado de tono y 55 ms de respuesta de volumen. El límite
  superior sigue la especificación RCA de aproximadamente 1400 Hz; el inferior
  se deriva de la extensión documentada.
- **Rockmore:** Do2–Do7, cinco octavas, control horizontal, 10 ms de suavizado y
  18 ms de volumen para permitir articulación rápida.
- **Webcam cómoda:** Do3–Do6, tres octavas, control vertical y más suavizado.
- **Personalizado:** frecuencias mínima/máxima, eje del tono y tiempos de
  respuesta configurables. La extensión puede aumentarse o reducirse en pasos
  de media octava mediante deslizador o botones −/+; el límite superior se
  recalcula conservando la frecuencia mínima. El panel muestra notas, octavas
  reales y valida el rango.

Los extremos exactos del instrumento personal de Clara Rockmore dependían de
su afinación; Do2–Do7 es una normalización musical de sus cinco octavas, no una
afirmación de que estuviera permanentemente ajustado a esas dos notas.

## Probar en local

La webcam requiere un **contexto seguro**. `localhost` cuenta como seguro, así
que basta con servir la carpeta por HTTP:

```bash
# Opción A — Python 3 (incluido en la mayoría de sistemas)
python -m http.server 8000

# Opción B — Node
npx serve .
```

Luego abre **http://localhost:8000**, pulsa **EMPEZAR** y concede el permiso de
cámara. Verás el vídeo espejado con el overlay de landmarks y oirás las voces.

> ⚠️ Abrir el `index.html` con doble clic (`file://`) **no** funciona: los módulos
> ES y `getUserMedia` necesitan servirse por `http://localhost` o `https://`.

## Stack

- **HTML5 + CSS3 + JavaScript Vanilla** con módulos ES. Sin frameworks, sin
  bundler, sin paso de build.
- **Visión:** [`@mediapipe/tasks-vision`](https://www.npmjs.com/package/@mediapipe/tasks-vision)
  `0.10.35` (clase `HandLandmarker`), cargado desde CDN (jsDelivr) con la versión
  fijada. El modelo `hand_landmarker.task` (float16) se descarga de
  `storage.googleapis.com/mediapipe-models`.
- **Audio:** Web Audio API nativa; el grafo DSP se construye a mano (sin Tone.js).
- **Sin `node_modules`** para desplegar: todo va por CDN.

### Estructura

```
/
├── index.html
├── styles.css
├── README.md
└── src/
    ├── config.js        # constantes ajustables (el "tacto" del instrumento)
    ├── main.js          # orquesta todo
    ├── handTracking.js  # HandLandmarker + bucle de detección
    ├── oneEuro.js       # filtro One Euro (suavizado de entrada)
    ├── mapping.js       # landmarks → frecuencia (log) y volumen (pinza)
    ├── scale.js         # escalas + afinación "afina al parar"
    ├── thereminVoice.js # wavetables por registro, vibrato y VCA
    ├── theremin-worklet.js # fuente aditiva AudioWorklet band-limited
    ├── audioEngine.js   # mezcla, Cabinet 1929, hall, eco y salida
    ├── settings.js      # preferencias y calibración local
    ├── recorder.js      # grabación de audio + export WAV
    └── ui.js            # overlay, lecturas, barras, controles
```

## Qué aporta THEREMIN3

THEREMIN3 combina la interfaz y las funciones musicales de THEREMIN2 con el
motor DSP y la robustez de tracking de la primera versión:

- fallback automático GPU → CPU para MediaPipe;
- timestamps monotónicos y detección sincronizada con frames de vídeo;
- asignación por posición en pantalla, independiente de la interpretación de
  handedness de cada cámara;
- seis wavetables RCA/Rockmore con crossfade equal-power por registro;
- fuente Sci-Fi band-limited y saturación asimétrica sobremuestreada;
- Cabinet 1929 modelado como etapa de salida independiente;
- carga opcional de una IR de cabinet medida por el usuario;
- vibrato en cents, filtros formantes, hall, eco y limitador de seguridad;
- modo Dúo, modo Clásico, escalas, afinación suave y grabación sólo de audio.

## Calibración y sesión

El asistente captura grave/agudo con la mano derecha y silencio/forte con la
izquierda. Los límites espaciales se guardan localmente. La cabecera permite
cambiar de cámara, detener y reiniciar liberando stream, landmarker,
osciladores, grabador y `AudioContext`. La asociación temporal de palmas reduce
el intercambio de roles cuando las manos se cruzan.

## Herramientas creativas y pedagógicas

- Entrenamiento: desviación en cents, estabilidad y frecuencia de vibrato.
- Laboratorio XY: morph continuo hacia Órbita prismática y apertura de espacio.
- Drone: congela la frecuencia conservando la articulación de volumen.
- Gestos: captura pitch/volumen/preset a 30 Hz, reproduce y exporta JSON.
- Cabinet: toggle independiente y carga de archivos IR de audio.

## Verificación

```bash
npm run check
npm test
```

El `AudioWorklet` es la ruta preferida; si el navegador no puede cargarlo, el
motor vuelve automáticamente al banco de `OscillatorNode`.

La configuración local de Claude está excluida mediante `.gitignore` y no debe
subirse al repositorio.

Los valores de síntesis y de "tacto" (vibrato, glide, umbrales de la escala,
parámetros del One Euro, etc.) están centralizados en
[`src/config.js`](src/config.js) para afinarlos a oído sin tocar la lógica.

## Desplegar en Cloudflare Pages

La app es **100% estática**, así que el despliegue es directo. HTTPS es
obligatorio para que `getUserMedia` funcione en producción (Cloudflare Pages lo
da automáticamente).

1. Sube este repositorio a GitHub.
2. En el panel de Cloudflare → **Workers & Pages** → **Create application** →
   **Pages** → **Connect to Git**, y elige el repo.
3. Configuración de build:
   - **Framework preset:** `None`
   - **Build command:** *(vacío)*
   - **Build output directory:** `/` (la raíz del repo)
4. **Deploy.** Obtendrás una URL pública con HTTPS donde la webcam funciona.

> No hay paso de build ni variables de entorno. Cualquier hosting de estáticos con
> HTTPS (GitHub Pages, Netlify, Vercel) sirve igual.

## Privacidad

🔒 **El vídeo se procesa en tu dispositivo y nunca se sube a ningún servidor.**
La detección de manos corre localmente en el navegador (WASM/GPU). La grabación
captura **únicamente el audio sintetizado**: nunca se graba ni la webcam ni el
vídeo.

## Compatibilidad

- Navegadores modernos con WebGL/WASM y Web Audio (Chrome, Edge, Firefox,
  Safari recientes). El delegate de MediaPipe usa GPU cuando está disponible.
- La grabación usa `MediaRecorder`; si el navegador no soporta un códec de audio
  adecuado, el botón de grabar se desactiva con un mensaje.
- En móvil, si el navegador soporta la **Web Share API** para archivos, aparece
  un botón **Compartir** junto a la descarga.
