# V5 — Rediseño centrado en Trabajos

## Objetivo

Convertir el sistema de gestión de contratos en un sistema de gestión de trabajos completo, donde un trabajo es la entidad central que puede existir como prospecto, cotización, o contrato firmado. Unificar la información del cliente en todas las vistas (admin, equipo.html, calendario).

## Arquitectura general

El sistema tiene tres entidades principales que coexisten: **Cliente**, **Trabajo** y **Contrato**.

- Un cliente puede tener muchos trabajos.
- Un trabajo puede o no tener un contrato asociado.
- Cuando un trabajo se formaliza en contrato, ambos comparten el mismo token.

El token se genera al crear el trabajo y es su identificador permanente. Si ese trabajo se convierte en contrato, `contratos.token` usa ese mismo valor. No se genera un token nuevo al crear el contrato.

---

## Sección 1 — Cambios de modelo de datos

### Tabla `prospectos`
Se elimina completamente. No hay datos reales que migrar. También se elimina el archivo `worker/src/routes/prospectos.js` y se remueve su registro del router en `worker/src/index.js`.

### Tabla `clientes` — campo nuevo
```sql
ALTER TABLE clientes ADD COLUMN inmobiliaria TEXT DEFAULT '';
```

### Tabla `trabajos` — cambios
```sql
-- Nuevo campo: token único generado al crear el trabajo
ALTER TABLE trabajos ADD COLUMN token TEXT UNIQUE;

-- Nuevo campo: ubicación/zona del inmueble de interés
ALTER TABLE trabajos ADD COLUMN ubicacion TEXT DEFAULT '';

-- El campo interes permanece en la BD con ese nombre (D1 no permite RENAME COLUMN).
-- En la UI y en las respuestas del API se etiqueta como "Notas de cotización".
-- El código de frontend y backend usa el campo interes pero lo presenta como notas_cotizacion.

-- El campo contrato_token permanece en la BD por compatibilidad pero el código deja de usarlo.
-- La relación trabajo↔contrato se determina buscando contratos.token = trabajos.token.
```

Los campos `paquetes_cotizados_json`, `portafolio_links_json` y `propiedades_interes_json` ya existen y se conservan.

### Estatus de trabajos — conjunto unificado

| Estatus | Color | Lógica |
|---|---|---|
| Nuevo | Gris `#9CA3AF` | Trabajo recién creado, sin cotización |
| En cotización | Amarillo `#F59E0B` | Cotización activa en conversación |
| Pendiente firma | Azul `#3B82F6` | Contrato generado, sin firma |
| Firmado | Azul claro `#60A5FA` | Contrato firmado, sin anticipo (si se requiere) |
| Reservado | Teal `#14B8A6` | Firmado + anticipo recibido, o firmado sin requerimiento de anticipo. Dispara evento en Google Calendar. |
| En producción | Morado `#8B5CF6` | Sesión realizada, en edición |
| Entregado | Verde `#10B981` | Material entregado al cliente |
| Completado | Verde oscuro `#065F46` | Trabajo cerrado |
| Cancelado | Rojo `#DC2626` | Cancelado — oculto por defecto en todas las vistas |

**Eliminado:** `Liquidado` — el estado de pago completo es información financiera (abonos), no define el estatus del trabajo.

**Reservado** se activa automáticamente cuando:
- El trabajo está en Firmado y se registra un abono, **o**
- El contrato se firma y el campo `anticipo` es 0 (no se requiere anticipo).

Al activarse Reservado se llama al adaptador de Google Apps Script para crear el evento en el calendario.

### Tabla `contratos` — sin cambios estructurales
El campo `token` sigue siendo la PK. Al crear un contrato desde un trabajo, se usa `trabajos.token` como valor del token del contrato.

### Abonos, propiedades, checklist
Sin cambios — siguen apuntando al token (que ahora es el mismo del trabajo).

---

## Sección 2 — Navegación de admin.html

### Sección principal: "Trabajos" (reemplaza "Contratos")

Tres vistas internas con tabs:

| Tab | Estatus incluidos |
|---|---|
| Prospectos | Nuevo, En cotización |
| Por firmar | Pendiente firma, Firmado |
| Confirmados | Reservado, En producción, Entregado, Completado |

Los trabajos en estatus **Cancelado** se ocultan en todas las vistas. Un toggle en el toolbar — "Mostrar cancelados" — los hace visibles dentro de la vista que corresponda. Desde el panel de un cancelado se puede cambiar el estatus de regreso.

### Stats bar

Franja delgada (~36px), fondo gris muy suave, una sola línea:

```
● Prospectos 4  ·  ● Por firmar 2  ·  ● Confirmados 7        ● 2 sesiones hoy
```

- El ● usa el color del estatus más representativo de cada vista (gris, azul, teal).
- "Sesiones hoy" aparece solo si hay sesiones ese día, en ámbar `#F59E0B`, alineado a la derecha.
- Sin scroll horizontal, sin chips con fondo de color saturado.

### Sección "Sesiones"

Sin cambios conceptuales. Solo muestra trabajos en estatus Reservado, En producción, Entregado o Completado (Confirmados). Ordenados por fecha de sesión ascendente.

### Sección "Clientes"

Lista simple: nombre, teléfono, inmobiliaria, número de trabajos activos. Al hacer clic abre un panel lateral con:
- Datos del cliente (editables)
- Lista de sus trabajos con estatus y fecha

Sin pipeline, sin badges complejos.

### Selección masiva

Se conserva en desktop. Se elimina en mobile.

### Secciones "Paquetes" y "Métricas"

Sin cambios.

---

## Sección 3 — Panel de trabajo

Al seleccionar un trabajo en cualquier vista se abre el panel lateral con dos tabs: **Info** y **Producción**.

### Tab Info

En orden vertical:

1. **Datos del cliente** — nombre, teléfono, correo, inmobiliaria. Bloqueados (campo-locked) si el cliente existe en el CRM; editables si es cliente sin perfil CRM.
2. **Datos del trabajo** — ubicación del inmueble, paquetes cotizados, links de portafolio enviados, notas de cotización.
3. **Estado del trabajo** — pill con color del estatus actual. Selector para cambiar estatus manualmente.
4. **Portal del cliente** — link del portal de firma y estado (firmado/pendiente). Solo visible si el trabajo tiene contrato.
5. **Acciones por propiedad** — fecha sesión, hora, dirección, link maps, orientación, nota interna de la propiedad. Sin el campo "ocultar selector de formato de video" — se elimina.
6. **Archivos del cliente** — logo, fachada, perímetro.
7. **Llamadas y notas** — historial de actividades en orden cronológico inverso. Cada entrada: fecha, hora, tipo (llamada agendada / nota), texto. Botón "Agendar llamada" que abre un modal con fecha, hora y nota previa. Al guardar crea evento en Google Calendar con nombre del cliente y URL `equipo.html?token=<trabajo_token>`. Botón "Agregar nota" para notas libres sin agendar.

**Eliminado de Info:**
- Nota interna general del contrato (`notas_internas`) — se elimina de la UI. La nota relevante por propiedad ya está en acciones por propiedad.
- Botones "Registrar abono" y "WhatsApp" al fondo del panel.

### Tab Producción

1. **Estado de producción** — lectura únicamente: indicadores de fotos / video / recorrido 360 listos o no (con fecha si están listos). No se puede editar aquí — se edita en equipo.html.
2. **Entrega** — link de Drive, links adicionales de entrega, botón "Revocar entrega".
3. **Revisiones de video** — lista de comentarios de ajuste con minutaje.

### Conversión trabajo → contrato

En el panel de un trabajo en estatus "En cotización" o posterior (sin contrato todavía), aparece el botón **"Crear contrato"**. Al presionarlo:

1. Se genera el PDF del contrato.
2. Se asigna el folio (`IAV-AAMM.NN-X`).
3. Se crean inmediatamente las carpetas de Drive (llamada síncrona al adaptador).
4. Se inserta en `contratos` usando `trabajos.token` como PK.
5. El estatus del trabajo avanza a "Pendiente firma".

Al crear un contrato nuevo desde el botón "+" de la sección Trabajos, se puede elegir:
- Trabajo existente de un cliente → seleccionar cliente → seleccionar trabajo activo
- Cliente nuevo con trabajo nuevo → formulario completo

---

## Sección 4 — equipo.html

### URL
`equipo.html?token=<trabajo_token>` para todos los casos — con o sin contrato asociado.

### Backend
El endpoint `obtenerEquipo` acepta el token del trabajo y devuelve datos completos: cliente, trabajo, contrato (si existe), propiedades y actividades.

### Layout — cuatro bloques verticales

**Bloque 1 — Cliente**
Nombre, teléfono, correo, inmobiliaria, origen. Solo lectura.

**Bloque 2 — Cotización**
Paquetes cotizados, links de portafolio enviados, ubicación del inmueble, notas de cotización. Solo lectura — se edita desde admin.

**Bloque 3 — Llamadas y notas**
Historial de actividades en orden cronológico inverso. Fecha, hora, tipo y texto de cada entrada. Botón "Agregar nota" para anotar durante una llamada sin salir de la página.

**Bloque 4 — Producción**
Contenido actual: propiedades con sesión/acceso/entregables, botones "Marcar listo" para fotos/video/recorrido, link al checklist de rodaje.

### Checklist
Accesible únicamente desde equipo.html. No aparece como navegación directa en ningún otro lugar.

---

## Sección 5 — Bug carpetas Drive

**Problema:** al subir archivos (logo, fachada, etc.) el sistema falla si las carpetas de Drive no existen todavía.

**Causa:** las carpetas se crean de forma asíncrona con `callAdapter` (fire-and-forget), pero la respuesta al cliente llega antes de que existan.

**Fix:** en `crearContrato`, reemplazar la llamada de creación de carpetas por `callAdapterSync` (llamada síncrona que espera respuesta del adaptador de Apps Script). La respuesta al cliente solo se envía después de confirmar que las carpetas fueron creadas.

---

## Paleta de colores — ESTATUS_MAP actualizado

```js
const ESTATUS_MAP = {
  'Nuevo':            { dot:'#9CA3AF', bg:'#F3F4F6', color:'#374151', label:'Nuevo'            },
  'En cotizacion':    { dot:'#F59E0B', bg:'#FEF3C7', color:'#92400E', label:'En cotización'    },
  'Pendiente firma':  { dot:'#3B82F6', bg:'#DBEAFE', color:'#1D4ED8', label:'Pendiente firma'  },
  'Firmado':          { dot:'#60A5FA', bg:'#EFF6FF', color:'#1E40AF', label:'Firmado'          },
  'Reservado':        { dot:'#14B8A6', bg:'#CCFBF1', color:'#0F766E', label:'Reservado'        },
  'En produccion':    { dot:'#8B5CF6', bg:'#F5F3FF', color:'#6D28D9', label:'En producción'    },
  'Entregado':        { dot:'#10B981', bg:'#DCFCE7', color:'#065F46', label:'Entregado'        },
  'Completado':       { dot:'#059669', bg:'#D1FAE5', color:'#064E3B', label:'Completado'       },
  'Cancelado':        { dot:'#DC2626', bg:'#FEE2E2', color:'#991B1B', label:'Cancelado'        },
};
```

Esta paleta reemplaza el `ESTATUS_MAP` actual en admin.html y se aplica de forma idéntica en todas las vistas donde aparezca un estatus.
