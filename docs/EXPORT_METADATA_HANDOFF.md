# Handoff: programa de metadatos para Premiere (lee el export de checklist)

**Para:** el agente/dev que va a construir el programa local que escribe metadatos en los archivos de cámara.
**Objetivo:** tomar el JSON que exporta `checklist.html`, emparejar cada registro con el archivo real de la cámara (por su consecutivo) y escribir los metadatos que Premiere lee (Scene, Shot, Good, Comment, Description).

> Lo único hecho a la medida de IAV es **emparejar por consecutivo**. La parte de "escribir metadatos que Premiere lee" la resuelve **exiftool** (gratis); NO se construye desde cero.

---

## 1. De dónde sale el JSON

En `checklist.html`, pestaña **Edición**, botón **"Exportar"** → descarga `bitacora-<folio>.json`. El programa local recibe ese archivo + las carpetas de video (Sony, Osmo, drone). No necesita internet ni API.

(El export se genera con `IAVChecklistLogic.buildExport(state, meta)` en `frontend/checklist-logic.js` — esa función es la fuente de verdad del esquema. Si cambia el esquema, cambia ahí.)

## 2. Esquema del JSON

```jsonc
{
  "version": 1,                       // versión del esquema
  "folio": "IAV-2608.05-A",
  "cliente": "Casa Cumbres",
  "exportadoEn": "2026-06-05T10:00:00.000Z",
  "totalArchivos": 4,
  "archivos": [
    {
      "archivo": "PIB2819",           // TOKEN — clave de emparejamiento (ver §3)
      "consecutivo": 2819,            // número del consecutivo
      "ancho": 4,                     // dígitos del contador (padding), p.ej. 0091
      "ejemploNombre": "20260520_PIB2818", // patrón real del nombre (lo que tecleó el camarógrafo al iniciar)
      "camara": "Sony principal",     // etiqueta legible
      "camaraId": "sony-main",        // sony-main | osmo-pocket-3 | drone-dji | sony-asesor | osmo-asesor
      "camaraTipo": "sony",           // "sony" | "dji"  (define cómo se ve el nombre del archivo)
      "servicio": "video",            // "video" | "drone" | "asesor"
      "escena": "Recamara principal",
      "escenaRuta": "Recamara principal > Bano principal", // ruta con subespacios
      "piso": "Piso 2",               // null en drone/asesor
      "toma": 1,                      // shotNumber (n-ésima toma de esa escena); null en descartes
      "tipo": "take",                 // "take" | "discard" | "omitted"
      "motivoDescarte": null,         // "failed" | "unrelated" | "empty" (solo si tipo=discard)
      "buena": true,                  // marcada como buena
      "nota": "se trabo al inicio",   // comentario para edición
      "par": null,                    // ASESOR: liga el par Sony↔Osmo (mismo par id = misma toma)
      "autor": "Bruno",
      "hora": "2026-06-05T03:11:38.636Z",
      "premiere": {                   // ya mapeado a campos de Premiere — escribe esto directo
        "Scene": "Recamara principal",
        "Shot": "1",
        "Camera Roll": "Sony principal",
        "Good": true,
        "Comment": "se trabo al inicio",
        "Description": "video · toma buena"
      }
    }
  ]
}
```

**Notas importantes del modelo:**
- **Foto y 360 NO aparecen** en el export. Son cobertura (qué cuarto se cubrió), no archivos individuales con nombre. El programa solo trabaja **video / drone / asesor** (clips).
- `tipo`:
  - `take` = toma real (puede ser `buena` o no).
  - `discard` = la cámara SÍ creó archivo pero no sirve (`motivoDescarte`: `failed` fallida, `unrelated` no relacionado/basura, `empty` vacío/accidental). Útil para que el editor las ignore o las borre.
  - `omitted` = archivo que existe en la tarjeta pero quedó sin identificar (escena "Sin identificar").
- `par` (asesores): un punto normal se graba con **dos cámaras a la vez** (Sony video + Osmo audio). Los dos archivos comparten el mismo `par`. El editor usa el **video de Sony** y le pega el **audio de la Osmo** del mismo `par`. La voz en off es solo Osmo (sin par Sony).

## 3. Emparejar el registro con el archivo real (la parte a medida)

El nombre real del archivo **no se conoce exacto** en checklist (la fecha y, en DJI, un timestamp único, varían). Lo estable es el **consecutivo**, que aparece DENTRO del nombre del archivo:

| Cámara | `camaraTipo` | `archivo` (token) | Nombre real en la tarjeta | Cómo emparejar |
|---|---|---|---|---|
| Sony | `sony` | `PIB2819` | `20260520_PIB2819.MP4` | el nombre **contiene** `archivo` (`PIB2819`) |
| Osmo / Drone (DJI) | `dji` | `0091` | `DJI_20260520_0091_D.MP4` | el nombre **contiene** `archivo` (el contador con padding, `0091`) |

**Algoritmo recomendado por carpeta:**
1. El usuario asigna cada carpeta a un `camaraId`/`camaraTipo` (carpeta Sony, carpeta Osmo, carpeta Drone).
2. Para cada `archivo` del JSON de esa cámara: busca el archivo de video cuyo nombre **contenga** el token `archivo`. (Para DJI, el token ya viene con padding según `ancho`.)
3. Si hay ambigüedad (varios match), desempata por orden del contador. `ejemploNombre` da el patrón esperado por si quieres validar.
4. Si no hay match, repórtalo (probable "registro equivocado" o archivo movido) — no inventes.

## 4. Escribir los metadatos (exiftool)

Premiere lee **XMP** embebido en el archivo (y sidecars `.xmp`). `exiftool` (gratis, multiplataforma) lo escribe. Mapeo a los campos de Premiere vía el esquema **XMP Dynamic Media (`xmpDM`)**:

| Campo Premiere | Tag XMP (exiftool) | Valor desde el JSON |
|---|---|---|
| Scene | `XMP-xmpDM:Scene` | `premiere.Scene` (o `escenaRuta`) |
| Shot  | `XMP-xmpDM:ShotName` | `premiere.Shot` (`toma`) |
| Good  | `XMP-xmpDM:Good` | `premiere.Good` (`True`/`False`) |
| Log Note / Comment | `XMP-xmpDM:LogComment` | `premiere.Comment` (`nota`) |
| Description | `XMP-dc:Description` | `premiere.Description` |
| Camera Roll / Reel | `XMP-xmpDM:CameraRoll` o `Reel` | `premiere["Camera Roll"]` (`camara`) |

Ejemplo de comando (un archivo):

```bash
exiftool \
  -XMP-xmpDM:Scene="Recamara principal" \
  -XMP-xmpDM:ShotName="1" \
  -XMP-xmpDM:Good=True \
  -XMP-xmpDM:LogComment="se trabo al inicio, usar segunda mitad" \
  -XMP-dc:Description="video · toma buena" \
  -overwrite_original \
  "20260520_PIB2819.MP4"
```

> ⚠️ **Verifica los nombres de campo en TU versión de Premiere.** El mapeo Premiere↔XMP es estándar pero puede variar por versión/formato (MP4 vs MOV). Antes de procesar todo: escribe metadatos a UN clip de prueba con exiftool, ábrelo en Premiere y confirma que Scene/Shot/Good/Comment aparecen en el panel de Metadatos. Ajusta los tags si hace falta.

**Forma del programa local (sugerida):** script Node o Python que (1) pide carpetas + el JSON, (2) empareja (§3), (3) por cada match arma y corre el comando exiftool con el bloque `premiere`, (4) reporta matches/no-matches/descartes. Es una capa delgada sobre exiftool, no una app desde cero.

## 5. Alternativa (sin escribir en los archivos): ALE nativo de Premiere

Si en vez de embeber XMP prefieres el flujo nativo de Premiere: genera un archivo **ALE (Avid Log Exchange)** (texto tab-delimitado con columnas Name/Scene/Take/Comment…) emparejado por nombre de archivo, e impórtalo en Premiere (Premiere **sí** importa ALE; **NO** importa CSV de metadatos nativamente). Desventaja: requiere paso manual de import y que los nombres cuadren exacto. El camino exiftool (§4) es más automático y los metadatos viajan dentro del archivo.

## 6. Casos borde a manejar
- **Descartes** (`tipo:"discard"`): igual se escriben (con `Good=False` y `Description` indicando el motivo) para que el editor sepa que existen pero no sirven. O el programa puede ofrecer moverlos a una subcarpeta `_descartes/`.
- **`omitted`** (sin identificar): escena vacía; márcalo o repórtalo, no adivines la escena.
- **Pares de asesor** (`par`): escribe ambos (video Sony + audio Osmo). Opcional: agrega al `Comment` el token del par contrario para que el editor sepa qué audio va con qué video.
- **Varias cámaras / tramos**: el `archivo` (token) ya es único por cámara; no mezcles carpetas.
- **`version` del esquema**: si `version` sube, revisa cambios antes de procesar.
