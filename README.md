# Theremin Web 3 🎵 — visión por computador + Web Audio

Un **theremin virtual** que se toca con las manos en el aire. La webcam detecta
ambas manos en tiempo real (MediaPipe Tasks Vision); la **posición vertical** de
cada mano controla el **tono** y la **apertura de la pinza pulgar–índice**
controla el **volumen**. El sonido se sintetiza con la **Web Audio API** nativa,
buscando un timbre cálido y expresivo cercano a un theremin analógico.

- 🎥 **Vídeo 100% on-device.** Nunca se sube nada a ningún servidor.
- 🎚️ **Tono logarítmico continuo**: cada frame de cámara se interpola a
  frecuencia de audio, sin sample-and-hold ni peldaños en escala Libre.
- 🎯 **Modo escala "afina al parar":** mientras mueves la mano el tono es libre;
  cuando te detienes, se atrae suavemente a la nota de la escala más cercana.
- 🔊 **Cinco perfiles DSP:** RCA, Rockmore de concierto, RCA con Cabinet 1929,
  Ciencia ficción moderna y Órbita prismática.
- 🎙️ **Grabación SOLO audio** (WebM/Opus + descarga opcional en WAV).
- 🌌 **Hall amortiguada, eco y limitador de último recurso** con headroom.
- 🌑 Interfaz minimalista en modo oscuro.
- 🎛️ **Calibración por intérprete**, cámaras intercambiables y preferencias
  persistentes exclusivamente en `localStorage`.
- 🧪 **Entrenamiento y laboratorio creativo:** cents, estabilidad, vibrato,
  morph XY, drone y grabación/reproducción de gestos.
- 📚 **Biblioteca interactiva integrada:** manual de usuario, historia documentada
  y especificación técnica con buscador, índices internos, cronología, laboratorios
  y enlaces a fuentes.

## Cómo funciona (controles)

| Acción | Efecto |
| --- | --- |
| Dúo: subir / bajar una mano | Cambia el **tono** (arriba = agudo) |
| Clásico: subir / bajar la mano derecha | Recorre el **tono continuo** (arriba = agudo) |
| Abrir / cerrar pinza pulgar–índice | Cambia el **volumen** |
| Mano **derecha** | Rango **agudo** (C4–C6) |
| Mano **izquierda** | Rango **grave** (C2–C4) |

- **Modo Clásico** (por defecto): una sola voz. Mano derecha = tono vertical;
  mano izquierda = volumen según su altura. La dirección no se configura:
  arriba siempre es agudo y abajo siempre es grave.
- **Modo Dúo**: cada mano es una voz independiente (tono + volumen).
- **Escala**: **Libre** (por defecto) · Cromática · Pentatónica · Mayor · menor,
  con **tónica** seleccionable (Do por defecto).
- **Sonido**:
  - **Theremin clásico de concierto — Rockmore** (por defecto): perfil vocal,
    cabinet de época, vibrato exclusivamente manual y sala discreta sin eco.
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

- **Concierto completo** (por defecto): Do1–Do7, seis octavas medidas en el RCA
  modificado de Clara Rockmore después de su restauración. Incluye los extremos
  medibles; Do2–Do7 sigue siendo el tramo de concierto más estable.
- **RCA 1929:** Si2–Fa6, aproximadamente 3,5 octavas, 14 ms de inercia de tono
  y 55 ms de respuesta de volumen. El límite
  superior sigue la especificación RCA de aproximadamente 1400 Hz; el inferior
  se deriva de la extensión documentada.
- **Rockmore estable:** Do2–Do7, cinco octavas utilizables, 10 ms de inercia y
  18 ms de volumen para permitir articulación rápida.
- **Webcam cómoda:** Do3–Do6, tres octavas y más suavizado.
- **Personalizado:** frecuencias mínima/máxima y tiempos de respuesta
  configurables. La extensión puede aumentarse o reducirse en pasos
  de media octava mediante deslizador o botones −/+; el límite superior se
  recalcula conservando la frecuencia mínima. El panel muestra notas, octavas
  reales y valida el rango.

La interpolación que une fotogramas no se puede desactivar: garantiza la
continuidad. El control **Inercia** sólo añade portamento expresivo por encima
del mínimo adaptativo necesario para cubrir la cadencia real de la cámara.

Do1 (32,7 Hz) puede no reproducirse como fundamental en altavoces de portátil o
móvil; el motor conserva sus armónicos en vez de inventar un refuerzo subgrave.
Los extremos medibles del instrumento real podían derivar, por eso el panel
mantiene también el perfil Rockmore estable de cinco octavas.

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

## Documentación interactiva

Dentro de **Configuración interpretativa** hay tres accesos que se abren en una
pestaña nueva para no interrumpir la sesión de cámara/audio:

- [`docs/manual.html`](docs/manual.html): preparación, controles, calibración,
  técnica, práctica, experimentación, grabación y diagnóstico.
- [`docs/historia.html`](docs/historia.html): cronología filtrable desde Termen y
  RCA hasta la era digital y el salto conceptual a Theremin Web, con fuentes.
- [`docs/especificaciones.html`](docs/especificaciones.html): arquitectura,
  tracking, ecuaciones, DSP, registros, equivalencias, efectos, privacidad,
  fallbacks y límites conocidos.

Las tres páginas funcionan sin JavaScript para lectura y enlaces. `docs.js`
añade búsqueda local, progreso, navegación activa, filtros, pestañas y pequeños
laboratorios. No cargan fuentes, imágenes ni scripts de terceros.

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
├── docs/
│   ├── manual.html
│   ├── historia.html
│   ├── especificaciones.html
│   ├── docs.css
│   └── docs.js
└── src/
    ├── config.js        # constantes ajustables (el "tacto" del instrumento)
    ├── main.js          # orquesta todo
    ├── handTracking.js  # HandLandmarker + bucle de detección
    ├── oneEuro.js       # filtro One Euro (suavizado de entrada)
    ├── mapping.js       # landmarks → frecuencia (log) y volumen (pinza)
    ├── pitchTrajectory.js # rampas audio-rate entre frames de cámara
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
- interpolación exponencial por `AudioParam`, lineal en octavas/cents, que
  cubre adaptativamente el intervalo de cada frame;
- asignación por posición en pantalla, independiente de la interpretación de
  handedness de cada cámara;
- siete wavetables RCA/Rockmore (Do1–Do7) con crossfade por registro;
- fuente Sci-Fi band-limited y saturación asimétrica sobremuestreada;
- Cabinet 1929 modelado como etapa de salida independiente;
- carga opcional de una IR de cabinet medida por el usuario;
- vibrato en cents, filtros formantes, hall, eco y limitador de seguridad;
- modo Dúo, modo Clásico, escalas, afinación suave y grabación sólo de audio.

## Calibración y sesión

El asistente captura durante 340 ms y usa la mediana de cada pose: grave/agudo
con la mano derecha y silencio/forte con la izquierda. Para rangos amplios
exige un recorrido vertical suficiente, evitando comprimir seis octavas en unos
pocos píxeles. Los límites espaciales se guardan localmente. La cabecera permite
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

## Desplegar en Vercel

La app es **100% estática** y ya incluye `vercel.json`. HTTPS es obligatorio
para `getUserMedia` y Vercel lo proporciona automáticamente.

1. Sube este repositorio a GitHub.
2. Conecta el repositorio en Vercel con **Framework preset: Other/None** y sin
   comando de build.
3. Cada `git push origin main` desplegará automáticamente
   `https://theremin-web.vercel.app/` si la integración sigue activa.

> No hay paso de build ni variables de entorno. Cualquier hosting de estáticos con
> HTTPS (GitHub Pages, Netlify, Vercel) sirve igual.

## Referencias históricas

- [RCA Theremin Service Notes (1929)](https://www.rcatheremin.com/servicenotes.php)
- [Biografía oficial de Clara Rockmore](https://nadiareisenberg-clararockmore.org/clara-rockmore-biography/)
- [Informe técnico del RCA de Clara Rockmore](https://www.rcatheremin.com/documents/Clara_RCA_Report.pdf)
- [Formas de onda y evolución tímbrica del RCA](https://www.rcatheremin.com/tone.php)

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
