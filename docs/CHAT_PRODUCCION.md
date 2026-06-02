# Chat en Producción — Guía de Endurecimiento

> Creado: 2026-06-02. Documento de referencia para cuando `chat.html` deje de ser
> mockup y se convierta en la app de chat real conectada a WhatsApp Business API.
>
> **Estado actual:** `frontend/chat.html` es un mockup semi-funcional con datos de
> ejemplo. Ya tiene aplicadas las mejoras de nivel mockup (render incremental,
> escape de HTML básico, dividers de fecha, navegación por teclado, notificaciones
> del navegador). Este documento cubre TODO lo que falta para producción.
>
> Ver también: `MASTER_AUTOMATIZACION.md` (arquitectura general, Durable Objects, fases).

---

## Cómo usar este documento

Cuando vayas a construir el chat real, recorre las secciones en este orden:
1. **Modelo de datos** (§2) — definir esto primero, cambiarlo después duele
2. **Seguridad** (§1) — no negociable antes de tocar datos reales
3. **Capa de estado y transporte** (§3) — la base sobre la que va todo
4. **Integración WhatsApp/Meta** (§4) — la lógica específica del dominio
5. El resto según prioridad

Cada ítem tiene una etiqueta de prioridad:
- 🔴 **Bloqueante** — no se puede ir a producción sin esto
- 🟡 **Importante** — afecta calidad/operación, hacer pronto
- 🟢 **Mejora** — suma, pero puede esperar

---

## 1. Seguridad

### 🔴 1.1 Escape de HTML exhaustivo (XSS)
El mockup ya usa una función `esc()` en los puntos principales, pero en producción
hay que auditar **cada** interpolación con `innerHTML`. Los datos peligrosos vienen del
cliente sin sanitizar:
- `conv.name` → nombre de perfil de WhatsApp (lo controla el cliente)
- `msg.text` → texto del mensaje
- `conv.lastMsg` → preview
- Cualquier campo de contrato que se muestre (dirección, notas)

**Regla:** preferir `textContent` sobre `innerHTML`. Cuando se necesite HTML (ej. `\n`→`<br>`),
escapar primero y luego transformar solo lo seguro. `admin.html` ya tiene el patrón `esc()`.

**Riesgo concreto:** la sesión de admin usa la clave `framedock`. Un XSS aquí secuestra
el panel completo. Un cliente que ponga `<img src=x onerror=...>` como nombre de WhatsApp
ejecuta código en tu navegador.

### 🔴 1.2 Autenticación de la página
El mockup no tiene login. En producción `chat.html` debe exigir la clave admin (header
`X-Admin-Key`) igual que el resto del sistema. Considerar:
- La conexión WebSocket también debe autenticarse (token en el handshake, no solo la página)
- No exponer el endpoint del Durable Object sin verificación de credenciales

### 🔴 1.3 Validación del webhook de Meta
- `GET /api/whatsapp` debe verificar el `hub.verify_token` secreto
- `POST /api/whatsapp` debe validar la firma `X-Hub-Signature-256` de Meta para
  confirmar que el mensaje viene realmente de Meta y no de un tercero

### 🟡 1.4 Sanitización de adjuntos
Imágenes que envía el cliente (QR de casetas, fotos) — validar tipo MIME, tamaño máximo,
no confiar en la extensión. Guardar en Drive vía el adapter, nunca servir directo desde
contenido del cliente.

---

## 2. Modelo de Datos

> **Definir esto antes de escribir código de UI.** El mockup usa atajos que no escalan.

### 🔴 2.1 Timestamps ISO, no strings
El mockup usa `'14:28'`, `'Ayer 16:20'`. En producción cada mensaje necesita un
timestamp ISO real (`2026-06-02T14:28:33Z`). Esto desbloquea:
- Ordenamiento correcto
- Agrupamiento por fecha real
- Cálculo de "hace cuánto" dinámico
- **Métrica de tiempo promedio de respuesta** (que se pidió en diseño)

El formateo a "14:28" / "Ayer" / "Hace 2 min" se hace en el render, no en el dato.

### 🔴 2.2 Campo `status` por mensaje
Chat real tiene ciclo de vida de mensaje:
```
enviando → enviado (✓) → entregado (✓✓) → leído (✓✓ azul) → fallido (⚠)
```
El mockup nace todo en ✓✓ azul. El modelo necesita:
```js
{
  id, conv_id, type, text, timestamp,
  status: 'sending'|'sent'|'delivered'|'read'|'failed',
  meta_message_id  // id que devuelve Meta, para mapear callbacks de estado
}
```
Meta envía webhooks de estado (`sent`/`delivered`/`read`) por separado — hay que mapearlos
al mensaje usando `meta_message_id`.

### 🟡 2.3 Esquema de mensajes en D1
Tabla dedicada en lugar de `mensajes_json` para volumen alto:
```sql
CREATE TABLE IF NOT EXISTS whatsapp_mensajes (
  id TEXT PRIMARY KEY,
  telefono TEXT NOT NULL,
  direccion TEXT NOT NULL,        -- 'entrante' | 'saliente'
  emisor TEXT,                    -- 'cliente' | 'bot' | 'bruno'
  tipo TEXT DEFAULT 'texto',      -- 'texto' | 'imagen' | 'documento' | 'plantilla'
  contenido TEXT,
  media_url TEXT,                 -- link de Drive si es adjunto
  meta_message_id TEXT,
  status TEXT DEFAULT 'sent',
  timestamp TEXT NOT NULL
);
CREATE INDEX idx_wmsg_telefono ON whatsapp_mensajes(telefono, timestamp);
```
`whatsapp_sesiones.mensajes_json` queda solo como caché de los últimos 10 para el bot.

### 🟢 2.4 Tipos de mensaje
El mockup solo maneja texto. Producción: imágenes, documentos, ubicaciones,
plantillas, respuestas a botones interactivos. Cada tipo necesita su render.

---

## 3. Arquitectura del Cliente

### 🔴 3.1 Capa de estado con render reactivo
El mockup usa variables globales mutables (`activeConvId`, `conversations` mutado en sitio).
Con WebSockets llegan eventos asíncronos que pueden chocar con re-renders. Necesita:
- Un store central (objeto de estado único)
- Una función de render que reaccione a cambios del store
- Mutaciones siempre vía funciones del store, nunca directas

No requiere framework — un patrón de store simple basta. Pero la estructura debe existir
**antes** de meter el transporte en tiempo real.

### 🔴 3.2 Separar capas
Hoy `simulateIncoming` mezcla datos, timers y DOM. Separar en:
- **Transporte** — WebSocket (hoy simulado con timers)
- **Estado** — el store
- **Render** — funciones puras que pintan desde el store

Así reemplazar la simulación por el WS real es enchufar una capa, no reescribir.

### 🟡 3.3 Render incremental real
El mockup ya hace append incremental de mensajes, pero `renderConvList` aún recrea todo
el DOM de la lista en cada cambio. Con 500 conversaciones se nota. Pasar a diff/actualización
por nodo, o virtualización si la lista crece mucho.

### 🟡 3.4 Envío optimista
Al enviar: mostrar el mensaje de inmediato con estado `sending` (reloj), luego actualizar
a ✓ cuando Meta confirma. Si falla, marcar ⚠ con opción de reintentar. El modelo de §2.2
lo soporta; falta la UI.

---

## 4. Integración WhatsApp / Meta

### 🔴 4.1 Indicador de ventana de 24 horas
**Específico del dominio, nadie lo resuelve por ti.** Meta solo permite texto libre dentro
de las 24h desde el último mensaje del cliente. Fuera de eso, solo plantillas aprobadas.

La UI debe mostrar claramente:
- Tiempo restante de la ventana (ej. "Ventana abierta — 18h restantes")
- Cuando esté cerrada: bloquear el campo de texto libre y ofrecer solo plantillas
- Sin esto, los envíos fallan en runtime sin que el operador entienda por qué

### 🔴 4.2 Reconexión del WebSocket
Cuando sea WS real:
- Detectar desconexión
- Reconectar con backoff exponencial
- **Resync de mensajes perdidos** durante la desconexión (pedir mensajes desde el último
  timestamp conocido)
- Indicador visual de "conexión perdida / reconectando"

### 🟡 4.3 Mapeo de callbacks de estado de Meta
Meta envía webhooks separados para `sent`/`delivered`/`read`. El Worker debe recibirlos,
mapearlos al mensaje por `meta_message_id`, actualizar D1 y notificar al ChatHub para
que el ✓✓ se actualice en vivo.

### 🟡 4.4 Plantillas aprobadas
UI para seleccionar y enviar plantillas (con sus variables). Listar solo las aprobadas por
Meta. Ver `MASTER_AUTOMATIZACION.md` §7 para las 3 plantillas de emergencia previstas.

### 🟢 4.5 Indicador "escribiendo..." real
Meta envía evento cuando el cliente teclea. El mockup lo simula con timers. Conectar al
evento real vía el ChatHub.

---

## 5. UX y Funcionalidad Faltante

### 🟡 5.1 Scroll-to-bottom inteligente con aviso
El mockup ya respeta la posición de scroll. Falta el botón flotante "↓ nuevo mensaje"
cuando llega algo mientras lees arriba.

### 🟡 5.2 Panel lateral de info del cliente
**Esta es la ventaja real vs Respond.io/Intercom.** Un tercer panel (derecha en desktop,
modal en mobile) con:
- Datos del contrato activo (folio, paquete, saldo, fecha de sesión)
- Historial de contratos previos
- Botón directo a acciones del admin
Esto justifica construirlo en casa en lugar de pagar un SaaS.

### 🟡 5.3 Respuestas rápidas / plantillas internas
Atajos para el operador: "Enviar link de portal", "Solicitar dirección", "Compartir
portafolio". Acelera mucho la atención manual.

### 🟢 5.4 Adjuntos
- Recibir y mostrar imágenes (QR de casetas, fotos de propiedad)
- Enviar imágenes/documentos
- Visor de imágenes inline

### 🟢 5.5 Búsqueda dentro de la conversación
Encontrar "¿cuál era la dirección?" en un thread largo.

### 🟢 5.6 Línea de "mensajes nuevos"
Marcador visual de dónde te quedaste al reabrir una conversación.

### 🟢 5.7 Paginación / scroll infinito
No cargar 1000 mensajes de golpe. Cargar los últimos N y traer más al hacer scroll arriba.

---

## 6. Accesibilidad

El mockup ya aplicó: navegación por teclado en la lista, `:focus-visible`, `role="log"`
aria-live en mensajes, `role="switch"` en el toggle del bot, aria-labels en botones de ícono.

Falta para producción:
### 🟡 6.1 Contraste WCAG AA
`--text-muted: #6b7280` sobre el sidebar oscuro queda en ~4.0:1, por debajo del mínimo
4.5:1 para texto pequeño. Ajustar a un gris más claro.

### 🟢 6.2 Anuncio de cambios de estado
Cuando el bot se pausa/reactiva o cambia el estado de un mensaje, anunciarlo vía aria-live
para lectores de pantalla.

### 🟢 6.3 Gestión de foco
Al abrir una conversación, mover el foco al thread o al compose. Al cerrar (mobile),
devolver el foco al item de la lista.

---

## 7. Rendimiento y Robustez

### 🟡 7.1 Debounce en búsqueda
Ya aplicado en el mockup (150ms). Verificar que se mantenga al cambiar a render real.

### 🟡 7.2 Lista de conversaciones eficiente
Ver §3.3 — no recrear todo el DOM en cada cambio.

### 🟢 7.3 Notificaciones del navegador
Ya implementadas en el mockup. Limitación conocida: en mobile, si el navegador mata la
pestaña en background, no llegan. Para algo más robusto se necesitaría una PWA con Service
Worker + Push API, o una app nativa. Evaluar si el correo (ya previsto en
`MASTER_AUTOMATIZACION.md` §7) cubre el caso urgente.

### 🟢 7.4 Límite de almacenamiento D1
Texto puro nunca satura los 5GB (ver `MASTER_AUTOMATIZACION.md` §6 de la conversación de
diseño). Mantener la regla: archivos a Drive, en D1 solo el link.

---

## 8. CSS / Diseño para Producción

### 🟡 8.1 Teclado virtual en mobile
iOS Safari tapa el compose cuando aparece el teclado. Manejar con la API `visualViewport`
para ajustar la altura del contenedor.

### 🟡 8.2 `100dvh` consistente
El sidebar fijo en mobile usa `height: 100%`; cambiar a `100dvh` para evitar cortes por
la barra del navegador.

### 🟢 8.3 SVGs repetidos
El HTML repite SVGs inline. Para producción, usar sprite o definirlos una vez con `<use>`.

### 🟢 8.4 Transición sidebar oscuro / chat claro
El header blanco pegado al sidebar oscuro puede verse abrupto. Revisar el borde de
transición.

---

## 9. Multi-agente (Futuro)

Ya contemplado en el modelo (`agente_asignado` en `whatsapp_sesiones`). Cuando aplique:
- Asignación de conversaciones a agentes
- Broadcast selectivo (solo al agente que tiene la conversación)
- Filtro "Mías" / "Sin asignar"
- Evitar que dos agentes respondan a la vez (locking suave o indicador "X está escribiendo")

Ver `MASTER_AUTOMATIZACION.md` §6 (multi-agente).

---

## 10. Checklist de Go-Live

Antes de poner el chat real frente a clientes:

- [ ] Todos los `innerHTML` con datos del cliente están escapados (§1.1)
- [ ] La página y el WebSocket exigen autenticación (§1.2)
- [ ] Webhook de Meta valida token y firma (§1.3)
- [ ] Timestamps ISO en el modelo de datos (§2.1)
- [ ] Campo `status` por mensaje + mapeo de callbacks de Meta (§2.2, §4.3)
- [ ] Tabla `whatsapp_mensajes` creada en D1 (§2.3)
- [ ] Capa de estado/render/transporte separadas (§3.1, §3.2)
- [ ] Envío optimista con estados visuales (§3.4)
- [ ] Indicador de ventana de 24h (§4.1)
- [ ] Reconexión de WebSocket con resync (§4.2)
- [ ] Plantillas aprobadas por Meta integradas (§4.4)
- [ ] Panel lateral de info del cliente (§5.2)
- [ ] Contraste WCAG AA corregido (§6.1)
- [ ] Manejo de teclado virtual mobile (§8.1)
- [ ] Pruebas en sandbox de Meta antes de números reales

---

> Documento vivo. Actualizar conforme se construya la versión real.
