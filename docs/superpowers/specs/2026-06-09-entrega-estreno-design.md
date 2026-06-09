# Entrega WOW — "El Estreno" (galería de entrega) — Diseño

> Spec de diseño. Reemplaza la etapa de entrega actual (link gris a Drive en `portal.html`)
> por una experiencia de entrega memorable, mobile-first, que impulse la recontratación.
> Fecha: 2026-06-09.

## 1. Problema y meta

Hoy la entrega final (estatus `Entregado`/`Liquidado`/`Completado`) se reduce a un banner
verde y un enlace gris a una carpeta de Google Drive (`renderEtapa4()` en `frontend/portal.html`).
El momento cumbre del servicio —cuando el cliente recibe el material por el que pagó— es plano.

**Meta única:** que recibir la media sea una experiencia *WOW* que haga que el cliente quiera
recontratar. Tres palancas: pico-final memorable, ahorrarle trabajo al cliente, y un bucle de
marca (la entrega es presumible y lleva el sello de IAV).

El 90% de los clientes abre el link desde el celular (WhatsApp), así que **mobile-first es
requisito duro**: debe verse impecable en cualquier dispositivo.

## 2. Concepto: "El Estreno"

La entrega deja de ser una "página de descarga" y se vuelve un **estreno privado** de la
propiedad. Cuatro ideas, todas validadas con prototipos (`mockups-galeria/v7-estreno.html`):

1. **El Estreno (revelado cinematográfico).** La primera vez que se abre el link: pantalla
   negra → logo de IAV → "presenta" → nombre de la propiedad → botón "Ver mi producción" →
   se asienta en la galería. Convierte la descarga en un *evento*. Solo la primera vez
   (botón "↺ Estreno" para repetirlo).
2. **Kit listo para publicar.** El material entregado ya empaquetado por destino:
   **Para redes** (video + caption con hashtags y "Grabado por @inmuebles.audiovisuales") y
   **Para tu anuncio** (fotos + descripción). Botones de descargar y de copiar texto. Le quita
   *todo* el trabajo al cliente → motor de recontratación.
3. **Sello de marca compartible.** La entrega lleva el logo real de IAV
   (`logo-invertido.svg` sobre barra charcoal con canto dorado) y cierra con "Una producción de
   Inmuebles Audiovisuales". Vive en una URL que el cliente reenvía con orgullo.
4. **Pico de recontratación.** Al final, en el punto de mayor emoción: reseña en Google +
   invitación sobria a agendar otra propiedad (por WhatsApp, **sin descuento ni código**).

### Decisiones de estilo (cerradas con el dueño)
- **Lenguaje visual:** "Dossier" papel editorial (papel marfil `--surface`, dorado `--gold*`,
  charcoal). Es el sistema actual del portal, elevado.
- **Tipografía:** Montserrat (display + UI) + Spline Sans Mono (etiquetas/datos). Es provisional
  de marca; intercambiable en una variable cuando se defina la fuente oficial. **No** usar
  Fraunces (rechazada por el dueño).
- **Sin contadores** de cantidad de archivos ni conteo de fotos.
- **Sin** sección antes/después.
- **Sin** "notas de revisión" (eso es de la etapa de revisión previa, no de la entrega final).
- Tarjeta "Tu entrega incluye": lista en lenguaje humano, **sin tecnicismos ni números**
  ("Tu video, listo para publicar" / "Tus fotografías profesionales" / "Tu recorrido virtual
  360°" + "Disponible por 30 días"). Sin íconos de palomita.
- **Reseña** en tarjeta dorada (gradiente); **recontratación** ("¿Tienes otra propiedad?") en
  tarjeta sobria de papel con botón outline dorado que lleva a WhatsApp. **Sin descuento ni
  código.**
- **Regla de emojis:** el chrome del producto va **sin emojis** (regla de CLAUDE.md). Los
  captions generados para redes *sí* pueden incluir emojis, porque son contenido saliente que
  el realtor publica en redes (convención de la plataforma); son editables.

## 3. Arquitectura y dónde vive cada cosa

- **Archivo nuevo `frontend/entrega.html?token=<token>`.** El portal (`portal.html`) redirige
  o enlaza aquí cuando el estatus es `Entregado`/`Liquidado`/`Completado`. Mantiene `portal.html`
  (~2,900 líneas) ligero. Reusa el mismo token y autenticación de portal.
- **Decisión clave: el material se migra a Cloudflare, no se sirve desde Drive.** Para que la
  galería sea rápida en celular y sin los problemas de permisos/estrangulamiento de Drive, al
  preparar la entrega se **copian las fotos a R2** y el **video a Stream**. La galería del cliente
  nunca toca Drive. Los originales full-res se quedan en Drive (link "descargar todo").
- **Carpeta de origen (ya existe en D1).** Cada trabajo tiene `propiedades.carpeta_entregables_id`
  (carpeta **Entregables** creada por el adapter en `crearCarpetas`). Dentro están las subcarpetas
  **Fotos** y **Videos**. No hay que pegar ninguna URL: "Preparar entrega" usa ese ID.
- **Migración (quién mueve los bytes).** El **adapter** (Apps Script) solo **lista** las
  subcarpetas Fotos/Videos y **marca cada archivo como público** (`ANYONE_WITH_LINK`), devolviendo
  `{ fotos:[{id,nombre}], videoWeb:{id,nombre}|null }`. El **Worker** hace el trabajo pesado: jala
  cada foto de Drive y la guarda en **R2** (`env.MEDIA.put`), y manda el video a **Stream** vía la
  API "copy from URL" (el Worker no tiene el límite de 50 MB de Apps Script). Así el adapter queda
  ligero y dentro de sus límites de ejecución.
- **Fotos → R2 + Cloudflare Image Transformations.** Se sirven por una ruta del Worker
  (`/media/entrega/<token>/<archivo>?w=600`) con redimensionado al vuelo (miniatura para la
  cuadrícula, tamaño grande para pantalla completa), formato `auto` (WebP/AVIF), cacheadas en el
  edge. Requiere **Transformations habilitado** en la zona. Las fotos son siempre **4:3**.
- **Video → Cloudflare Stream.** El adapter detecta en la carpeta Videos el archivo cuyo nombre
  termina en **`_web`** (versión 1080p comprimida que Bruno exporta, idealmente < 45 MB) y el
  Worker lo sube a Stream (copy-from-URL). Reproductor limpio con autoplay para el Estreno.
  Respaldo: pegar el ID/URL a mano en el admin. **No** reproducir 4K desde Drive.
- **Modelo de datos (D1).** Columnas nuevas en `contratos` (no tabla aparte; **D1 no soporta
  foreign keys**):
  - `entrega_manifiesto_json`: `{ fotos:[{ key, nombre }], destacadoKey, propiedadNombre,
    propiedadUbicacion }` (las URLs se arman desde `key` apuntando a la ruta `/media/...`).
  - `entrega_video_proveedor` (`stream | youtube | ''`) + `entrega_video_id` (UID de Stream).
  - `entrega_textos_json`: `{ redes, anuncio }` (plantilla editable en Fase 1; IA en Fase 2).
  - `entrega_config_estado`: `borrador | publicado` (gate de revisión, ver §5).
  - `entrega_media_estado`: `pendiente | migrando | listo | error` (progreso de la copia).
  - El tour 360 reutiliza `contratos.recorrido_url` + `tiene_recorrido` (ya existen).
- **Infra nueva a aprovisionar:** bucket **R2** con binding `MEDIA`, cuenta **Stream** (account id
  + API token como *secret*), y **Transformations** habilitado en la zona. Documentar en
  `docs/CREDENCIALES.md`.
- **IA de textos (Fase 2).** Ruta nueva en el Worker `/api/generarTextosEntrega` que toma datos
  de la propiedad + cuartos del **checklist** (`checklist.html`/tabla de checklist) y devuelve
  `textos.redes` y `textos.anuncio`. Proveedor: Cloudflare Workers AI o DeepSeek (barato,
  on-stack; arquitectura idéntica sea cual sea). API key como **secret** de Cloudflare. Salida
  **siempre editable** por el admin antes de publicar.

## 4. La experiencia (orden en `entrega.html`, mobile-first)

1. **Estreno** (overlay primera visita): logo IAV → "presenta" → nombre propiedad → ubicación →
   "Ver mi producción". Con "Saltar intro".
2. **Header**: barra charcoal + logo IAV + canto dorado (igual al portal real). Botón "↺ Estreno".
3. **Hero**: el reel (poster + play; reproduce desde el host de video). "Tu producción está
   lista" + nombre de la propiedad.
4. **Fotografías**: grid (primera foto destacada a ancho completo si hay `destacado`). Revelado
   escalonado al hacer scroll. "Ver todas las fotos →". Lazy-load.
5. **Recorrido 360°**: preview + "Abrir recorrido" + fila con liga y botón **Copiar**. Nota
   "Solo en línea".
6. **Listo para publicar (Kit)**: acordeón con "Para redes" y "Para tu anuncio"; cada uno con
   texto (copiar) + descarga.
7. **Descargar todo el material** (botón).
8. **Tu entrega incluye** (lista humana) + "Disponible por 30 días".
9. **Cómo publicarlo en alta calidad** (guía).
10. **¿Te encantó tu material?** → reseña en Google.
11. **¿Tienes otra propiedad?** → invitación a agendar otra propiedad por WhatsApp (sin descuento).
12. **Comprobante de pago** (plegable) + **WhatsApp** + "Una producción de Inmuebles
    Audiovisuales".

**Estado solo-video** (paquetes sin fotos ni 360): el hero ocupa más, se omiten las secciones
de fotos/360, y las tarjetas de valor (incluye / guía / reseña / reventa) llenan la página para
que **no se sienta vacía**. Validado en `mockups-galeria/v3-completo.html` (derecha).

## 5. Flujo de configuración en admin (gate de revisión)

Requisito del dueño: **revisar antes de publicar**. La entrega tiene un estado `borrador` antes
de `publicado`.

1. El dueño aprieta **"Preparar entrega"** (usa `carpeta_entregables_id`).
2. El sistema **migra** fotos a R2 y el `_web` a Stream (estado `migrando → listo`), arma el
   manifiesto y, en Fase 2, genera los textos con IA.
3. **Pantalla de configuración / vista previa** en `admin.html`:
   - Ve la `entrega.html` tal cual la verá el cliente (vista previa).
   - **Edita** los textos (redes/anuncio) y cualquier copy.
   - Marca el **destacado** (foto estrella / portada).
   - Confirma el video detectado (`_web` → Stream) o pega un ID a mano; pega la liga del 360.
4. **Publicar** → `estado_config = publicado` → el cliente obtiene acceso. Antes de eso, el
   cliente no ve la entrega nueva.

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Velocidad/permisos de Drive en la galería | **Resuelto:** las fotos se migran a R2 y se sirven con Transformations desde tu dominio; la galería del cliente nunca toca Drive. |
| La migración (copiar 40+ fotos) tarda | El Worker hace el trabajo en segundo plano con estado `migrando → listo`; el admin ve progreso. Es una sola vez por entrega. |
| Video pesado no cabe por el límite de Apps Script (~50 MB) | Bruno exporta una versión `_web` 1080p comprimida (< 45 MB) y el Worker la sube a Stream vía copy-from-URL (sin pasar por Apps Script). Respaldo: pegar ID a mano. |
| Falta el archivo `_web` o la subcarpeta Fotos/Videos no existe | El gate de admin avisa "no se encontró video web / fotos"; Bruno corrige y re-prepara. Pegar ID a mano siempre disponible. |
| Reproducir 4K desde Drive es lento y feo | Host de video real (Cloudflare Stream). Ya decidido. |
| Transformations no habilitado en la zona | Verificar en setup (Task de infra); si no, fallback a servir el original de R2 sin redimensionar. |
| Foto en formato no visible (RAW/TIFF) en la carpeta Fotos | El Worker/adaptador solo migra imágenes web (jpg/png/webp); RAW/TIFF se ignoran. |
| "Acceso 30 días" y "revocación" son ilusorios (link de Drive sigue público) | Tratarlos como **informativos** en Fase 1. Enforcement real (adapter cambia permisos vía cron) = fuera de alcance inicial. |
| IA inventa datos en los textos | Gate de revisión: el dueño edita y aprueba antes de publicar. Prompt acotado a datos reales del checklist. |
| Datos de propiedad insuficientes para buen texto | Conectar `checklist` (cuartos) + datos del contrato; lo que falte se deja en blanco/editable. |
| Logo externo no carga | Es el mismo patrón del portal actual; aceptable. |
| Fotos en orientaciones mixtas rompen el grid | Guardar `orientacion`; grid que tolera vertical/horizontal. |
| `portal.html` ya es enorme | Archivo nuevo `entrega.html`. Ya decidido. |
| Compatibilidad con entregas existentes (solo `entrega_drive_link`) | La galería es aditiva; si no hay manifiesto, fallback al comportamiento actual (link a Drive). |

## 7. Fases

**Fase 1 — La galería WOW (el corazón).**
`entrega.html` con: Estreno, hero con video real, galería de fotos (manifiesto vía adapter +
caché), 360 con copiar-liga, "Tu entrega incluye", guía, reseña, recontratación (sin descuento), comprobante,
WhatsApp. Gate de configuración/preview en admin (con textos por **plantilla** editable, aún sin
IA). Estado solo-video. Esto entrega el ~90% del WOW y del motor de recontratación.

**Fase 2 — Kit + IA.**
Acordeón "Para redes / Para tu anuncio" con textos **generados por IA** conectando el checklist
(`/api/generarTextosEntrega`), editables en el gate de revisión.

(Posible Fase 3, fuera de alcance ahora: enforcement real de 30 días; caché de imágenes en R2 si
Drive estrangula en producción.)

## 8. Fuera de alcance
- La **landing page** que el realtor comparte para *vender* (es otro producto, con su propio spec).
- Cortes de video distintos por plataforma (eso es trabajo de edición, no lo genera el sistema).
- Enforcement real de expiración/revocación de Drive.

## 9. Referencias
- Prototipos: `mockups-galeria/v7-estreno.html` (final), `v3-completo.html` (estado solo-video),
  `v1-direcciones.html` (comparativa de direcciones).
- Entrega actual a reemplazar: `frontend/portal.html` `renderEtapa4()`.
- Datos actuales: `worker/src/routes/portal.js`, `contratos.js` (`entrega_drive_link`,
  `entrega_links_extra`).
