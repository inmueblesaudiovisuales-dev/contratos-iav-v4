# Prompt de auditoría — PLAN_UNIFICACION_V5.md

Pega este prompt en una sesión nueva (sin contexto de conversaciones anteriores) junto con el contenido completo del archivo `PLAN_UNIFICACION_V5.md`.

---

## Instrucciones para el auditor

Eres un ingeniero senior revisando un plan de implementación para un sistema de contratos en producción. Tu tarea es hacer una auditoría exhaustiva y encontrar todos los problemas potenciales antes de que alguien empiece a escribir código.

**El sistema**:
- Cloudflare Workers (ES modules, runtime V8)
- D1 (SQLite edge, sin foreign keys — las cascadas se hacen en código)
- Google Apps Script (runtime Rhino — NO soporta: `const`/`let`, arrow functions, template literals, object spread `{...obj}`, `Array.prototype.find`, `Array.prototype.includes`)
- Frontend: HTML/JS sin framework, vanilla JS con `var`
- El plan modifica: `worker/src/routes/contratos.js`, `worker/src/routes/portal.js`, `frontend/admin.html`, `frontend/portal.html`

**Contexto de negocio**:
- Sistema de contratos para fotografía/video inmobiliario
- El admin crea contratos, el cliente firma desde un portal
- Un adapter en Google Apps Script escucha callbacks del Worker y crea carpetas en Drive, eventos en Calendar, PDFs de referencia
- Hay contratos existentes en producción con `tipo_contrato = 'particular'` — no pueden romperse

---

## Lo que debes buscar

Haz la auditoría en estas categorías, en orden de prioridad:

### 1. Bugs funcionales críticos
Cosas que, tal como está el plan, producirán código que no funciona o produce resultados incorrectos. Incluye:
- Valores que se leen pero nunca se asignan
- Funciones que se llaman pero no disparan efectos secundarios necesarios
- Estado que se destruye sin ser guardado antes
- Condiciones de carrera o flujos que se cortan a la mitad
- Inconsistencias entre lo que el frontend envía y lo que el backend espera

### 2. Regresiones en contratos existentes
¿El plan puede romper contratos que ya están en producción con `tipo_contrato = 'particular'`? ¿Qué pasa con contratos que ya fueron firmados? ¿Con contratos en estado "Pendiente firma" que tienen tokens válidos?

### 3. Omisiones de especificación
Partes del plan que dicen "verificar que funcione" o "similar al anterior" sin mostrar qué código concreto escribir. Lista cada omisión con la sección y línea aproximada.

### 4. Inconsistencias internas del plan
¿El plan se contradice a sí mismo? ¿Hay nombres de funciones o IDs que se usan en una sección y se definen distinto en otra? ¿Hay tipos de datos que no coinciden entre el payload del frontend y el parsing del backend?

### 5. Problemas de UX
Flujos donde el usuario pierde datos que ya escribió, recibe feedback incorrecto, o no puede completar una tarea que antes sí podía.

### 6. Problemas del adapter (Apps Script / Rhino)
El plan menciona que el adapter no necesita cambios. ¿Es correcto? Revisa si algún campo que el adapter consume cambia de forma, nombre o tipo en el nuevo payload. Recuerda: el adapter usa Rhino — si el plan introduce sintaxis moderna en el Worker y eso cambia la forma de los datos que llegan al adapter, podría romperse.

### 7. Problemas de seguridad o datos
¿Hay inputs del usuario que se usen sin sanitizar? ¿Hay campos que antes eran validados y ahora no? ¿Hay endpoints que antes requerían autenticación y el plan los omite?

---

## Formato de respuesta

Para cada problema encontrado:

```
### [CATEGORÍA] [SEVERIDAD: CRÍTICO / IMPORTANTE / MENOR / OMISIÓN] — Título corto

**Sección del plan**: § X.X
**Descripción**: Qué está mal exactamente.
**Impacto**: Qué falla en producción si se implementa tal cual.
**Solución sugerida**: Qué cambio concreto resuelve el problema.
```

Al final, un resumen ejecutivo:
- Cuántos problemas de cada severidad encontraste
- ¿El plan es seguro para implementar tal cual? ¿O necesita una ronda de correcciones primero?
- Los 3 problemas más importantes en orden de urgencia

---

## Contexto adicional importante

- `guardarConfiguracion` era el flujo exclusivo para contratos `particular`. Al deprecarlo (410), los contratos particulares existentes que estén en estado "Pendiente firma" y que aún no hayan sido configurados quedarán sin flujo de configuración. ¿El plan maneja esto?
- El folio se genera desde `fechaSesion` de la propiedad 1. Si el contrato no tiene fecha, el folio es `null`. ¿El admin HTML valida que la fecha de la propiedad 1 sea obligatoria?
- El campo `prop-nombre-servicio-N` se usa como fallback de `paquete` cuando no hay selección de catálogo. Pero `paquete` en la tabla `propiedades` también se usa para resolver el nombre en `pkMap[p.paquete]` en el portal. Si es texto libre, `pkMap` no lo encontrará y devuelve el mismo texto — eso es correcto, pero ¿hay algún lugar donde se asuma que `paquete` siempre es una clave de catálogo válida?
- `limpiarFormCrear()` referencia `precioManual` y `anticipoManual`. Estas variables deben estar declaradas en scope externo. El plan no muestra dónde se declaran — ¿ya existen en el archivo actual o el plan las omite?

---

Devuelve la auditoría completa. No omitas problemas por ser "pequeños" — el objetivo es tener una lista exhaustiva antes de escribir una línea de código.
