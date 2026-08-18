# Handoff — Sistema de Entregas (R129–R133)

> Documento vivo. Si retomas esto sin contexto previo, **empieza aquí** y usa
> `docs/superpowers/plans/2026-08-11-sistema-entregas.md` para el plan por fases.
>
> Última actualización: 2026-08-18
> Rango de commits: `9994f46..HEAD`.
>
> **Atajos:** §2 estado · §15 lo que falta · §21 qué material hay vivo ahora ·
> §14 las 27 trampas conocidas · §18-§20 las sesiones del 11-12 ago (ZIP, descargas,
> rediseño de los dos portales y preparación automática) · §22 la sesión del 18 ago
> (la marca que no se quitaba tras liberar, y la galería de destacadas).
>
> **Pendiente inmediato:** correr la migración `r133-destacadas.sql` en D1 (§22.5).

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
| F6 — Expiración y limpieza | ✅ cron activo (horario) |
| Preparación automática de galerías | ✅ cron cada 2 min (§20) |
| F7 — Liga en el evento de Calendar | ❌ **descartada por Bruno** (11 ago 2026) |

**El ciclo completo está probado de punta a punta con material real** (12 ago 2026):
subir 985 MB por partes → Stream con marca → publicar → liberar → copia limpia → el
cliente ve la limpia → descargar el original intacto. No queda ningún camino sin
ejercer. Ver §18.9.

**Los dos portales están rediseñados**: el del cliente (§18.4) y el de control (§19).

**Verificación:** 84 pruebas unitarias + verificación end-to-end contra producción,
incluido un ZIP de 476 MB extraído y comparado archivo por archivo (§18.6).

**La galería se prepara sola**: un cron cada 2 minutos, sin necesidad de dejar la
ventana abierta (§20).

**Lo que falta es de otro tipo** — probarlo en un teléfono real, dejar correr los 14
días y rotar el token de Cloudflare. Ver §15.

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
| `design/entregas-portal-v2.html` | Mockup del rediseño del portal de control |
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

- **84 pruebas unitarias** (`node --test src/*.test.js`) sobre lógica pura: códigos,
  siembra desde paquetes, reloj de Monterrey, máquina de estados, firmas HMAC,
  llaves de R2, matemática de multiparte, tope de la fracción de marca, cabeceras de
  descarga parcial, y el ZIP completo (CRC32 contra zlib, tamaño exacto, nombres
  repetidos, y extraerlo con Windows comparando byte a byte).
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

> Actualizado el 12 ago 2026. Casi todo lo que estaba en esta lista ya se probó:
> la subida multiparte (§18.7), la marca del video en el flujo normal (§18.8), la
> liberación y la copia limpia (§18.9). Queda solo lo que no depende del código.

- **Un teléfono real.** Todo se validó en escritorio y a 375 px emulados. El visor
  del portal del cliente tiene gesto de deslizar y nunca ha tocado una pantalla
  táctil.
- **La expiración real a los 14 días.** Solo se probó forzando vigencias cortas.
- **Liberar la entrega de Mireya con SU material** (45 fotos de 10 MB y un video de
  986 MB). El ciclo se ejerció con entregas de prueba desechables; con volumen real
  es donde han aparecido todos los problemas serios de esta semana.

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

## 12b. RESUELTO: era el token, no nuestro origen

> **El diagnóstico anterior de esta sección era equivocado y estuvo escrito aquí
> varias sesiones.** Se conserva la corrección completa porque el error de método
> vale más que la conclusión.

**Lo que decía:** que Stream no podía leer `/api/e/origen`, probablemente por el WAF.
Se propusieron tres rodeos, todos caros y ninguno necesario.

**Lo que es:** el `CF_MEDIA_TOKEN` **no tiene permisos de Stream**. La API contesta
`9106: Authentication failed (status: 400)` a **cualquier** llamada de Stream —
incluso a una simple *lectura* del estado de un video.

### Cómo se comprobó

1. Se subió un video real de 985 MB por la ruta multiparte y se disparó la copia.
   Falló igual.
2. Se dejó `wrangler tail` corriendo durante el intento: llegó **únicamente** el
   `POST` a `procesarVideo`. **Ninguna petición a `/api/e/origen`.** O sea, Stream
   nunca llegó a pedirnos el archivo: el rechazo pasa antes, en la API de Cloudflare.
3. Se consultó el estado del video ya existente de Mireya — una operación de solo
   lectura, sin ninguna URL nuestra de por medio. **También falla, con el mismo
   9106.**

### Por qué se diagnosticó mal

Dos cosas se juntaron:

- **El mensaje de Stream engaña.** "Authentication failed" al copiar una URL se lee
  como "no pude autenticarme *contra esa URL*", cuando significa "tu token no está
  autorizado".
- **`estadoVideo` se tragaba el error**: devolvía `null` sin decir por qué, así que no
  había forma de distinguir "el video no existe" de "el token no sirve". Ya arreglado:
  ahora devuelve el código y el mensaje de Cloudflare.

La lección de método: **antes de culpar a la pieza nueva y complicada (nuestro origen
firmado), hay que probar la operación más simple posible** (una lectura). Si esa
también falla, el problema nunca estuvo donde se buscaba.

### Lo que falta

Bruno tiene que generar un API token con **Account → Stream → Edit** y aplicarlo:

```bash
npx wrangler secret put CF_MEDIA_TOKEN
```

Y **después un deploy**, porque `wrangler secret put` solo no lo aplica (§14).
Ese mismo token necesita también **Account → Cloudflare Images → Edit** si se quiere
conservar el borrado de Images heredado.

Con eso queda cerrado A2, y A3 (la copia limpia al liberar) se puede ejercer por fin:
depende de la misma llamada.

**Mientras tanto**, subir un video arrastrándolo deja el archivo bien en R2 pero sin
marca de agua en Stream. El rodeo sigue siendo copiar desde Drive — que funcionaba
porque se hizo cuando el token todavía servía.

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

**Y no bastaba con el cron.** Hasta el 12 ago, borrar una entrega a mano dejaba su
material colgado en R2 y en Stream, pagándose para siempre y sin forma de
encontrarlo. Se habían acumulado **2,074 MB** (§18.9). Ya está arreglado, y el menú
de configuración tiene un botón para buscar y borrar restos: conviene correrlo de
vez en cuando, porque cualquier subida que falle a la mitad deja basura.

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
13. **Un secret que existe no es un secret correcto.** `wrangler secret list` muestra
    **nombres, nunca valores**: la lista se ve bien mientras el contenido está mal. La
    única verificación real es usarlo. Costó un diagnóstico entero (§18.8).
14. **Antes de culpar a la pieza nueva y complicada, probar la operación más simple.**
    Se dio por hecho que Stream no podía leer nuestro origen firmado; bastaba una
    *lectura* de estado —sin ninguna URL nuestra— para ver que fallaba igual y que el
    problema era el token (§12b).
15. **`obj.range` de R2 viene lleno aunque nadie pida un rango.** Fiarse de él hace que
    una descarga normal conteste 206. Quien manda es la petición (§18.7).
16. **Cloudflare descarta el `Content-Length` que pongas a mano** si el cuerpo es un
    stream normal: responde `chunked`. Solo `FixedLengthStream` lo conserva.
17. **Un `TransformStream` normal cuesta CPU por byte**, aunque tu código no toque los
    datos. Para mover volumen dentro de un Worker: `FixedLengthStream` o
    `IdentityTransformStream` con `pipeTo` (§18.3).
18. **`Expand-Archive` de Windows no valida el CRC.** Un test que dependa de eso da
    falso verde.
19. **`background-image` se descarga SIEMPRE y todo junto.** No hay carga diferida
    posible. Cualquier cuadrícula que pida imágenes al Worker tiene que usar
    `<img loading="lazy">`; si no, 50 miniaturas son 50 transformaciones simultáneas
    que tumban al Worker **y a las subidas que corran al mismo tiempo** (§20.4).
20. **`window.innerWidth` puede ser 0**: pestaña en segundo plano, o antes de que
    termine el layout. Restarle un margen da un ancho **negativo** y las URLs salen
    imposibles. Medir el contenedor y poner piso (§20.5).
21. **La carga diferida nativa no arranca si la ventana mide 0.** El navegador concluye
    que nada está cerca de la pantalla. Hace falta una red de seguridad que fuerce la
    carga, y **por tandas** (§20.5).
22. **Los cron de Cloudflare no son puntuales.** Medido: tramos de 3 minutos sin
    ninguna ejecución y luego varias de golpe. No prometer un número en la interfaz.
23. **No colgar lógica de comparar `event.cron` con una cadena exacta.** Así se quedó
    sin ejecutar la preparación entera. Que lo barato corra siempre y lo caro sea lo
    que cuelga de la comparación (§20.2).
24. **Un elemento atorado al frente de una fila ordenada la bloquea completa.** El cron
    ordenaba por fecha y siempre agarraba el mismo archivo imposible. Lo que falla hay
    que marcarlo para no reintentarlo (§20.2).
25. **No medir con la herramienta que hace el trabajo.** Se contaban los pendientes con
    un endpoint que *procesa* al consultar: las mediciones movían lo que intentaban
    medir y además chocaban con el cron. Para medir, consultar D1 directo (§20.2).
26. **El runner de GitHub falla a veces al clonar** (`server certificate verification
    failed`). No es el código: `gh run rerun <id>`.
27. **El borde y el navegador son dos cachés distintas.** Meter el estado en la llave
    del borde no sirve de nada si la URL que ve el navegador no cambia: él guarda por
    URL y no sabe nada de esa llave. Cualquier cosa que se sirva distinto según un
    estado tiene que llevar ese estado **en la URL**. Costó que el cliente siguiera
    viendo la marca de agua después de pagar, y no lo detecta ninguna prueba de
    servidor: `curl` no tiene caché (§22.1).

---

## 15. Lo que falta para terminarlo

> **Actualizado el 12 ago 2026.** El sistema está completo y el ciclo entero se
> probó de punta a punta con material real. Ya no queda ningún camino sin ejercer.
> Lo que sigue en esta lista es de otro tipo: cosas que solo Bruno puede hacer,
> cosas que solo el tiempo puede probar, y deuda menor.

### A. Lo que estaba roto — todo cerrado

| # | Qué era | Estado |
|---|---|---|
| A1 | La copia reducida no se generaba al subir; el 1102 seguía vivo | ✅ cerrado (§18.1, §18.2) |
| A2 | Un video subido desde el navegador se quedaba sin marca de agua | ✅ cerrado (§12b, §18.8) |
| A3 | La copia limpia del video al liberar nunca había corrido | ✅ cerrado (§18.9) |

Los tres tardaron más de lo que parecía porque los tres tenían un diagnóstico
equivocado escrito en este documento. Ver §12b y §18.3.

### B. El ciclo — completo

| # | Qué faltaba | Estado |
|---|---|---|
| B1 | F7: liga en el evento de Calendar | ❌ **descartada por Bruno** |
| B2 | Descargar todas las fotos en un ZIP | ✅ hecho y probado con 476 MB (§18.3) |
| B3 | Ejercer la liberación con material real | ✅ ciclo completo probado (§18.9) |
| B4 | Subida multiparte de un video grande | ✅ 985 MB en 11 partes (§18.7) |
| B5 | Probar en un teléfono de verdad | ⬜ **pendiente — solo Bruno** |
| B6 | Dejar pasar los 14 días reales | ⬜ **pendiente — solo el tiempo** |

**B5** importa más de lo que parece: todo se validó en escritorio y en ancho de
celular simulado. El visor del cliente tiene gesto de deslizar y **nunca ha tocado
una pantalla táctil de verdad**.

**B6**: la expiración solo se probó forzando vigencias cortas. El cron corre cada
hora y borra R2 + Stream; ese camino sí está bien (`expirarEntregas` siempre borró
el material, ver §18.9), pero un ciclo real de dos semanas no ha ocurrido.

### C. Decisiones de Bruno

| # | Qué | Estado |
|---|---|---|
| C1 | Las 5 variantes `-1-N` de Mireya | ⬜ abierto |
| C2 | Poder elegir la portada | ✅ **hecho** (§19) — clic en la miniatura |
| C3 | Qué pasa con la entrega de Mireya | ⬜ **abierto y con enlace vivo** |
| C4 | Densidad del mosaico (`ANCHO_MARCA = 0.45`) | ⬜ abierto |
| C5 | Cuándo se apaga R123 | ⬜ abierto |
| C6 | Backfill de entregas para contratos viejos | ⬜ abierto |
| C7 | Registrar pagos desde este portal | ❌ **NO por ahora** |
| C8 | Los 5 PNG colados en la entrega de Felipe | ⬜ **abierto** |

**C3 — Mireya. CERRADO el 18 ago:** Bruno aclaró que **todas las entregas que hay
son demos, no clientes reales**. El material es real y el saldo de $4,500 sale del
contrato, pero no hay nadie esperando del otro lado. Deja de ser urgencia y deja de
ser decisión pendiente. Lo mismo vale para la de Felipe (C8) y para §21 entero: lo
que hay es banco de pruebas, no entregas vivas.

**C7 — Registrar pagos aquí.** Se planteó el 12 ago. Es factible y usaría el mismo
motor que admin, con el efecto bonito de que registrar el pago **liberaría la
entrega sola**. Bruno decidió que no por ahora: rompería el aislamiento — hoy este
sistema solo lee de los contratos y nunca escribe.

**C8 — Basura en la entrega de Felipe.** Tiene `marca-agua-stream.png` y cuatro
`Sequence 01…Still00X.png` que se colaron en una subida. Se quitan con el modo
nuevo del portal.

### D. Deuda técnica

**Lo que urge más:**

- **Rotar `CF_MEDIA_TOKEN`.** Se pegó en el chat **dos veces**, y el 12 ago se
  recuperó del historial de la sesión para arreglar §12b. Sigue activo. Hace falta
  uno nuevo con **Stream → Edit** e **Images → Edit**; `wrangler secret put` y
  **después un deploy** (§14).

**Lo demás:**

- ~~`ENTREGAS_KEY` sin configurar~~ ✅ hecho el 11 ago. La `ADMIN_KEY` sigue siendo
  aceptada a propósito, para no quedarse fuera si se pierde la otra.
- **El parámetro `?m=`** sigue expuesto en producción. Inofensivo (solo cambia la
  escala del mosaico) pero es andamio de depuración.
- **El error de `procesarVideo` devuelve una URL de origen firmada** para poder
  probarla a mano. Solo la ve quien tenga la llave, pero es información de más.
- **Columnas muertas:** `images_id` e `images_hash` en `e_archivos` ya no se
  escriben. `borrarDeImages` se conserva por si quedaran registros viejos.
- **Sin interfaz:** `procesarVideo`, `estadoVideo` y `sembrar` se siguen llamando a
  mano por API. `derivados` y `huerfanos` ya tienen botón.
- **`generarDerivado` no reintenta** si falla: la foto queda sirviendo del original
  y solo va lenta. El portal debería reportarlo.
- **La descarga del cliente no tiene barra propia.** Se apoya en la del navegador,
  que ahora sí avanza porque se anuncia el tamaño (§18.3). Una barra dentro de la
  página obligaría a recibir el archivo en memoria antes de guardarlo, y con 1 GB
  eso truena un celular. Decisión consciente, no olvido.
- **Correr `huerfanos` de vez en cuando.** Cualquier subida que falle a la mitad
  deja restos que nadie más va a encontrar. Está en el menú de configuración.
- **El ZIP rechaza la entrega si algún archivo quedó con `crc32 = -2`** (se intentó
  preparar y no se pudo). Hoy contesta "faltan N por preparar", que en ese caso es
  confuso porque no se van a preparar nunca. Debería decir cuáles y ofrecer excluirlos.
- **`asegurarCrc` no tiene tope de tamaño.** Con el video de 986 MB reventaba el CPU
  cada minuto (§20.2). Los videos ya salieron del filtro, pero una foto de 60 MB haría
  lo mismo: un solo intento, marcarla `-2` y seguir. Conviene un tope explícito.

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

### Si retomas esto sin contexto, empieza por aquí

1. **Correr la migración `r133-destacadas.sql`** en D1. El código ya la da por hecha
   (§22.4): sin ella no existe la columna `portada`.
2. **Rotar el token** (D). Es lo único que bloquea trabajo de video.
3. **Abrir una entrega en un teléfono real** (B5).

Lo que **ya no** es prioridad: decidir qué pasa con las entregas que hay. Son demos
(§4 C3). No hay ningún cliente esperando.

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

### 18.7 A2 resuelto y B4 probado (madrugada del 12 ago)

- **B4 — subida multiparte con un video real: FUNCIONA.** Se subió el MP4 de 985 MB en
  11 partes de 90 MB; todas confirmaron etag y R2 ensambló el archivo. Era la ruta que
  nunca se había ejercido.
- **A2 diagnosticado de verdad** — ver §12b. No era nuestro origen: es el token. Se
  corrigió el diagnóstico equivocado que llevaba varias sesiones escrito aquí.
- **F7 (liga en el Calendar) descartada por Bruno.** No se hará; el adapter no se toca.
- La entrega de prueba con el video se borró: no quedan 985 MB colgados en R2.

**Siguiente al retomar:** token nuevo con permiso de Stream → cierra A2 y desbloquea
A3 (la copia limpia al liberar, que nunca ha corrido). Después, rediseño del **portal
de control** para hacerlo más fácil de usar — pedido por Bruno el 11 ago.

### 18.8 A2 CERRADO — el token estaba puesto, pero con el valor equivocado

Segunda corrección del mismo problema en una noche, y la lección es distinta a la de
§12b.

**Qué pasó:** tras concluir que el token no tenía permisos de Stream, Bruno preguntó
*"¿no te había dado ya un token con eso?"*. Lo tenía. En el historial estaba el token
que se generó justamente para esto, y **sigue vivo y funcional**: verificado contra
`/user/tokens/verify` (`status: active`) y contra `/stream/watermarks` (`success: true`).

El secret `CF_MEDIA_TOKEN` **existía** en el Worker — aparece en `wrangler secret
list` — pero su **valor** no era el de ese token. En algún punto quedó guardado otro.
`secret list` solo muestra nombres, nunca valores, así que la lista se veía correcta
mientras el contenido estaba mal.

**Se repuso y se desplegó.** Verificado en producción:

- `estadoVideo` sobre el video de Mireya: `ready`, 100 %, 2160×3840. Antes: error 9106.
- **Stream copió un video de 985 MB desde `/api/e/origen`** — la operación que llevaba
  sesiones declarada imposible. Terminó en `ready` y se borró la copia de prueba.

**Lo que hay que aprender de esto:**

1. **Un secret presente no es un secret correcto.** `wrangler secret list` da falsa
   tranquilidad: confirma el nombre, no el contenido. La única verificación real es
   *usarlo*.
2. **Buscar en el historial antes de pedirle al usuario algo que ya dio.** Estuve a
   punto de mandar a Bruno a generar un token que ya existía y funcionaba.

**Nota honesta sobre el arreglo de `origen`:** en la misma sesión se le agregó
`Content-Length`, soporte de `Range` y respuesta a `HEAD` — porque se sospechaba que
Stream no podía leerlo. Resultó que la causa era el token, así que **no está probado
que ese cambio fuera necesario**. Se conserva porque es correcto de todos modos: un
origen que anuncia su tamaño y acepta rangos es lo que cualquier descargador espera de
un archivo de 1 GB.

**Estado de A2: cerrado.** Un video subido desde el navegador ya puede llegar a Stream
con su marca de agua. Falta ejercer **A3**: la copia limpia al liberar, que usa la
misma llamada y ahora debería funcionar.

### 18.9 A3 cerrado, y dos bugs que aparecieron al ejercerlo

**A3 — la copia limpia del video al liberar: FUNCIONA.** Ciclo completo con el MP4
real de 985 MB: subida multiparte → Stream con marca → publicar → liberar → copia
limpia → el cliente apunta sola a la limpia (`conMarca: false`). Verificado contra la
API de Stream: la copia con marca lleva `VistaPreviaIAV-Vertical` (el perfil vertical
correcto, porque el video es 2160×3840) y **la limpia no lleva ninguna**.

Con eso, **el ciclo completo del sistema está probado de punta a punta con material
real.** Ya no queda ningún camino sin ejercer.

Pero ejercerlo destapó dos bugs, y los dos habrían pegado en el peor momento.

#### La copia "limpia" habría salido CON marca

`pedirVideoLimpio` pasaba `null` como perfil, y `copiarAStream` hacía
`watermarkUid || env.STREAM_WATERMARK_UID`. Con `||`, "va limpia a propósito" y "no me
dijeron nada" se ven **iguales**, y ganaba el default.

O sea: el cliente paga, se genera su copia sin marca… con marca. Pagó para seguir
viendo lo mismo. Se separó en `uidWatermark()`: `undefined` = usa el de siempre;
`null` o vacío = ésta va limpia. 3 tests.

**Encontrado leyendo el código antes de ejecutar, no en producción.** Vale la pena
notarlo: el `||` que colapsa "vacío" con "no especificado" es un error clásico y aquí
costaba caro.

#### Borrar una entrega dejaba el material colgado, pagándose

`borrarEntregaCascada` borraba **solo los registros de la base**. Y como los registros
son lo único que sabe dónde vive cada archivo, borrarlos primero convertía todo el
material en huérfanos imposibles de encontrar después.

Medido: **2,074 MB en R2 y 2 videos en Stream** acumulados de entregas borradas.
Todo eso se estaba pagando en silencio.

Arreglado: primero el material, después los registros. Si el material falla, los
registros se borran igual —dejar la entrega a medias sería peor— y lo que no se pudo
borrar queda en el log. Afecta también a `eliminarContrato`.

`expirarEntregas` **ya lo hacía bien**: ese camino nunca estuvo roto, lo cual explica
que no se notara antes.

#### Herramienta nueva: `huerfanos`

```
GET /api/e/huerfanos            lista material sin registro (R2 + Stream)
GET /api/e/huerfanos?borrar=1   lo borra
```

Nunca toca `sistema/` (la marca de agua), y en Stream solo considera los videos que
este sistema creó (`entrega-*`, `limpio-*`): los de R123 no son asunto suyo.

Se corrió: **43 archivos y 2 videos borrados, 0 fallos.** Después: 0 huérfanos.
Verificado que las 4 entregas reales quedaron intactas y sirviendo.

**Conviene correrlo de vez en cuando**, porque cualquier fallo a media subida deja
restos que nadie más va a encontrar.

#### Corrección a lo que se reportó antes

En §18.7 se dijo que al borrar la entrega de prueba se liberaron "985 MB de R2".
**Era falso** — por este mismo bug, no se liberó nada. Los 985 MB siguieron ahí hasta
la limpieza de huérfanos.

---

## 19. Rediseño del portal de control (12 ago 2026)

Mockup en `design/entregas-portal-v2.html`, con las 4 entregas y las 50 fotos
reales. Implementado en `frontend/entregas.html`.

### Qué estaba mal

- **La lista eran tarjetas gigantes** ordenadas por estado interno. Con 20 entregas,
  scroll infinito para leer cuatro datos por entrega.
- **El dato que Bruno viene a buscar no estaba**: "Completa" o "0 de 1", chiquito y
  abajo a la derecha, no dice qué hay que hacer.
- **No había buscador.** Con 30 entregas no hay forma de encontrar a nadie.
- **En el detalle, la acción vivía al final de 50 miniaturas.** Para publicar había
  que hacer scroll por toda la galería.
- **Cada miniatura repetía un nombre truncado** (`IAV-2607.17…`) que no distingue
  nada y duplica el alto de la cuadrícula.
- **Borrar una foto era una X al pasar el mouse.** Con archivos de 10 MB, un clic
  accidental cuesta volver a subirlos.
- **Elegir portada existía pero era invisible**: solo se descubría por accidente.

### Qué se hizo

- Lista agrupada por **qué toca hacer** — *Por hacer / Esperando pago / Entregadas /
  Se borran pronto* — y dicho en palabras: "Falta subir Fotografías", "Esperando pago
  · $4,500", "Se borra en 2 días". El **cliente** pasa a ser lo primero de cada fila.
- **Buscador** por cliente, folio o dirección. Se oculta dentro del detalle.
- **Barra de acción pegada arriba** con el siguiente paso y sus botones. Se quitaron
  los duplicados del panel lateral: dos botones que hacen lo mismo en la misma
  pantalla no guían, compiten.
- **Cuadrícula densa** sin nombres; el nombre en el tooltip.
- **Modo quitar explícito**: se entra a propósito, se eligen, y la barra dice cuántos
  se van antes de confirmar.
- **La portada se ve**: cinta, estrella llena, estrella hueca al pasar el mouse, y una
  línea que lo explica. No aparece con una sola foto.
- **Menú de configuración** (engrane) con limpiar sin pagar, buscar material sin dueño
  y cambiar contraseña. Lo que borra material deja de estar junto al botón diario.
- Si se **libera a mano con saldo pendiente**, se dice explícito: *"Liberada a mano. En
  el contrato siguen debiendo $X"* — antes se leían "Liberada" y "Saldo $4,500" como
  una contradicción, cuando las dos son ciertas.

### Decisiones de Bruno

- **F7 (liga en el Calendar): descartada.** No se hará.
- **Registrar pagos desde este portal: NO por ahora.** Se puede —sería el mismo motor
  que admin y liberaría la entrega sola— pero rompería el aislamiento: hoy este
  sistema solo lee de los contratos, nunca escribe.

### Cómo se conecta con el admin (respuesta a una pregunta recurrente)

No copia nada, **lee en vivo**. Comparte la base D1. Cada entrega guarda el
`contrato_token` y con eso lee `saldo_pendiente` de `contratos` en cada consulta. Los
datos del cliente igual, de `clientes`. Por eso corregir un teléfono en admin se
refleja aquí solo. Liberar **no toca el contrato**.

### Bugs propios encontrados al probar en producción

1. **"← Todas las entregas" duplicado** al mover el título a la barra de acción.
2. **Hueco enorme donde iba el buscador**: ocultarlo con `visibility` deja reservada
   su fila entera, que en pantallas angostas es una franja vacía.
3. **La barra pegajosa quedaba tapada por el encabezado** — los dos empezaban en
   cero. Se **mide** el alto del encabezado en vez de fijar un número, porque cambia
   con el ancho.
4. Las filas se apilaban ya a 820 px, lo que las hacía el doble de altas sin ganar
   nada. Ahora solo en celular (560 px).

Verificado en producción: buscador (filtra y da vacío coherente), modo quitar
(entra, marca, cuenta, cancela sin borrar nada), menú (abre, cierra al hacer clic
fuera), barra pegajosa (queda justo debajo del encabezado al hacer scroll), y las 50
miniaturas intactas con su portada marcada.

---

## 20. Preparación automática y errores con nombre (12 ago 2026)

Dos cosas que Bruno pidió después de usar el sistema de verdad.

### 20.1 La galería se prepara sola

Antes había que dejar la ventana abierta mirando una barra. Ahora un cron
(`*/2 * * * *`) llama a `prepararPendientes()`, que procesa **3 archivos por
ejecución**: cada uno decodifica un JPEG de 10 MB y pasarse revienta el CPU.

El botón sigue existiendo como **"Prepararlas ya"**, para cuando quieres publicar
sin esperar.

**Honestidad sobre la puntualidad:** los cron de Cloudflare **no son puntuales**.
Medido: hubo tramos de 3 minutos sin ninguna ejecución y luego 3 archivos de golpe.
Por eso la interfaz dice "unos minutos" y no promete un número.

### 20.2 Tres bugs en el camino, todos del mismo tipo

**Colgar de una comparación exacta.** La primera versión hacía
`if (event.cron === '* * * * *')` para separar el cron minutero del horario. No se
ejecutó **nunca**. Ahora `prepararPendientes` corre en **todas** las ejecuciones —es
barato e idempotente— y lo pesado (sincronización, respaldo, expiración) es lo que
cuelga de la comparación, al revés: se salta si NO es el horario. Si ese valor
llegara raro, se prepara de más en vez de no prepararse nunca.

**Un archivo atorado bloqueaba la fila entera.** El cron ordena por fecha y siempre
agarraba los mismos primeros. Al frente estaba **el video de Mireya de 986 MB** con
el CRC sin calcular: pedirle el CRC revienta el CPU, falla, y al minuto siguiente le
vuelve a tocar a él. Nada más se preparaba nunca, y ese 1102 además tumbaba las
peticiones vecinas. Dos arreglos: los videos salen del filtro (no llevan copia
reducida ni entran al ZIP, así que **nunca necesitaron CRC**), y lo que se intenta y
no se puede se marca `crc32 = -2` y deja de reintentarse.

> **Convención:** `crc32 = -1` es "nunca se intentó"; `-2` es "se intentó y no se
> pudo". Cualquier consulta de pendientes debe usar `= -1`, no `< 0`.

**Medir con la herramienta que hace el trabajo.** Durante el diagnóstico usé el
endpoint `derivados` para contar pendientes — pero ese endpoint *procesa* al
consultar, así que mis mediciones movían lo que intentaban medir, y encima chocaban
con el cron y devolvían 1102. Las mediciones fiables salieron de consultar D1
directamente.

### 20.3 Cuando falla una subida, se dice cuál

Antes el aviso era "2 fallaron" y tocaba adivinar cuáles de 50 y volver a buscarlas
en el disco. Ahora sale una tabla con **el nombre de cada archivo y qué pasó**, y un
botón **"Reintentar N"** que los vuelve a subir sin volver a elegirlos: los `File`
quedan guardados en memoria.

### 20.4 Otro efecto secundario del rediseño

Las miniaturas del portal iban como `background-image`, que el navegador **descarga
siempre y todo junto**. Con 50 fotos son 50 transformaciones simultáneas: tumban al
Worker y —lo que Bruno reportó— tumban también las subidas que corren al mismo
tiempo, con 503 en `subirFoto`. En su consola se veían las dos mitades. Ahora van
como `<img loading="lazy">`.

**Lección que ya se repitió tres veces:** cualquier cuadrícula que pida imágenes al
Worker tiene que cargarlas de forma diferida. No es refinamiento visual, es lo que
mantiene al Worker de pie.

### 20.5 Y el bug que Bruno vio en el enlace del cliente

La galería pedía las fotos con **ancho negativo** (`w=-36&d=-18`): el cálculo era
`window.innerWidth - 36`, y cuando la ventana reporta 0 —pestaña en segundo plano, o
antes de que termine el layout— sale negativo y no carga ninguna. El hero sí se veía
porque tenía un valor de respaldo (`|| 375`).

Tres arreglos, en capas: el ancho se mide del **contenedor**; `fotoUrl()` rechaza
cualquier ancho inválido y cae a 375, así que ningún otro punto puede repetirlo; y si
la carga diferida nunca arranca (pasa cuando la ventana mide 0), a los 2.5 s se
fuerzan **de a 6 con pausa**.

---

## 21. Estado del material el 12 ago 2026

Foto del momento, para que quien retome sepa qué hay vivo y no lo confunda con basura.

> **Corrección del 18 ago 2026:** todo lo de esta tabla son **demos**. El material es
> real y los saldos salen de contratos reales, pero **no hay ningún cliente esperando
> su entrega**. Sirve como banco de pruebas —es material de verdad, que es donde
> aparecen los bugs de verdad— y nada más. Los enlaces vivos no son un riesgo.

| Entrega | Estado | Material | Nota |
|---|---|---|---|
| **Mireya Gómez** (IAV-2607.17-A) | publicada | 45 fotos + video | **Saldo $4,500.** Enlace vivo, nunca enviado. Decidir si se pausa (C3). |
| **Felipe johnson** ("casita") | publicada | 50 fotos | Quedó publicada; si fue sin querer, pausar. Trae 5 PNG colados (C8). |
| **Valeria Castillo Ceuz** (IAV-2608.04-A) | borrador | 8 fotos | De la tanda donde fallaron 2 por el 503 de §20.4. |
| **Gustavo Sepulveda** (IAV-2608.04-B) | borrador | vacía | Sembrada del contrato. |

- **0 archivos pendientes de preparar** en todo el sistema.
- **0 huérfanos** en R2 y en Stream.
- En Stream viven el video de Mireya (`prueba-auth`) y **6 videos de R123**, que no son
  de este sistema y que `huerfanos` ignora a propósito.

### Cuentas de las pruebas de esta semana

Todo lo creado para probar se borró: entregas `ZZZ PRUEBA *`, la copia de Stream
`PRUEBA-A2-borrar`, y los 2 GB de huérfanos que había dejado el bug del borrado.
Lo que queda arriba es material real de Bruno.

---

## 22. Sesión del 18 ago 2026 — la marca que no se quitaba, y la galería de destacadas

Dos cosas pedidas por Bruno. La primera era un bug real y del peor tipo: el único que
se enteraba era el cliente, justo después de pagar.

### 22.1 Las fotos seguían con marca de agua después de liberar

**El servidor nunca estuvo mal.** Decide mosaico o no según el estado, y su caché de
borde ya llevaba `st=limpia|marcada` en la llave — eso se había previsto desde el
principio y funcionaba.

Quien no distinguía nada era el **navegador**. Guarda por URL, y la URL de una foto
—`/api/e/foto?a=…&w=…&d=…`— era **idéntica** antes y después de liberar. Con
`Cache-Control: public, max-age=86400`, quien había abierto su galería sin pagar
seguía viendo el mosaico un día entero, servido de su propio disco, sin volver a
preguntarle a nadie. Pagaba y veía exactamente lo mismo.

Es la clase de falla que no aparece en ninguna prueba de servidor: `curl` no tiene
caché, y una pestaña recién abierta tampoco. Solo la sufre quien miró antes de pagar
—o sea, el cliente, siempre.

**El arreglo, en dos capas.**

`versionFotos()` vive en `entregas-core.js` y devuelve una cadena que cambia al
liberarse (`m` mientras tiene marca, `l<fecha>` cuando ya no). El payload público la
manda como `fotoVer`; las dos páginas la cuelgan de la URL como `&v=`. **El servidor
la ignora por completo**: su único trabajo es que la URL deje de ser la misma, para
que el navegador la trate como una foto que nunca ha visto.

Y el `Cache-Control` se parte en dos plazos, que antes eran uno solo:

| Quién | Antes | Ahora | Por qué |
|---|---|---|---|
| Borde de Cloudflare | 86400 | `s-maxage=86400` | Es quien absorbe la carga, y ya distingue marcada de limpia |
| Navegador | 86400 | `max-age=300` | No distingue nada; 5 min es el respaldo por si algo pide sin `&v=` |

**Cómo se comprobó, que es lo que vale.** Con un servidor de prueba que cuenta
peticiones y responde con el `Cache-Control` de producción, cargando las fotos desde
el navegador de verdad:

| | Peticiones que llegan al servidor |
|---|---|
| URL sin `&v=` (lo de antes), vista con marca y luego liberada | **1** ← la segunda salió del disco: mosaico |
| URL con `&v=`, mismo recorrido | **2** ← la segunda va al servidor: limpia |

6 tests nuevos sobre `versionFotos`, incluido el caso de la entrega **vencida**: al
expirar el servidor vuelve a poner el mosaico, así que la versión también tiene que
regresar a `m` o el navegador seguiría mostrando la limpia que alcanzó a guardar.

> **Trampa nueva, y es general:** el borde y el navegador son dos cachés distintas.
> Meter el estado en la llave del borde no sirve de nada si la URL que ve el
> navegador no cambia. Cualquier cosa que se sirva distinto según un estado tiene que
> llevar ese estado **en la URL**, no solo en la llave de caché del servidor.

### 22.2 La galería: un muestrario, no un archivero

Antes caían las 45 fotos de golpe, todas del mismo tamaño y en el orden en que se
subieron. Orden nuevo del portal del cliente:

**portada → descarga → video → 6 destacadas EN GRANDE → botón "Ver las 45" → el resto.**

- Las destacadas van a **una columna en celular y dos en escritorio**: medido, 339 px
  contra los 166 px del mosaico en un teléfono de 375. El doble o el triple.
- Si nadie marcó destacadas, caen las primeras 6. Si Bruno marcó 10, se muestran las
  **10**: es su decisión, no la del sistema. El 6 solo manda cuando nadie eligió.
- **El resto no se monta hasta que se pide.** No es refinamiento visual: cada
  miniatura es una transformación del Worker, y no tiene caso pagar 39 por fotos que
  quizá nadie abra.
- El visor sigue navegando sobre **todas** las fotos, en el orden en que se ven. Por
  eso `fotos()` devuelve la lista ya ordenada —destacadas primero— y cada tanda sabe
  desde qué índice empieza: si el orden de la página y el del visor no coincidieran,
  tocar la tercera foto abriría otra distinta.
- Con 6 fotos o menos no aparece el botón.

### 22.3 Elegir portada y destacadas, en el portal de control

Las miniaturas medían **62 px** — un timbre postal donde no se distingue una foto de
otra — y encima elegir portada era un clic invisible sobre esa miniatura. Aquí se
toman dos decisiones y las dos piden ver la foto de verdad.

- Miniaturas de **150 px**, con las dos acciones **siempre a la vista**: palomita
  (entra al muestrario) y estrella (es la portada). Escondidas tras el hover no
  existen: la portada llevaba meses sin poder cambiarse porque nadie sabía que se
  podía.
- Contador **"N de 6"** arriba, para no ir contando anillos dorados en una cuadrícula
  de 50.
- La portada cuenta como destacada y **no se puede sacar del muestrario desde ahí**:
  el servidor lo rechaza con un mensaje que dice qué hacer ("elige otra portada y
  luego quítala"), en vez de ignorar el clic en silencio.
- **En modo quitar, la tira vuelve a ser un solo botón.** Ahí la única decisión es
  cuál se va, y dos acciones más encima invitan al accidente que ese modo vino a
  evitar.

### 22.4 Migración r133

`portada` se separa de `destacado`. Hasta aquí `destacado` significaba las dos cosas
porque solo hacía falta una: era la portada y era exclusiva.

| Columna | Qué significa ahora |
|---|---|
| `portada` | 0/1, a lo más **una** por entrega. La foto grande de la cabecera |
| `destacado` | 0/1, **varias** por entrega. El muestrario |

Lo ya elegido se conserva: las que eran `destacado=1` pasan a `portada=1` y siguen
destacadas. La portada siempre cuenta como destacada — sería raro que la foto elegida
como la mejor no apareciera entre las mejores.

### 22.5 Qué falta de esto

- **Correr la migración r133 en D1.** El código la necesita: sin ella, `portada` no
  existe como columna y el `SELECT *` no la trae.
- Verlo en un **teléfono real** (sigue siendo B5). Las destacadas se midieron a
  375 px emulados, no en una pantalla táctil.
- El número 6 vive en `DESTACADAS_VISIBLES` (`routes/entregas.js`) y el portal lo lee
  del servidor, así que cambiarlo es una línea.
