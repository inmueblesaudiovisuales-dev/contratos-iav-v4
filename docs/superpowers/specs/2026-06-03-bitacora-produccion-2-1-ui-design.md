# IAV Checklist — Bitacora de Produccion 2.1 UI Campo

**Fecha:** 2026-06-03  
**Archivo objetivo:** `frontend/checklist.html`  
**Ronda propuesta:** R54  
**Estado:** Spec de refinamiento visual/UX sobre R53  

---

## Objetivo

R54 no debe agregar funciones grandes. Debe convertir la Bitacora 2.0 en una herramienta de campo mas rapida, compacta y clara.

La meta es que el equipo pueda usarla con prisa, una mano y poca lectura:

> abrir, elegir modo, registrar, revisar riesgos, irse con confianza.

---

## Principios

- Menos altura fija arriba, mas espacio para tarjetas.
- Un solo foco visual por momento.
- El modo activo debe ser obvio sin ocupar media pantalla.
- Los contadores deben orientar decisiones, no solo mostrar numeros.
- Las tarjetas deben diferenciar clave, amenidad y normal.
- Edicion debe leerse como secuencia, no como lista administrativa.
- Cierre debe funcionar como semaforo operativo.

---

## Cambios de UI

### 1. Header compacto

Despues de cargar espacios, el header debe ocupar menos altura.

Actual:

- Cliente grande.
- Folio.
- Sync.
- Nombre.
- Servicios.

Nuevo:

```text
Casa Demo                         En vivo
IAV-2606.03-A       Bruno · Servicios
```

Reglas:

- Mantener nombre editable, pero mas discreto.
- `Servicios` puede ser boton secundario pequeño.
- No usar dos filas de controles pesadas si no es necesario.

### 2. Selector de modo compacto

Reemplazar las cuatro tarjetas grandes de modo por una barra segmentada:

```text
[ Foto ] [ 360 ] [ Video ] [ Drone ]
```

Debajo, una banda compacta:

```text
Video activo
Registra cada espacio en el orden real de captura.
```

Reglas:

- Botones con texto claro.
- No usar solo iniciales.
- El modo activo debe tener alto contraste.
- La ayuda se muestra una sola vez en la banda, no repetida en cada boton.

### 3. Resumen orientado a riesgo

Cambiar de:

```text
1/50
17 claves faltan
Foto 0/14 · 360 0/14 · Video 1/14
```

a:

```text
Faltan 17 claves
Riesgo principal: Amenidades sin video
Foto 0/14 · 360 0/14 · Video 1/14 · Drone 0/8
```

Reglas:

- Si no faltan claves: `Claves listas`.
- Si hay amenidades pendientes: destacarlas antes que faltantes normales.
- Si Drone esta incompleto: mostrarlo como riesgo separado.
- El progreso numerico sigue existiendo, pero no debe ser la voz principal.

### 4. Cards con jerarquia

Tipos visuales:

**Clave**

- Borde izquierdo dorado.
- Label `CLAVE`.

**Amenidad**

- Label `AMENIDAD`.
- Si tambien es clave: `AMENIDAD CLAVE`.

**Normal**

- Card limpia sin acento fuerte.

Ejemplo:

```text
Alberca                         AMENIDAD CLAVE
Video 02 listo
Falta Foto · Falta 360

[ Video registrado · opciones ]
```

Reglas:

- El boton principal sigue siendo el elemento mas obvio.
- Los estados se ven como etiquetas pasivas.
- El menu `...` no debe competir visualmente con el boton principal.

### 5. Boton principal semantico

Textos:

- Si falta: `Registrar video`
- Si ya esta: `Video registrado · opciones`
- Si hay multiples tomas: `2 tomas de video · revisar`
- Foto: `Registrar foto`
- 360: `Registrar recorrido 360`
- Drone: `Registrar toma drone`

Regla:

- Evitar `Gestionar video` como texto principal; es correcto pero poco natural.

### 6. Cierre tipo semaforo

Vista Cierre debe ordenar por severidad:

```text
Rojo — Falta antes de irnos
- Video en Terraza
- 360 en Alberca

Amarillo — Revisar
- Sala tiene 2 tomas de video
- Cocina marcada con problema

Verde — Listo
- Drone completo
- Interior completo
```

Reglas:

- No mostrar listas largas al principio.
- Priorizar faltantes clave y amenidades.
- Colapsar detalles normales debajo de cada grupo.

### 7. Edicion tipo timeline

Vista Edicion debe verse como salida para postproduccion:

```text
VIDEO PRINCIPAL
01  Fachada
02  Sala
03  Cocina

DRONE PRINCIPAL
01  Fachada aerea
02  Vista general

REPETIDAS / EXTRAS
Video 08  Sala  reemplaza Video 02
```

Reglas:

- Numero de toma alineado.
- Nombre de espacio mas visible que autor/hora.
- Repetidas/extras separadas.
- Amenidades capturadas al final, resumidas.

### 8. Plantillas con onboarding mas claro

Pantalla inicial:

```text
Que vamos a producir hoy?

Casa residencial
Departamento
Amenidades del desarrollo
Terreno
Lista propia
```

Reglas:

- Amenidades debe aparecer como opcion principal, no debajo.
- Cada tarjeta muestra solo lo necesario: nombre, descripcion corta, cantidad.
- Al elegir plantilla, preview claro y botones:
  - `Usar plantilla`
  - `Agregar a existente`
  - `Reemplazar todo`

---

## Fuera de alcance

- Nuevos endpoints.
- Cambios D1.
- Cambios al adapter.
- Export PDF/CSV.
- Roles de usuario.
- Voz.
- Automatizar servicios desde contrato.
- Nuevas reglas de negocio de captura.

---

## Criterios de aceptacion

- La pantalla Capturar muestra mas tarjetas visibles que R53 en mobile.
- El modo activo se entiende sin leer cuatro descripciones repetidas.
- Las cards clave/amenidad/normal se distinguen en menos de un segundo.
- El boton principal no usa `Gestionar`; usa textos orientados a accion.
- Cierre muestra primero rojo/amarillo/verde.
- Edicion se lee como timeline.
- Plantillas se sienten como onboarding, no como formulario.
- No se reduce la cobertura de pruebas de `checklist-logic.test.js`.

