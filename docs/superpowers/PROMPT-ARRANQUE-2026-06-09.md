# Prompt de arranque — sesión LOCAL (Playwright) para pulir "Armar cuartos"

Copia/pega esto como primer mensaje en la sesión local de Claude Code (corriendo dentro del repo
`contratos-iav-v4`, con Playwright disponible).

---

Estás en el repo contratos-iav-v4. Vamos a pulir la pantalla "Armar cuartos" del checklist y a verificar
VISUALMENTE con Playwright (esto es lo que la sesión anterior, remota y sin navegador, no pudo hacer).

PRIMERO lee, en este orden y completos:
1. `CLAUDE.md` (reglas del repo).
2. `docs/superpowers/HANDOFF-2026-06-09-armar-cuartos.md` (handoff exhaustivo y MÁS RECIENTE; ignora handoffs
   anteriores para este tema). Contiene contexto, mapa del código, causas raíz de los bugs, comandos y metas.
3. El mockup aprobado (verdad visual): `worker/mock-armar-cuartos/index.html`.

Trabaja SOLO en la rama `checklist-cambios-2026-06-07` (haz checkout + `git pull`). NUNCA `main`, NUNCA deploy a
producción (sí al preview aislado). Archivos de este trabajo: `frontend/checklist.html`,
`frontend/checklist-logic.js` y, para los iconos, `frontend/assets/`. No toques `worker/` ni `iav-metadata-app`.

OBJETIVO: que "Armar cuartos" (versión consolidada, una sola pantalla por piso con steppers) se vea y funcione
como el mockup aprobado, fácil de entender y de picar. Arregla los BUGS en este orden (detalle y causas raíz en
el handoff, sección 4):

1. Al agregar el primer cuarto te saca a "Capturar". Causa: `showSetup = setupOpen || !state.espacios.length`
   en `render()`; al crear el primer espacio `setupOpen` sigue false y la vista se va. Fix: mantener `setupOpen`
   true mientras se arma (cerrar solo con "Listo, a capturar").
2. Cuadro tintado vacío en cada fila: faltan los iconos. Causa: la app usa un Tabler SUBSET local
   (`frontend/assets/tabler-icons*.woff2` + `tabler-icons.css`) que NO trae los glifos nuevos (ti-sofa, ti-cup,
   ti-bed, etc.). Fix recomendado: regenerar el subset incluyendo TODOS los iconos usados. Verifica VISUALMENTE
   que ya no haya cuadros vacíos (que el glifo exista en el woff2, no solo la clase en el CSS).
3. El botón "−" se ve feo/inconsistente con el "+": hazlo un UI consistente con el "+" (mismo estilo, con −).
   Mira `.cs-sb` / `.cs-sb.add` y el mockup.
4. Verifica en casa de 1 piso que la Planta baja sí sugiere Recámara (defaultVisible ya la incluye).

USO DE PLAYWRIGHT: levanta la app (ver handoff sección 6: estática con `?demo=1`, o `wrangler dev`), entra como
Bruno a "Armar cuartos", y toma capturas antes/después de cada fix. No declares nada "listo" sin verlo.

SKILLS: usa `superpowers:systematic-debugging` (causa raíz antes de parchar), `superpowers:verification-before-completion`
(evidencia: comandos + capturas), y el gate del repo. Si cambias diseño (no solo bugs), usa `superpowers:brainstorming`
primero.

VERIFICACIÓN antes de dar por terminado (handoff sección 7):
- `node --test frontend/checklist-logic.test.js` → 227 pass.
- Compilación inline de checklist.html OK (comando en el handoff).
- Gate (después de commitear): `bash .claude/skills/build-from-plan/phase-gate.sh "frontend/checklist.html" "version: 1" "normalizeChecklistData"` → PASA.
- Playwright: capturas mostrando los 3 bugs resueltos y la pantalla viéndose como el mockup, sin cuadros vacíos.

Commit por cambio (continúa numeración Fxx, p. ej. F50…), push a `checklist-cambios-2026-06-07`. Para que Bruno
lo vea en el celular: `cd worker && npx wrangler deploy -c wrangler.preview.toml` (preview aislado, NO producción)
y comparte la URL `https://contratos-iav-v4-preview.inmueblesaudiovisuales.workers.dev/checklist?demo=1&cb=N`.

Nota de estilo al chatear con Bruno: sin asteriscos de markdown; sin emojis en el producto; español con acentos
en texto visible.
---
