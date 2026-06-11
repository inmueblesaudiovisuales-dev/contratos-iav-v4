# Sugerencias de nombre por cámara, marca de vlog y rangos a mano — diseño

Fecha: 2026-06-11. Toca dos repos: `contratos-iav-v4` (checklist, origen del dato) e
`iav-metadata-app` (app de bajar material, consumidor del dato).

## Objetivo

Que el checklist registre mejor lo que se grabó y que el archivo de datos (JSON exportado) salga
más completo, sin romper la compatibilidad existente. Tres mejoras en el checklist + una en la app.

Fuente de verdad de los formatos: `iav-metadata-app/docs/superpowers/2026-06-10-estructuras-tarjetas.md`
(muestras reales de tarjetas). Los formatos de abajo están verificados contra ese documento.

---

## Mejora 1 — Sugerencias de nombre por cámara (checklist.html)

Hoy `sugerenciaNombre(camera, fecha)` solo sugiere para `kind === 'sony'`
(`YYYYMMDD_<PREFIJO><NNNN>`, prefijo desde `camera.counterExample`, fecha desde el folio vía
`fechaDeFolio`). Se extiende a todas las cámaras, cada una con su formato real. La parte predecible
va lista; la hora (que solo conoce la cámara al grabar) queda como hueco visible. El número arranca
en `0001` y queda editable/seleccionado.

Formatos por `kind` / cámara:

| Cámara (kind) | Sugerencia | Hueco | Ancho número |
|---|---|---|---|
| Sony video / FX30 (`sony`) | `YYYYMMDD_<PREFIJO>0001` | — | 4 |
| Osmo Pocket 3 y drones (`dji`) | `DJI_YYYYMMDD______0001_D` | hora HHMMSS (6) | 4 |
| Insta360 (nuevo, ver Mejora 2 nota) | `IMG_YYYYMMDD______00_001` | hora HHMMSS (6) | 3 |
| Audio / Tascam (`tascam`) | `YYMMDD_0001` | — | 4 |

Detalles:
- **Fecha** desde el folio (`fechaDeFolio`, ya existe). Audio usa **año de 2 dígitos** (`YYMMDD`);
  el resto, 4 dígitos (`YYYYMMDD`).
- **Prefijo Sony** desde `camera.counterExample` (`prefijoSony`, ya existe). Los demás son fijos por
  formato (`DJI_`, `IMG_`).
- **Hueco** = marcador visible (p. ej. seis `_`) donde el operador escribe la hora leída de la cámara.
- El hueco hace que la sugerencia NO sea un nombre final pegable de corrido: es una plantilla. El
  campo sigue siendo editable como hoy.
- `sugerenciaNombre` deja de asumir Sony: enruta por `camera.kind` (y por cámara para Insta360).
  Default conservador: si no hay formato conocido, string vacío (como hoy las no-Sony).

## Mejora 2 — Marca de vlog de Osmo Action (checklist.html + JSON)

Casilla en el checklist: **"Incluye vlog de Osmo Action (personal)"**. Es material personal de Bruno,
NO del cliente; no se registra toma por toma ni con rango (se selecciona a mano al bajar). Pensado
para juntar a futuro todos los vlogs en una SSD aparte.

- Se guarda en el estado y se exporta en `buildExport` como un campo **aditivo**:
  `vlogOsmoAction: true|false` (solo se emite `true`, o se omite cuando es falso, a definir en el plan;
  preferible emitir siempre el booleano para que la app lo lea directo).
- **NO se sube la versión del JSON** (sigue `version: 2`). El campo es aditivo: la app que valida
  `version <= 2` lo acepta y, si no lo conoce, lo ignora. Subir a 3 rompería la app actual
  (`SUPPORTED_VERSION = 2`), así que se evita.
- Ubicación de la casilla en la UI: a proponer en el plan (candidato: junto a la selección de
  servicios/cámaras o en el apartado de rangos). Requiere validación visual de Bruno.

> Nota Insta360: la cámara Insta360 NO existe hoy en `CAMERA_DEFAULTS`. Para darle sugerencia de
> nombre (Mejora 1) hay que agregarla como cámara. Confirmar en el plan si se agrega como cámara
> registrable o solo como formato de sugerencia. El Osmo Action tampoco existe como cámara; para la
> marca de vlog NO se necesita agregarlo como cámara (es solo una casilla/bandera).

## Mejora 3 — Rango a mano después de grabar (checklist.html)

- **Foto y 360:** ya existe (`rangosManuales`, `camarasRangoManual()`, `renderRangosManuales`,
  apartado "Rangos de archivo (foto y 360)"). Confirmar que esté visible y funcionando en la app real.
- **Video y drone:** extender `camarasRangoManual()` para incluirlos, con copy que aclare que es una
  red de seguridad. Regla de precedencia (ya existe en `buildExport`): si hay tomas registradas con
  token, esas mandan (primer/último token); el rango a mano solo entra cuando NO hay tomas. No cambia
  la estructura del JSON (usa `grabaciones[]`).

---

## Mejora 4 — La app lee y muestra la marca de vlog (iav-metadata-app)

- Añadir `vlogOsmoAction?: boolean` al tipo `Bitacora` (`src/engine/types.ts`), aditivo (igual que se
  hizo con `token?`). `loadBitacora` ya conserva campos extra (`return data as Bitacora`).
- Mostrar en la app (opción B de Bruno):
  - Un **aviso** en la vista del trabajo: "Este trabajo incluye vlog de Osmo Action (personal)".
  - Un ítem en el **inventario de material** del trabajo (junto a Video, Foto, 360, etc.), marcado
    como personal / se baja a mano.
- Visión futura (NO se construye ahora): la app contribuirá de vuelta a la base de datos; capturar la
  info de forma estructurada para no estorbar esa dirección.

---

## Compatibilidad y despliegue

- JSON: se mantiene `version: 2`. Cambio aditivo (`vlogOsmoAction`). App vieja y nueva conviven.
- `contratos-iav-v4`: el push a `main` despliega a producción (GitHub Actions). Verificación manual
  del checklist antes de soltar (las sugerencias y la marca son UI sin pruebas automáticas).
- `iav-metadata-app`: cambios en rama de trabajo; merge local a `master`; push cuando Bruno lo pida.

## Riesgos / decisiones abiertas (para el plan)

1. Ubicación visual de la casilla de vlog y del apartado de rango de video/drone — validación de Bruno.
2. Insta360: ¿se agrega como cámara registrable o solo como formato de sugerencia?
3. Confirmar (no asumir) que el apartado de rangos foto/360 está hoy visible y funcionando.
4. Osmo Pocket 3 sigue el patrón DJI (confirmado por Bruno); su `counterExample`/sufijo exacto se
   valida al implementar si difiere del drone.
