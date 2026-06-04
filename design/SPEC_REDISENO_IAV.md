# SPEC MAESTRO — Rediseño Inmuebles Audiovisuales (admin + portal)

> **Para:** el modelo que ejecuta (Sonnet u otro), supervisado por Bruno.
> **Repo:** `inmueblesaudiovisuales-dev/contratos-iav-v4` (rama `main`). **Es la fuente de verdad** (no los archivos locales).
> **Entrega:** todo de un jalón · **commit directo a `main`** (GitHub Actions despliega en ~1 min) · production-ready.
> **Versión del spec:** 1.0 — derivada de una sesión de descubrimiento exhaustiva con el dueño.

---

## 0. CÓMO USAR ESTE DOCUMENTO

### ⛔ PREFLIGHT OBLIGATORIO — antes de TOCAR una sola línea
**No empieces a trabajar hasta completar esta verificación. Nunca uses versiones viejas ni asumas que tienes algo.**
0. **Entorno: corre LOCAL en la Mac de Bruno** (Claude Code CLI), **no** en la web/nube — porque la migración D1 necesita `wrangler` local. La Mac ya tiene **wrangler 4.88 autenticado** (OAuth, cuenta `inmueblesaudiovisuales@gmail.com`) y el repo **ya está clonado en `~/contratos-iav-v4`**. Trabaja ahí.
1. **El repo de GitHub `inmueblesaudiovisuales-dev/contratos-iav-v4`, rama `main`, es la ÚNICA fuente de verdad.** Usa el clon local `~/contratos-iav-v4` (haz `git pull`). No uses otras copias sueltas, ni `/tmp/...`, ni archivos de sesiones anteriores: pueden estar desactualizados.
2. **Asegura estado fresco:** `git fetch origin && git status` → confirma que estás en `main` y al día; si no, `git pull origin main`. Anota el hash del último commit y verifícalo contra lo que esperas. Si vas a empezar en un entorno limpio, **clona el repo de cero**.
3. **Confirma que tienes TODOS los archivos necesarios y son los del repo:**
   - `frontend/admin.html`, `frontend/portal.html`
   - `worker/` completo (`src/index.js`, `src/routes/*.js`, `schema.sql`, `wrangler.toml`, `migrations/`)
   - `adapter/AdapterScript4_v1.js`
   - `design/SPEC_REDISENO_IAV.md` (este), `design/design-system.css`, `design/B-dossier.html`, `design/BUILD_LOG.md`
   - `MASTER_V4.md` (contexto de DB/flujos) — **léelo también**.
4. **Verifica tamaños/coherencia:** `admin.html` debe rondar ~6,000 líneas y `portal.html` ~2,800. Si tienes un `admin.html` mucho más corto, es una versión vieja → NO la uses.
5. **Si falta cualquier archivo o no estás 100% seguro de tener la versión más reciente y completa: BÚSCALO.** Si tras buscar sigues sin poder confirmarlo, **DETENTE y pregúntale a Bruno.** No improvises sobre datos incompletos.
6. **Repite el `git pull` al inicio de CADA fase** (commiteas por fase; evita trabajar sobre estado viejo).

### MODO AUTÓNOMO (Bruno está dormido — no esperes input)
Una vez que el **preflight pasa**, ejecuta TODO de corrido (Fases 0→5) **sin pausar a preguntar**. Bruno no estará disponible. 
- **Único punto de parada dura: el preflight.** Si no puedes confirmar que tienes todos los archivos en su versión más reciente, **detente y deja el motivo en `BUILD_LOG.md`** (no construyas sobre archivos dudosos aunque eso signifique no avanzar; es preferible a romper con datos viejos).
- **De ahí en adelante, NO te detengas por dudas.** Toda ambigüedad (estética, microcopy, implementación, decisiones de producto no cubiertas) la resuelves con buen criterio siguiendo el espíritu del spec, y la **registras en `BUILD_LOG.md`**.
- Sé conservador solo con lo verdaderamente destructivo: no borres datos reales, no elimines columnas/tablas, no rompas el modelo ni `equipo.html`. Si algo así fuera necesario, **no lo hagas**: déjalo anotado como pendiente para Bruno y sigue con el resto.
- **Reporte matutino:** al terminar (o si te detienes), deja en `BUILD_LOG.md` un resumen claro para que Bruno lo lea al despertar: qué se hizo, decisiones tomadas, qué falta, y qué requiere su mano (desplegar el adapter; correr la migración si la saltaste; cualquier flag).

---

1. Lee este spec completo **antes** de tocar código.
2. Trabaja sobre el repo (`frontend/admin.html`, `frontend/portal.html`, `worker/`, `adapter/AdapterScript4_v1.js`).
3. **Antes de sobrescribir**, guarda respaldos: copia `frontend/admin.html` → `frontend/admin-v4-backup.html` y `frontend/portal.html` → `frontend/portal-v4-backup.html` en el primer commit.
4. Ejecuta el **QA de la sección 11** y haz una prueba manual de humo **antes** del push final.
5. Migraciones D1: se aplican con `wrangler d1 execute contratos-iav-v4 --remote --command="..."` o vía archivo en `worker/migrations/`. Entrega también el SQL en `worker/migrations/r57-rediseno.sql`.
6. El adapter de Apps Script (`adapter/AdapterScript4_v1.js`) **no se auto-despliega**: deja el archivo listo y avisa a Bruno que debe pegarlo en script.google.com y publicar nueva versión.

### Mandato de cambio (importante)
**Tienes autorización para modificar sin límites todo lo que el objetivo requiera** — refactorizar código desordenado, reescribir secciones enteras del frontend, agregar columnas/endpoints, y **arreglar cualquier bug que encuentres en el camino**. No seas tímido ni "minimalista por miedo". El único límite es: **(1) no perder funcionalidad existente, (2) no romper el modelo de datos ni `equipo.html`, (3) verificar que todo siga cargando y funcionando.** Si algo del sistema actual estorba al objetivo, cámbialo. Si encuentras una forma mejor que la que describe este spec, tómala (y déjala anotada). El dueño prefiere que hagas de más a que te quedes corto.

### Reglas de oro (no negociables)
- **Reorganiza y re-pinta con libertad, pero preserva el comportamiento.** Puedes mover, reescribir y refactorizar; lo que NO puedes es perder una función que el usuario usa hoy ni romper un endpoint/columna del que depende el backend o `equipo.html`. Ante la duda, conserva el handler/endpoint y cámbiale solo la UI.
- **No rompas el backend ni `equipo.html`.** El modelo de datos (clientes/trabajos/actividades/contratos/propiedades/tokens) se conserva. `equipo.html` lee por `token` de trabajo; sigue funcionando.
- **No refactorices el esquema de datos** más allá de los ALTER aditivos de la sección 9. Nada de renombrar/eliminar columnas o tablas.
- **Paridad cel/Mac:** todo funciona y se ve bien en móvil (se usa el 100% desde el celular) y en escritorio.
- **Production-ready:** sin `console.log` de basura, sin TODOs a medias, sin estados rotos. Maneja loading, error y vacío en cada vista.

---

## 1. CONTEXTO DE NEGOCIO (por qué este rediseño)

**Inmuebles Audiovisuales** — fotografía, video cinemático, drone y recorridos 360° para inmobiliarias en Monterrey. Lo operan **Bruno** (dueño) y **Danna** (hace contratos); **Fernanda** sube material desde `equipo.html`. Comparten un solo login (clave `framedock`); no importa quién hizo qué.

- **~20 contratos/mes**, 5-6 vivos a la vez. Ticket promedio **$4,500 MXN** (rango $3,000–$7,000). **99% de los contratos = 1 propiedad.**
- **Muchísimos clientes recurrentes.** Canal casi único: **WhatsApp**. Pago dominante: **transferencia (CLABE)**.
- **El admin existe para 3 cosas: cotizar/contratar · cobrar · tener al cliente a la mano.**
- **El problema:** la versión actual (v4/R35) se volvió compleja y mal organizada — metió una capa de CRM con sidebar, pipeline de "Trabajos", etapas y un panel sobrecargado que enterró el trabajo #1 (cotizar/contratar rápido). El dueño la describe como "horrible" y "poco funcional". Quiere volver a la sencillez veloz de v3, pero con un diseño con carácter.
- **Sensación deseada:** minimalismo tipo Apple + calidez editorial. "Eficiencia, que todo tenga su lugar."

---

## 2. SISTEMA DE DISEÑO ("Dossier" — Apple + editorial cálido)

Aplica a **admin y portal** (un solo sistema compartido). Define estos tokens una vez (en `:root`) y úsalos en todo; **no** dejes valores hardcodeados sueltos.

### 2.1 Principios
- Limpio, con mucho aire, jerarquía clara. Papel cálido + tinta + **dorado discreto** (acento, no protagonista).
- Tipografía cuidada (nada de "texto plano tipo Word").
- Precisión: **alineación al pixel, simetría perfecta, escala de espaciado consistente, geometría bien hecha.** El dueño nota lo chueco.

### 2.2 PROHIBICIONES (el dueño las rechaza explícitamente)
- ❌ **Emojis** en la UI. Usa íconos finos monocromáticos (Tabler Icons, ya incluido).
- ❌ **TEXTO EN MAYÚSCULAS** en labels/títulos (nada de `text-transform:uppercase` con `letter-spacing`). Usa sentence-case ("Saldo pendiente", no "SALDO PENDIENTE").
- ❌ Sombras pesadas/genéricas, bordes "burbuja", geometría asimétrica o mal alineada.
- ❌ Íconos de colores llamativos.

### 2.3 Paleta (hex exactos)
```
--paper-0:  #F7F4EC   /* canvas / fondo de la app (papel cálido) */
--paper-1:  #FFFDF8   /* tarjetas / superficies (marfil, NO #FFF puro) */
--paper-2:  #EFEADF   /* hover / zonas hundidas */
--line:     #E2DBCB   /* hairlines cálidas */
--line-2:   #D2C9B3   /* bordes de inputs */

--onyx:     #1C1C1E   /* topbar / texto fuerte / botón oscuro */

--gold:        #B08D2E /* dorado para TEXTO/ÍCONOS (pasa contraste AA en claro) */
--gold-leaf:   #C9A84C /* dorado de marca para SUPERFICIES/rellenos/botón primario */
--gold-pale:   #F3EAD0 /* fondos suaves dorados */

--ink-1:    #211E18   /* texto principal (tinta cálida casi negra) */
--ink-2:    #5C564A   /* secundario */
--ink-3:    #918975   /* terciario / labels / placeholders */

--ok:       #2F7D55   /* pagado / liquidado / éxito */
--warn:     #B0560E   /* saldo pendiente / atención */
--danger:   #B23A2B   /* error / cancelar / eliminar */
```
**Regla de contraste:** texto/íconos dorados usan `--gold` (#B08D2E); superficies/botón primario usan `--gold-leaf` (#C9A84C). Nunca texto fino en #C9A84C sobre claro.

### 2.4 Tipografía (Google Fonts) — HÍBRIDA
Carga: `Fraunces` (display serif, opsz) + `Inter` (UI sans) + `Spline Sans Mono` (cifras).
```html
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&family=Spline+Sans+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```
- **Fraunces (serif):** SOLO en montos grandes ($), nombre del cliente, y títulos de pantalla. Es el toque de carácter. No abusar.
- **Inter (sans):** toda la UI — labels, listas, botones, inputs, navegación. Limpia tipo SF.
- **Spline Sans Mono:** cifras de dinero, folios, CLABE, fechas tabulares. Usa `font-variant-numeric: tabular-nums` para que las columnas alineen.
- Reemplaza **todo** `'Courier New'` y `'Montserrat'` del código actual por este sistema.

### 2.5 Escala y formas
- Espaciado base **4px** (usa 4/8/12/16/20/24/32/48). Sé consistente.
- Radios: `--r:10px` (tarjetas/inputs), `--r-sm:8px` (chips/botones chicos), `--r-lg:14px` (modales/sheets).
- Sombras: muy sutiles. `--shadow: 0 1px 2px rgba(33,30,24,.04), 0 4px 16px rgba(33,30,24,.06)`. Prefiere hairlines (`--line`) sobre sombras.
- Hairline dorada de marca (1px `--gold-leaf`) bajo el topbar como firma sutil ("canto dorado").
- Modo **claro** únicamente. Define todos los tokens en `:root` de forma que un futuro modo oscuro sea posible (no lo implementes ahora).

### 2.6 Componentes base (definir una vez, reusar)
Botones (`.btn-primario` = `--gold-leaf` con texto `--onyx`; `.btn-onyx`; `.btn-ghost` con borde `--line-2`; `.btn-sm`). Inputs (fondo `--paper-1`, borde `--line-2`, foco borde `--gold` + halo `rgba(176,141,46,.12)`). Chips/badges (estatus). Tarjeta (`--paper-1` + `--line` + `--r`). Modal/bottom-sheet. Toast/mensaje (`.ok`/`.error`). Skeleton de carga. Todos sin mayúsculas, con íconos Tabler finos.

---

## 3. ARQUITECTURA DE INFORMACIÓN

### 3.1 Admin — navegación
- **Fuera el sidebar** (`#sidebar`, `#side-menu`, `sidebar-item`, `sm-nav-item`). 
- **Topbar** (onyx, hairline dorada) con marca tipográfica en CSS (texto "Inmuebles Audiovisuales" + marca/inicial dorada; sin archivo de logo) y, a la derecha, engrane **Ajustes** + salir.
- **Tabs principales: `Hoy` · `Contratos` · `Clientes`.**
- **Móvil:** bottom-nav con 3 destinos: `Hoy` · **Nuevo (FAB dorado central)** · `Contratos`; `Clientes` y `Ajustes` accesibles desde el topbar/menú compacto.
- **Ajustes** (secundario): Métricas + Paquetes (solo re-estilo) + **Datos bancarios** + **Plantillas de WhatsApp** (nuevas).

> Lo que se ELIMINA de la navegación (pero NO del backend): el pipeline de Trabajos, las sub-tabs Confirmados/Por firmar/Prospectos, la vista de "Pipeline activo", el concepto de prospecto como pantalla. Los trabajos/actividades siguen existiendo por debajo (los crea el flujo y los consume `equipo.html`).

### 3.2 Portal — flujo (se conserva, se re-estiliza mobile-first)
Stepper de 3 etapas: **Firma → Pago → Entrega.** La mecánica de firma y el PDF **no cambian** (solo estética). Ver sección 8.

---

## 4. ADMIN — PANTALLA POR PANTALLA

### 4.1 `Hoy` (pantalla de inicio nueva)
Lo primero que se ve al entrar. Puramente accionable, calmado, sin ruido. Orden vertical:
1. **Encabezado ligero:** saludo/fecha + un único número discreto: **"Por cobrar: $XX,XXX"** (suma de saldos pendientes). Sin más métricas.
2. **Botón grande `Nuevo contrato`** (primario dorado), siempre visible.
3. **Sesiones de la semana** (próximos 7 días, agrupadas por día). Tarjeta ligera por sesión: cliente · hora · tipo de servicio. Toque → abre el contrato. El detalle del día (dirección, acceso) vive en Calendar/`equipo.html`, **no** recargar aquí. Opcional: link "ver en equipo".
4. **Llamadas de hoy** (actividades tipo `llamada_agendada` con `fecha_actividad` = hoy). Cada una: cliente · hora · nota previa · acceso rápido a su info (abre expediente). Botón para marcar hecha (ver 5.4).
5. **Por cobrar** (lista de contratos con `SaldoPendiente > 0`, todos). Por fila: cliente · saldo (mono, `--warn`) · botón **Cobrar** (abre cobro por WhatsApp con CLABE, ver 5.2).
6. **Film-strip de sesiones** (diferenciador): tira horizontal scrolleable de las sesiones próximas, estilo "rollo de película" (marco con perforaciones sutiles en CSS). El bloque de **HOY** lleva un punto dorado que "respira" (animación suave de ~3.5s, respetando `prefers-reduced-motion`). Paleta clara (sobre `--paper-1`, acento `--gold-leaf`). Toque → abre el contrato.

Estados vacíos claros y bonitos ("No hay sesiones esta semana", etc.). Datos desde `listarContratos`/`listarTrabajos`/`listarActividades` (filtrado en frontend por fecha).

### 4.2 `Nuevo contrato` (el flujo más importante — rápido como v3)
**Una sola propiedad, plano, sin acordeones de multipropiedad.** Elimina de la vista el botón "+ Agregar propiedad" y toda la maquinaria `numProps`/`renderTodasLasProps` multi-card (puede quedar el código, pero la UI por defecto es 1 propiedad; si se requiere multipropiedad alguna vez, va como caso excepcional escondido — el dueño manda 2 contratos para 2 propiedades).

Campos, en orden:
1. **Cliente** — buscador `#contrato-cliente-search` (autocomplete sobre `listarClientes`). Si es recurrente, al elegirlo **autocompleta solo contacto** (nombre, teléfono, correo) y trae su **logo/archivos** (ver 5.5). Si es nuevo, captura nombre + teléfono.
2. **Correo:** oculto/colapsado (opcional — el cliente lo pone en su portal).
3. **Tipo de propiedad:** Residencial / Terreno (toggle). (Comercial es raro; no agregar tipo nuevo.)
4. **Paquete** (select del catálogo) **o precio libre** (modo personalizado: nombre del servicio + precio). El dueño **negocia seguido**, así que el precio debe ser fácil de ajustar.
5. **Entregables:** ocultos por defecto (se autocompletan del paquete; editables si se expande).
6. **Fecha y hora de sesión** (normalmente se sabe al crear).
7. **Adicionales:** colapsados (`<details>`), no estorban.
8. **Precio total:** editable, prominente, se autollena del paquete.
9. **Anticipo:** **prominente y rápido** — botones `Sin anticipo ($0)` · `50%` · `100%` · `Otro`. Recuerda la preferencia del cliente (ver 5.6): si el cliente tiene `sin_anticipo` o un último anticipo, sugiérelo. (El dueño baja el anticipo a $0 seguido en recurrentes.)
10. **Botón `Crear contrato y generar link`** (primario dorado).

Tras crear: muestra el **link del portal** con botones **Copiar** y **WhatsApp** (NO abrir WhatsApp solo). Conserva el comportamiento de `crearContrato()` (auto-crea cliente+trabajo si no hay vinculado), pero con dedupe por teléfono (ver 5.3).

### 4.3 `Contratos` (lista + panel)
**Lista** estilo ledger (sobria, alineada):
- Orden por defecto: **más reciente primero** (fecha de creación desc).
- Tabs: **Abiertos / Todos** (cancelados ocultos por defecto; visibles en Todos o con un toggle discreto).
- Búsqueda **discreta** (nombre / teléfono / folio) — sin el chip `⌘K` grande ni instrucciones que comen espacio. Un campo simple o ícono que expande.
- Columnas: folio (mono) · cliente (Fraunces) · estatus (chip informativo) · sesión · total (mono) · saldo (mono, `--warn` si debe / `--ok` si liquidado). Borde izquierdo sutil para proximidad de sesión (hoy/pronto) si aplica.
- Móvil: filas como tarjetas.

**Panel de detalle** (se abre al tocar una fila). **Está hoy sobrecargado y mal organizado — esta es una limpieza fuerte.** Orden por prioridad de uso real:
1. **Header:** cliente (Fraunces) · folio (mono) · estatus (chip informativo, **no** dropdown de 9 estatus) · sesión.
2. **Pago (lo primero):** Total / Pagado / Saldo + barra de progreso + **Registrar abono** (monto + método: Transferencia/Efectivo/Clip/OXXO + nota → `registrarAbono`). Historial de abonos.
3. **Cobrar / compartir:** botón **Cobrar por WhatsApp** (mensaje con saldo + CLABE, ver 5.2) · Copiar link · WhatsApp (link portal) · Recordatorio.
4. **Datos del contrato/propiedad:** paquete, fecha de sesión, dirección, adicionales — solo lectura, limpio.
5. **Más acciones** (menú "···" o sección colapsada, lo poco frecuente): **Reagendar** (con aviso al cliente por WhatsApp, usa `reagendarPropiedad`) · **Marcar entregado / material listo** · **Subir precio / servicio extra** (modal upsell existente) · **Cancelar** (con confirmación) · Notas internas · Archivos · Checklist de rodaje (link).
6. **Producción/entrega:** estado (mayormente se gestiona en `equipo.html`); aquí informativo + marcar entregado.

> El estatus se actualiza **solo** (firma/pago/entrega); el dueño lo ignora. Solo se cambian a mano **Cancelar** y **Marcar entregado** → ofrécelos como acciones explícitas, no como un selector de estatus.

### 4.4 `Clientes` (expediente tranquilo — NO pipeline)
Quita el "Pipeline de ventas", los chips de pipeline y la columna de prospectos. Deja:
- **Buscador** de clientes (nombre/teléfono) + lista simple.
- **Botón `Agendar llamada`** (rápido, ver 5.3) y `Nuevo cliente`.
- **Expediente del cliente** (al abrir uno):
  - **Contacto** (editable → `actualizarCliente`, que YA existe) + inmobiliaria + origen.
  - **Historial de contratos** (montos, fechas, estatus) — toque abre el contrato.
  - **Hilo de llamadas y notas** (actividades, orden por fecha desc): nota previa al agendar → marcar hecha + resumen → notas sueltas. Botones **Agendar llamada** y **Agregar nota** (ver 5.4). Visible para Bruno y Danna (login compartido).
  - **Lo cotizado:** interés + paquetes cotizados + portafolio enviado (de la tabla `trabajos`).
  - **Archivos del cliente** (logo + otros): ver/descargar/subir; reutilizables entre contratos (ver 5.5).
  - **Botón `Recontratar`** → abre Nuevo contrato precargando contacto + logo/archivos (ver 5.5).

### 4.5 `Ajustes`
- **Métricas** y **Paquetes:** solo re-estilizar al nuevo sistema (no son prioridad; funcionan).
- **Datos bancarios** (nuevo): CLABE, banco, titular, instrucciones de depósito OXXO/7-Eleven, link de Clip (opcional). Guardado vía `config` (sección 9). Se usan en cobro (5.2) y portal (8).
- **Plantillas de WhatsApp** (nuevo): textos editables por situación (contrato listo, recordatorio de anticipo, cobro con CLABE, material listo, reagendar). Con variables (`{nombre}`, `{saldo}`, `{link}`, `{clabe}`, `{fecha}`). Guardado vía `config`.

---

## 5. FEATURES NUEVAS (detalle funcional)

### 5.1 Plantillas de WhatsApp
- Defaults sensatos por estatus (hoy `renderPanel` ya arma `waTexto` por estatus — formalízalo como plantillas editables guardadas en `config`).
- Donde haya un botón WhatsApp, usa la plantilla correspondiente con variables sustituidas.

### 5.2 Cobrar en un toque (CLABE)
- Botón **Cobrar** en Por cobrar (Hoy) y en el panel.
- Genera mensaje de WhatsApp (`wa.me/{telnormalizado}?text=...`) con: **saldo pendiente + CLABE + banco + titular** (prioridad), depósito OXXO/7-Eleven, link de Clip (opcional, secundario), y **link del portal como secundario**. Texto desde la plantilla de cobro.
- Datos bancarios desde `config` (Ajustes). Reusar `normalizarTelWA()`.

### 5.3 Agendar llamada rápida (con dedupe)
- **Un solo formulario** simple: nombre + teléfono + fecha/hora + nota previa (+ opcional: interés/paquetes, link de propiedad). **Sin** presupuesto.
- Al guardar, por debajo (sin que el usuario pase por "crear cliente" → "crear trabajo"):
  1. **Dedupe por teléfono:** busca cliente existente por teléfono normalizado (vía `listarClientes` o el nuevo endpoint). Si existe → úsalo (ofrece "este cliente ya existe, ¿es él?"). Si no → crea (`crearCliente`).
  2. Reusa el trabajo abierto del cliente si lo hay; si no, crea uno (`crearTrabajo`).
  3. Crea la actividad `llamada_agendada` (`agendarLlamada`) → el adapter ya crea el **evento en Google Calendar** (`agendarLlamadaCliente`).
- **Recomendado:** endpoint atómico `agendarLlamadaRapida` (sección 9) que hace los 3 pasos en una transacción para robustez en móvil. Si no se implementa, el frontend orquesta con manejo de errores.
- Enriquecer info del cliente es **opcional y posterior** (desde el expediente).

### 5.4 Hilo de notas/llamadas (estado + resumen)
- Actividades por cliente, orden por fecha. Tipos: `llamada_agendada`, `nota`.
- Una llamada agendada puede **marcarse hecha** y agregarle **resumen** (qué se habló) → usa nuevo campo `estado`/`resultado` en `actividades` (sección 9). 
- Notas sueltas en cualquier momento (`agregarNota`). Todo compartido (login único).

### 5.5 Archivos a nivel cliente (logo reutilizable) + arreglar subida
- **Bug actual:** la subida (`subirArchivoAdmin` + adapter) "siempre falla". **Diagnostícala y déjala funcionando de forma confiable** (manejo de errores, tipos/peso, feedback claro, reintento).
- Los archivos del cliente (especialmente **logo**) se guardan a **nivel cliente** (no solo del contrato): agrega `logo_url` (y/o `carpeta_cliente_id`/`archivos_json`) a `clientes` (sección 9) y lógica en adapter para una carpeta Drive por cliente. Aprovecha `obtenerLogoCliente` del adapter.
- **Reuso:** al recontratar / crear contrato de un cliente con logo, el logo se **aplica solo** (sin volver a subir). El expediente lista/descarga todos sus archivos. Bruno también puede subirlos (se los mandan por WhatsApp).

### 5.6 Recontratar + anticipo recordado
- **Recontratar** desde el expediente → abre Nuevo contrato con contacto + logo/archivos cargados.
- **Anticipo recordado:** agrega a `clientes` un flag `sin_anticipo` (y/o `anticipo_default`). En Nuevo contrato, si el cliente lo tiene, sugiere ese anticipo (p. ej. $0). El botón "Sin anticipo" del form setea/usa esta preferencia.

---

## 6. (reservado — ver sección 4 para admin)

---

## 7. RESPONSIVE / MÓVIL
- **Se usa el 100% desde el celular** (crear contratos completos incluidos) además de la Mac. Diseña mobile-first y verifica ambos.
- Bottom-nav con FAB dorado central para Nuevo. Panel de contrato como **bottom-sheet** con handle; **Registrar abono** siempre alcanzable con el pulgar.
- Targets táctiles ≥ 44px. Inputs cómodos. Nada que requiera hover para funcionar.

---

## 8. PORTAL (`portal.html`) — rediseño completo, mobile-first

El cliente lo abre **casi siempre en el celular** (link de WhatsApp). Debe verse premium y on-brand (mismo sistema de diseño, sección 2). La **mecánica de firma y el PDF NO cambian** (solo estética). Stepper Firma → Pago → Entrega.

### 8.1 Claridad del formulario (problema central)
El cliente hoy se pierde: no sabe qué poner, hay muchos campos juntos, lenguaje confuso, adicionales poco claros. Arregla:
- **Lenguaje simple y humano** en labels y ayudas (sin jerga). 
- **Ejemplos/placeholders** que muestren qué escribir.
- **Agrupar y revelar progresivamente** (paso a paso / secciones), no todo de golpe.
- **Adicionales claros:** cada opción con qué incluye y **cómo cambia el precio en vivo** (total se actualiza al seleccionar).

### 8.2 Bloque de acceso (simplificar fuerte)
Hoy, al activar "requiere acceso especial", aparecen ~14 campos (método, tipo de inmueble, contacto, quién resuelve, otro contacto, instrucciones caseta, dónde nos vemos, detalle punto, torre, piso, depto, estacionamiento, restricciones, comentarios). **Reducir a ~5 o menos, sin perder la capacidad de instruir:**
- Conserva: **tipo de inmueble** · **¿dónde nos vemos?** · **contacto de acceso** (un campo + "yo / otra persona") · **método de acceso** (opcional).
- **Funde torre + piso + departamento** en un solo campo ("Torre / piso / interior").
- **Funde las 3 textareas** (caseta + restricciones + estacionamiento + comentarios) en **una sola**: "Instrucciones de acceso (caseta, estacionamiento, restricciones, lo que necesitemos saber)".
- Mantén el toggle: para casa/terreno no aparece nada de esto.
- Al guardar, mapea los campos fundidos a las columnas existentes de `propiedades`/`datos_especificos` (no rompas lo que lee `equipo.html`; puedes concentrar el texto libre en `instruccionesCaseta`/`comentarios`).
- En **Terreno**, enfatiza "referencias / cómo llegar" (terreno baldío es difícil de ubicar).

### 8.3 Pago en el portal
- Muestra **saldo + CLABE (prioridad) + banco + titular**, **depósito OXXO/7-Eleven**, y **link de Clip (opcional)**. Botón para **mandar comprobante por WhatsApp**. Datos desde `config`. (No hay pasarela nueva.)

### 8.4 Reseña (opcional, no prioritario)
- Tras entrega, un botón discreto "dejar reseña" / o desde el admin "pedir reseña por WhatsApp". No es prioridad; inclúyelo solo si no añade complejidad.

---

## 9. BACKEND (worker + adapter + D1) — cambios

> Mucho ya existe: `actualizarCliente`, `obtenerCliente`, `borrarCliente`, `listarClientes`, `listarActividades`, `agendarLlamada`, `agregarNota`, `crearCliente`, `crearTrabajo`. **Úsalos.** Lo siguiente es lo que falta.

### 9.1 Migración D1 (`worker/migrations/r57-rediseno.sql`)
> **Numeración (importante):** las migraciones se nombran por el **número de Ronda**, NO consecutivo. Los archivos existentes llegan a `r37` (`r35`, `r36-v5-schema` → agregó `clientes.inmobiliaria`, `trabajos.token/ubicacion`, `r37-backfill`), **ya aplicados**, pero el proyecto va en **Ronda 56/57** (confírmalo en `MASTER_V4.md`). Por eso la nueva migración se nombra con la **ronda actual al momento de ejecutar (mínimo `r57`)** — p. ej. `r57-rediseno.sql` o superior si ya avanzó la ronda. **No uses `r38`.**
> Las columnas de abajo NO existen aún (verificado contra `schema.sql` + r36/r37), pero **verifica el esquema actual antes de aplicar** (`wrangler d1 execute contratos-iav-v4 --remote --command="PRAGMA table_info(clientes)"` etc.); si alguna ya existiera, omite ese `ALTER`. Actualiza también `worker/schema.sql` para reflejar las columnas nuevas, y registra esta ronda en `MASTER_V4.md`.
```sql
-- Preferencia de anticipo por cliente
ALTER TABLE clientes ADD COLUMN sin_anticipo INTEGER DEFAULT 0;
ALTER TABLE clientes ADD COLUMN anticipo_default REAL DEFAULT NULL;
-- Logo / carpeta a nivel cliente
ALTER TABLE clientes ADD COLUMN logo_url TEXT DEFAULT '';
ALTER TABLE clientes ADD COLUMN carpeta_cliente_id TEXT DEFAULT '';
-- Estado y resumen de actividades (llamadas hechas + qué se habló)
ALTER TABLE actividades ADD COLUMN estado TEXT DEFAULT 'pendiente';  -- pendiente | hecha
ALTER TABLE actividades ADD COLUMN resultado TEXT DEFAULT '';
-- Tabla de configuración (datos bancarios, plantillas WhatsApp)
CREATE TABLE IF NOT EXISTS config (
  clave TEXT PRIMARY KEY,
  valor TEXT DEFAULT '',
  actualizado TEXT
);
```

### 9.2 Endpoints worker nuevos
- **`obtenerConfig` / `guardarConfig`** (RUTAS de config): get/set de claves (`banco_clabe`, `banco_nombre`, `banco_titular`, `pago_oxxo`, `pago_clip_url`, `wa_template_*`). Admin-only `guardarConfig`; `obtenerConfig` lo necesita el portal (expón solo las claves públicas necesarias: datos bancarios; las plantillas son admin-only).
- **`agendarLlamadaRapida`** (recomendado, atómico): recibe `{nombre, telefono, fecha, hora, nota, interes?, paquetes?, propiedadLink?}`. Busca cliente por teléfono normalizado → crea si no existe; reusa/crea trabajo; inserta actividad; deja que el adapter cree el evento Calendar. Devuelve `{clienteId, trabajoId, actividadId}`. (Si no se implementa, el frontend orquesta con los endpoints existentes.)
- **`marcarActividad`** (o extender actividades): `{actividadId, estado, resultado}` para marcar llamada hecha + resumen.
- **Archivos a nivel cliente:** extender `archivos.js`/adapter para subir/listar archivos en la **carpeta del cliente** y guardar `logo_url`/`carpeta_cliente_id`. Endpoint para listar archivos del cliente. **Arreglar los bugs de subida existentes.**
- **Dedupe:** helper para buscar cliente por teléfono normalizado (en `clientes.js`).

### 9.3 Adapter (`AdapterScript4_v1.js`)
- **Reusar/crear carpeta Drive por cliente** y guardar el logo ahí; `obtenerLogoCliente` ya existe — conéctalo al `logo_url` del cliente.
- Verifica que `agendarLlamadaCliente` (ya crea evento Calendar) reciba bien fecha/hora desde el flujo rápido.
- Arreglar lo que cause fallos en `subirArchivoAdmin`.
- **Entregar el archivo del adapter listo y avisar a Bruno** que lo despliegue manualmente en script.google.com.

### 9.4 No tocar
- Esquema existente (solo ALTER aditivos de 9.1). Nada de renombrar/borrar.
- Flujos de firma, PDF, correos automáticos (se conservan — dan profesionalismo aunque el cliente no los lea).
- `equipo.html` (se arregla un bug en otra sesión; aquí no se rediseña).

---

## 10. INVENTARIO DE CAMBIOS POR ARCHIVO (resumen)
- **`frontend/admin.html`** — rediseño total: tokens/tipografía nuevos; quitar sidebar; tabs Hoy/Contratos/Clientes; pantalla Hoy nueva; Nuevo contrato a 1 propiedad; panel reorganizado; expediente de cliente sin pipeline; Ajustes con datos bancarios + plantillas; features 5.x. Preservar IDs/handlers/endpoints salvo lo indicado. Quitar mayúsculas/emojis.
- **`frontend/portal.html`** — rediseño visual mobile-first; claridad del form; simplificación de acceso; pago con CLABE/OXXO/Clip; firma/PDF intactos.
- **`frontend/admin-v4-backup.html`, `frontend/portal-v4-backup.html`** — respaldos (primer commit).
- **`worker/src/routes/`** — `config` (nuevo), `clientes.js` (dedupe, logo), `actividades.js` (estado/resultado, agendarLlamadaRapida), `archivos.js` (archivos cliente + fix). `index.js` — registrar rutas nuevas.
- **`worker/schema.sql`** + **`worker/migrations/r57-rediseno.sql`** — cambios de 9.1.
- **`adapter/AdapterScript4_v1.js`** — carpeta/logo por cliente, fix de subida. (Despliegue manual.)

---

## 11. QA / CRITERIOS DE ACEPTACIÓN (antes del push)

**Visual / sistema**
- [ ] Cero mayúsculas en labels; cero emojis; íconos finos Tabler; alineación y simetría correctas.
- [ ] Tipografía híbrida aplicada (Fraunces solo en montos/nombres/títulos; Inter en UI; mono en cifras). Sin `Courier New`/`Montserrat`.
- [ ] Tokens de color usados consistentemente; dorado discreto; contraste AA en texto.
- [ ] Se ve bien en móvil (360px) y escritorio (1280px+).

**Admin — flujos**
- [ ] `Hoy` muestra sesiones de la semana, llamadas de hoy, por cobrar (todos con saldo) y total por cobrar; film-strip con "hoy" que respira (y respeta reduce-motion).
- [ ] Crear un contrato típico (1 propiedad, paquete, anticipo $0) en pocos toques; sale link con Copiar/WhatsApp; cliente recurrente autocompleta contacto y trae logo.
- [ ] Lista de contratos ordena por reciente; Abiertos/Todos; búsqueda discreta funciona.
- [ ] Panel: registrar abono actualiza saldo; cobrar por WhatsApp arma mensaje con CLABE; reagendar/cancelar/marcar entregado funcionan; estatus es informativo.
- [ ] Expediente de cliente: editar contacto (actualizarCliente), hilo de actividades (agendar/hecha+resumen/nota), lo cotizado, archivos, recontratar.
- [ ] Agendar llamada rápida con teléfono existente NO duplica cliente; crea evento en Calendar.

**Portal**
- [ ] Mobile-first; firma y PDF funcionan igual; pago muestra CLABE/OXXO/Clip; acceso simplificado (~5 campos) con toggle; adicionales con precio en vivo; lenguaje claro.

**Backend**
- [ ] Migración r38 aplicada en D1 remoto; `config` con datos bancarios; subida de archivos confiable; adapter entregado para despliegue manual.

**Seguridad de salida**
- [ ] Respaldos creados; smoke test manual (crear contrato → abono → firmar en portal) OK; luego commit a `main`.
- [ ] **Cero estilos viejos:** ninguna pantalla, modal o componente quedó con el look anterior (mayúsculas, `Courier`/`Montserrat`, emojis, bordes/sombras viejos). Todo hereda de `design-system.css`.
- [ ] **Sin basura en producción:** si creaste contratos/clientes/abonos de prueba para verificar (clave admin `framedock`), elimínalos antes de cerrar. No dejar registros de prueba en la base real.
- [ ] `design/BUILD_LOG.md` actualizado con el estado final y avisos para Bruno (migración D1, adapter).

---

## 12. RESUMEN DE DECISIONES (referencia rápida)
1 propiedad por contrato · recurrente autocompleta solo contacto · anticipo variable y prominente ($0 frecuente, recordado) · correo/entregables ocultos · estatus automático (a mano solo cancelar/entregar) · cobranza por CLABE vía WhatsApp · clientes = expediente (no pipeline) · agendar llamada rápida con dedupe + Calendar · archivos/logo a nivel cliente reutilizables · notas compartidas con Danna · portal mobile-first con form claro y acceso simplificado · estética Apple + editorial cálido, dorado discreto, sin mayúsculas ni emojis · commit a main con respaldo + QA.

> **Fuente única de diseño:** usar `design-system.css` (entregado junto a este spec) — tokens y componentes ya escritos. **Referencia visual:** el mockup `design/B-dossier.html`. Todo lo de admin y portal hereda de ahí.

---
---

# ANEXOS (spec v2.0 — impecable)

## ANEXO A — Wireframes (texto) de cada pantalla

> Layout y orden exacto. Móvil = una columna; escritorio = como se indica. Nada de mayúsculas en labels.

### A.1 Admin · Hoy
```
┌─ topbar onyx ─ Inmuebles Audiovisuales · marca dorada ········· [⚙] [salir] ─┐
├─ tabs:  Hoy(activo) · Contratos · Clientes ─────────────────────────────────┤
│                                                                              │
│  Hoy es martes 3 de junio                          Por cobrar  $63,500       │ ← número discreto
│                                                                              │
│  [  + Nuevo contrato  ]  (botón primario dorado, ancho)                      │
│                                                                              │
│  Sesiones de la semana                                                       │
│  ┌── mié 4 ───────────────────────────────────────────────────────────┐     │
│  │ 13:00  Mariana Treviño · Foto + 360°                            ›    │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│  ┌── vie 6 ───────────────────────────────────────────────────────────┐     │
│  │ 09:30  Grupo SP · Drone                                         ›    │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  Llamadas de hoy                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │ 11:00  Juan (RE/MAX) · "cerrar paquete residencial"   [hecha] [info]│     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  Por cobrar                                                                  │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │ Roberto Garza M.            $2,750            [ Cobrar ]            › │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  Radar de sesiones  (film-strip horizontal)                                  │
│  [▣ 03 HOY•] [▣ 04 mié] [▣ 06 vie] [▣ 09 lun] →                              │
└──────────────────────────────────────────────────────────────────────────────┘
Móvil: bottom-nav  [ Hoy ]  ( ＋ )  [ Contratos ]   ·  ⚙/Clientes en topbar.
```

### A.2 Admin · Nuevo contrato (1 propiedad, plano)
```
‹ Contratos
Nuevo contrato

Cliente
[ buscar cliente existente… ]          ← autocomplete; si recurrente → llena contacto + trae logo
Nombre del cliente   [______________]
Teléfono             [____________]     Correo (opcional) ▸ colapsado

Tipo de propiedad   ( Residencial )( Terreno )
Servicio            ( Paquete )( Precio libre )
  Paquete           [ Residencial Combo · $4,500 ▾ ]
  Entregables ▸ (colapsado, autollenado)
Fecha de sesión [ 2026-06-10 ]   Hora [ 10:00 ]
Servicios adicionales ▸ (colapsado)

Precio total  [ 4,500 ]   (editable)
Anticipo      ( Sin anticipo )( 50% )( 100% )( Otro )  → [ 0 ]   ← prominente; recuerda preferencia

[  Crear contrato y generar link  ]
── tras crear ──
Contrato creado — link para el cliente
contratos.inmuebles…/portal?token=…   [ Copiar ] [ WhatsApp ]   [ Crear otro ]
```

### A.3 Admin · Contratos (lista + panel)
```
Contratos        [ Abiertos | Todos ]            [buscar…]  [filtros] [⋯]
┌ folio ──── cliente ───────────── estatus ───── sesión ── total ── saldo ┐
│ IAV-2606.03-A  Roberto Garza M.  •Anticipo    03 jun   $5,500   $2,750  │ ← borde izq dorado si sesión hoy
│ IAV-2606.04-A  Mariana Treviño   •Firmado     04 jun   $3,000   $3,000  │
└──────────────────────────────────────────────────────────────────────────┘
        (al tocar fila) ───────────────────────────────► PANEL/sheet:
        ┌──────────────────────────────────────────┐
        │ IAV-2606.03-A                         [✕] │
        │ Roberto Garza M.        •Anticipo recibido│
        │ ── (hairline dorada) ─────────────────────│
        │ Total $5,500 · Pagado $2,750 · Saldo $2,750
        │ [▓▓▓▓▓░░░░░] 50%                           │
        │ Registrar abono: [monto][método▾][nota]   │
        │ [ Registrar abono ]                       │
        │ Historial: + $2,750 · Transferencia · 1jun│
        │ ── Cobrar / compartir ───                 │
        │ [ Cobrar por WhatsApp ] [Copiar] [WA] [🔔]│ (íconos Tabler, no emoji)
        │ ── Datos ──  paquete · sesión · dirección │
        │ ── Más acciones ⋯  reagendar · entregado  │
        │      · servicio extra · cancelar · notas  │
        │      · archivos · checklist               │
        └──────────────────────────────────────────┘
```

### A.4 Admin · Clientes (expediente)
```
Clientes        [ + Agendar llamada ] [ + Nuevo cliente ]
[buscar cliente…]
┌ lista clientes ┐   ┌──────────── expediente (al abrir) ─────────────┐
│ Roberto Garza  │   │ Roberto Garza M.        recurrente · 3 contratos│
│ Mariana T.     │   │ 81 1234 5678 · correo · RE/MAX   [editar]       │
│ Grupo SP       │   │ ── Contratos ──  IAV-2606.03-A $5,500 · …       │
│ …              │   │ ── Llamadas y notas ──  (hilo por fecha)        │
│                │   │   • 1 jun · llamada · "cerró combo" [hecha]     │
│                │   │   [ + Agendar llamada ] [ + Nota ]              │
│                │   │ ── Lo cotizado ──  Combo, +drone · portafolio   │
│                │   │ ── Archivos ──  [logo.png] [+ subir]            │
│                │   │ [ Recontratar ]                                 │
└────────────────┘   └─────────────────────────────────────────────────┘
```

### A.5 Portal (mobile-first, 3 pasos)
```
[ logo IAV ]                          Inmuebles Audiovisuales
●─────○─────○   Firma · Pago · Entrega

(Firma)  Resumen de tu servicio · paquete · entregables · total
         Tus datos:  nombre [..] tel [..] correo [..]
         Propiedad:  domicilio [..]  ubicación (link) [..]
                     referencias de cómo llegar [..]
         ▸ ¿Requiere acceso especial (caseta/depto)?  (toggle → ~5 campos)
         Servicios adicionales (con precio en vivo, total se actualiza)
         [ firma dibujada ]   [ Acepto y firmo ]

(Pago)   Tu saldo: $2,750
         Transfiere por CLABE:  6461 8000 1234 5678 90   [copiar]
         Banco · Titular
         O deposita en OXXO/7-Eleven · (opcional: pagar con tarjeta ▸ Clip)
         [ Enviar comprobante por WhatsApp ]

(Entrega) Links de descarga · carpeta Drive · [dejar reseña]
```

---

## ANEXO B — Microcopy y plantillas (texto literal, español MX, tono "tú")

> Reglas: claro, humano, sin tecnicismos, sin mayúsculas decorativas. Los `{…}` son variables.

### B.1 Plantillas de WhatsApp (editables en Ajustes; estos son los defaults)
- **Contrato listo (pendiente firma):**
  `Hola {nombre}, aquí está tu contrato con Inmuebles Audiovisuales para revisar y firmar: {link}`
- **Recordatorio de anticipo:**
  `Hola {nombre}, te recuerdo el anticipo de {anticipo} para apartar tu sesión. Puedes ver el detalle aquí: {link}`
- **Cobro con CLABE (el importante):**
  `Hola {nombre}, tu saldo pendiente es {saldo}. Puedes transferir a:\n\nCLABE: {clabe}\nBanco: {banco}\nA nombre de: {titular}\n\nTambién puedes depositar en OXXO/7-Eleven. Cuando hagas el pago, mándame tu comprobante por aquí. Ver detalle: {link}`
- **Material listo (entrega):**
  `Hola {nombre}, tu material ya está listo para descargar: {link}`
- **Reagendar:**
  `Hola {nombre}, reagendamos tu sesión para {fecha} a las {hora}. Cualquier cosa me dices.`

### B.2 Estados vacíos (admin)
- Hoy / sesiones: `No hay sesiones esta semana.`
- Hoy / llamadas: `Sin llamadas para hoy.`
- Hoy / por cobrar: `Todo al corriente. Nadie te debe.`
- Contratos: `Aún no hay contratos. Crea el primero.`
- Cliente sin actividades: `Sin llamadas ni notas todavía.`

### B.3 Botones / labels clave (sentence-case)
"Nuevo contrato" · "Crear contrato y generar link" · "Registrar abono" · "Cobrar por WhatsApp" · "Copiar link" · "Agendar llamada" · "Agregar nota" · "Marcar hecha" · "Recontratar" · "Sin anticipo" · "Más acciones" · "Reagendar" · "Marcar entregado" · "Cancelar contrato".

### B.4 Portal — ayudas/ejemplos (para que el cliente sepa qué poner)
- Domicilio: `Calle, número, colonia y municipio` 
- Ubicación: `Pega tu link de Google Maps, Apple Maps o Waze`
- Referencias (terreno): `Entre qué calles, portón, señas para ubicarlo fácil (importante en terrenos)`
- Acceso (toggle): `¿La propiedad está en privada, edificio o requiere registro en caseta?`
- Instrucciones de acceso (campo fundido): `Caseta, estacionamiento, restricciones, lo que necesitemos saber para entrar sin contratiempos`
- Adicionales: cada uno con una línea de qué incluye y `+ $X` visible; el total se actualiza al seleccionar.

---

## ANEXO C — Contratos de datos y diccionario de nombres

### C.1 Convención de nombres (NO romper)
| Capa | Convención | Ejemplo |
|------|-----------|---------|
| D1 (columnas) | `snake_case` | `saldo_pendiente`, `cliente_id`, `fecha_sesion` |
| API admin (`obtenerContrato`, `listarContratos`) | `PascalCase` | `SaldoPendiente`, `NombreCliente`, `FechaSesion` |
| API portal/equipo (`obtenerEquipo`, `obtenerPortal`) | `camelCase` | `nombreCliente`, `telefonoCliente`, `fechaSesion` |

> El admin consume PascalCase, el portal/equipo camelCase. Respeta lo que ya devuelve cada endpoint; usa los helpers existentes (`clienteNombreVal`, etc.) que toleran varias variantes.

### C.2 JSON de endpoints nuevos
```jsonc
// POST agendarLlamadaRapida   (admin-only)
// req:
{ "nombre":"Juan", "telefono":"8127174207", "fecha":"2026-06-10", "hora":"11:00",
  "nota":"cerrar combo", "interes":"combo", "paquetes":["RES-COMBO"], "propiedadLink":"" }
// res:
{ "ok":true, "clienteId":"cli_…", "trabajoId":"trb_…", "actividadId":"act_…",
  "clienteExistente":true }   // true si hizo match por teléfono (dedupe)

// POST marcarActividad   (admin-only)
{ "actividadId":"act_…", "estado":"hecha", "resultado":"acordó pagar el viernes" }
// res: { "ok":true }

// GET/POST obtenerConfig / guardarConfig
// obtenerConfig (público para claves bancarias):
{ "ok":true, "banco_clabe":"…","banco_nombre":"…","banco_titular":"…","pago_oxxo":"…","pago_clip_url":"" }
// guardarConfig (admin-only): { "clave":"banco_clabe", "valor":"6461…" } → { "ok":true }

// Archivos de cliente
// POST subirArchivoCliente (admin): { clienteId, archivo(base64/multipart), nombre, esLogo:true }
// GET  listarArchivosCliente: { ok:true, archivos:[{nombre,url,esLogo}], logoUrl:"…" }
```

### C.3 Mensajes/estados de respuesta
Toda respuesta del worker: `{ ok:true, … }` o `{ ok:false, error:"texto" }`. El frontend muestra `error` en el toast correspondiente. No tragues errores en silencio.

---

## ANEXO D — Inventario "NO ROMPER" y "QUITAR DE LA UI"

### D.1 Debe seguir funcionando (handlers/endpoints existentes)
`crearContrato` · `obtenerContrato` · `listarContratos` · `registrarAbono` · `actualizarEstatus` · `guardarEntrega` · `revocarEntrega` · `reagendarPropiedad` · `actualizarContratoUpsell` · `crearCliente` · `listarClientes` · `obtenerCliente` · **`actualizarCliente`** · `borrarCliente` · `crearTrabajo` · `listarTrabajos` · `actualizarTrabajo` · `agendarLlamada` · `agregarNota` · `listarActividades` · `obtenerEquipo` · `marcarProduccion` · `obtenerPortal` · `firmaCliente` · `guardarConfiguracion` · `subirArchivo`/`subirArchivoAdmin` · paquetes/checklist/revisión/stats. **Conserva los IDs de formularios y los `data-*`.**

### D.2 Quitar de la UI (pero CONSERVAR datos/endpoints)
- Markup: `#sidebar`, `#side-menu`, `.sidebar-item`, `.sm-nav-item`, sub-tabs `subtab-strip` (Confirmados/Por firmar/Prospectos), `pipeline-chips`, `pipeline-lista`, columna "Pipeline de ventas".
- Funciones JS que dejan de tener UI (no las llames; puedes borrarlas si quedan 100% huérfanas y sin efectos): `renderPipeline`, `cambiarGrupoTrabajos`, `filtrarPipeline`, `renderCardsTrabajos` si se sustituye. **No borres** las que comparten lógica con lo que sí se usa (verifica referencias antes de borrar).
- El selector de 9 estatus en el panel → reemplazar por estatus informativo + acciones "Cancelar" y "Marcar entregado".

### D.3 Limpieza obligatoria de estilo (heredado)
- Eliminar todo `text-transform:uppercase` + `letter-spacing` de labels/títulos.
- Eliminar `'Courier New'` y `'Montserrat'`; usar el sistema tipográfico nuevo.
- Eliminar emojis de la UI (sustituir por íconos Tabler).

---

## ANEXO E — Reglas de negocio y casos borde
- **"Abiertos"** = estatus en {Nuevo, En cotización, Pendiente firma, Firmado, Reservado, Anticipo recibido, En produccion, Entregado, Liquidado}. **Excluye** Completado y Cancelado.
- **Cancelados:** ocultos en Abiertos; visibles solo en Todos. Cancelar pide confirmación.
- **Dedupe de teléfono:** normaliza con `normalizarTelWA()` (quita no-dígitos, maneja 52/521). Match exacto sobre teléfono normalizado. Si no hay teléfono → no dedupe, crea cliente nuevo y avisa "cliente nuevo (sin teléfono para verificar duplicados)".
- **Anticipo $0:** permitido. No cambia la mecánica de estatus (el contrato puede ir a producción sin anticipo si el dueño lo decide). "Sin anticipo" setea `anticipo=0` y marca preferencia del cliente (`sin_anticipo=1`).
- **Anticipo recordado:** al elegir cliente recurrente, si `sin_anticipo=1` → sugiere $0; si hay `anticipo_default` o último anticipo, sugiérelo. El dueño puede sobreescribir.
- **Estatus automático:** firma → Firmado; abono ≥ anticipo → Anticipo recibido/Reservado; saldo 0 + entregado → Completado, etc. (lógica existente). El admin **no** ofrece cambiarlo a mano salvo Cancelar/Entregado.
- **Precio:** se autollena del paquete; editable (negociación). Si se edita, respeta el valor manual (`precioManual`).
- **Reagendar:** usa `reagendarPropiedad` (actualiza Calendar/carpeta/PDF) + ofrece avisar al cliente por WhatsApp (plantilla reagendar).
- **Una propiedad por contrato** en la UI nueva. Para 2 propiedades, el dueño hace 2 contratos (reusa cliente vía autocomplete).
- **Portal acceso:** el toggle solo aparece relevante; para casa/terreno no se piden campos de edificio. Terreno enfatiza referencias.

---

## ANEXO F — Estados de componentes y accesibilidad
- **Cada componente** define: normal · hover · foco (anillo `--gold-glow`) · activo · deshabilitado · cargando (skeleton) · vacío · error. No dejar estados sin estilo.
- **Touch targets ≥ 44px** en móvil. Inputs altos (42px). 
- **Contraste:** texto cumple WCAG AA (texto dorado usa `--gold`, no `--gold-leaf`).
- **`prefers-reduced-motion`:** desactiva la animación "respira" y las transiciones del panel (ya en `design-system.css`).
- **Foco visible** siempre (no `outline:none` sin reemplazo). Navegable con teclado en escritorio.
- **Fuentes:** `display=swap`; evita saltos de layout (define tamaños).
- **Móvil con señal mala:** operaciones con feedback de carga, manejo de error y reintento; nada que deje el estado a medias (especialmente subir archivos y agendar llamada rápida).

---

## ANEXO G — Guion de prueba manual (antes del push)
1. **Crear contrato típico:** cliente nuevo → Residencial → paquete $4,500 → anticipo "Sin anticipo" → fecha → crear. ✔ aparece link, ✔ Copiar y WhatsApp funcionan, ✔ aparece en Contratos (arriba), ✔ en Hoy si la sesión es esta semana.
2. **Cliente recurrente:** buscar uno existente → ✔ autocompleta contacto, ✔ trae logo; crear segundo contrato. ✔ no duplica cliente.
3. **Cobrar:** abrir contrato con saldo → Registrar abono parcial → ✔ saldo baja, barra avanza; "Cobrar por WhatsApp" → ✔ mensaje con CLABE correcta.
4. **Agendar llamada rápida:** con teléfono de cliente existente → ✔ no duplica, ✔ evento en Calendar; marcar hecha + resumen → ✔ queda en el hilo.
5. **Expediente:** editar contacto → ✔ guarda (`actualizarCliente`); ver contratos/cotizado/archivos.
6. **Reagendar / cancelar / marcar entregado:** ✔ funcionan; cancelar pide confirmación y sale de Abiertos.
7. **Portal (móvil):** abrir link → firmar (✔ PDF llega) → ver pago con CLABE → acceso con toggle (~5 campos) → adicionales con precio en vivo.
8. **Responsive:** repetir 1 y 3 en 360px (FAB, bottom-sheet, abono con pulgar).
9. **Regresión:** ningún `console error`; checklist de QA (sección 11) en verde.

---

## ANEXO H — Playbook de ejecución (Opus, por fases)

**Modo:** un hilo Opus principal que sostiene la visión (no fan-out en `admin.html`). Cada fase = commit a `main`. El contexto vive en: este spec + `design-system.css` + `design/B-dossier.html`. Si el contexto se reinicia, re-anclar con esos tres + el resumen de decisiones (sección 12).

- **Fase -1 — Preflight (obligatoria).** Completar la verificación del inicio de la sección 0: repo `main` al día, todos los archivos presentes y en su versión más reciente (admin ~6k líneas, portal ~2.8k), leídos spec + design-system + mockup + `MASTER_V4.md` + `BUILD_LOG.md`. Si falta algo o hay duda → buscar; si no se resuelve → **detenerse y preguntar a Bruno**. No avanzar sin esto.
- **Fase 0 — Cimientos.** Incrustar `design-system.css` en `admin.html` (y luego portal). Construir el shell nuevo: topbar + tabs `Hoy/Contratos/Clientes`, quitar sidebar/side-menu, bottom-nav + FAB. Verificar que la app sigue cargando y autenticando. Commit.
- **Fase 1 — Admin.** En sub-pasos commiteables: (1.1) Hoy · (1.2) Nuevo contrato (1 propiedad) · (1.3) Contratos lista · (1.4) Panel reorganizado · (1.5) Clientes/expediente · (1.6) Ajustes (bancario + plantillas). Tras cada sub-paso, abrir en navegador y comparar con wireframe + mockup. Commit por sub-paso.
- **Fase 2 — Backend.** Migración `r57-rediseno.sql` (aplicar en D1 remoto) · rutas `config`, dedupe en `clientes`, `agendarLlamadaRapida`, `marcarActividad`, archivos de cliente + **fix de subida** · adapter (carpeta/logo por cliente). *Candidato a subagente dedicado* (archivos independientes). Entregar adapter para despliegue manual. Commit.
- **Fase 3 — Portal.** Aplicar design-system mobile-first · claridad del form · acceso simplificado (~14→~5) · pago CLABE/OXXO/Clip · firma/PDF intactos. Commit.
- **Fase 4 — Integración + QA.** Conectar features que cruzan capas (cobro usa `config`, recontratar usa archivos cliente, anticipo recordado). Correr ANEXO G + sección 11. Respaldos creados. Smoke test. Commit y verificación final.
- **Fase 5 — Auditoría de bugs + resolución (cierre).** Pasada completa cazando bugs introducidos y heredados: revisar cada flujo del ANEXO G, errores de consola, llamadas a endpoints (payloads/nombres), estados borde (sin teléfono, sin sesión, multipropiedad legacy, contratos viejos sin cliente_id), responsive, y subida de archivos. **Documentar y resolver** todo lo encontrado. Entregar una nota de "bugs encontrados y resueltos". Commit final.

> Regla por fase: no avanzar a la siguiente si la app quedó rota. Cada commit debe dejar `admin.html`/`portal.html` cargando sin errores.

---

## ANEXO I — Orden de despliegue, alcance fino, riesgos y "definition of done"

### I.1 Orden de despliegue (CRÍTICO para no romper producción)
Como el push a `main` despliega al instante y el frontend nuevo llama endpoints nuevos:
- **El backend y la migración D1 van PRIMERO** (o en el mismo push) que el frontend que los consume. Recomendado: **Fase 2 (backend) antes de activar en la UI** las features que dependen de endpoints nuevos (`config`/cobro CLABE, `agendarLlamadaRapida`, `marcarActividad`, archivos de cliente).
- Alternativa de seguridad: el frontend **degrada con gracia** si un endpoint nuevo aún no existe (try/catch + ocultar el botón), de modo que ningún orden rompa la app.
- La **migración D1** (`r57-rediseno.sql`) debe aplicarse en remoto **antes** de que el worker nuevo lea/escriba esas columnas. Como son `ALTER … DEFAULT`, los registros viejos quedan con default y no truenan.

### I.2 Quién corre qué
- Frontend + worker: se despliegan con el push a `main` (GitHub Actions).
- **Migración D1: córrela tú** — corres local en la Mac y `wrangler` ya está autenticado (cuenta `inmueblesaudiovisuales@gmail.com`), así que debería funcionar: `wrangler d1 execute contratos-iav-v4 --remote --file=worker/migrations/r57-rediseno.sql`. Reintenta varias veces si falla (red). **Si tras varios intentos no puedes, sáltala** — NO bloquees el rediseño por esto: deja el `.sql` listo, anota en `BUILD_LOG.md` el comando exacto para que Bruno la corra, y **asegura que el worker degrada con gracia** (ver I.4-bis) para que la app no truene mientras la migración esté pendiente. Cada ALTER usa `DEFAULT`, así que aplicarla después no rompe datos.

### I.4-bis Degradación con gracia si la migración no está aplicada (OBLIGATORIO)
Como la migración puede quedar pendiente (Bruno la corre al despertar), el **worker debe tolerar que las columnas/tabla nuevas no existan todavía**: envuelve en try/catch las lecturas/escrituras a `config`, `clientes.sin_anticipo/anticipo_default/logo_url/carpeta_cliente_id` y `actividades.estado/resultado`; si fallan por columna/tabla inexistente, usa defaults (p. ej. `config` → datos bancarios vacíos; `sin_anticipo` → 0). El **frontend** oculta/no-opera las features dependientes si el dato no viene, en vez de romper. Así la app funciona aplique o no la migración; al correrla, las features se activan solas.
- **Adapter Apps Script:** nunca se auto-despliega. Entregar el archivo y avisar a Bruno que lo pegue en script.google.com y publique nueva versión.

### I.3 Auth y seguridad de endpoints nuevos
- Endpoints admin (`guardarConfig`, `agendarLlamadaRapida`, `marcarActividad`, archivos de cliente, etc.): usar el patrón existente **`requireAdmin`** (header `X-Admin-Key: framedock`), igual que el resto del admin.
- `obtenerConfig`: exponer **solo** claves bancarias (las ve el portal del cliente, y de todos modos el cliente necesita la CLABE para pagar). Las **plantillas de WhatsApp NO** se exponen al portal (admin-only).

### I.4 Datos legacy (no romper lo viejo)
- **Contratos multi-propiedad existentes:** crear es de 1 propiedad, pero el **panel y la lista deben MOSTRAR correctamente** contratos antiguos con 2+ propiedades (el render itera propiedades). No asumir 1 propiedad al leer.
- **Contratos viejos sin `cliente_id`:** el panel/expediente deben tolerarlo (no romper si no hay cliente vinculado; mostrar datos del contrato igual).
- **Migraciones de formato** previas (checklist viejo, adicionales string vs objeto) ya existen en el código — conservarlas.

### I.5 Alcance de la familia de archivos
- **En alcance ahora:** `admin.html` (completo, incluida la **pantalla de login**, que también se re-estiliza) y `portal.html` (completo).
- **Fuera de alcance ahora — NO tocar:**
  - `equipo.html` — **no modificar.** Tiene un bug visual conocido pero **no es prioritario**; se deja para otra sesión. No lo rediseñes ni intentes arreglarlo ahora.
  - `checklist.html` — **otra sesión.** Bruno quiere usarlo más, pero su re-estilo queda para después. Aquí solo: asegurar que el **link** desde el admin funcione.
  - `chat.html` — **no tocar.** Le falta mucho para estar listo; ni rediseño ni cambios.
  - `revision.html` — no prioritario; no tocar.
  - Si alguno de estos se rompe por un cambio tuyo, **repórtalo**, no lo rediseñes.
- **Correos automáticos / PDF:** no se rediseña su HTML; se conservan (dan profesionalismo).

### I.6 Definition of done (por fase)
Una fase está "done" solo si: (a) la app carga sin errores de consola en móvil y escritorio; (b) cumple su parte del wireframe y del design-system; (c) ningún flujo previo se rompió (regresión); (d) commit hecho con mensaje claro. La **Fase 5** además entrega la nota de "bugs encontrados y resueltos".

### I.7 Riesgos y mitigaciones
| Riesgo | Mitigación |
|--------|-----------|
| Push a main rompe producción (clientes esperando) | Respaldos `*-v4-backup.html`; reversión por git (`git revert` + push redepliega en ~1 min); v3 sigue viva como red. |
| Orden de despliegue (frontend antes que backend) | Backend/migración primero; frontend degrada con gracia (I.1). |
| Pérdida de contexto del ejecutor a mitad | Contexto en artefactos: spec + `design-system.css` + mockup B + build log; fases re-anclables. |
| Inconsistencia visual entre pantallas | `design-system.css` como fuente única; prohibido estilos sueltos hardcodeados. |
| Bugs heredados/nuevos | Fase 5 dedicada a auditoría + resolución; ANEXO G como guion. |
| Subida de archivos sigue fallando | Diagnóstico explícito en Fase 2; criterio de aceptación: subir/ver/reusar logo funciona de punta a punta. |

### I.8 Build log (para sobrevivir reinicios de contexto)
El ejecutor mantiene `design/BUILD_LOG.md` en el repo: qué fase va, qué se hizo, decisiones tomadas, pendientes. Si el contexto se reinicia, leer spec + design-system + mockup + este log y continuar.
