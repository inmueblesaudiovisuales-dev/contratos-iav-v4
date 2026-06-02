# IAV Automatización — Documento Master

> Creado: 2026-06-02. Decisiones tomadas entre Bruno Gutiérrez y Claude en sesión de diseño.
> Este documento es el plano maestro del sistema de automatización. Ninguna línea de código
> debe escribirse sin consultar estas definiciones.
> Sistema base: `contratos-iav-v4` (ver `MASTER_V4.md`). No se crea un servidor nuevo —
> se expande el Worker actual con nuevos endpoints, tablas y la app de chat.

---

## 1. Visión General

Sistema de automatización en tres fases que convierte WhatsApp en el canal principal de
operación de Inmuebles Audiovisuales — desde el primer contacto de un prospecto hasta la
entrega del material final.

### Fases de implementación

| Fase | Qué se construye | Dependencia externa |
|------|-----------------|-------------------|
| **Fase 1** | Tablas D1, columnas nuevas, `chat.html` básico, endpoints WhatsApp (recepción) | Ninguna |
| **Fase 2** | Inbox en tiempo real con Durable Objects, envío manual desde `chat.html` | Aprobación de Meta (número + plantillas) |
| **Fase 3** | Bot de Gemini, cotización automática, creación de contratos, crons | Gemini API key, geofence definido |

**Tiempo mínimo para Fase 2:** ~3 semanas por aprobación de Meta (plantillas + número).

---

## 2. Decisiones de Negocio Confirmadas

### Canal de comunicación
- **Solo WhatsApp.** Instagram y Facebook Messenger reciben un auto-reply con link a WhatsApp.
  Configurado directamente en Meta Business Suite, sin código.
- Número nuevo dedicado al bot/negocio. El 81 2717 4207 se conserva para uso personal de Bruno
  hasta que el sistema esté en producción.

### Horarios de atención

| Periodo | Días | Comportamiento |
|---------|------|---------------|
| Horario operacional | Lun–Sáb 9am–6pm | Bot activo + Bruno puede contestar |
| Horario extendido | Lun–Sáb 8am–9am y 6pm–9pm | Solo bot, si requiere escalar avisa que no hay nadie hasta las 9am |
| Fuera de horario | Lun–Sáb 9pm–8am | Bot responde, avisa que retoman al día siguiente |
| Domingo | Todo el día | Solo bot, misma lógica de fuera de horario |

Cuando el bot necesita escalar a Bruno **fuera del horario operacional**, responde al cliente:
> "Este caso lo atiende directamente nuestro equipo. En este momento estamos fuera de horario
> de operación — te contactamos en cuanto retomemos [mañana/el lunes] a las 9am."

Y en lugar de WhatsApp, notifica a Bruno por **correo electrónico**.

### Paquetes y precios confirmados
Catálogo idéntico al de `contratos-iav-v4` (tabla `paquetes` en D1). Agregar:

| Clave | Nombre | Precio | Nota |
|-------|--------|--------|------|
| ADD-DOBLE-FORMATO | Doble Formato Nativo | $1,500 MXN | Pendiente agregar a D1 |

**ADD-EXPRESS:** $1,000 MXN. Entrega al día siguiente (no 48h). Ya está en D1.

### Facturación
> "No manejamos facturación en este momento."

Frase exacta que usa el bot. Sin más explicación, sin alternativas.

### Formatos de video
El cliente los elige en el **portal de firma** (`portal.html`), no en la conversación de WhatsApp.
El bot explica las opciones si el cliente pregunta y le indica que las seleccionará en el portal.

Opciones en portal:
- Vertical Nativo — Reels, TikTok, Shorts (default, recomendado)
- Horizontal Nativo + Recorte Vertical — incluye recorte vertical, advertencia de encuadre
- Doble Formato Nativo (+$1,500) — dos pasadas de producción, calidad nativa en ambos

### Regla de "Locación no lista"
**No hay automatización.** El equipo en campo avisa a Bruno directamente por WhatsApp personal.
Bruno decide caso por caso si aplicar la penalización del 25% o no. Si aplica, la registra
manualmente en el admin. Sin botones especiales, sin mensajes automáticos al cliente, sin
lógica de bloqueo de fechas.

### Contactos que no son clientes (proveedores, freelancers, etc.)
El bot los pasa por el flujo de cotización. Si la conversación no encaja con ningún servicio,
responde:
> "Para contacto comercial o colaboraciones, escríbenos a inmueblesaudiovisuales@gmail.com."

Sin flujo especial en el sistema.

### Geofence
**Radio exacto: pendiente definir.** El bot no puede cotizar distancias hasta tener este número.
Precios de referencia conocidos mientras tanto:
- MTY, San Pedro, Guadalupe, Santiago → $0 extra
- Allende → $500
- Saltillo → $1,750
- Fuera del radio → escala a Bruno

---

## 3. Stack Tecnológico

| Componente | Tecnología | Propósito |
|---|---|---|
| Worker | Cloudflare Workers (existente) | API, webhook WhatsApp, lógica del bot |
| Base de datos | Cloudflare D1 (existente) | Todas las tablas |
| Chat en tiempo real | Cloudflare Durable Objects | WebSockets para `chat.html` |
| Mensajería | WhatsApp Cloud API (Meta) | Recepción y envío de mensajes |
| IA / Chatbot | Gemini 2.5 Flash (Google) | Generación de respuestas |
| Calendario | Apps Script adapter (existente) | Leer disponibilidad, crear eventos |
| Clima | OpenWeatherMap API | Monitoreo 24h antes de sesión |
| Mapas | Google Maps Distance Matrix | Cálculo de viáticos por distancia |
| Notificaciones internas | Apps Script / Gmail (existente) | Correos a Bruno |
| Pagos | Por definir (Conekta o Stripe) | Links de pago — solo Fase 3 |
| Control de versiones | GitHub + CI/CD Cloudflare | Deploy automático en push a `main` |

### Por qué Durable Objects y no Pusher/Ably
- Sin dependencias externas
- Los mensajes nunca salen de la infraestructura de Cloudflare
- Menor latencia (~10-20ms vs ~50-100ms)
- Permite lógica custom: pausar bot automáticamente cuando Bruno escribe,
  marcar mensajes como leídos, indicador de "escribiendo...", reintentos de envío
- Requiere Workers Paid plan ($5/mes)

---

## 4. Base de Datos — Cambios a D1

### 4.1 Tablas nuevas

#### `prospectos`
Contactos que interactúan con el bot antes de convertirse en contratos.

```sql
CREATE TABLE IF NOT EXISTS prospectos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefono TEXT NOT NULL,
  nombre_whatsapp TEXT,
  propiedad_interes TEXT,
  resumen_conversacion TEXT,
  estatus TEXT DEFAULT 'Cotizando',
  -- Valores: 'Cotizando', 'Postergado', 'Abandonado', 'Convertido'
  fecha_primer_contacto TEXT NOT NULL,
  fecha_ultimo_mensaje TEXT,
  fecha_contacto_programado TEXT
);
```

#### `whatsapp_sesiones`
Historial de conversaciones y estado del bot por número.

```sql
CREATE TABLE IF NOT EXISTS whatsapp_sesiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefono TEXT NOT NULL UNIQUE,
  canal TEXT DEFAULT 'whatsapp',
  -- Valores: 'whatsapp' (único por ahora)
  mensajes_json TEXT DEFAULT '[]',
  -- Últimos 10 mensajes completos
  resumen_historico TEXT,
  -- Resumen acumulado de mensajes anteriores al 10 más reciente
  modo_manual INTEGER DEFAULT 0,
  -- 1 = IA pausada, Bruno atiende manualmente
  agente_asignado TEXT,
  -- Para soporte multi-agente futuro
  estatus_chat TEXT DEFAULT 'activo',
  -- Valores: 'activo', 'pausado_ia', 'cerrado'
  ultima_actualizacion TEXT
);
```

#### `revisiones_video`
Notas de revisión del cliente sobre la versión con marca de agua.

```sql
CREATE TABLE IF NOT EXISTS revisiones_video (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contrato_id TEXT NOT NULL,
  minuto_segundo TEXT,
  descripcion_ajuste TEXT NOT NULL,
  fecha TEXT NOT NULL
);
```

### 4.2 Columnas nuevas en tablas existentes

**Tabla `contratos`:**
```sql
ALTER TABLE contratos ADD COLUMN origen TEXT DEFAULT 'admin';
-- Valores: 'admin' (creado por Bruno), 'whatsapp' (creado por el bot)
ALTER TABLE contratos ADD COLUMN penalizacion_reagendamiento REAL DEFAULT 0;
-- 25% acumulado si aplica, se suma al saldo_pendiente
```

**Tabla `propiedades`:**
```sql
ALTER TABLE propiedades ADD COLUMN requiere_acceso INTEGER DEFAULT 0;
-- 1 = privada o caseta, se pregunta en portal y en confirmación matutina
ALTER TABLE propiedades ADD COLUMN formato_video TEXT DEFAULT 'vertical_nativo';
-- Valores: 'vertical_nativo', 'horizontal_recorte_vertical', 'doble_nativo'
ALTER TABLE propiedades ADD COLUMN cajones_estacionamiento TEXT;
-- Solo para tipo 'Departamento', se pregunta el día de la sesión
```

### 4.3 Migración pendiente (ejecutar en D1 remota)
```bash
# ADD-DOBLE-FORMATO al catálogo
wrangler d1 execute contratos-iav-v4 --remote --command="INSERT INTO paquetes (clave, tipo, nombre, precio, es_adicional, entregables, activo, orden, alcance) VALUES ('ADD-DOBLE-FORMATO', 'Adicional', 'Doble Formato Nativo', 1500, 1, 'Dos pasadas de producción en campo. Material nativo en vertical y horizontal.', 1, 11, 'por_propiedad')"

# Columnas nuevas en contratos
wrangler d1 execute contratos-iav-v4 --remote --command="ALTER TABLE contratos ADD COLUMN origen TEXT DEFAULT 'admin'"
wrangler d1 execute contratos-iav-v4 --remote --command="ALTER TABLE contratos ADD COLUMN penalizacion_reagendamiento REAL DEFAULT 0"

# Columnas nuevas en propiedades
wrangler d1 execute contratos-iav-v4 --remote --command="ALTER TABLE propiedades ADD COLUMN requiere_acceso INTEGER DEFAULT 0"
wrangler d1 execute contratos-iav-v4 --remote --command="ALTER TABLE propiedades ADD COLUMN formato_video TEXT DEFAULT 'vertical_nativo'"
wrangler d1 execute contratos-iav-v4 --remote --command="ALTER TABLE propiedades ADD COLUMN cajones_estacionamiento TEXT"
```

---

## 5. Nuevos Endpoints en el Worker

### WhatsApp
| Método | Ruta | Propósito |
|--------|------|-----------|
| `GET` | `/api/whatsapp` | Verificación del webhook de Meta (token secreto) |
| `POST` | `/api/whatsapp` | Recepción de mensajes entrantes |
| `POST` | `/api/whatsapp/enviar` | Envío de mensajes (usado por el Durable Object) |
| `POST` | `/api/toggleModoManual` | Pausar/reactivar el bot desde `chat.html` |

### Calendario (nuevo en Apps Script adapter)
| Acción | Propósito |
|--------|-----------|
| `obtenerDisponibilidad` | Retorna slots libres en los próximos 30 días (lun–sáb) |

**Lógica de agendamiento del bot:**
- Priorizar días sin eventos existentes
- Lunes a sábado únicamente
- Horario máximo de inicio: 4:00 PM
- No agendar para el día siguiente salvo que el cliente tenga urgencia explícita
- Bloques de 3 horas por propiedad
- Preguntar primero si quiere la fecha más próxima disponible

---

## 6. App de Chat en Tiempo Real — `chat.html`

Página separada de `admin.html`. Mismo dominio, autenticación con la misma clave admin.

### Arquitectura Durable Object

```
chat.html (browser)
    ↕  WebSocket
ChatHub (Durable Object)  ← proceso persistente en Cloudflare
    ↑  notificado por
Worker POST /api/whatsapp
    ↓  guarda en
D1 (whatsapp_sesiones)
```

### Funcionalidades del inbox
- Sidebar con lista de conversaciones: nombre, teléfono, último mensaje, hace cuánto
- Filtros: Todos / Bot activo / Atención manual / Sin asignar / Resueltos
- Thread de mensajes con burbujas diferenciadas:
  - Cliente → gris, izquierda
  - Bot → verde, derecha, con ícono 🤖
  - Bruno → azul, derecha, sin ícono
- Toggle "Pausar bot / Reactivar bot" por conversación
- Botón "Ver contrato" si el número tiene contrato activo en D1
- Indicador "escribiendo..." cuando el cliente teclea
- Web Notifications cuando la pestaña está en segundo plano
- Caja de texto para responder manualmente

### Comportamiento del Durable Object
- Cuando Bruno escribe desde `chat.html` → DO pone `modo_manual = true` en D1 automáticamente
- Cuando Bruno activa "Reactivar bot" → DO pone `modo_manual = false`
- Marcar mensajes como leídos al abrir una conversación (señal a Meta)
- Reintentos automáticos si el envío a Meta falla

### Multi-agente
Soportado por diseño. Columna `agente_asignado` en `whatsapp_sesiones`. Filtro "Mías" en el inbox.
Para la operación actual (solo Bruno) no se usa activamente.

---

## 7. Sistema de Notificaciones

### Correo (Apps Script — existente)
Usado para todo lo operacional. Sin costo adicional.

| Evento | Destinatario | Cuándo |
|--------|-------------|--------|
| Handoff solicitado (horario operacional) | Bruno | Inmediato |
| Mensaje nuevo sin leer (horario operacional) | Bruno | Inmediato |
| Pago de anticipo recibido | Bruno | Inmediato |
| Pago final recibido | Bruno | Inmediato |
| Cotización abandonada (48h sin respuesta) | Bruno | A las 48h |

### WhatsApp plantillas (solo emergencias de campo)
Máximo 3 plantillas a someter a Meta:

1. **Cancelación mismo día** — cliente reporta problema con la sesión
2. **Sin acceso en locación** — equipo llegó y no puede entrar
3. **Retraso significativo** — cliente reporta que va muy tarde

Las plantillas son para notificar a Bruno, no al cliente. El cliente recibe texto libre
dentro de la ventana de 24h.

---

## 8. Bot de Gemini — Identidad y Comportamiento

> **El System Prompt está pendiente.** Este documento registra las directrices acordadas,
> no el prompt final.

### Identidad
- Se presenta como **"Área de Coordinación"** o **"Asistente Digital"**
- Saludo: "Hola, te atiende el sistema de coordinación de Inmuebles Audiovisuales. ¿En qué podemos ayudarte?"
- Nunca dice que es IA. Nunca finge ser humano con nombre propio.
- Tono: corporativo, plural ("somos", "nuestro equipo"), sin emojis, directo, premium.
- Prohibido: "Video Tour" → siempre "video cinemático"
- Lenguaje neutro: "tu propiedad", "el inmueble" (no asumir si es asesor o dueño)

### Flujo de cotización
1. Primera pregunta: tipo de propiedad (residencial, terreno, departamento)
2. Ubicación exacta → determina si está en zona estándar o requiere viáticos
3. Paquete de interés → cotización con precios de D1
4. Disponibilidad en calendario → ofrece fechas (lun–sáb, máx 4pm inicio)
5. Confirmación → crea contrato en D1, envía link al portal

### Memoria (Rolling Summary)
- Se guardan íntegros los **últimos 10 mensajes** por número en `whatsapp_sesiones`
- Al llegar el mensaje #11, Gemini redacta un párrafo de resumen y lo guarda en `resumen_historico`
- El resumen más el historial reciente se inyectan como contexto en cada llamada
- Al identificar un número existente en `contratos`, el bot carga el historial del cliente

### Reconocimiento de clientes recurrentes
- Búsqueda por `telefono_cliente` en `contratos` al recibir cualquier mensaje
- Si tiene contrato activo: bot lo saluda por nombre y sabe el estatus de su proyecto
- Si es cliente anterior sin contrato activo: tono más cálido, puede referenciar trabajo previo
- Si es número nuevo: flujo estándar de prospecto

### Creación automática de contratos
El bot acumula datos en `prospectos` durante la conversación. Cuando el cliente confirma:

```
Worker llama internamente a crearContrato() con:
  - nombreCliente (del perfil WhatsApp o preguntado)
  - telefonoCliente (automático del webhook)
  - paqueteBase (elegido en cotización)
  - precioTotal (calculado)
  - propsData[0].tipo, fechaSesion, direccion
  - origen: 'whatsapp'

Contrato creado en D1 con estatus 'Pendiente firma'
Bot envía al cliente: link al portal existente
El portal maneja: firma, formato de video, requiere_acceso, add-ons opcionales
```

### Detonadores de handoff a humano
```
Palabras clave:    "llamar", "teléfono", "hablar con alguien", "asesor", "persona",
                   "humano", "pásame", "quiero hablar"
Situaciones:       Detección de frustración
                   Negociación de precio o descuentos por volumen
                   Propiedades fuera del radio de cobertura
                   Horarios después de 4pm
                   Hoteles, desarrollos industriales, fuera de NL
                   Solicitud de material crudo
                   Reclamo de copyright / audio silenciado
                   Guion para asesor en video
                   Add-ons fuera del catálogo
```

**Protocolo de handoff:**
1. Bot cambia `modo_manual = true` en `whatsapp_sesiones`
2. Bot responde al cliente: "Claro, te transfiero con nuestro equipo de producción."
3. Worker envía correo a Bruno con contexto del chat
4. Si es horario operacional, Bruno retoma desde `chat.html`
5. Si es fuera de horario, bot avisa al cliente y el correo queda para cuando Bruno regrese

### Fallback si Gemini falla
1. Bot activa `modo_manual = true` automáticamente
2. Responde al cliente: "Estamos experimentando problemas técnicos. Te contactamos en breve."
3. Correo de alerta a Bruno

### Regla de Oro
La IA tiene prohibido decir "no" a algo técnicamente posible. Siempre consulta con dirección:
> "Para esa solicitud especial, prefiero consultarlo directamente con dirección. Dame un momento y te confirmo."

---

## 9. Automatizaciones Programadas (Cron)

El Worker ya tiene `scheduled()` para cron (corre cada hora). Se expande con un dispatcher
que evalúa qué debe dispararse según timestamps en D1.

| Automatización | Cuándo | Canal |
|----------------|--------|-------|
| Guía de preparación | 24-48h antes de sesión | WhatsApp (plantilla) |
| Monitoreo climático | 24h antes de sesión | WhatsApp si hay riesgo |
| Confirmación matutina | 8:00 AM del día de sesión | WhatsApp (plantilla) |
| Recordatorio de anticipo | 24h después de firma sin pago | WhatsApp |
| Ultimátum anticipo | 24h antes de sesión sin pago | WhatsApp |
| Cotización abandonada | 48h sin respuesta | WhatsApp |
| Follow-up post-entrega | 15-20 días después de "Completado" | WhatsApp |

**Mensajes agrupados:** Si un cliente tiene múltiples propiedades el mismo día,
recibe un solo mensaje consolidado (confirmación, clima, accesos).

---

## 10. Portal de Revisión de Video

Nueva página: `revision.html`. Conectada al token del contrato.

- El video se abre en Google Drive (no incrustado)
- Formulario: campos "Minuto:Segundo" + "Descripción del ajuste"
- El cliente puede agregar tantas filas como necesite
- Al enviar: Worker guarda en `revisiones_video`, alerta al equipo de edición
- Aviso siempre visible: resolución reducida en la nube, descargar para evaluar calidad

**Mensaje del bot cuando el video con marca está listo:**
> "Tu material cinemático está listo para revisión inicial. En el siguiente enlace puedes
> visualizar la pieza y dejarnos tus notas sobre ajustes finos. Una vez aprobada esta versión,
> te compartiremos el enlace de pago final para liberar los archivos en alta resolución."

---

## 11. Cambios en `portal.html`

- Nueva sección: selección de formato de video (antes de la firma)
- Nueva pregunta: "¿La propiedad se encuentra en privada o requiere registro en caseta?" (Sí/No)
  → guarda en `propiedades.requiere_acceso`
- Checkbox obligatorio: cliente confirma políticas de revisión (máx. 2 rondas, sin cambios
  estructurales ni de música)

---

## 12. Cambios en `admin.html`

- Nueva pestaña **"Conversaciones"** — acceso directo a `chat.html` o vista integrada
- Nueva pestaña **"Prospectos"** — lista de quienes interactúan con el bot, en qué etapa están
- Campo `origen` visible en el panel del contrato (admin vs whatsapp)
- Etiqueta visual "URGENTE" para contratos con `entrega_express = 1`
- Búsqueda por nombre o teléfono con historial completo

---

## 13. Pendientes Críticos (Bloqueantes)

| Pendiente | Quién lo resuelve | Impacto |
|-----------|------------------|---------|
| Número nuevo de WhatsApp para el bot | Bruno (trámite SIM/número virtual) | Bloquea Fase 2 |
| Cuenta Meta Business verificada | Bruno (documentos del negocio) | Bloquea Fase 2 |
| Diseño y aprobación de 3 plantillas WhatsApp | Bruno + Claude | Bloquea automatizaciones proactivas |
| Radio exacto del geofence (km) | Bruno | Bloquea cotización automática de distancias |
| Cuenta Conekta o Stripe | Bruno | Bloquea links de pago automáticos (Fase 3) |
| Gemini API key con billing activo | Bruno (ya tiene) | ✅ Resuelto |
| System Prompt del bot | Bruno + Claude (sesión futura) | Bloquea Fase 3 |

---

## 14. Lo que Fue Explícitamente Descartado

| Ítem | Razón |
|------|-------|
| Flujo automático de "Locación no lista" | Requiere interpretación humana siempre |
| Respond.io / Intercom / servicios externos de chat | Se construye propio en `chat.html` |
| Pusher / Ably para tiempo real | Durable Objects es superior sin dependencias externas |
| Instagram y Facebook Messenger como canales operacionales | Solo auto-reply con link a WhatsApp |
| Notificaciones urgentes a Bruno por WhatsApp para todo | Solo 3 plantillas para emergencias de campo |
| Calendly | Redundante con Google Calendar + Apps Script |
| Facturación / CFDI | No se factura actualmente |
| Selección de música en pre-producción | Decisión del equipo creativo |

---

## 15. Portal para Equipo (Futuro — Fuera de Alcance Actual)

Identificado como proyecto futuro separado dentro del mismo sistema:
- **Vista fotógrafo/videógrafo:** sesiones del día, dirección, notas de acceso, checklist
- **Vista editor:** contratos listos para editar, fechas de entrega, formato de video, express
- Sin acceso a precios ni datos financieros
- Mismo Worker, misma D1, nuevas rutas con permisos diferenciados

---

> **Documento creado: 2026-06-02.**
> Próxima sesión: System Prompt del bot (requiere tener resueltos los pendientes críticos).
