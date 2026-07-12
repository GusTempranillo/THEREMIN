# Instrucciones de agentes

Las instrucciones completas para trabajar en este proyecto están en
[`agents.md`](agents.md). También debe leerse [`HANDOFF.md`](HANDOFF.md) antes
de modificar código.

Resumen obligatorio:

- revisar el código real antes de cambiarlo;
- conservar la separación tracking → mapeo → audio → UI;
- mantener GPU/CPU fallback, timestamps crecientes y automatización Web Audio;
- no subir secretos, `.claude/`, grabaciones ni configuraciones privadas;
- ejecutar `node --check` sobre los módulos antes de entregar;
- probar cámara, audio, tracking y grabación en `localhost` y HTTPS;
- no usar `git push --force` salvo petición explícita.
