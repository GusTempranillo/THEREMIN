# QA de producción — Theremin Web 3

## Matriz mínima

| Plataforma | Navegador | Cámara | Audio | Tracking | Grabación | WAV | Reinicio |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Windows | Chrome | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Windows | Edge | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Windows | Firefox | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| macOS | Safari | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| iPhone/iPad | Safari | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Android | Chrome | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

## Recorrido

1. Abrir la URL HTTPS en una ventana privada y conceder cámara.
2. Verificar GPU o fallback CPU sin errores visibles.
3. Calibrar cuatro poses y comprobar que persisten tras recargar.
4. Cruzar las manos varias veces sin intercambio de roles.
5. Probar RCA, Rockmore, Cabinet, Sci‑Fi y Órbita prismática.
6. Cambiar entre 1, 3,5, 5 y 7 octavas; comprobar extremos y ausencia de saltos.
7. Activar entrenamiento, XY, drone y reproducción de gestos.
8. Cambiar de cámara; detener y reiniciar tres veces.
9. Grabar 30 s, reproducir WebM, generar WAV y compartir en móvil.
10. Mantener una sesión de 10 min observando temperatura, CPU y deriva.

## Métricas objetivo

- Sin excepciones en consola.
- Sin clics al cambiar de preset/cabinet.
- Tracking estable ≥ 24 FPS en móvil medio y ≥ 30 FPS en escritorio.
- Latencia `baseLatency + outputLatency` registrada; objetivo cableado < 50 ms.
- Sin streams de cámara activos después de Detener.
