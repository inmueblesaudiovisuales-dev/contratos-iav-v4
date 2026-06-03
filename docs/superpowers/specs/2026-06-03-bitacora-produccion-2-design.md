# IAV Checklist — Bitacora de Produccion 2.0

**Fecha:** 2026-06-03  
**Archivo objetivo:** `frontend/checklist.html`  
**Ronda propuesta:** R53  
**Estado:** Spec de rediseño UX posterior a R48  

---

## Resumen

La primera Bitacora de Produccion resolvio parte del modelo de datos: modos Foto/360/Video/Drone, bitacora cronologica, espacios en lote y cierre. Pero la interfaz todavia falla en lo mas importante: en campo no queda obvio donde tocar, los estados parecen botones, las plantillas estan escondidas, y una segunda captura puede crear tomas duplicadas sin intencion clara.

La version 2.0 debe rediseñar la experiencia completa alrededor de una regla:

> El estado informa. El boton grande registra. Las tomas repetidas siempre requieren intencion explicita.

Ademas, Amenidades debe tratarse como una zona de produccion de primera clase, no como una nota o un cuarto suelto.

---

## Problemas a corregir

| Problema | Riesgo en campo | Decision 2.0 |
|----------|-----------------|--------------|
| Chips como "Foto falta" parecen clickeables | El usuario toca el lugar equivocado | Chips pasan a ser solo lectura; la accion principal es un boton grande. |
| Modo "360" es poco intuitivo | No queda claro si es boton o estado | Modo se nombra "Recorrido 360" en texto completo donde haya espacio. |
| Agregar espacios abre directo un textarea | Plantillas quedan escondidas y se siente incompleto | La pantalla inicial y el modal abren primero en Plantillas. |
| Doble toque en Video crea otra toma silenciosa | Duplicados accidentales en edicion | Si ya hay toma, se abre un sheet: Repetir, Extra, Reemplaza anterior, Cancelar. |
| Amenidades quedan mezcladas | Se olvidan areas clave para vender el desarrollo | Amenidades es zona propia con plantilla y pendientes separados. |
| Cierre no prioriza lo importante | El equipo puede irse con faltantes clave | Cierre agrupa por Interior, Exterior, Amenidades y Drone. |
| Edicion comparte UI con campo | El editor lee demasiado ruido | Vista Edicion muestra secuencias limpias, repetidas, notas y usar/no usar. |

---

## Usuarios

**Videografo**

- Registra Video y Drone.
- Necesita secuencia real.
- Necesita repetir tomas sin ensuciar el orden principal.
- Necesita marcar notas de edicion rapido.

**Fotografo**

- Marca Foto normal por espacio.
- No necesita orden detallado, solo cobertura.
- Necesita ver pendientes sin leer toda la bitacora.

**Operador 360**

- Marca Recorrido 360 por espacio o amenidad.
- El orden no es tan importante como Video, pero si debe quedar en historial.

**Editor**

- Entra despues.
- Necesita secuencia de Video y Drone, tomas repetidas, notas, y cual usar/no usar.
- No necesita operar la vista de campo.

---

## Modelo mental

La app debe separar cuatro conceptos:

1. **Zonas**
   - Interior
   - Exterior
   - Amenidades
   - Drone

2. **Elementos capturables**
   - Espacios: Sala, Cocina, Recamara principal.
   - Subespacios: Bano principal, Closet, Terraza de recamara.
   - Amenidades: Alberca, Gimnasio, Lobby, Salon de eventos.
   - Tomas Drone: Fachada aerea, Vista general, Entorno.

3. **Estado por servicio**
   - Pendiente
   - Hecho
   - No aplica

4. **Tomas / registros**
   - Entradas cronologicas con tipo, orden, autor, hora, intencion y nota.

---

## Flujo principal

### 1. Preparar propiedad

Si no hay espacios cargados, la pantalla inicial no debe mostrar una lista vacia con un boton pequeño. Debe mostrar:

```text
Prepara esta propiedad

Elige una plantilla para empezar rapido.

[ Casa residencial ]
[ Departamento ]
[ Terreno ]
[ Amenidades ]
[ Lista propia ]
```

Cada tarjeta de plantilla debe incluir:

- Nombre.
- Cantidad aproximada de elementos.
- Breve descripcion.
- Vista previa al tocar.

Acciones:

- `Usar plantilla`
- `Agregar a existente`
- `Reemplazar todo`
- `Editar antes`

### 2. Capturar

La vista principal debe tener una franja clara de modo activo:

```text
Modo activo: Video
Registra los espacios conforme los grabas.
```

Modos:

- Foto normal
- Recorrido 360
- Video
- Drone

En mobile pueden verse como botones compactos, pero nunca solo como letras sin contexto. Si el espacio horizontal obliga abreviar, el modo activo debe escribir el nombre completo en la franja.

### 3. Registrar captura

La tarjeta no debe depender de que el usuario toque el nombre o un chip.

Ejemplo en modo Video:

```text
Sala
Video 01 registrado
Falta Foto normal · Falta Recorrido 360

[ Registrar video ]
```

Si ya existe Video:

```text
Sala
Video 01 registrado
Falta Foto normal · Falta Recorrido 360

[ Gestionar video ]
```

Al tocar `Gestionar video`, aparece:

- `Repetir toma`
- `Toma extra`
- `Esta toma reemplaza la anterior`
- `Corregir registro`
- `Cancelar`

### 4. Revisar antes de irnos

La vista Cierre debe responder:

> Ya nos podemos ir, o falta algo importante?

Debe mostrar primero faltantes por zona:

- Interior
- Exterior
- Amenidades
- Drone

Luego:

- Tomas repetidas.
- Tomas con problema.
- Servicios desactivados.
- Elementos marcados como no aplica.

### 5. Edicion

La vista Edicion debe ser distinta de Bitacora general.

Debe mostrar:

- Secuencia Video principal.
- Secuencia Drone principal.
- Tomas repetidas / extras.
- Tomas marcadas `usar` o `no usar`.
- Notas.
- Amenidades capturadas.

---

## Plantillas

Las plantillas son parte central de la UX, no una ayuda secundaria.

### Casa residencial

Zonas:

**Exterior**

- Fachada
- Cochera
- Jardin / Terraza
- Patio

**Interior**

- Acceso / Recibidor
- Sala
- Comedor
- Cocina
- Bano de visitas
- Recamara principal
  - Bano principal
  - Closet
- Recamara 2
  - Bano
- Recamara 3
- Lavanderia

### Departamento

**Interior**

- Acceso
- Sala
- Comedor
- Cocina
- Bano de visitas
- Recamara principal
  - Bano principal
  - Closet
- Recamara secundaria
- Balcon / Terraza
- Lavanderia

**Amenidades**

- Lobby
- Alberca
- Gimnasio
- Salon de eventos
- Terraza comun
- Asadores

### Terreno

**Exterior**

- Frente del terreno
- Vista desde calle
- Lateral izquierdo
- Lateral derecho
- Fondo
- Vista panoramica
- Acceso
- Servicios / entorno

**Drone**

- Vista general
- Perimetro
- Entorno
- Accesos
- Toma de cierre

### Amenidades

Amenidades debe tener plantilla propia porque muchas sesiones dependen de vender el desarrollo o edificio.

**Amenidades base**

- Alberca
- Gimnasio
- Lobby
- Salon de eventos
- Terraza comun
- Asadores
- Area infantil
- Cancha
- Cowork
- Jardines
- Estacionamiento de visitas
- Acceso / Caseta
- Elevadores
- Pasillos / areas comunes

### Exterior / Drone

**Exterior**

- Fachada
- Calle / acceso
- Cochera
- Jardin
- Terraza
- Roof garden
- Vista exterior

**Drone**

- Fachada aerea
- Vista general de propiedad
- Calle / acceso
- Entorno / ubicacion
- Amenidades aereas
- Terreno completo
- Roof / terraza
- Toma de cierre

---

## Agregar espacios

El flujo `+ Espacios` debe abrir un sheet con dos tabs:

- Plantillas
- Lista propia

### Tab Plantillas

Muestra tarjetas:

- Casa residencial
- Departamento
- Terreno
- Amenidades
- Exterior / Drone

Al tocar una tarjeta, se muestra preview agrupada por zona. La accion principal debe decir:

- `Usar plantilla`

Acciones secundarias:

- `Agregar a existente`
- `Reemplazar todo`

### Tab Lista propia

Debe tener:

- Textarea.
- Ejemplo visible.
- Preview automatico del arbol.
- Contador: `Agregar 8 espacios`.

Soporte:

```text
Recamara principal
  Bano principal
  Closet
```

y:

```text
Recamara principal > Bano principal
```

---

## Tarjetas de captura

Cada tarjeta debe separar claramente:

1. Identidad del elemento.
2. Estado pasivo.
3. Accion principal.
4. Acciones secundarias.

Ejemplo:

```text
Sala                    Interior

Video 01 registrado
Falta Foto normal
Falta Recorrido 360

[ Registrar video ]
```

Si el modo actual ya esta hecho:

```text
Sala                    Interior

Video 01 registrado

[ Gestionar video ]
```

El boton principal cambia por modo:

- `Registrar foto`
- `Registrar recorrido 360`
- `Registrar video`
- `Registrar toma drone`

Los chips de estado no deben tener apariencia de boton. Deben verse como etiquetas.

---

## Reglas de captura

### Foto normal

Primer registro:

- Marca Foto como hecho.
- Crea entrada en bitacora.

Segundo toque:

- No crea duplicado.
- Abre opciones:
  - `Marcar pendiente`
  - `Marcar no aplica`
  - `Agregar nota`

### Recorrido 360

Primer registro:

- Marca 360 como hecho.
- Crea entrada en bitacora.

Segundo toque:

- No crea duplicado automatico.
- Abre opciones:
  - `Rehacer recorrido 360`
  - `Marcar pendiente`
  - `Marcar no aplica`
  - `Agregar nota`

### Video

Primer registro:

- Crea toma principal.
- Marca Video como hecho.
- Asigna orden `Video 01`, `Video 02`, etc.

Segundo toque:

- Abre sheet de intencion:
  - `Repetir toma`
  - `Toma extra`
  - `Reemplaza anterior`
  - `Corregir registro`
  - `Cancelar`

### Drone

Misma regla que Video, pero con secuencia separada:

- `Drone 01`
- `Drone 02`

---

## Intenciones de toma

Cada entrada de Video/Drone puede tener una intencion:

- `principal`
- `repetida`
- `extra`
- `reemplazo`
- `correccion`

Regla para edicion:

- Si existe una toma `reemplazo`, la vista Edicion debe sugerir esa como la principal.
- Las repetidas y extras se muestran separadas.
- Las correcciones pueden modificar estado sin crear una toma nueva si el usuario elige corregir.

---

## No aplica

`No aplica` es necesario, pero no debe esconder errores.

Reglas:

- Debe ser accion secundaria, no accion principal.
- Debe quedar visible en Cierre bajo "Marcado como no aplica".
- Para espacios clave, debe pedir confirmacion ligera:
  - `Marcar Terraza como no aplica para Video?`

---

## Espacios clave

Algunos elementos deben poder marcarse como clave:

- Fachada
- Sala
- Cocina
- Recamara principal
- Terraza / Jardin
- Alberca
- Amenidades principales

Cierre debe priorizar:

```text
Faltan 2 claves
- Video: Terraza
- 360: Alberca
```

antes de listar faltantes normales.

---

## Trabajo simultaneo

La app debe soportar que 3 personas trabajen al mismo tiempo.

Debe mostrar sin saturar:

- Autor en registros.
- Hora en bitacora.
- Cambios remotos reflejados por polling.
- Toast discreto cuando se actualiza algo remoto, si no interrumpe captura.

No debe bloquear por "alguien mas esta editando".

---

## Vista Cierre

Orden de la vista:

1. Faltantes clave.
2. Faltantes por zona.
3. Amenidades pendientes.
4. Drone pendiente.
5. Tomas repetidas / extras.
6. Problemas y notas.
7. No aplica.
8. Servicios desactivados.

Debe usar lenguaje operativo:

- `Falta Video en Terraza`
- `Falta Recorrido 360 en Alberca`
- `Sala tiene 2 tomas de video`
- `Cocina marcada como problema`

---

## Vista Edicion

Vista pensada para postproduccion.

Secciones:

**Video principal**

```text
01 Fachada
02 Sala
03 Cocina
04 Recamara principal
05 Bano principal
```

**Drone principal**

```text
01 Fachada aerea
02 Vista general
03 Entorno
```

**Repetidas / extras**

```text
Video 08 Sala - reemplaza Video 02
Video 11 Cocina - toma extra
```

**Notas**

```text
Cocina - usar segunda toma, menos reflejo
Sala - revisar ruido
```

**Amenidades**

```text
Alberca - Video, Foto, Drone
Gimnasio - Foto, 360
Lobby - Video
```

---

## Diseño visual

Direccion: herramienta profesional de produccion en campo.

Principios:

- Alto contraste.
- Una accion primaria por tarjeta.
- Botones grandes.
- Chips pasivos, no interactivos.
- Modo activo siempre visible.
- Plantillas como tarjetas grandes.
- Menus secundarios escondidos pero faciles de encontrar.
- Cierre con prioridad visual por riesgo.

Evitar:

- Letras sueltas como unico label de modo.
- Chips con apariencia de boton.
- Textareas como primer contacto.
- Acciones duplicadas silenciosas.
- Vistas con demasiada informacion al mismo tiempo.

---

## Fuera de alcance de esta iteracion

- Voz.
- Integracion automatica con servicios contratados.
- Cambios al adapter de Apps Script.
- Cambios de schema D1.
- Export PDF/CSV avanzado.
- Roles/permisos por usuario.

---

## Criterios de aceptacion

- Al abrir sin espacios, el usuario ve primero plantillas, no un textarea vacio.
- Amenidades aparece como plantilla y zona propia.
- El modo activo se entiende con texto completo.
- Cada tarjeta tiene un boton principal claro para registrar el modo activo.
- Los estados no parecen botones.
- Repetir Video/Drone requiere elegir intencion.
- Foto/360 no se duplican con un segundo toque accidental.
- Cierre prioriza faltantes clave, Amenidades y Drone.
- Edicion muestra secuencias limpias de Video y Drone.
- El diseño se puede operar en celular con prisa y una mano.

