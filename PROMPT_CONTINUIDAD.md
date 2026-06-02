# Prompt de continuidad - contratos-iav-v4

> Este archivo existe para que cualquier sesión de Codex retome el proyecto sin depender de la computadora de Bruno.

## Qué es este repo

- Sistema de contratos de Inmuebles Audiovisuales
- Backend: Cloudflare Workers + D1
- Frontend: HTML, CSS y JavaScript puro
- Deploy: GitHub Actions a `main`
- Documento maestro: [MASTER_V4.md](./MASTER_V4.md)

## Cómo trabajar aquí

1. Leer primero [MASTER_V4.md](./MASTER_V4.md).
2. Revisar el estado actual de `main` y los archivos involucrados.
3. Hacer cambios pequeños y coherentes con las rondas previas.
4. Verificar que el flujo completo siga funcionando.
5. Actualizar [MASTER_V4.md](./MASTER_V4.md) con la nueva ronda.
6. Hacer `commit` descriptivo en español.
7. Hacer `push` directo a `main`.

## Reglas simples

- No usar emojis en archivos ni en interfaz.
- Mantener CSS mobile-first.
- Respetar las convenciones de DB y flujo ya documentadas.
- No tocar el adapter de Apps Script salvo que sea parte explícita de la tarea.
- No reescribir cosas viejas solo por limpieza si no aportan a la tarea actual.

## Qué debe hacer Codex cuando retome el proyecto

- Entender primero el objetivo del usuario.
- Leer [MASTER_V4.md](./MASTER_V4.md) antes de modificar nada.
- Trabajar sobre el repo clonado en la nube, no sobre la computadora de Bruno.
- Dejar todo documentado y listo para despliegue.

## Estado útil para recordar

- La ronda más reciente es R26.
- El repo ya tiene el picker de formato por propiedad.
- La próxima ronda debe documentarse como R27.
