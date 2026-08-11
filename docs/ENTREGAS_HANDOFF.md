# Handoff — Sistema de Entregas (R129–R130)

> Documento vivo. Si retomas esto sin contexto previo, **empieza aquí** y usa
> `docs/superpowers/plans/2026-08-11-sistema-entregas.md` para el plan por fases.
>
> Última actualización: 2026-08-11
> Rango de commits: `9994f46..HEAD`. La sesión del 11 ago (noche) está en §18.

---

## 1. Qué es

Sistema para entregarle material a los clientes de Inmuebles Audiovisuales con un
candado de pago: el cliente **ve** todo su material con marca de agua desde que se
publica, pero solo **puede descargarlo** cuando liquida. Al liberarse arranca un
reloj de 14 días; al vencer, el material se borra.

Es independiente del admin de contratos: URL propia, página propia, llave propia y
tablas propias con prefijo `e_`. Comparte la base D1 únicamente para poder leer el
saldo del contrato en vivo, que es lo que dispara la liberación automática.

**No reemplaza al sistema R123 ("El Estreno").** Aquel sigue vivo e intacto en
`/entrega` y en las columnas `entrega_*` de la tabla `contratos`. Los dos conviven
sin pisarse; el corte se decidirá aparte.

---

## 2. Estado

| Fase | Estado |
|---|---|
| F1 — Cimientos, migración, hooks | ✅ en producción |
| F2 — Portal de control | ✅ en producción |
| F3 — Subida y marca de agua | ✅ en producción |
| F4 — Portal del cliente | ✅ en producción |
| F5 — Liberación, reloj, descargas | ✅ en producción, **con ZIP** (§18) |
| F6 — Expiración y limpieza | ✅ cron activo |
| F7 — Liga en el evento de Calendar | ⬜ **no empezada** — requiere publicar el adapter a mano |

**Limitación abierta:** Stream no puede leer nuestra URL de origen, así que un video
subido desde el navegador queda en R2 pero sin marca de agua. Ver §12b.

**Verificación:** 81 pruebas unitarias + verificación end-to-end contra producción,
incluido un ZIP de 476 MB extraído y comparado archivo por archivo. Ver §18.6.

---

## 3. URLs y accesos

| Qué | Dónde |
|---|---|
| Portal de control (Bruno) | `https://entregas.inmueblesaudiovisuales.com` |
| Enlace del cliente | `https://entregas.inmueblesaudiovisuales.com/<folio>-<codigo>` |
| Enlace sin folio (entregas sueltas) | `https://entregas.inmueblesaudiovisuales.com/<codigo>` |
| Ruta de prueba en el otro host | `https://contratos.inmueblesaudiovisuales.com/ver/<codigo>` |
| API | `/api/e/<accion>` en cualquiera de los dos hosts |

**Autenticación del portal:** header `X-Entregas-Key`, o `?k=` en la query (las
etiquetas `<img>` no pueden mandar cabeceras). Acepta `ENTREGAS_KEY` si está
configurada y, si no, la `ADMIN_KEY`. Falla cerrado.

**El enlace del cliente no lleva llave.** Su único candado es el `codigo`: 10
caracteres de un alfabeto de 31 sin caracteres ambiguos, ~49.5 bits de entropía.

---

## 4. Decisiones cerradas

Todas discutidas y confirmadas. **No reabrir sin instrucción explícita.**

| # | Decisión | Por qué |
|---|---|---|
| 1 | Antes de pagar el cliente ve **todo** su material, con marca de agua | Es el gancho comercial: ya vio lo bueno y lo quiere soltar |
| 2 | Marca en fotos: **mosaico repetido**, no logo en esquina | Un logo en esquina se recorta en segundos |
| 3 | Texto: **"Vista previa · Inmuebles Audiovisuales"** | "Vista previa" frena al que iba a publicarla; el nombre viaja gratis |
| 4 | Marca en video: logo al **centro**, no en esquina | Stream no sabe hacer mosaico, y una esquina se recorta |
| 5 | Tour 360 visible desde el inicio | Bruno controla el acceso real desde CloudPano; no tiene caso duplicar el candado |
| 6 | El tour **no expira** y sobrevive al borrado | Es solo texto, vive en CloudPano y no ocupa nada |
| 7 | Liberación **automática** al llegar el saldo a cero | Con override manual para cobros en efectivo |
| 8 | Vigencia de **14 días desde la liberación**, no desde la publicación | Si el cliente tarda un mes en pagar, sus 14 días siguen intactos |
| 9 | Al expirar se **borra todo** el material | El respaldo es el Drive manual de Bruno |
| 10 | **Ningún correo automático** al cliente | Botones que copian el mensaje de WhatsApp ya escrito |
| 11 | Aviso a Bruno 2 días antes del borrado, **dentro del portal** | Mandarlo por correo obliga a tocar el adapter |
| 12 | El que nunca paga **no se borra solo** | Herramienta de limpieza manual |
| 13 | Drive **fuera** del camino de entrega | Bruno sube su respaldo por su cuenta |
| 14 | Base D1 **compartida** | La liberación depende del saldo, que vive en `contratos` |
| 15 | Una entrega **por propiedad** | Espeja el evento de Calendar |
| 16 | El concepto se llama **"entregables"** | "Checklist" ya es la bitácora de rodaje |
| 17 | La búsqueda va por **código**, nunca por folio | `reagendarPropiedad` regenera el folio y rompería enlaces ya enviados |
| 18 | De los clientes ligados **no se copia nada** | Nombre/teléfono/correo se leen en vivo de `clientes` |
| 19 | R123 se deja morir | No se migran las entregas viejas |
| 20 | Mosaico **horizontal**, sin inclinación | `draw` tilea pero no rota; el ángulo exigiría un tile pre-rotado sin costura |

---

## 5. Arquitectura

### El principio que lo ordena todo

**Una sola copia de cada foto.** El original limpio vive en R2 y el mosaico se dibuja
**al servir**, con el binding `env.IMAGES`. Consecuencias:

- Una sola subida por foto.
- La marca de agua deja de ser irreversible: es un parámetro, no un archivo quemado.
  Cambiar `sistema/marca-agua.png` o la opacidad afecta a **todas** las entregas,
  viejas y nuevas, al instante.
- Al liberar, la **misma** foto se sirve sin mosaico. No hay segunda copia.
- Desaparece el riesgo de que el navegador altere el color: ya no hay canvas.

**El video no puede resolverse igual.** Stream quema la marca al codificar y
re-codificar en cada reproducción no es viable. Además, lo que hace que el video no
se pueda descargar es justamente que Stream lo tiene picado en pedazos: servirlo como
archivo plano para marcarlo al vuelo lo volvería descargable.

Por eso el video sí tiene dos copias en Stream:

| Copia | Cuándo se crea | Para qué |
|---|---|---|
| Original limpio (R2) | Al subir | La descarga |
| Con marca (Stream) | Al subir | Lo que ve antes de pagar |
| Limpia (Stream) | **Al liberar**, solo si ya pagó | Lo que ve después de pagar |

Stream jala de R2 del lado del servidor, así que el archivo pesado se sube **una sola
vez**. La copia limpia solo se genera cuando ya pagaron, así que lo que nunca se
liquida no gasta de más. Las tres se borran al expirar.

### Archivos

| Ruta | Qué es |
|---|---|
| `frontend/entregas.html` | Portal de control |
| `frontend/entregas-cliente.html` | Lo que abre el cliente |
| `worker/src/entregas-core.js` | Lógica pura: códigos, siembra, reloj, estados |
| `worker/src/entregas-media.js` | R2 / Images / Stream y firmas temporales |
| `worker/src/routes/entregas.js` | API bajo `/api/e/*` |
| `worker/migrations/r129-entregas.sql` | Las 5 tablas |
| `worker/migrations/r130-video-limpio.sql` | `stream_uid_limpio` |
| `worker/migrations/r131-derivado-web.sql` | `r2_key_web`: la copia reducida de la galería |
| `worker/migrations/r132-crc.sql` | `crc32`: sin esto el ZIP no se puede armar sin quemar CPU |
| `worker/src/entregas-zip.js` | ZIP en streaming, sin compresión |
| `design/entrega-cliente-v2.html` | Mockup del rediseño del portal del cliente |
| `design/entregas-mockup.html` | Mockup de referencia del diseño |

**Ganchos en el flujo existente**, todos blindados en `try/catch` para que un fallo
del sistema de entregas **nunca** impida crear un contrato, registrar un abono ni
borrar:

- `crearContrato` → siembra una entrega en borrador por propiedad
- `registrarAbono` → libera al llegar el saldo a cero (solo si ya está publicada)
- `eliminarContrato` → borra las entregas **antes** que el contrato

---

## 6. Modelo de datos

Cinco tablas nuevas con prefijo `e_`. **No modifican ninguna de las 14 existentes.**
Reversible: un `DROP TABLE` de las cinco deja la base como estaba.

| Tabla | Contenido |
|---|---|
| `e_clientes` | `cliente_id` liga al admin. Si existe, los datos de contacto se leen en vivo y las columnas locales quedan vacías |
| `e_entregas` | `codigo` (único, llave del enlace público), `estado`, `tour_url`, `dias_vigencia`, `pagado_manual`, y las fechas del ciclo |
| `e_entregables` | `tipo` (`fotos`\|`video`\|`enlace`), `nombre`, `orden`, `completo`, `valor` |
| `e_archivos` | `r2_key` (original), `images_id` (legacy), `stream_uid`, `stream_uid_limpio`, `bytes`, `destacado` |
| `e_eventos` | Bitácora. Sobrevive al borrado del material |

**D1 ignora las foreign keys.** Las cascadas van a mano:
`e_eventos` → `e_archivos` → `e_entregables` → `e_entregas`.

---

## 7. El ciclo de vida

```
BORRADOR     Solo Bruno la ve. Sube material.
   ↓ publicar (exige todos los entregables completos)
PUBLICADA    El cliente ve todo con mosaico. Cero descarga. Reloj detenido.
   ↓ el saldo llega a cero, o botón manual
LIBERADA     Descarga abierta, fotos sin mosaico. Arranca el reloj: 14 días.
   ↓ 14 días
EXPIRADA     Se borra el material. Sobrevive el registro y la liga del 360.
```

Más **pausada** (el cliente ve "acceso en pausa") y **extender** (empuja el reloj
desde hoy; si ya venció, revive).

**Hueco cerrado a propósito:** si el cliente liquida **antes** de que se publique, no
se libera una galería vacía. Queda pagada y se libera sola en el momento de publicar.

**El reloj corta al final del día en Monterrey** (UTC-6 fijo; México eliminó el
horario de verano en 2022 y Nuevo León no es municipio fronterizo). Así "14 días" no
depende de la hora en que se registró el pago.

---

## 8. API

Todo bajo `/api/e/`. **Público** = sin llave.

| Acción | Método | Qué hace |
|---|---|---|
| `publica` | GET | **Público.** Lo que ve el cliente. Aquí está el gate |
| `foto` | GET | **Público.** Sirve la foto con o sin mosaico según el estado |
| `bajar` | GET | **Público con firma.** Descarga el original. Firma de 15 min |
| `origen` | GET | **Público con firma.** Origen temporal para que Stream copie de R2 |
| `listar` | GET | Lista agrupada |
| `obtener` | GET | Detalle |
| `crear` | POST | Entrega suelta |
| `actualizar` | POST | Título, dirección, tour, vigencia |
| `sembrar` | POST | Siembra desde un contrato (o `todos:true`). Idempotente |
| `buscarClientes` | GET | Busca en `e_clientes` y en `clientes` a la vez |
| `agregarEntregable` / `borrarEntregable` / `guardarEnlace` | POST | Entregables |
| `subirFoto` | POST | Multipart. Una foto |
| `videoIniciar` / `videoParte` / `videoTerminar` | POST | Subida multiparte de video |
| `importarDrive` | POST | Trae un archivo de Drive a R2, del lado del servidor |
| `procesarVideo` | POST | Manda a Stream un video que ya está en R2 |
| `estadoVideo` | GET | Si Stream ya terminó de codificar |
| `borrarArchivo` | POST | Quita un archivo |
| `publicar` / `liberar` / `marcarPagada` / `extender` / `pausar` / `borrar` | POST | Transiciones |
| `porExpirar` | GET | Lo que se borra en los próximos días |
| `expirarAhora` | POST | Dispara la expiración a mano |
| `sinPagar` | GET | Publicadas sin pagar, para la limpieza manual |
| `subirMarca` | POST | Mete el PNG de la marca a R2 |
| `probarImages` | GET | Prueba de vida del binding |

---

## 9. La marca de agua, en detalle

Es la pieza central y la que más iteraciones tomó.

### Cómo se genera

El PNG vive en R2 en `sistema/marca-agua.png` y se dibuja con `draw({repeat:true})`.
El tile actual mide **2186×486** y contiene el texto dos veces, la segunda desplazada
media anchura, para reproducir el patrón de ladrillo con separación 2.0×. Se generó
con canvas dibujando el patrón también desplazado ±ancho y ±alto, de modo que lo que
cruza un borde reaparece del otro lado: así el tile repite sin costura.

### Los parámetros

| Parámetro | Valor | Dónde |
|---|---|---|
| Opacidad | `0.60` | `OPACIDAD_MARCA` en `routes/entregas.js` |
| Ancho base | `0.45` | `ANCHO_MARCA` |
| Tope duro | `0.95` | `TOPE_MARCA` — **ver la trampa abajo** |
| Ancho de referencia | `375` px | `ANCHO_REF` |

### La compensación por tamaño

Una fracción fija se ve bien en el hero y se vuelve ruido ilegible en una miniatura:
el 45% de una celda de 160px es texto de 70px. Lo que tiene que quedar constante es
el **tamaño físico** del texto en pantalla, no su proporción. Por eso el cliente manda
el ancho real de despliegue (`&d=`) y el servidor compensa contra `ANCHO_REF`.

### Cómo ajustarla en vivo

```
/api/e/foto?a=<archivoId>&w=1000&d=500&m=0.30
```

`m` fuerza la base sin redesplegar. Más chico = mosaico más denso. Cuando decidas, es
una constante de una línea.

### Los perfiles de Stream (video)

| uid | Nombre | Escala | Para |
|---|---|---|---|
| `d537462dcedc9c326ff9e3c517b31e34` | VistaPreviaIAV | 0.45 | Horizontal |
| `08ab04bc1cc268a0ff86d910e5b7f179` | VistaPreviaIAV-Vertical | 0.85 | **Vertical** (el formato nativo de IAV) |

`perfilWatermark()` elige por orientación. **Ninguno se puede editar**: cambiarlos
obliga a resubir todos los videos ya subidos.

---

## 10. Lo que se probó, y cómo

### Automatizado

- **63 pruebas unitarias** (`node --test src/*.test.js`) sobre lógica pura: códigos,
  siembra desde paquetes, reloj de Monterrey, máquina de estados, firmas HMAC,
  llaves de R2, matemática de multiparte, tope de la fracción de marca.
- **52 verificaciones end-to-end** contra la D1 de producción vía `wrangler dev
  --remote`: ciclo completo, gate de publicación, gate de descarga, firmas
  inválidas, expiración, extensión, cascadas de borrado.
- **Prueba de humo** de los endpoints y páginas que ya existían, para confirmar
  que no hubo regresiones.

### Manual, con material real

Se armó la entrega del contrato **IAV-2607.17-A (Mireya Gómez)** con su material de
verdad, traído de Drive:

| Entregable | Resultado |
|---|---|
| Fotografías | 45 archivos, **457 MB** |
| Video cinemático | 1 archivo, **986 MB, importado en 43 segundos** |
| Tour 360 | `app.cloudpano.com/tours/0ubb5K1KZ` |

El video resultó ser **2160×3840, vertical 4K, 113 segundos**, y Stream le aplicó el
perfil vertical correctamente. Eso confirma que crear el segundo perfil era necesario:
con la escala horizontal habría salido ilegible.

**Publicada** y verificada en el navegador: la galería carga, la marca de agua se ve
del mismo tamaño físico en el hero y en las miniaturas, y el payload público **no
contiene ninguna liga de descarga**. Ruta:
`https://entregas.inmueblesaudiovisuales.com/IAV-2607.17-A-7bbkvv7wxa`

**Usar material real encontró los dos bugs más graves** (§11 #14 y #22). Con imágenes
de prueba generadas ninguno habría salido.

### Lo que NO se ha probado

- La subida de un video grande **desde el navegador** por la ruta multiparte. El
  código está desplegado, pero el video de esta prueba entró por Drive.
- **La marca de agua del video en el flujo normal**, por §12b. La de esta prueba se
  aplicó copiando directo desde Drive.
- La **liberación** de esta entrega: sigue con saldo de $4,500, así que la descarga
  y la copia limpia del video no se han ejercido con material real.
- El portal del cliente **en un teléfono real** (solo emulado a 375 px).
- La expiración real a los 14 días (se probó forzando vigencias cortas).
- La **reproducción del video** en el portal del cliente.

---

## 11. Fallas encontradas y resueltas

El catálogo completo. Varias eran silenciosas — es la parte más valiosa de este
documento.

| # | Falla | Cómo se resolvió |
|---|---|---|
| 1 | Marca ilegible en **video vertical** — el PNG es 11.7:1 y con la escala horizontal se pierde | Segundo perfil de Stream con escala 0.85 |
| 2 | El canvas del navegador podía **alterar el color** de las fotos | Desapareció al mover la marca a tiempo de servicio: ya no hay canvas |
| 3 | `eliminarContrato` dejaba **entregas huérfanas** | `borrarEntregasDeContrato()` antes de la cascada existente |
| 4 | Pagar **antes** de publicar liberaba una galería vacía | `debeLiberarAlPagar` exige `publicada`; `publicar` detecta pago previo |
| 5 | El reloj se calculaba en **UTC**, no en hora local | UTC-6 fijo, corte al final del día en Monterrey. 11 tests |
| 6 | **Slugs repetidos** entre clientes | Código aleatorio de 10 caracteres |
| 7 | Los contratos **que ya existían** nacían sin entrega | Endpoint `sembrar`, idempotente |
| 8 | Convivencia con R123 | Archivos y rutas propias; `entrega.html` intacto |
| 9 | `reagendarPropiedad` **regenera el folio** → rompería enlaces enviados | La búsqueda va por código; el folio en la URL es decorativo |
| 10 | `ASSETS.fetch('/x.html')` devuelve **307**, no el contenido | Se piden las rutas sin extensión |
| 11 | `llaveR2` dejaba pasar `..` en el nombre | Colapsar puntos. **Lo encontró un test**, no una revisión |
| 12 | `STREAM_CUSTOMER_CODE` estaba **vacío** → el video de R123 nunca pudo reproducirse | Se llenó con `customer-cl73mgx0feu2w8io` |
| 13 | **`wrangler-action` descartaba el binding `[images]` sin error.** Deploy verde, galería rota | Se fijó `wranglerVersion: '4.120.1'` |
| 14 | **Con fracción ≥ 1 la marca de agua no se dibujaba.** Cloudflare lee `width ≤ 1` como fracción y `> 1` como **píxeles**: el overlay medía un píxel y **las fotos se servían limpias, con 200 y sin ningún error** | Tope en 0.95, y 503 si algo lo rebasa. Tres tests |
| 15 | La marca se veía de tamaños distintos entre hero y miniatura | Compensación por ancho de despliegue |
| 16 | `repeat` tilea el PNG a su **tamaño nativo** → texto gigante | `width` como fracción del ancho |
| 17 | Drive devuelve una **página de aviso de antivirus** para archivos >100 MB | Host `usercontent` con `confirm=t`, con el otro de respaldo |
| 18 | `ligasDescarga` quedó detrás de la llave de admin, que el cliente no tiene | Las ligas firmadas se metieron al payload público, con el gate en un solo lugar |
| 19 | **CAÍDA DE PRODUCCIÓN**: `contratos.*` dejó de resolver | Ver §11b |
| 20 | El título de la entrega repetía el nombre del cliente | Cae al folio cuando la propiedad no tiene dirección |
| 21 | **Stream no puede leer nuestra URL de origen.** Copiar de R2 vía el endpoint `origen` falla con "Authentication failed (status: 400)", aunque la URL responde 200 y sirve el video correctamente al probarla a mano | **Sin resolver.** Rodeo: copiar directo desde Drive, que sí funciona. Ver §12b |
| 22 | **La galería salía vacía con fotos reales.** Transformar el JPEG original (10 MB, 4000×6000) en cada vista revienta los límites de recursos del Worker: Cloudflare responde **1102** y las 7 peticiones simultáneas de la cuadrícula fallan todas | Copia reducida de ~2000px generada una sola vez al subir (migración r131). La galería transforma esa. Más caché con el estado en la llave |

> **El #22 solo apareció con material real.** Las pruebas usaban imágenes generadas de
> 27 KB. Y con `curl` tampoco salía: 8 peticiones paralelas desde una máquina no caen
> en el mismo isolate; el navegador sí las manda todas al mismo. **Hay que probar en
> el navegador, con fotos de verdad.**

### 11b. Post-mortem de la caída

**Síntoma:** "Safari can't find the server contratos.inmueblesaudiovisuales.com".
El admin, el portal y el resto quedaron inalcanzables. El Worker estaba sano: era DNS.

**Causa:** `contratos` estaba declarado como `[[routes]]` con `zone_name`, que enruta
tráfico pero **no es dueño del registro DNS**. Ese registro vivía aparte, creado a
mano tiempo atrás. Al agregar `entregas` como `custom_domain`, Cloudflare reorganizó
los registros de la zona y el de `contratos`, que no pertenecía a ningún Worker, quedó
huérfano y se borró.

**Arreglo:** `contratos` pasó también a `custom_domain`. Cloudflare es dueño de los
dos registros y los mantiene; ninguno puede volver a quedar suelto. Queda más robusto
que antes.

**Lección, y es la que importa:** la prueba de humo después de tocar dominios tiene
que cubrir los hostnames **que ya funcionaban**, no solo el que se acaba de agregar.
La prueba de la noche anterior sí lo cubría; la de esa mañana no.

**Nota de diagnóstico:** el correo (MX), el SPF y el sitio v3 nunca se tocaron. Se
verificaron después de la caída y estaban intactos.

---

## 12. `CF_MEDIA_TOKEN` — resuelto

El token que estaba puesto no tenía permiso de Stream (probablemente se creó solo con
Images). Eso explica por qué `STREAM_CUSTOMER_CODE` llevaba vacío desde siempre:
**ningún video pasó nunca por el Worker**, ni en R123.

Se reemplazó por uno con **Stream: Edit** e **Images: Edit**. Detalle importante:
`wrangler secret put` no bastó — hizo falta **un deploy después** para que el Worker
tomara el secreto nuevo. Antes del deploy seguía dando "Authentication error".

> **Rotar pendiente.** El token en uso se pegó en el chat, así que conviene cambiarlo
> por uno limpio cuando el sistema esté estable.

## 12b. Limitación abierta: Stream no puede leer nuestro origen

El diseño original era: el video se sube una sola vez a R2 y Stream lo copia desde
`/api/e/origen`, una URL firmada que sirve el propio Worker. **Eso no funciona.**
Stream responde `Authentication failed (status: 400)`.

Lo que sí está comprobado:

- La URL de origen **responde 200** y sirve el `video/mp4` correctamente al pedirla a
  mano, con los primeros bytes en 0.47 s.
- Stream **sí puede** copiar de una URL de Google Drive con el mismo token y el mismo
  perfil de marca de agua.

Es decir: el token está bien, el perfil está bien y nuestro endpoint está bien.
Lo que falla es el fetch de Stream **contra nuestro propio dominio**. La hipótesis
más probable es que la protección de bots o el WAF de la zona esté bloqueando al
fetcher de Stream, pero **no está confirmado**.

**Rodeo actual:** copiar directo desde Drive (`importarDrive` + copia manual a
Stream). Sirve para material que ya vive en Drive, que es el caso de hoy.

**Qué falta para cerrarlo**, en orden de preferencia:

1. Confirmar si es el WAF y, de serlo, agregar una regla que deje pasar al fetcher de
   Stream sobre `/api/e/origen`.
2. Si no, generar URLs prefirmadas de R2 (requiere credenciales S3 de R2, que el OAuth
   de wrangler no incluye) para que Stream lea del bucket sin pasar por el Worker.
3. Como último recurso, subir el video dos veces desde el navegador: a R2 y a Stream
   por `direct_upload`. Funciona seguro, pero manda 1 GB dos veces.

**Mientras tanto, subir un video arrastrándolo al portal deja el archivo bien en R2
pero sin marca de agua en Stream.**

---

## 13. Costos reales

| Concepto | Precio | Por entrega típica (~1.4 GB) |
|---|---|---|
| R2 (originales) | $0.015 / GB-mes | ~$0.02 / mes **mientras vive** |
| Stream (con marca) | $5 / 1000 min-mes | ~$0.01 / mes |
| Stream (copia limpia) | igual | ~$0.01 / mes, solo si ya pagó |
| Transformaciones de imagen | 5,000 gratis, luego $0.50 / 1000 | Dentro del tramo gratis con ~20 entregas/mes |

**El borrado a los 14 días es lo que mantiene plano el costo.** Sin él, R2 crece para
siempre. Por eso el gate de F6 es innegociable.

---

## 14. Trampas conocidas — no repetir

1. **No desplegar a mano mientras Actions está desplegando.** Pasó: `wrangler deploy`
   directo fue pisado por el deploy de Actions del commit anterior. Ahora que el push
   funciona, el flujo es siempre push a `main`.
2. **`gh run watch` puede agarrar la corrida anterior.** Verificar que el `headSha`
   coincida con `HEAD` antes de dar por bueno un deploy.
3. **`Invoke-RestMethod` de PowerShell 5.1 rompe el proxy de `wrangler dev --remote`**
   con `RangeError`. Usar `curl` para probar.
4. **`python` en esta máquina es el stub de la Microsoft Store.** Usar `node -e` para
   parsear JSON en scripts.
5. **El OAuth de wrangler no incluye R2.** No se puede usar `wrangler r2` — hay que
   pasar por el binding del Worker (por eso existe `subirMarca`).
6. **El scope `workflow` de GitHub es aparte.** Sin él no se puede pushear nada bajo
   `.github/workflows/`. Se amplía con `gh auth refresh -s workflow`.
7. **Cloudflare lee `width ≤ 1` como fracción y `> 1` como píxeles.** Vale para todas
   las opciones de transformación, no solo `draw`.
8. **`wrangler secret put` no basta: hace falta un deploy después** para que el Worker
   tome el secreto nuevo. Sin él sigue usando el viejo y el síntoma es un error de
   autenticación que parece del token nuevo.
9. **Probar con `curl` no reproduce los límites de recursos del Worker.** Ocho
   peticiones paralelas desde una máquina no caen en el mismo isolate; el navegador sí
   las manda todas al mismo. **Los problemas de carga hay que verlos en el navegador**,
   con `read_network_requests` o la pestaña de red.
10. **Probar con imágenes generadas chicas esconde bugs reales.** El 1102 y el tope de
    la fracción de marca solo aparecieron con JPEG de 10 MB de verdad.
11. **Drive sirve archivos >100 MB solo por `drive.usercontent.google.com` con
    `confirm=t`.** `drive.google.com/uc` devuelve una página de aviso de antivirus.
12. **Un `custom_domain` nuevo puede borrar el registro DNS de un hostname que estaba
    como `[[routes]]`.** Ver §11b.

---

## 15. Lo que falta para terminarlo

Ordenado por lo que rompe si no se atiende. Cada punto trae el contexto de diagnóstico
que ya se juntó, para no volver a investigarlo desde cero.

### A. Roto ahora mismo

**A1 — El derivado no se generaba al subir. ~~El 1102 sigue vivo para entregas nuevas.~~
CERRADO el 11 ago 2026 (commit `5c80900`).**

Era el mismo bug de §11 #22, **cerrado a medias**. `generarDerivado()` existía y
funcionaba, pero solo lo llamaban `foto` —de forma perezosa y *después* de haber
servido, o sea que la primera vista todavía transformaba el original de 10 MB— y el
endpoint `derivados`, que había que llamar a mano.

*Lo que se hizo:*

- `subirFoto` e `importarDrive` encolan el derivado con `ctx.waitUntil` al terminar.
- El portal tiene `completarDerivados()`: pregunta al endpoint `derivados` en bucle
  hasta que no quedan pendientes. Se llama en dos puntos — al terminar de subir, y
  **otra vez antes de publicar**, que es el último momento en que se puede evitar que
  el cliente sea quien descubra la galería en blanco. Si no logra terminarlas, pide
  confirmación explícita antes de publicar en vez de fallar callado.
- Corta el bucle si un lote no avanza (`hechos === 0`), para no girar en vacío cuando
  el que falla es el servidor.

*Verificado en producción:* se creó una entrega de prueba, se subió una foto por
`subirFoto` y **`r2_key_web` quedó lleno solo** a los pocos segundos, sin llamar nada
más; `derivados` reportó `pendientes: 0`; la entrega de prueba se borró. Las 45 de
Mireya siguen en 45/45.

*Lo que NO se verificó:* la galería completa **en el navegador** con 20+ fotos reales
recién subidas. El derivado se probó con un JPEG de 356 KB, no de 10 MB — aunque
`generarDerivado` sí se había ejercido antes con los 45 originales de 10 MB. Con
`curl` no se reproduce el 1102 (ver §14), así que esa prueba sigue pendiente y es la
única forma de declarar el 1102 muerto del todo.

**A2 — Stream no puede leer nuestro origen** (§12b). Un video arrastrado al portal
queda bien en R2 pero **sin marca de agua**, y la copia limpia al liberar fallará por
lo mismo.

**A3 — La copia limpia del video al liberar no se ha ejercido nunca.** Depende de A2.
Cuando A2 se resuelva, hay que liberar una entrega con video y confirmar que
`streamListo` detecta el cambio y que el portal cambia de uid.

### B. Falta para que el ciclo esté completo

**B1 — F7: la liga en el evento de Calendar.** Requiere modificar
`adapter/AdapterScript4_v1.js` y **publicarlo a mano** en script.google.com. Son
**tres** constructores de descripción que hay que dejar iguales: `procesarFirma`,
`crearEventoReservado` y `reagendarPropiedad`. Si uno se queda atrás habrá eventos con
liga y sin ella sin patrón claro. Actualizar el header `// Ultima modificacion:` con
hora de Monterrey y registrar en `docs/RONDAS.md`.

**B2 — ~~El ZIP.~~ HECHO el 11 ago 2026.** Ver §18: costó tres intentos y los tres se
veían bien con archivos chicos. `worker/src/entregas-zip.js`, 14 tests.
**Probado con las 50 fotos reales de Felipe: 476 MB en 29 s, extraído con Windows,
los 50 archivos íntegros byte a byte.** El video NO va en el ZIP a propósito: ya es un
archivo suelto y meterlo dentro le quita el poder retomarse.

**B3 — ~~Probar la liberación con material real.~~ PARCIALMENTE HECHO el 11 ago 2026.**
Se ejerció el ciclo completo (publicar → marcar pagada → liberar → descargar) con
entregas de prueba desechables, ya borradas. Verificado:

- La descarga entrega el **original intacto**: hash idéntico al archivo subido.
- La **misma foto** servida desde una entrega publicada y desde una liberada da
  bytes distintos, y la liberada pesa 16 KB menos — o sea, el mosaico sí se quita.
  Esta es la promesa central del sistema y ahora está comprobada, no supuesta.
- Aparecen `zip`, `descargas` y la fecha límite solo cuando está liberada.

**Lo que sigue sin probarse: la entrega de Mireya con su material real** (45 fotos de
10 MB y el video de 986 MB), y sobre todo **la copia limpia del video** — que depende
de A2 y nunca ha corrido.

**B4 — Probar la subida de un video grande arrastrándolo**, no importándolo de Drive.
La ruta multiparte (`videoIniciar`/`videoParte`/`videoTerminar`) está desplegada y
nunca ha corrido con un archivo real.

**B5 — Probar en un teléfono de verdad.** Todo se validó a 375 px emulados.

**B6 — Probar la expiración real.** Solo se probó forzando vigencias cortas, nunca
dejando pasar los 14 días con el cron corriendo.

### C. Decisiones que quedaron pendientes de Bruno

**C1 — Las 5 variantes `-1-1` a `-1-5`** de la entrega de Mireya traen la marca
"default" en Drive y parecen versiones alternas de la foto 1. Se importaron todas
porque no le tocaba al sistema decidir qué se entrega. Si son descartes, quitarlas.

**C2 — La portada** quedó en la primera foto subida (`IAV-2607.17-A-1.jpg`), no en la
mejor. No hay forma de cambiarla desde el portal: el campo `destacado` existe en
`e_archivos` pero **la interfaz no lo expone**. Falta un botón.

**C3 — La entrega de Mireya está publicada** con material real de una clienta que
sigue debiendo. El enlace es inadivinable y no se envió nada, pero conviene decidir si
se pausa o se le manda.

**C4 — La densidad del mosaico.** Quedó en `ANCHO_MARCA = 0.45`, que reproduce la
calibración original. `0.30` da un mosaico más denso y discreto. Se compara en vivo
con `?m=` sobre una foto real.

**C5 — El corte con R123.** Sigue vivo en `/entrega`. Falta decidir cuándo se apaga y
qué pasa con las entregas viejas que apuntan a Drive.

**C6 — Backfill de entregas** para los contratos que ya existían. `sembrar` con
`todos:true` ya existe y es idempotente; falta decidir si se corre.

### D. Deuda técnica y cabos sueltos

- ~~**`ENTREGAS_KEY` no está configurada.**~~ **HECHO el 11 ago 2026.** Sin ella el
  portal de entregas exigía teclear la `ADMIN_KEY` —o sea que para entregar fotos
  había que andar cargando la llave del sistema de contratos— y además `secretoFirma()`
  caía a `ADMIN_KEY` como secreto HMAC. Ya está puesta como secret y aplicada con un
  deploy (`wrangler secret put` solo no basta, ver §14). Verificado: la llave nueva
  responde 200 y una inventada 401. La `ADMIN_KEY` **sigue siendo aceptada a
  propósito**, para no quedarse fuera si se pierde la otra. Bruno la teclea una vez y
  queda en `localStorage`.
- **Rotar `CF_MEDIA_TOKEN`**: el que está en uso se pegó en el chat.
- **El parámetro `?m=`** sigue expuesto en producción. Es inofensivo (solo cambia la
  escala del mosaico) pero es andamio de depuración.
- **El error de `procesarVideo` devuelve una URL de origen firmada** para poder
  probarla. Solo lo ve quien tenga la llave, pero es información de más.
- **Columnas muertas:** `images_id` e `images_hash` en `e_archivos` ya no se escriben
  desde que la marca se dibuja al servir. `borrarDeImages` se conserva por si quedaran
  registros viejos. Se pueden limpiar.
- **La interfaz no expone** `procesarVideo`, `estadoVideo`, `derivados` ni `sembrar`.
  Todos se llaman a mano por API.
- **No hay reintento** si `generarDerivado` falla: queda en el original y solo se ve
  lento. Debería reportarse en el portal.
- **Las descargas de fotos no tienen indicador de avance** en el portal del cliente.

### E. Preexistente, no causado por este trabajo

- `www.inmueblesaudiovisuales.com` da 404; el ápice sí responde 200.
- No hay registro **DMARC** en el dominio. Sí hay SPF.
- El repositorio es público con credenciales en texto plano (ver abajo).

### Riesgo conocido, no atendido por decisión de Bruno

El repositorio `contratos-iav-v4` es **público**, no privado como dice
`docs/PROYECTO.md:30`. En él viven en texto plano `ADMIN_KEY`, la URL del adapter de
Apps Script, el `database_id` de D1 y `docs/CREDENCIALES.md`. Con `ADMIN_KEY`
cualquiera puede llamar la API de admin en producción. Se planteó el 2026-08-11 y
Bruno decidió no atenderlo por ahora. Queda aquí como registro, no como insistencia.

---

## 16. Entorno de trabajo

Instalado en la máquina Windows durante este trabajo:

| Herramienta | Versión | Para qué |
|---|---|---|
| Node.js | 24.19.0 | Tests y scripts |
| npm | 11.17.0 | — |
| wrangler | 4.120.1 | Deploy, D1, dev remoto |
| GitHub CLI | 2.97.0 | Push autenticado |

`wrangler login` y `gh auth login` ya están hechos, con credenciales guardadas
localmente. Ninguna pasó por el chat.

**Nota:** `npm` bloquea por defecto los scripts de instalación de `esbuild` y
`workerd`. Wrangler funciona igual, pero `wrangler dev` local los necesita; se
instalaron con `npm install -g --allow-scripts=esbuild,workerd wrangler`.

---

## 17. Archivos fuera del repo

En `E:\CLAUDE\Sistema de entregas\`:

| Archivo | Qué es |
|---|---|
| `marca-agua.html` | Calibrador del mosaico sobre una foto real. Genera el PNG de Stream |
| `marca-agua-stream.png` | El PNG que se subió a los perfiles de Stream |
| `entregas-mockup.html` | Mockup con las tipografías reales (la copia del repo cae a respaldos) |

---

## 18. Sesión del 11 ago 2026 (noche) — descargas, ZIP y rediseño del cliente

Todo lo de esta sección está desplegado y verificado contra producción.

### 18.1 Lo que se cerró

| Qué | Dónde |
|---|---|
| Copias reducidas al subir (A1) | `subirFoto`, `importarDrive`, `completarDerivados()` |
| Llave propia del portal de entregas | secret `ENTREGAS_KEY` |
| Subir y preparar como **dos pasos** | botón "Preparar galería (N)" |
| Descargas con tamaño y reanudables | `cabecerasRango()`, r132 |
| **ZIP de todas las fotos** | `worker/src/entregas-zip.js` |
| Elegir la portada | endpoint `portada`, clic en la miniatura |
| **Varios videos** | `base.videos[]` en `payloadPublico` |
| Rediseño del portal del cliente | `frontend/entregas-cliente.html` |

### 18.2 El 1102 se movió de lugar antes de morir

Llamar `generarDerivado` con `ctx.waitUntil` dentro de `subirFoto` **empeoró el
problema en vez de arreglarlo**: transformar un JPEG de 10 MB mientras siguen
entrando subidas agota el isolate, y a partir de ahí *todas* las subidas siguientes
contestan 503. Medido con material real: **de 50 fotos entraron 10 y 40 murieron en
cadena**, ninguna por culpa propia.

La lección general, que aplica a cualquier cosa que se agregue después: **el trabajo
pesado no va durante la subida.** Va después, en peticiones separadas y de a poquitas.
Por eso existe el paso "Preparar galería".

De paso se descubrió que el portal escondía el error: hacía `r.json()` sobre una
respuesta que era HTML de Cloudflare, y el fallo de parseo tapaba el código real. Los
errores de red ahora se leen como texto antes de intentar interpretarlos.

### 18.3 El ZIP: tres intentos, dos límites de CPU

Vale la pena el detalle porque **los tres se veían perfectos con archivos de prueba**.

1. **CRC32 al vuelo.** Muerto a los **32 MB** de 476. `Worker exceeded CPU time limit`
   (capturado con `wrangler tail`). Calcular el CRC de cada byte en JS es carísimo.
2. **CRC precalculado (r132), `TransformStream`.** Muerto a los **69 MB**. Seguía
   siendo CPU: un `TransformStream` normal hace pasar cada byte por JavaScript aunque
   el código no los toque.
3. **`FixedLengthStream`.** Completo: 476 MB en 29 s. Mueve los bytes dentro del
   runtime y **de regalo pone el `Content-Length`** — que era justo lo que faltaba
   para la barra de progreso; antes Cloudflare respondía `chunked` y descartaba la
   cabecera que se le ponía a mano.

Decisiones que sostienen esto:

- **Sin compresión** (método *store*). Los JPEG ya vienen comprimidos: comprimir gasta
  el recurso escaso (CPU) sin ahorrar espacio.
- Al no comprimir, **el tamaño final se calcula de antemano**. De ahí sale el
  `Content-Length` exacto: `tamanoZip()`, verificado con un test byte a byte.
- **El CRC se guarda en la base** (r132), calculado al preparar la galería.
- Si algo falla a media escritura, el stream **se aborta** en vez de cerrarse: un ZIP
  truncado que cierra "bien" se ve válido y truena al extraer.

### 18.4 Rediseño del portal del cliente

El anterior hacía difícil justo lo que venía a hacer. El visor **no tenía navegación**
(45 fotos = abrir y cerrar 45 veces), la cuadrícula recortaba todo a 4:3 y el hero
hacía de portada y de reproductor a la vez.

Orden nuevo, decidido con Bruno: **portada → descarga → video → fotos → recorrido.**
La descarga primero porque es a lo que vino el cliente; el video siempre arriba de las
fotos.

- **Mosaico por columnas**: cada foto conserva su proporción; las verticales dejan de
  salir mochadas. Todas visibles.
- **Carga diferida obligatoria.** No es refinamiento: cada miniatura es una
  transformación del Worker y pedir 45 de golpe es exactamente lo que lo tumba.
- **Visor** con flechas, teclado, deslizar, contador y descarga individual. El swipe
  solo cuenta si el gesto fue más horizontal que vertical, para no cambiar de foto al
  hacer scroll.
- **Sin fotos, la portada cae al primer cuadro del video.**
- Al cliente se le muestra **"Video cinemático"**, no `IAV-2607.17-A-v2.mp4`.

### 18.5 Trampas nuevas

- **`obj.range` de R2 viene lleno aunque nadie pida un rango.** Fiarse de él hacía que
  una descarga normal contestara 206 y —peor— que no se registrara en la bitácora,
  porque el evento colgaba de esa condición. **Quien manda es la petición.**
- **Cloudflare descarta el `Content-Length` que pongas a mano** si el cuerpo es un
  stream normal: responde `chunked`. Solo `FixedLengthStream` lo conserva.
- **Un `TransformStream` normal cuesta CPU por byte.** Para mover volumen dentro de un
  Worker hay que usar `FixedLengthStream` o `IdentityTransformStream` y `pipeTo`.
- **El runner de GitHub falla a veces al clonar** (`server certificate verification
  failed`). No es el código: `gh run rerun <id>`.
- **`Expand-Archive` de Windows no valida el CRC.** Un test que dependa de eso da
  falso verde; el que hay se salta explícitamente en vez de mentir.
- **Preparar una foto de 10 MB rebota seguido con 503.** En una tanda de 50 hubo hasta
  **6 fallos seguidos** y aun así terminó completa. Cualquier bucle que se rinda pronto
  abandona una preparación que iba bien: el umbral está en 12 con espera creciente.

### 18.6 Verificación

- **81 tests** automatizados (43 core + 24 media + 14 zip), 1 saltado a propósito.
- ZIP de **476 MB** extraído con Windows: 45 JPEG y 5 PNG, **0 corruptos**.
- Descarga parcial: bajado entero y en dos pedazos → **bytes idénticos**.
- Original descargado = archivo subido, **hash idéntico**.
- Misma foto publicada vs liberada → **bytes distintos**: el mosaico sí se quita.
- Visor navegado en producción: avanza, retrocede, da la vuelta, oculta flechas con
  un solo elemento.
- Entregas de prueba creadas y **borradas**; las 4 reales quedaron intactas.
