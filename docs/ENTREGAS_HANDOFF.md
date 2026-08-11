# Handoff — Sistema de Entregas (R129–R130)

> Documento vivo. Si retomas esto sin contexto previo, **empieza aquí** y usa
> `docs/superpowers/plans/2026-08-11-sistema-entregas.md` para el plan por fases.
>
> Última actualización: 2026-08-11
> Rango de commits: `9994f46..294c96b` (17 commits, +4795 líneas)

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
| F5 — Liberación, reloj, descargas | ✅ en producción (sin ZIP) |
| F6 — Expiración y limpieza | ✅ cron activo |
| F7 — Liga en el evento de Calendar | ⬜ **no empezada** — requiere publicar el adapter a mano |

**Bloqueo activo:** `CF_MEDIA_TOKEN` no tiene permiso de Stream, así que el video no
puede recibir la marca de agua. Ver §12.

**Verificación:** 63 pruebas unitarias + 52 verificaciones end-to-end contra la D1 de
producción, más prueba de humo sin regresiones en los endpoints y páginas existentes.

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

Está en **borrador**: nada expuesto. Ruta:
`https://entregas.inmueblesaudiovisuales.com/IAV-2607.17-A-7bbkvv7wxa`

**Usar material real fue lo que encontró el bug más grave** (§11 #14). Con imágenes
de prueba generadas nunca habría salido.

### Lo que NO se ha probado

- La marca de agua **en el video** (bloqueada por el token, §12).
- La subida de un video grande **desde el navegador** por la ruta multiparte. El
  código está desplegado, pero el video de esta prueba entró por Drive, no arrastrado.
- El comportamiento del portal del cliente **en un teléfono real** (solo emulado).
- La expiración real a los 14 días (se probó forzando vigencias cortas).

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

## 12. Bloqueo activo: `CF_MEDIA_TOKEN`

Stream rechaza con **"Authentication error"**. El secreto existe en el Worker, pero
al parecer se creó solo con permiso de Images, no de Stream. Eso explica por qué
`STREAM_CUSTOMER_CODE` estaba vacío: **ningún video pasó nunca por el Worker**, ni en
R123.

**Para desbloquear:** crear un token con **Cloudflare Stream: Edit** y **Cloudflare
Images: Edit** (nivel Account) y ponerlo con:

```bash
cd worker && wrangler secret put CF_MEDIA_TOKEN
```

Hasta entonces el video no recibe marca de agua y la copia limpia al liberar tampoco
se genera. Todo lo demás funciona.

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

---

## 15. Lo que falta

### Bloqueante para usarlo de verdad

- **`CF_MEDIA_TOKEN` con permiso de Stream** (§12).

### Siguiente en la fila

- **F7 — la liga de la entrega en el evento de Calendar.** Requiere modificar
  `adapter/AdapterScript4_v1.js` y **publicarlo a mano** en script.google.com. Son
  **tres** constructores de descripción los que hay que dejar iguales: `procesarFirma`,
  `crearEventoReservado` y `reagendarPropiedad`. Si uno se queda atrás habrá eventos
  con liga y sin ella sin patrón claro.
- **ZIP para bajar todas las fotos de un jalón.** Hoy se bajan en cascada, una por
  una, desde el navegador. El ZIP en streaming desde el Worker está pendiente.
- **Probar la subida de un video grande arrastrándolo**, no importándolo de Drive.

### Mejoras identificadas, sin urgencia

- Aviso al cliente por WhatsApp el día 11 (hoy solo lo ve si entra al portal).
- `www.inmueblesaudiovisuales.com` da 404; el ápice sí responde. Preexistente.
- No hay registro **DMARC** en el dominio. Hay SPF. Preexistente.
- Backfill masivo de entregas para los contratos viejos: `sembrar` con `todos:true`
  ya existe, falta decidir si se corre.

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
