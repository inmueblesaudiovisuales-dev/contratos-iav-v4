# Roadmap — iav-metadata-app a 4 funciones

App de Mac (Electron + exiftool empaquetado). Hoy hace 1 función; objetivo: 4, todas sobre el mismo
material (tarjetas SD -> organizar -> metadatos -> Premiere -> aprendizaje). **Repo separado:
`iav-metadata-app`** (NO es contratos-iav-v4). Este doc es la referencia para construir allá.

Principios que se mantienen en todas: motor puro y testeable (`src/engine/`), idempotencia, **nunca
tocar originales**, firma ad-hoc, solo Apple Silicon.

---

## F1 — Crear metadatos (ACTUAL, ya existe)
Escribe XMP que Premiere lee, cruzando la bitácora del checklist con los archivos por token
(Sony ends-with, DJI por contador). Es la baseline; pasa a ser el "modo Metadatos". Sin cambios.

## F2 — Registrar uso (SIGUIENTE; NO ahora — primero terminar checklist)
**Qué:** capturar qué tomas se usaron en el video final -> banco de datos de aprendizaje.
**Flujo:**
1. El editor exporta la secuencia final de Premiere como **FCP XML o EDL** (un clic).
2. La app lee ese archivo, extrae los clips usados y los **cruza con la bitácora por token**
   (reusa el matcher actual).
3. Marca `usada: si/no` por cada toma.
4. **POST** al endpoint `registrarUsoTomas` (adapter Apps Script, **ya construido — R90 en
   contratos-iav-v4**) -> Sheet maestro `UsoTomas`.
**Reusa:** `jsonLoader` (bitácora), `matcher`, `deviceReader`. **Nuevo:** parser FCP XML/EDL +
cliente HTTP (1 POST saliente).
**Contrato POST (ya fijo, ver RONDAS R90 de contratos-iav-v4):**
`{ action:'registrarUsoTomas', folio, cliente, filas:[{fecha,archivo,escena,piso,servicio,tipoToma,movimiento,prioridad,buena,usada,autor}] }`
**A definir al construir:** URL del endpoint (worker o Apps Script web app); de dónde saca
folio/cliente (de la bitácora); cómo decide qué bitácora corresponde a la secuencia.
**Nota honesta:** hoy la app es "sin internet/nube"; F2 agrega 1 POST saliente. **Sin credenciales
de Google en la app** — el backend escribe al Sheet.

## F3 — Ingesta de SD / crear carpetas (FUTURO)
**Qué:** meter la SD después de grabar y que la app **organice todo** en la estructura correcta.
**Flujo:**
1. Detecta la tarjeta SD (o pides la carpeta de la SD).
2. Pregunta **dónde guardar** (raíz destino / a qué trabajo-folio pertenece).
3. Crea la **estructura de carpetas** (plantilla conocida — *A DEFINIR la estructura exacta de Bruno*).
4. **Copia** los archivos al subfolder correcto **según cámara/tipo**: Sony -> su carpeta,
   Drone/DJI -> la suya, etc. (reusa detección Sony vs DJI por nombre + tag `Encoder` para modelo DJI).
**Reglas:** copiar (no mover) por seguridad; **idempotente** (no recopiar lo ya copiado);
ignorar `.LRF`/`.SRT`/`.XML`/`_Proxy` (reusa `folderScanner`).
**Reusa:** `folderScanner` (whitelist/blacklist), `deviceReader`, `matcher` (clasificar por cámara).
**A definir:** estructura de carpetas exacta (por servicio? por fecha/escena? espejo de Drive?);
destino (disco local / NAS / Drive); varias SD a la vez; verificación por checksum (opcional);
se liga a un folio/bitácora o es independiente.

## F4 — Crear proxies (FUTURO, LIGADO a F3)
**Qué:** generar proxies chicos y eficientes para editores externos; **mismo nombre de archivo**
para reconectar.
**Flujo:**
1. Tras F3 (archivos ya organizados), transcodifica **proxies de baja resolución/bitrate**.
2. **Mismo basename** que el original, en carpeta paralela (para relink por nombre).
3. El editor externo edita con los proxies; al regresar, **reconectas a full-res por nombre**
   (workflow de proxies de Premiere).
**Stack:** **empacar ffmpeg** en la app (como ya empaca exiftool).
**A definir:** codec/resolución/bitrate (ej. H.264 ~720p baja tasa, o **ProRes Proxy** para Premiere);
estructura/carpeta de proxies; convención de relink (Premiere "Attach Proxies" vs reemplazo por
nombre); si genera para todas las cámaras o selectivo.

---

## Arquitectura sugerida (las 4 en una app)
- **UI:** 4 modos/pestañas — Metadatos (actual) / Uso / Ingesta / Proxies.
- **Motor:** cada función como módulo puro testeable en `src/engine/`. Nuevos: `sequenceParser` (F2),
  `ingest` (F3), `proxy` (F4, ffmpeg).
- **F3 -> F4 encadenadas** (ingesta y luego proxies).

## Orden sugerido de construcción
1. **F2** (cuando terminemos checklist) — chico, alto valor: cierra el loop de aprendizaje.
2. **F3** (ingesta) — mediano; bloquea en definir la estructura de carpetas de Bruno.
3. **F4** (proxies) — depende de F3 + ffmpeg.
