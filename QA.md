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
3. Confirmar el arranque: Clásico, Libre, Rockmore, Cabinet activo, reverb 12 %
   y Concierto completo Do1–Do7.
4. Mover la derecha lentamente de abajo arriba en Libre: no deben oírse notas,
   mesetas, escalones ni cambios tímbricos discretos a 30 o 60 FPS.
5. Mover la mano horizontalmente a altura constante: el tono no debe cambiar.
6. Calibrar cuatro poses y comprobar que persisten tras recargar; para seis
   octavas debe rechazarse un recorrido vertical excesivamente corto.
7. Cruzar las manos varias veces sin intercambio de roles y tapar una mano
   durante un solo frame: no debe producir un salto ni un clic.
   Pausar o bloquear la pista de vídeo más de 260 ms: el sonido debe apagarse y
   reanudarse sin salto cuando vuelvan los fotogramas.
8. Probar RCA, Rockmore, Cabinet, Sci‑Fi y Órbita prismática.
9. Cambiar entre 1, 3,5, 5, 6 y 7 octavas; comprobar extremos y continuidad.
10. Probar Cromática, Pentatónica, Mayor y menor con el sonido Rockmore; Libre
    debe volver inmediatamente al tono exacto sin atracción.
11. Activar entrenamiento, XY, drone y reproducción de gestos.
12. Cambiar de cámara; detener y reiniciar tres veces.
13. Grabar 30 s, reproducir WebM, generar WAV y compartir en móvil.
14. Mantener una sesión de 10 min observando temperatura, CPU y deriva.

## Métricas objetivo

- Sin excepciones en consola.
- Sin clics al cambiar de preset/cabinet.
- Barrido Libre estrictamente monótono y sin sample-and-hold perceptible.
- Tracking estable ≥ 24 FPS en móvil medio y ≥ 30 FPS en escritorio.
- Latencia `baseLatency + outputLatency` registrada; objetivo cableado < 50 ms.
- Sin streams de cámara activos después de Detener.
