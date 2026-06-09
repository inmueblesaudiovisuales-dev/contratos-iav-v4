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

      // --- Campos del modo guiado (opcionales; null si no se usó modo guiado) ---
      "tipoToma": "wide",             // clave interna del tipo de encuadre (ver §2a)
      "tipoTomaLabel": "Plano abierto", // etiqueta legible del tipo de toma
      "movimiento": "gimbal_walk",    // clave interna del movimiento de cámara (ver §2a)
      "movimientoLabel": "Caminata con gimbal", // etiqueta legible del movimiento
      "sugerencia": "sala.wide",      // id de la sugerencia que ligó este archivo; null si toma libre
      "prioridad": "must",            // "must" | "nice" según la sugerencia; null si toma libre
      "ordenEdicion": 10,             // orden sugerido para string-out (entero, basado en tipo de toma)

      "premiere": {                   // ya mapeado a campos de Premiere — escribe esto directo
        "Scene": "Recamara principal",
        "Shot": "1",
        "Camera Roll": "Sony principal",
        "Good": true,
        "Comment": "se trabo al inicio",
        "Description": "[E10] video · toma buena · Plano abierto / Caminata con gimbal"
        // sin modo guiado: "video · toma buena"  (formato original, sin prefijo ni sufijo)
      }
    }
  ],

  // --- Secciones nuevas del modo guiado ---

  "resumenGuia": [                    // cobertura must por cuarto; una entrada por cuarto/target
    {
      "nombre": "Sala/estancia",      // nombre del cuarto o target de drone
      "modo": "video",                // "video" | "drone"
      "mustHechas": 3,                // sugerencias [MUST] grabadas
      "mustFaltan": 0                 // sugerencias [MUST] que aún faltan
    }
  ],

  "guionEdicion": {                   // lista ordenada de takes para armar el string-out
    "contexto": "Amplitud y luz: abre cada cuarto y liga espacios.",
    // contexto: foco del tipo de propiedad + descripción libre ingresada en el checklist (o null)
    "clips": [
      {
        "archivo": "PIB2819",         // token de emparejamiento (mismo que en archivos[])
        "escena": "Sala",
        "ordenEdicion": 10,           // orden de montaje sugerido (null = sin tipo asignado)
        "buena": true,
        "tipo": "Plano abierto",      // tipoTomaLabel (null si no asignado)
        "movimiento": "Caminata con gimbal" // movimientoLabel (null si no asignado)
      }
    ]
    // clips: solo tomas reales (tipo="take"), ordenadas por ordenEdicion asc, luego piso, luego escena
  }
}
```

**Notas importantes del modelo:**
- **`version: 1` permanece intacto.** Los campos del modo guiado son aditivos; la app de metadatos de Mac los ignora sin problema y sigue operando igual.
- **La bitácora puede llenarse por dictado (Meta A, R118).** Bruno dicta las tomas y la app las importa como mediaFiles. El export `version:1` NO cambia: el dictado produce los mismos mediaFiles que la captura manual (mismo `token`/contador/`shotNumber`), incluyendo el comentario libre por toma, que viaja al campo `Comment`/`LogComment` igual que una `nota` capturada a mano.
- **Foto y 360 NO aparecen** en el export. Son cobertura (qué cuarto se cubrió), no archivos individuales con nombre. El programa solo trabaja **video / drone / asesor** (clips).
- `tipo`:
  - `take` = toma real (puede ser `buena` o no).
  - `discard` = la cámara SÍ creó archivo pero no sirve (`motivoDescarte`: `failed` fallida, `unrelated` no relacionado/basura, `empty` vacío/accidental). Útil para que el editor las ignore o las borre.
  - `omitted` = archivo que existe en la tarjeta pero quedó sin identificar (escena "Sin identificar").
- `par` (asesores): un punto normal se graba con **dos cámaras a la vez** (Sony video + Osmo audio). Los dos archivos comparten el mismo `par`. El editor usa el **video de Sony** y le pega el **audio de la Osmo** del mismo `par`. La voz en off es solo Osmo (sin par Sony).

### §2a. Vocabulario del modo guiado

Cuando el operador usó el modo guiado, cada archivo registrado lleva `tipoToma` y `movimiento` (claves internas) más sus etiquetas legibles. Si grabó en modo manual (toma libre), esos campos son `null`.

**Tipos de toma (`tipoToma` → `tipoTomaLabel`):**

| Clave | Etiqueta |
|---|---|
| `wide` | Plano abierto |
| `general` | Plano general |
| `medio` | Plano medio |
| `detalle` | Detalle/inserto |
| `transicion` | Transicion/puente |
| `pov` | Punto de vista/recorrido |
| `contrapicado` | Contrapicado para amplitud |
| `ventana` | Plano de ventana/vista |
| `reveal` | Revelacion |
| `simetrica` | Toma simetrica |
| `textura` | Acercamiento de textura |
| `exterior` | Exterior/fachada |

**Movimientos de cámara (`movimiento` → `movimientoLabel`):**

| Clave | Etiqueta |
|---|---|
| `static` | Fija/estatica |
| `pan` | Paneo |
| `tilt` | Cabeceo/tilt |
| `dolly` | Travelling/dolly |
| `push_in` | Acercamiento |
| `pull_out` | Alejamiento |
| `gimbal_walk` | Caminata con gimbal |
| `orbit` | Orbital |
| `umbral` | Revelacion tras umbral |
| `parallax` | Parallax |
| `tilt_up` | Revelacion vertical |
| `slider` | Slider lateral |
| `tracking` | Seguimiento |
| `pedestal` | Pies a cabeza |
| `whip` | Whip pan/transicion |

**`ordenEdicion`** es un entero asignado por tipo de toma: los planos abiertos (establecimiento, POV, exterior) quedan en 10–20; los planos generales y revelaciones en 30–35; planos medios en 40; ventanas en 45; detalles y texturas en 50. Los clips sin tipo asignado van al final (`null` → se ordenan últimos en `guionEdicion`).

### §2b. `premiere.Description` extendida

El campo `Description` (escrito en `XMP-dc:Description`) tiene el siguiente formato cuando el modo guiado asignó tipo y/o movimiento:

```
[E<ordenEdicion>] <servicio> · <estado> · <tipoTomaLabel> / <movimientoLabel>
```

Ejemplos:
- `[E10] video · toma buena · Plano abierto / Caminata con gimbal`
- `[E50] video · toma buena · Detalle/inserto / Acercamiento`
- `[E20] drone · toma buena · Punto de vista/recorrido / Caminata con gimbal`
- `video · toma buena` — sin modo guiado (formato original, sin prefijo ni sufijo)
- `video · descarte: toma fallida` — descarte (no cambia con el modo guiado)

El prefijo `[E<n>]` solo aparece si `ordenEdicion != null`. El sufijo ` · tipo / movimiento` solo aparece si al menos uno de los dos está disponible. Los descartes y omitidos no llevan prefijo ni sufijo.

### §2c. `resumenGuia`

Array con una entrada por cuarto (video) o por target de drone. Permite al editor saber, de un vistazo, qué espacios tienen cobertura completa y cuáles tienen sugerencias [MUST] sin grabar.

```jsonc
{
  "nombre": "Sala/estancia",    // nombre del cuarto o del target de drone
  "modo": "video",              // "video" | "drone"
  "mustHechas": 3,              // número de sugerencias [MUST] grabadas
  "mustFaltan": 0               // número de sugerencias [MUST] que no se grabaron
}
```

Si el operador no usó modo guiado en ningún cuarto, `resumenGuia` será un array vacío.

### §2d. `guionEdicion`

Contiene la lista ordenada de tomas reales (tipo `"take"`) para que el editor arme el string-out sin revisar toda la bitácora.

```jsonc
{
  "contexto": "Amplitud y luz: abre cada cuarto y liga espacios.",
  // Frase de foco según el tipo de propiedad (casa/depto/quinta…) más la descripción libre
  // que el operador ingresó en el campo "Destacados de la propiedad". null si no hay contexto.

  "clips": [
    {
      "archivo": "PIB2819",         // token de emparejamiento
      "escena": "Sala",
      "ordenEdicion": 10,           // entero de orden sugerido; null si no tiene tipo asignado
      "buena": true,                // marcada como buena
      "tipo": "Plano abierto",      // tipoTomaLabel (null si toma libre sin tipo)
      "movimiento": "Caminata con gimbal" // movimientoLabel (null si toma libre sin movimiento)
    }
  ]
}
```

Los clips están ordenados por `ordenEdicion` ascendente (los `null` van al final), luego por piso, luego por nombre de escena, luego por número de toma. Solo se incluyen tomas (`tipo="take"`); descartes y omitidos no aparecen aquí.

## 2e. Flujo de edición contemplado

El editor recibe el JSON y puede usar los campos del modo guiado así:

1. **String-out inicial:** ordenar los clips de `guionEdicion.clips` por `ordenEdicion` ascendente. Los planos abiertos y POV van primero (10–20), seguidos por generals y revelaciones (30–35), luego planos medios (40), ventanas (45) y detalles (50). Esto produce un rough-cut con la estructura narrativa estándar de cada propiedad.

2. **Filtrar por calidad:** usar `buena: true` para montar solo las takes aprobadas. Las tomas con `buena: false` quedan disponibles como respaldo si una buena tiene problema técnico.

3. **Leer el movimiento:** el campo `movimiento` (o `movimientoLabel`) indica cómo se mueve la cámara, lo que ayuda a elegir puntos de corte (un `gimbal_walk` corta bien a la mitad; un `static` se acorta sin problema en los extremos; un `orbit` da puntos de corte naturales al regresar al eje).

4. **Identificar b-roll de detalle:** los clips con `tipoToma: "detalle"` o `tipoToma: "textura"` son candidatos directos a b-roll de corte entre planos amplios.

5. **Contexto de la propiedad:** `guionEdicion.contexto` da la frase de foco (p.ej. "Amplitud y luz: abre cada cuarto y liga espacios.") que el editor puede usar como guía editorial al decidir el ritmo y los énfasis del corte.

6. **Cobertura por cuarto:** `resumenGuia` indica si algún cuarto quedó sin las tomas [MUST]. Si `mustFaltan > 0`, es señal de que ese espacio puede tener una cobertura limitada y conviene revisarlo antes de comprometer el edit final.

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
- **Campos del modo guiado ausentes**: si un archivo tiene `tipoToma: null` y `movimiento: null`, simplemente ignóralos. La app de metadatos escribe el bloque `premiere` tal cual; los campos de guía son para uso editorial, no para exiftool.

## 7. Mapeo propuesto fase 2 — XMP propios en `iav-metadata-app` (pendiente)

> **Este apartado es orientación para el trabajo futuro en el repo `iav-metadata-app`.** No está implementado hoy. El programa actual escribe solo los campos del bloque `premiere` (Scene, Shot, Good, Comment, Description). Lo que sigue queda documentado como hoja de ruta.

Hoy, `tipoToma`, `movimiento` y `ordenEdicion` viajan en `premiere.Description` (texto libre). Eso es legible pero no filtrable directamente en Premiere. En la fase 2 del programa de metadatos se podría escribir además campos XMP propios en un namespace personalizado (p.ej. `XMP-IAV`) que Premiere no reconoce de forma nativa pero que herramientas como exiftool, DaVinci Resolve o scripts de automatización sí pueden leer.

Mapeo propuesto:

| Campo del export | Tag XMP sugerido | Tipo | Ejemplo |
|---|---|---|---|
| `tipoToma` | `XMP-IAV:ShotType` | string | `"wide"` |
| `tipoTomaLabel` | `XMP-IAV:ShotTypeLabel` | string | `"Plano abierto"` |
| `movimiento` | `XMP-IAV:Movement` | string | `"gimbal_walk"` |
| `movimientoLabel` | `XMP-IAV:MovementLabel` | string | `"Caminata con gimbal"` |
| `ordenEdicion` | `XMP-IAV:EditOrder` | integer | `10` |
| `prioridad` | `XMP-IAV:Priority` | string | `"must"` |
| `sugerencia` | `XMP-IAV:SuggestionId` | string | `"sala.wide"` |

Requisito previo: definir el namespace `XMP-IAV` con un ExifTool config file (`.ExifTool_config`) para que exiftool lo registre. Una vez que los campos existen como XMP, herramientas externas pueden filtrar clips por tipo, movimiento u orden de edición sin depender del texto de `Description`.

Esto queda abierto hasta que el flujo editorial lo requiera.
