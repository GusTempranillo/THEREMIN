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
- 🔊 **Sonido cálido:** vibrato con entrada retardada (0.55 s), 2.º oscilador de
  calidez, filtro paso-bajo y envolvente suave (sin clics).
- 🎙️ **Grabación SOLO audio** (WebM/Opus + descarga opcional en WAV).
- 🌌 **Reverb procedural y limitador** para una mezcla más cálida y segura.
- 🌑 Interfaz minimalista en modo oscuro.

## Cómo funciona (controles)

| Acción | Efecto |
| --- | --- |
| Subir / bajar una mano | Cambia el **tono** (arriba = agudo) |
| Abrir / cerrar pinza pulgar–índice | Cambia el **volumen** |
| Mano **derecha** | Rango **agudo** (C4–C6) |
| Mano **izquierda** | Rango **grave** (C2–C4) |

- **Modo Dúo** (por defecto): cada mano es una voz independiente (tono + volumen).
- **Modo Clásico**: una sola voz. Mano derecha = tono (C3–C6); mano izquierda =
  volumen según su altura. Más fiel al theremin real y más fácil de tocar.
- **Escala**: Libre · Cromática · **Pentatónica** (por defecto) · Mayor · menor,
  con **tónica** seleccionable (Do por defecto).
- **Onda**: senoidal (cálida) o triangular. Toggles para 2.º oscilador y filtro.

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
    ├── thereminVoice.js # grafo Web Audio por voz
    ├── audioEngine.js   # AudioContext, mezcla, gestión de voces
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
- seno, triángulo y segundo armónico con saturación suave sobremuestreada;
- vibrato en cents, filtro dinámico, reverb de convolución y limitador;
- modo Dúo, modo Clásico, escalas, afinación suave y grabación sólo de audio.

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
