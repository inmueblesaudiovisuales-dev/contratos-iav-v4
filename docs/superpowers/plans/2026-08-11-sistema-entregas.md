# Plan — Sistema de Entregas (R129+)

> Sistema independiente para entregar material a clientes: galería con marca de agua antes de
> pagar, descarga liberada al liquidar, y 14 días de vigencia. Reemplaza la entrega R123
> ("El Estreno"), que queda congelada.
>
> Mockup de referencia: `design/entregas-mockup.html`
> Fecha del plan: 2026-08-11

---

## 1. Por qué

Hoy la entrega R123 muestra el material y **al mismo tiempo** ofrece descargarlo: los botones
"Descargar todo", "Fotos" y "Video" apuntan a `driveLink` desde el momento en que se publica
(`frontend/entrega.html:371-373`). Las fotos se sirven en `imagedelivery.net` con URL pública sin
firmar y el video sube a Stream con `requireSignedURLs: false` (`contratos.js:573`). No hay marca de
agua, no hay vencimiento real (el HTML dice "Disponible por 30 días" hardcodeado) y el gate de
publicación es manual, desligado del saldo.

El objetivo es invertir eso: **ver sí, llevarse no, hasta que liquide.**

---

## 2. Decisiones cerradas

Discutidas y confirmadas con Bruno. No reabrir sin instrucción explícita.

| Tema | Decisión |
|---|---|
| Qué ve antes de pagar | **Todo** su material, completo, con marca de agua. Sin descarga. |
| Marca de agua en fotos | **Mosaico tenue repetido** sobre toda la imagen, no logo en esquina. |
| Marca de agua en video | Logo en esquina (Stream no soporta mosaico). Se compensa con HLS fragmentado. |
| Tour 360 | Visible desde el inicio. Bruno controla el acceso real desde CloudPano. |
| Liberación | **Automática** cuando `saldo_pendiente` llega a 0. Botón manual de override. |
| Vigencia | **14 días desde la liberación**, no desde la publicación. |
| Al expirar | Se borra **todo** el material (R2, Images, Stream). El respaldo es el Drive manual de Bruno. |
| Excepción al borrado | La **liga del 360 sobrevive**: es solo texto y el recorrido sigue vivo en CloudPano. |
| Correos automáticos | **Ninguno al cliente.** Botones que copian el mensaje de WhatsApp ya escrito. |
| Aviso a Bruno | Sí, 2 días antes de cada borrado, con la lista de lo que se va. |
| Cliente que nunca paga | Sin borrado automático. Herramienta manual de limpieza. |
| Drive | **Fuera del sistema.** Bruno sube su respaldo a mano, por su cuenta. |
| Independencia | App, URL, contraseña, tablas y clientes propios. **Base D1 compartida.** |
| Granularidad | **Una entrega por propiedad** (espeja el evento de Calendar). |
| Nombre del concepto | **"Entregables"**, no "checklist" — ese nombre ya lo usa la bitácora de rodaje. |
| Legacy R123 | Se deja morir. Las entregas viejas siguen apuntando a Drive. No se migran. |

### Por qué D1 compartida y no base aparte

La liberación depende de `saldo_pendiente`, que vive en `contratos`. Con base compartida es una
consulta directa. Con bases separadas sería una llamada por red entre dos sistemas, con reintentos y
monitoreo — justo la plomería frágil que se está quitando al sacar Drive. Las tablas nuevas están
aisladas con prefijo `e_`, así que una separación futura es una mudanza, no una reescritura.

### Por qué los clientes ligados no se copian

De un cliente que viene de admin se guarda **solo la liga** (`cliente_id`). Nombre, teléfono y correo
se leen en vivo de `clientes`. Así no hay dos versiones divergiendo. Solo los clientes creados a mano
en el sistema de entregas guardan sus propios datos, porque no tienen de dónde leerlos.

---

## 3. Prerrequisitos de Bruno

| # | Prerrequisito | Estado |
|---|---|---|
| 1 | Bucket R2 `iav-entregas-originales` creado, **sin acceso público** | ✅ 2026-08-11 |
| 2 | Subdominio `entregas.inmueblesaudiovisuales.com` apuntado al Worker | ⬜ pendiente |
| 3 | PNG de marca de agua (`marca-agua-stream.png`, 2622×225, RGBA, 62 KB) | ✅ 2026-08-11 |
| 4 | Watermark profile creado en Stream | ✅ 2026-08-11 |
| 5 | Images y Stream activos en la cuenta | ✅ Stream confirmado al crear el perfil |

### Watermark profile de Stream

```
uid       d537462dcedc9c326ff9e3c517b31e34
name      VistaPreviaIAV
position  center
opacity   0.30
scale     0.45
padding   0.05
```

Va como variable en `wrangler.toml` (`STREAM_WATERMARK_UID`) y se manda en cada subida a Stream.

> **No se puede editar.** Cambiar la marca exige borrar el perfil, crear otro y **volver a subir
> todos los videos**; los ya subidos conservan la marca vieja para siempre.
>
> Se eligió `center` en vez de una esquina porque una marca en esquina se recorta en minutos, y el
> video es el entregable más valioso. La opacidad baja (0.30 contra el 0.60 de las fotos) compensa
> que sea una marca grande y central.

### Herramientas locales generadas

Fuera del repo, en `E:\CLAUDE\Sistema de entregas\`:

- `marca-agua.html` — calibrador del mosaico sobre una foto real. Genera el PNG para Stream.
- `entregas-mockup.html` — copia del mockup con las tipografías reales (la del repo cae a respaldos).

> **R2 no necesita token.** El Worker lo lee por binding declarado en `wrangler.toml`
> (`env.ENTREGAS_ORIGINALES`), no por API. `CF_MEDIA_TOKEN` se queda como está, solo para
> Images y Stream. Para que Stream pueda copiar el video desde R2 se expondrá un endpoint temporal
> firmado por el propio Worker — no se usan credenciales S3 de R2.

---

## 4. Modelo de datos

Migración: `worker/migrations/r129-entregas.sql`

| Tabla | Contenido |
|---|---|
| `e_clientes` | `id`, `cliente_id` (liga a `clientes`, nullable), `nombre`, `telefono`, `correo`, `origen` (`admin`\|`manual`), `fecha_creacion`. Si `cliente_id` existe, los datos de contacto se leen de `clientes` y las columnas locales quedan vacías. |
| `e_entregas` | `id`, `e_cliente_id`, `contrato_token` (nullable), `num_propiedad` (nullable), `slug` (único, para la URL corta), `token`, `titulo`, `direccion`, `estado`, `tour_url`, `pagado_manual`, `fecha_creacion`, `fecha_publicada`, `fecha_liberada`, `fecha_expira`, `fecha_pausada`, `dias_vigencia` (default 14). |
| `e_entregables` | `id`, `e_entrega_id`, `tipo` (`fotos`\|`video`\|`enlace`), `nombre`, `orden`, `completo`. Se siembran desde el paquete del contrato. |
| `e_archivos` | `id`, `e_entregable_id`, `nombre`, `bytes`, `mime`, `r2_key` (original), `images_id` / `stream_uid` (preview con agua), `orden`, `destacado`, `fecha`. |
| `e_eventos` | `id`, `e_entrega_id`, `tipo`, `detalle`, `fecha`. Bitácora: creada, subida, publicada, vista, descargada, extendida, expirada. |

`estado` ∈ `borrador` · `publicada` · `liberada` · `pausada` · `expirada`

**D1 no soporta foreign keys.** Las cascadas van a mano con `db.batch()`, orden:
`e_eventos` → `e_archivos` → `e_entregables` → `e_entregas`.

---

## 5. Archivos

| Ruta | Qué es |
|---|---|
| `frontend/entregas.html` | Portal de control. Nuevo. |
| `frontend/entrega.html` | Portal del cliente. **Reescritura completa.** |
| `worker/src/routes/entregas.js` | Handlers del sistema. Nuevo. |
| `worker/src/entregas-media.js` | Subida a R2/Images/Stream, firma de URLs, borrado. Nuevo. |
| `worker/src/entregas-watermark.js` | Composición del mosaico (lógica pura, con tests). Nuevo. |
| `worker/migrations/r129-entregas.sql` | Migración. Nueva. |
| `worker/src/index.js` | Agregar el bloque de rutas `/api/e/*`. |
| `worker/src/routes/contratos.js` | Hook en `crearContrato` para sembrar entregas. |
| `worker/src/routes/abonos.js` | Hook en `registrarAbono` para liberar al saldar. |
| `worker/src/cron.js` | Expiración diaria y aviso previo. |
| `worker/wrangler.toml` | Binding R2, ruta del subdominio, `ENTREGAS_KEY`. |
| `adapter/AdapterScript4_v1.js` | Liga en la descripción del evento. **Despliegue manual.** |

**Auth:** clave propia `ENTREGAS_KEY` en header `X-Entregas-Key`. Independiente de `ADMIN_KEY` para
poder dar acceso a alguien sin abrirle el admin completo.

---

## 6. Cómo se genera la marca de agua

Esta es la pieza que decide el resto del diseño, y sale distinta para foto y para video.

### Valores calibrados por Bruno (2026-08-11)

Calibrados sobre una foto real con `marca-agua.html`. **Programar tal cual**, no aproximar.

| Parámetro | Valor |
|---|---|
| Texto | `Vista previa · Inmuebles Audiovisuales` |
| Opacidad | `0.60` |
| Tamaño base | `28px` a un ancho de referencia de `1200px` (escala proporcional al ancho real) |
| Separación | `2.0×` el ancho del texto (y `2.0 × 1.9` en vertical) |
| Ángulo | `-31°` |
| Tipografía | Georgia / serif, peso 500 |
| Color | Blanco sólido, filas alternas desfasadas a medio paso |

La implementación de referencia es la función `mosaico()` de `marca-agua.html`.

### Fotos — en el navegador, con canvas

El archivo ya está cargado en el navegador cuando Bruno lo arrastra. Ahí mismo:

1. Se sube el **original tal cual a R2**.
2. Se dibuja en un canvas una copia **reducida** (máx. ~2000px de lado largo) con el mosaico encima,
   y esa copia se sube a **Images**.

La doble subida es aceptable porque la segunda va reducida: ~38 fotos de 10 MB son ~400 MB de
original contra ~40 MB de preview. No se procesa nada en el Worker.

### Video — una sola subida, Stream lo quema al codificar

1. Se sube el original **una sola vez a R2**.
2. El Worker le pide a Stream que **copie desde una URL firmada de R2**, aplicando el watermark
   profile. Stream lo quema durante el encode.

Así el archivo pesado viaja una vez sola desde la computadora de Bruno.

> **Restricción confirmada:** Stream aplica el watermark **solo al subir**. Cambiar la marca de un
> video ya subido exige volver a subirlo. Y no soporta mosaico, únicamente 5 posiciones
> (`upperRight`, `upperLeft`, `lowerLeft`, `lowerRight`, `center`) con opacidad, escala y padding.

### Lo que esto no resuelve

**Nadie puede impedir una captura de pantalla.** Bloquear clic derecho y arrastre es fricción, no
protección. La marca de agua es la defensa real: hace que el material robado sea inservible para
publicar, que es exactamente el riesgo que importa.

---

## 7. Fases

Cada fase termina con un gate verificable. No avanzar sin pasarlo.

### F1 — Cimientos: datos, rutas y siembra automática

- Migración `r129-entregas.sql` aplicada en remoto.
- `worker/src/routes/entregas.js` con auth propia y los endpoints de lectura/escritura básicos.
- Bloque de rutas `/api/e/*` en `index.js`.
- Hook en `crearContrato`: al crear un contrato se siembra **una entrega en borrador por
  propiedad**, con sus entregables derivados del paquete y adicionales, más su `slug`.
- Siembra del cliente: si el contrato trae `cliente_id`, se crea `e_clientes` **solo con la liga**.

**Gate:** crear un contrato de 2 propiedades con Paquete Residencial genera 2 entregas en borrador,
cada una con 3 entregables (`fotos`, `video`, `enlace`), y un solo `e_clientes` ligado.
Un Terreno genera 2 entregables, sin `enlace`.

### F2 — Portal de control, solo lectura

- `frontend/entregas.html`: lista agrupada (pendientes / con el cliente / liberadas), entregables
  como palomitas, semáforo de días, orden por urgencia.
- Vista de detalle de una entrega, sin subida todavía.
- Buscador de clientes sobre `e_clientes` **y** `clientes`.
- Crear entrega suelta, con sus 3 entregables por defecto y editables.

**Gate:** la lista refleja el estado real de D1; crear una entrega suelta con cliente nuevo funciona
y aparece en el grupo correcto.

### F3 — Subida y marca de agua  ← núcleo

- Binding R2 y helpers en `entregas-media.js`.
- Fotos: original a R2 + preview con mosaico a Images (canvas en navegador).
- Video: original a R2 + copia a Stream desde URL firmada, con watermark profile.
- Enlace: solo se guarda la URL.
- Reemplazar un archivo individual sin rehacer la entrega.
- Un entregable se marca completo al tener contenido; se puede desmarcar a mano.

**Gate:** subir 3 fotos y 1 video a una entrega de prueba. Verificar que en Images y Stream el
material **tiene marca de agua**, que en R2 está **limpio**, y que el entregable pasó a completo.

### F4 — Portal del cliente

- Reescritura de `frontend/entrega.html` con los estados `publicada`, `liberada`, `pausada`,
  `expirada`.
- Ruta corta `/e/<slug>`.
- Estado publicada: galería completa con agua, 360 copiable, aviso de saldo, **cero descarga**.
- Texto explícito de los 14 días y de que el 360 no expira.
- Botón de publicar habilitado solo con todos los entregables completos, y con la razón visible
  cuando está deshabilitado.

**Gate:** con una entrega publicada, inspeccionar la respuesta de la API y confirmar que **no
contiene ninguna URL descargable** del material original.

### F5 — Liberación, reloj y descargas

- Hook en `registrarAbono`: al llegar `saldo_pendiente` a 0, la entrega ligada pasa a `liberada`,
  se fija `fecha_expira` y se registra el evento.
- Switch de pagado manual para entregas sueltas. Botón de liberar ahora.
- Extender vigencia. Pausar y reanudar.
- Descargas por URL firmada de corta duración: bloque de fotos, video, foto individual y ZIP
  completo en streaming desde el Worker.
- Botones que copian el mensaje de WhatsApp ya redactado, con la liga adentro.

**Gate:** registrar el abono que liquida un contrato de prueba → la entrega pasa sola a `liberada`
con fecha correcta; las 4 formas de descarga funcionan; una URL firmada caducada devuelve error.

### F6 — Expiración y limpieza

- Cron diario: marcar expiradas y borrar de R2, Images y Stream. `e_entregas` y `e_eventos`
  sobreviven como registro.
- Aviso a Bruno 2 días antes con la lista de lo que se va.
- Página mínima post-expiración: **solo la liga del 360** y el WhatsApp.
- Herramienta de limpieza manual: publicadas sin pagar, de más vieja a más nueva, con peso y
  selección múltiple.

**Gate:** forzar la expiración de una entrega de prueba. Confirmar que R2, Images y Stream quedan
sin sus objetos, que el registro y la liga del 360 sobreviven, y que la página mínima carga.

### F7 — Liga en el evento de Calendar  ← toca el adapter

- Agregar la liga de control a la descripción del evento, junto al portal de equipo.
- **Los tres constructores** deben quedar iguales: `procesarFirma`, `crearEventoReservado` y
  `reagendarPropiedad`. Si uno se queda atrás, habrá eventos con liga y sin ella sin patrón claro.
- Actualizar el header `// Ultima modificacion:` con hora de Monterrey y número de ronda.
- Registrar en `docs/RONDAS.md`.

**Gate:** crear contrato → firmar → abrir el evento en Calendar y confirmar que trae la liga y que
abre la entrega correcta. Repetir tras un reagendamiento.

> **Despliegue manual obligatorio.** El push a `main` no publica el adapter. Bruno pega
> `adapter/AdapterScript4_v1.js` en script.google.com y publica versión nueva.

---

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Subir 2 GB desde el navegador se rompe a media subida | Subida multiparte/reanudable a R2, con reintento por parte y barra de progreso real. Verificar en F3 con un archivo grande de verdad, no uno de prueba. |
| El ZIP en streaming excede los límites de CPU del Worker | ZIP sin compresión (store), que es casi puro copiado. Si aun así truena, el ZIP se degrada a descarga por bloques y se documenta. |
| El watermark de Stream no se puede cambiar después | Cerrar el diseño del logo **antes** de F3. Cambiarlo luego obliga a resubir videos. |
| Costo de R2 creciendo sin control | El borrado a los 14 días es lo que lo mantiene plano. Si F6 falla, el costo crece calladito: el gate de F6 es innegociable. |
| El cliente pierde el material y ya se borró | Recuperación manual: Bruno vuelve a subir desde su respaldo de Drive. Asumido y aceptado. |

---

## 9. Lo que NO se hace

Descartado explícitamente. No proponerlo en sesiones futuras.

- Aprobación o comentarios del cliente sobre fotos individuales.
- Usuarios múltiples con permisos por rol.
- Tableros de estadísticas o analítica de uso.
- Correos automáticos al cliente, en cualquier etapa.
- Borrado automático de entregas publicadas sin pagar.
- Migración de las entregas R123 existentes.
- Sincronización masiva de clientes entre admin y entregas.
