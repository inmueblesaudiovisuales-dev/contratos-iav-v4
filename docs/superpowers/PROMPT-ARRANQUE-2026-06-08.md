# Prompt de arranque — pegar en el chat nuevo (2026-06-08)

> Copia y pega TODO lo que está dentro del bloque de abajo en la nueva sesión.

---

Vamos a continuar un proyecto que ya está avanzado, todo en GitHub. Repo
`inmueblesaudiovisuales-dev/contratos-iav-v4`, rama `checklist-cambios-2026-06-07` (NO main). Trabajamos solo sobre
GitHub: clona/actualiza la rama.

**Antes de tocar nada, lee el handoff completo:** `docs/superpowers/HANDOFF-2026-06-08.md`. Ahí está todo el estado,
las reglas duras, la API del motor, el sistema visual R1, los gotchas del flujo de verificación, y el detalle de lo
que sigue. Lee también los documentos que el handoff indica en su sección 3, en orden — sobre todo el spec y el plan
del rediseño de drone.

**La meta inmediata** es implementar el plan **`docs/superpowers/plans/2026-06-08-drone-rediseno-escalas-plan.md`
(fases F34–F36)** con el skill `build-from-plan`: una fase = un subagente builder + un commit + el gate (que TÚ
corres, no te fíes del resumen del builder) + verificación visual con Playwright en las fases de UI. Sin deploy a
producción; todo queda en la rama. Su spec es `docs/superpowers/specs/2026-06-08-drone-rediseno-escalas-design.md`
(ya aprobado por mí).

Resumen de lo que es ese rediseño: el **drone deja de ser un piso con pseudo-cuartos** y se vuelve una **lane por
escalas** (Propiedad / Amenidades / Inmediato / Ubicación). Propiedad y Amenidades **se derivan de los espacios
reales** que armé (si hay Alberca → "Alberca aérea", cada feature con sus tomas sugeridas), más tomas fijas (Salida
a contexto, Fachada/Órbita, Cenital giratorio). **Sin golden hour. Sin el híbrido** (drone solo en su lane). En
"Armar cuartos" solo queda un **interruptor "incluir drone"**. La fase F35 (migración) es la delicada: revierte el
drone-como-piso de F17/F18 **sin perder las tomas de drone del estado viejo** — exige tests de estado viejo.

Reglas duras (están detalladas en el handoff, no las rompas): rama nunca `main`; nunca `wrangler deploy` a
producción (sí los previews aislados); `worker/` intocable; export `version:1` intacto; `normalizeChecklistData`
retro-compatible; **no tocar `iav-metadata-app`** (todo eso es backlog diferido,
`docs/superpowers/backlog-app-metadatos.md`); sin emojis; español formal con acentos; áreas táctiles ≥44px y el
sistema visual R1 en toda UI nueva; **proponer antes de implementar** cualquier cambio visual y esperar mi OK.

Cuando termines fases de UI, redespliega el preview
(`cd worker && npx wrangler deploy -c wrangler.preview.toml`) y pásame la URL en texto plano. Estoy en el celular
con remote control: para revisar diseños usa capturas (con ruta absoluta) o mockups en workers.dev.

Ojo con dos gotchas del flujo (vienen en el handoff): (1) al verificar con Playwright tras editar, el navegador
puede correr el JS viejo por cache — fuerza recarga con un query param distinto (`...&cb=NNN`) y confirma con
`browser_evaluate`; (2) el gate marca falsos emojis en capturas `.png` — si lo único que "falla" es un PNG y el
código pasó, commitea las capturas aparte y empuja igual.

Antes de implementar, confírmame que entendiste el estado y el plan.

---

(Fin del bloque a pegar.)
