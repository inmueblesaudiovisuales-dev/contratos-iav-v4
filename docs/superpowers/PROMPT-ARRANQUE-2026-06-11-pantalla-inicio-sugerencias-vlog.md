# Prompt de arranque — pantalla de inicio, sugerencias de nombre, vlog y rangos

> Pega esto para abrir la sesión de CONSTRUCCIÓN. El diseño y el plan ya están escritos.

---

## Contexto

Se trabaja SIEMPRE en las copias locales del disco (no "en GitHub"). GitHub es solo respaldo/publicación.

Dos repos, con sus rutas EXACTAS:
- **Checklist:** `/Users/brunogutierrez/contratos-iav-v4` — rama **`main`**. OJO: **push a `main` despliega
  a producción** (GitHub Actions). NO correr `wrangler deploy` a mano. Pruebas de lógica:
  `node --test frontend/checklist-logic.test.js`.
- **App de bajar material:** `/Users/brunogutierrez/iav-metadata-app` — rama de trabajo **`rediseno`**.
  **Merge local a `master`**, sin push salvo que Bruno lo pida. Gate:
  `npx tsc --noEmit && npx vitest run` (+ `npm run build:app` al tocar UI).

> CARPETA EQUIVOCADA — NO usar: existe una copia vieja del checklist en
> `/Users/brunogutierrez/Documents/CLAUDE/contratos-iav-v4` (rama del 5-jun, ~217 commits atrás). NO
> trabajar ahí. La única copia buena del checklist es `/Users/brunogutierrez/contratos-iav-v4`.

## ANTES DE EMPEZAR — verifica que trabajas en la copia correcta y al día (OBLIGATORIO)

No avances hasta confirmar las cuatro cosas, en CADA repo. Si algo falla, DETENTE y avísale a Bruno; no
intentes arreglarlo con `pull`/`reset` por tu cuenta.

1. **Carpeta correcta.** Estás en la ruta exacta de arriba (no en `Documents/CLAUDE/...` para el checklist).
   `pwd` debe coincidir.
2. **Rama correcta.** Checklist en `main`; app en `rediseno`. `git branch --show-current`.
3. **Al día con GitHub (no atrasado).** Corre:
   ```
   git fetch origin
   git rev-list --left-right --count origin/<rama>...HEAD
   ```
   El resultado es `DETRAS  ADELANTE`. **Si DETRAS > 0, DETENTE** — la copia local NO es la más actual
   (hay trabajo en GitHub que no tienes). Avísale a Bruno antes de hacer nada. `ADELANTE > 0` está bien
   (es trabajo local sin subir, p. ej. el spec/plan/prompt).
4. **Spec y plan presentes.** Confirma que existen en el checklist:
   `docs/superpowers/specs/2026-06-11-sugerencias-vlog-rangos-design.md` y
   `docs/superpowers/plans/2026-06-11-pantalla-inicio-sugerencias-vlog-rangos.md`. Si no están, estás en
   la carpeta o rama equivocada — DETENTE.

## Qué construir

Lee primero, en `contratos-iav-v4`:
- **Spec:** `docs/superpowers/specs/2026-06-11-sugerencias-vlog-rangos-design.md`
- **Plan (8 tareas, TDD donde aplica):** `docs/superpowers/plans/2026-06-11-pantalla-inicio-sugerencias-vlog-rangos.md`
- Referencia de formatos reales de archivo: `iav-metadata-app/docs/superpowers/2026-06-10-estructuras-tarjetas.md`

Cinco mejoras: (1) pantalla de inicio del trabajo; (2) sugerencias de nombre por cámara; (3) marca de
vlog de Osmo Action; (4) rango a mano para video/drone; (5) la app lee y muestra la marca de vlog.

## Cómo ejecutar

- Usa **superpowers:subagent-driven-development** (un subagente por tarea, revisión entre tareas) o
  **executing-plans**. Sigue el plan tarea por tarea.
- **TDD donde hay lógica pura** (Tasks 1, 3, y los helpers de Task 5): prueba que falla → implementación
  mínima → prueba verde. Las tareas de UI (Tasks 2, 4, 6, 8) se cierran con **verificación visual** (no
  hay test de estilos).
- **Gate por tarea antes de cada commit:**
  - Checklist (lógica): `node --test frontend/checklist-logic.test.js` verde.
  - App: `npx tsc --noEmit && npx vitest run` (+ `npm run build:app` si tocaste UI).
- **Commits descriptivos por tarea, sin push.** El push/despliegue lo decide Bruno al final.

## Reglas (obligatorias)

1. **NUNCA asumir: verificar en el código.** Antes de tocar, confirmar los nombres/ids reales
   (`ROLE_DEF`/`ROLE_ORDER`, ids de servicios, setter de `tipoPropiedad`, apartado de rangos foto/360).
   Si no lo verificaste tú, no lo afirmes.
2. **Diseño idéntico al checklist.** Toda UI nueva reusa las variables CSS (`--ink-1/2/3`, `--gold`,
   `--gold-soft`, `--card`, `--line`) y las fuentes (`--font-ui` Inter, `--font-display` Fraunces,
   `--font-mono` Spline Sans Mono) y las clases existentes (`.role-opt`, `.btn`, `.primary`, `.label`,
   `.action-stack`). **Prohibido** introducir colores o tipografías nuevos. Los hex de los bocetos del
   visor eran solo ilustrativos.
3. **JSON aditivo, NO subir versión.** `vlogOsmoAction` se suma a `version: 2`. Subir a 3 rompería la app
   (`SUPPORTED_VERSION = 2`).
4. **Español formal con acentos** en texto visible; identificadores/carpetas sin acentos; **sin emojis**.
5. **Mobile-first**, como el resto del checklist.
6. Regla del adapter de `contratos-iav-v4` NO aplica aquí (no se toca `adapter/`).

## Verificación

- La que puede hacer la sesión: `node --test`, `tsc`, `vitest`, `build:app` verdes. Lo visual NO lo valida
  la máquina (jsdom no ve estilos).
- La que valida **Bruno** en la app/checklist real (criterios de aceptación, ver "Cierre" del plan):
  pantalla de inicio (rol, tipo de propiedad, servicios que se quitan/activan, switch de vlog, saltar,
  reabrir); sugerencias de nombre por cámara con hueco de hora; rango a mano video/drone; el JSON trae
  `vlogOsmoAction`; la app muestra el aviso + el ítem de inventario; **colores y tipografía idénticos**.

## Despliegue (lo hace la sesión, cuando Bruno apruebe — Bruno no lo hace a mano)

- `contratos-iav-v4`: `git push origin main` despliega a producción. **Antes de empujar, confirmar con
  Bruno qué entra:** hoy `main` ya trae commits previos sin empujar (sugerencias de nombre Sony + docs +
  el merge del handoff de portafolio). Verificar `git log origin/main..main` y avisar.
- `iav-metadata-app`: merge local a `master`; push solo si Bruno lo pide.

## Cuando termines

Deja todo verde, resume qué se construyó y corre el guion de verificación con Bruno. No empujes nada sin
su visto bueno.
