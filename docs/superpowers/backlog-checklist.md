# Backlog — Checklist (armar cuartos y conexiones)

> Ideas capturadas para retomar en otra sesión. No es trabajo en curso; orden y alcance se deciden después.

## 1. Cliente arma el esqueleto desde el portal (portal.html → checklist.html)

Que el **cliente**, en el formulario de `portal.html`, pueda **opcionalmente** dejar armado el
**esqueleto de la propiedad** (la estructura de cuartos: pisos, recámaras/baños numerados,
sub-cuartos, exterior, amenidades) usando una versión ligera del nuevo flujo "Armar cuartos"
(esquema vivo + arranque rápido por números + hoja para agregar).

- **Opcional:** si el cliente no lo llena, no pasa nada; el equipo lo arma en sitio como hoy.
- **Conexión:** ese esqueleto se guarda y **alimenta `checklist.html`**, de modo que el equipo
  llegue con los cuartos ya esbozados y solo ajuste/capture (agregar lo que faltó con el botón
  contextual "Agregar cuarto aquí", quitar lo que no exista).
- **Origen de la idea:** sesión de rediseño de "Armar cuartos" (mockup esquema vivo). Bruno pidió
  anotarlo como meta futura.

Pendiente de definir: dónde se persiste el esqueleto (¿D1 contra el contrato/propiedad?), cómo
viaja a `checklist.html`, y qué tanto del flujo se expone al cliente sin abrumarlo.
