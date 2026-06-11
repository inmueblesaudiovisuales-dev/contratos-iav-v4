# Pantalla de inicio, sugerencias de nombre, marca de vlog y rangos a mano — diseño

Fecha: 2026-06-11. Toca dos repos: `contratos-iav-v4` (checklist, origen del dato) e
`iav-metadata-app` (app de bajar material, consumidor del dato).

## Objetivo

Que el checklist configure mejor el trabajo desde el arranque y registre mejor lo que se grabó, para
que el archivo de datos (JSON exportado) salga más completo, sin romper la compatibilidad existente.

Fuente de verdad de los formatos de archivo:
`iav-metadata-app/docs/superpowers/2026-06-10-estructuras-tarjetas.md` (muestras reales). Los formatos
de abajo están verificados contra ese documento.

Regla de diseño visual transversal: **toda UI nueva debe verse y comportarse igual que el resto de
`checklist.html`** (su mismo lenguaje visual, componentes y CSS; mobile-first). No inventar un estilo
nuevo.

---

## Mejora 1 — Pantalla de inicio del trabajo (checklist.html) [pieza central]

Una sola pantalla de arranque al abrir un trabajo (estilo "Opción A": todo a la vista, con scroll).
Reemplaza el arranque actual (el selector de rol discreto pasa a vivir aquí). Estructura:

1. **Saludo + folio + cliente/fecha** (folio prominente).
2. **¿Quién eres?** — roles: **Video, Fotografía, 360**. (El drone va DENTRO de Video; el asesor NO
   es rol.) **Cualquiera de los tres puede configurar el trabajo.**
3. **Enlace "Saltar configuración y entrar"** — entra directo al rol sin tocar la configuración (para
   cuando ya está configurada o no te toca configurar).
4. **Bloque de configuración del trabajo** (se puede saltar; reabrible después):
   - **Tipo de propiedad** (Casa / Depto / Terreno / etc.) — reusa `state.guide.tipoPropiedad`.
   - **Servicios de este trabajo** — Video, Foto, 360, Drone, Asesor; cada uno activable/desactivable.
     Al apagar uno, desaparece del checklist; reactivable cuando se necesite. Reusa `state.servicios`,
     `setServiceActive` y los filtros existentes (`if (!state.servicios[...])` ya respetados en cuartos,
     cámaras y estados). Revive la pantalla "Servicios activos" que hoy existe pero quedó sin acceso.
   - **Switch "¿Estás grabando con tu Osmo Action?"** — material personal de Bruno (vlog), NO del
     cliente. Ver Mejora 3.
5. **Botón "Empezar".**

Comportamiento de persistencia:
- La configuración se hace **una vez** y queda guardada en el trabajo (estado compartido en la DB).
- Si se abre el checklist en **otro dispositivo / otra persona** y ya está configurado, la pantalla
  **no obliga**: se puede saltar (entrar directo al rol). Sigue siendo **reconfigurable** por cualquiera
  de los tres roles.

Reusos verificados (no reimplementar): `state.servicios` + `setServiceActive` + filtros por servicio;
`state.guide.tipoPropiedad` + `PROPERTY_FOCUS`; el selector de rol actual (`renderRoleSelect`/`roleReady`)
se integra/!reemplaza por esta pantalla; la pantalla muerta `abrirServicios` se reaprovecha.

Decisión abierta (resolver en el plan): cómo se marca "ya está configurado" para decidir si la pantalla
aparece o se ofrece saltarla (candidato: una bandera en el estado tipo `configurado: true` al pulsar
"Empezar").

## Mejora 2 — Sugerencias de nombre por cámara (checklist.html)

Hoy `sugerenciaNombre(camera, fecha)` solo sugiere para `kind === 'sony'`
(`YYYYMMDD_<PREFIJO><NNNN>`, prefijo desde `camera.counterExample`, fecha desde el folio vía
`fechaDeFolio`). Se extiende a todas las cámaras. La parte predecible va lista; la hora (que solo
conoce la cámara al grabar) queda como hueco visible. El número arranca en `0001`, editable.

| Cámara (kind) | Sugerencia | Hueco | Ancho número |
|---|---|---|---|
| Sony video / FX30 (`sony`) | `YYYYMMDD_<PREFIJO>0001` | — | 4 |
| Osmo Pocket 3 y drones (`dji`) | `DJI_YYYYMMDD______0001_D` | hora HHMMSS (6) | 4 |
| Insta360 | `IMG_YYYYMMDD______00_001` | hora HHMMSS (6) | 3 |
| Audio / Tascam (`tascam`) | `YYMMDD_0001` | — | 4 |

Detalles:
- **Fecha** desde el folio (`fechaDeFolio`, ya existe). Audio usa **año de 2 dígitos** (`YYMMDD`); el
  resto, 4 (`YYYYMMDD`).
- **Prefijo Sony** desde `camera.counterExample` (`prefijoSony`, ya existe). Los demás fijos por formato.
- **Hueco** = marcador visible (p. ej. seis `_`) donde el operador escribe la hora leída de la cámara.
  La sugerencia es una plantilla editable, no un nombre final pegable de corrido.
- `sugerenciaNombre` enruta por `camera.kind` (y por cámara para Insta360). Default conservador:
  string vacío si no hay formato conocido.

> Insta360 no existe hoy en `CAMERA_DEFAULTS`. Decisión abierta (plan): agregarla como cámara
> registrable o solo como formato de sugerencia.

## Mejora 3 — Marca de vlog de Osmo Action (checklist.html + JSON)

El switch de la pantalla de inicio (Mejora 1) guarda en el estado y se exporta en `buildExport` como
campo **aditivo**: `vlogOsmoAction: boolean`.

- Material personal de Bruno, NO del cliente. Sin nombre ni rango (se selecciona a mano al bajar).
  Pensado para juntar a futuro todos los vlogs en una SSD aparte.
- **NO se sube la versión del JSON** (sigue `version: 2`). Aditivo: la app que valida `version <= 2` lo
  acepta y, si no lo conoce, lo ignora. Subir a 3 rompería la app actual (`SUPPORTED_VERSION = 2`).

## Mejora 4 — Rango a mano después de grabar (checklist.html)

- **Foto y 360:** ya existe (`rangosManuales`, `camarasRangoManual()`, `renderRangosManuales`).
  Confirmar (no asumir) que esté visible y funcionando en la app real.
- **Video y drone:** extender `camarasRangoManual()` para incluirlos, con copy de "red de seguridad".
  Precedencia ya existente en `buildExport`: si hay tomas con token, esas mandan; el rango a mano solo
  entra cuando NO hay tomas. No cambia la estructura del JSON (usa `grabaciones[]`).

## Mejora 5 — La app lee y muestra la marca de vlog (iav-metadata-app)

- Añadir `vlogOsmoAction?: boolean` al tipo `Bitacora` (`src/engine/types.ts`), aditivo (igual que se
  hizo con `token?`). `loadBitacora` ya conserva campos extra.
- Mostrar (opción B de Bruno): un **aviso** en la vista del trabajo ("Este trabajo incluye vlog de Osmo
  Action — personal") **y** un ítem en el **inventario de material** del trabajo, marcado como personal /
  se baja a mano.
- Visión futura (NO se construye ahora): la app contribuirá de vuelta a la base de datos; capturar la
  info de forma estructurada para no estorbar esa dirección.

---

## Compatibilidad y despliegue

- JSON: se mantiene `version: 2`. Cambio aditivo (`vlogOsmoAction`). App vieja y nueva conviven.
- `contratos-iav-v4`: el push a `main` despliega a producción (GitHub Actions). Verificación visual del
  checklist antes de soltar (la pantalla de inicio, las sugerencias y la marca son UI sin pruebas
  automáticas). Lógica pura nueva (formatos de nombre, fecha) sí va con `node --test`.
- `iav-metadata-app`: cambios en rama de trabajo; merge local a `master`; push cuando Bruno lo pida.

## Decisiones abiertas (para el plan)

1. Cómo se marca "trabajo ya configurado" para decidir aparecer/saltar la pantalla de inicio.
2. Insta360: ¿cámara registrable o solo formato de sugerencia?
3. Confirmar que el apartado de rangos foto/360 está hoy visible y funcionando.
4. `counterExample`/sufijo exacto de Osmo Pocket 3 (sigue patrón DJI; validar al implementar si difiere).
5. Encaje exacto del selector de rol actual dentro de la nueva pantalla (integrar vs reemplazar).
