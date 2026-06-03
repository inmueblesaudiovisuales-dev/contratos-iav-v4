# IAV Checklist — Bitacora de Produccion

**Fecha:** 2026-06-03  
**Archivo objetivo:** `frontend/checklist.html`  
**Ronda propuesta:** R46  

---

## Resumen

`checklist.html` dejara de funcionar como una tabla de cuartos por columna y pasara a ser una **Bitacora de Produccion** para campo y edicion.

El objetivo principal es que el equipo registre lo que captura en el orden real de trabajo, sin friccion y sin depender de un flujo lineal. En una sesion trabajan varias personas al mismo tiempo en zonas distintas de la propiedad, asi que la experiencia debe permitir captura paralela, sincronizacion frecuente, pendientes claros y una bitacora cronologica util para postproduccion.

La regla de uso en campo sera:

> elegir modo -> tocar espacio -> captura registrada.

---

## Principios de diseno

| Principio | Decision |
|----------|----------|
| Rapidez en campo | La accion principal debe ser de un toque. No formularios por toma. |
| Baja carga mental | La pantalla inicial muestra solo modo, progreso, espacios y acciones esenciales. |
| Captura paralela | Cada persona usa su nombre y modo; los registros guardan autor y hora. |
| Edicion clara | Video y Drone guardan numero de orden; todo queda en bitacora filtrable. |
| Prevencion de omisiones | Pendientes por servicio activo y vista de cierre antes de irse. |
| Flexibilidad | Servicios activos se prenden/apagan manualmente por sesion. |
| Estructura real | Espacios pueden tener subespacios, como bano o closet dentro de habitacion. |

---

## Servicios de captura

La app tendra cuatro servicios principales:

- Foto
- 360
- Video
- Drone

Todos estaran activos por defecto. El equipo podra desactivar manualmente cualquier servicio para una sesion especifica. Esto evita conectar esta version con los datos comerciales del contrato y resuelve casos donde no aplica foto, 360 o video.

Cuando un servicio esta desactivado:

- No aparece como modo seleccionable.
- No aparece como pendiente.
- No aparece como chip requerido en espacios.
- Los registros historicos de ese servicio se conservan en la bitacora si ya existian.

Drone queda siempre disponible por defecto porque se realiza en la mayoria de las sesiones, aunque lo haga el videografo.

---

## Pantallas principales

La experiencia se organizara en tres vistas:

1. Captura
2. Bitacora
3. Cierre

Estas vistas deben sentirse como modos de trabajo, no como secciones pesadas.

---

## 1. Vista Captura

Es la pantalla inicial y la mas importante.

### Header

Debe mostrar:

- Folio y cliente.
- Estado de sincronizacion.
- Nombre de la persona usando la app.
- Acceso compacto a servicios activos.

El nombre se mantiene en `localStorage`, como en la version actual.

### Selector de modo

Controles principales:

- Foto
- 360
- Video
- Drone

Solo aparecen los servicios activos. El modo seleccionado define que ocurre al tocar un espacio.

### Lista de espacios

Los espacios se muestran como una lista compacta y mobile-first. Cada espacio tiene:

- Nombre.
- Indicador de nivel si es subespacio.
- Chips de estado por servicio activo.
- Accion secundaria para mas opciones.

Ejemplo conceptual:

```text
Recamara principal
  Foto listo · 360 falta · Video 06
  Bano principal
    Foto falta · 360 listo · Video 07
  Closet
    Foto listo · 360 no aplica · Video falta
```

Tocar el espacio registra una captura del modo actual.

### Comportamiento por modo

**Foto**

- Tocar un espacio marca Foto como hecho.
- Crea entrada cronologica con hora y autor.
- No necesita numero visible de orden.

**360**

- Tocar un espacio marca 360 como hecho.
- Crea entrada cronologica con hora y autor.
- Se muestra en historial porque ayuda a ubicar el recorrido.

**Video**

- Tocar un espacio registra una toma de video.
- Crea numero secuencial: Video 01, Video 02, etc.
- Si se registra de nuevo el mismo espacio, se crea una nueva toma y queda como repeticion posible.

**Drone**

- Usa una lista propia de tomas, no la lista de cuartos interiores.
- Crea numero secuencial: Drone 01, Drone 02, etc.
- Se guarda en la misma bitacora general.

### Lista base de Drone

Drone inicia con tomas sugeridas:

- Fachada aerea
- Vista general de propiedad
- Calle / acceso
- Entorno / ubicacion
- Amenidades
- Terreno completo
- Roof / terraza
- Toma de cierre

El equipo puede agregar, quitar o marcar no aplica en estas tomas.

---

## Agregar espacios

La app tendra un flujo central de **agregar espacios en lote**.

Un boton `+ Espacios` abre un editor simple donde el equipo puede pegar una lista:

```text
Sala
Comedor
Cocina
Recamara principal
  Bano principal
  Closet
Recamara 2
  Bano
Lavanderia
Terraza
Cochera
```

La sangria crea subespacios. Tambien se podra aceptar formato con `>`:

```text
Recamara principal > Bano principal
Recamara principal > Closet
```

La vista debe incluir plantillas rapidas:

- Casa base
- Departamento
- Amenidades
- Exterior
- Drone base

Las plantillas agregan espacios sin borrar lo existente, salvo que el usuario elija reemplazar.

---

## Acciones secundarias

Las acciones secundarias deben estar escondidas en un menu ligero por espacio o por entrada de bitacora. No deben competir con la accion principal.

Acciones por espacio/servicio:

- Marcar no aplica.
- Limpiar estado.
- Agregar subespacio.
- Editar nombre.
- Borrar espacio.

Acciones por toma:

- Repetir toma.
- Marcar como usar esta.
- Marcar como no usar.
- Agregar nota.
- Borrar registro.

Despues de registrar una captura, aparecera un toast con accion `Deshacer`.

---

## 2. Vista Bitacora

La bitacora muestra el historial cronologico de la sesion.

Filtros:

- Todo
- Video
- Drone
- 360
- Foto
- Notas

Cada registro debe mostrar:

- Hora.
- Servicio.
- Numero de orden si aplica.
- Espacio o toma.
- Autor.
- Nota o bandera si existe.

Ejemplo:

```text
11:08 · Video 01 · Fachada · Bruno
11:12 · Drone 01 · Fachada aerea · Bruno
11:18 · Foto · Cocina · Ana
11:19 · 360 · Cocina · Luis
11:22 · Video 02 · Sala · Bruno
```

Video y Drone deben ser visualmente mas faciles de escanear que Foto, porque son los mas relevantes para edicion.

---

## 3. Vista Cierre

La vista Cierre existe para revisar antes de irse de la propiedad.

Debe mostrar:

- Pendientes por servicio activo.
- Espacios clave incompletos.
- Tomas marcadas con problema.
- Tomas repetidas.
- Servicios desactivados.
- Resumen de Video en orden.
- Resumen de Drone en orden.

Esta vista debe responder rapido a la pregunta:

> Ya nos podemos ir, o falta algo importante?

---

## Datos a persistir

El endpoint actual `guardarChecklist` ya guarda JSON libre en `checklist.cuartos_json`. Para v1 se puede preservar ese modelo y guardar un nuevo formato dentro del JSON, con migracion desde el formato actual.

Formato conceptual:

```json
{
  "version": 2,
  "servicios": {
    "foto": true,
    "t360": true,
    "video": true,
    "drone": true
  },
  "modoActual": "video",
  "espacios": [
    {
      "id": "esp-1",
      "nombre": "Recamara principal",
      "parentId": null,
      "orden": 1,
      "clave": true,
      "estados": {
        "foto": { "estado": "hecho", "autor": "Ana", "hora": "11:18" },
        "t360": { "estado": "pendiente" },
        "video": { "estado": "hecho", "ultimoOrden": 6 }
      }
    }
  ],
  "droneItems": [
    {
      "id": "drone-1",
      "nombre": "Fachada aerea",
      "estado": "pendiente"
    }
  ],
  "bitacora": [
    {
      "id": "log-1",
      "tipo": "video",
      "orden": 1,
      "targetId": "esp-1",
      "nombre": "Recamara principal",
      "autor": "Bruno",
      "hora": "11:08",
      "nota": "",
      "bandera": ""
    }
  ]
}
```

Estados por servicio:

- `pendiente`
- `hecho`
- `no_aplica`

Banderas de bitacora:

- `usar`
- `no_usar`
- `repetida`
- `problema`

---

## Migracion desde checklist actual

Si el JSON existente tiene `cuartos` y `columnas`, se migrara a `version: 2`:

- Cada cuarto pasa a `espacios`.
- `foto`, `video` y `t360` marcados se convierten en estados `hecho`.
- Columnas activas pasan a `servicios`.
- Se crea `drone: true` por defecto.
- Si no hay bitacora previa, se inicia vacia.

Esto permite no romper checklists ya creados.

---

## Fuera de alcance para v1

No se implementara en esta ronda:

- Lectura automatica de servicios contratados desde propiedades/adicionales.
- Captura por voz.
- Export avanzado a CSV/PDF.
- Flujo guiado lineal por cuartos.
- Cambios al adapter de Apps Script.
- Cambios de base de datos fuera del JSON existente.

---

## Criterios de aceptacion

- Una persona puede seleccionar Foto, 360, Video o Drone y registrar capturas con un toque.
- Video y Drone generan numeros de orden separados.
- Foto, 360, Video y Drone aparecen en la bitacora cronologica.
- Los servicios pueden activarse/desactivarse manualmente y dejan de contar como pendientes.
- Se pueden agregar varios espacios de una vez desde una lista pegada.
- Se pueden crear subespacios.
- La vista Cierre muestra pendientes por servicio activo.
- El formato viejo de checklist se carga sin error y se migra al nuevo formato.
- La experiencia funciona bien en celular y no se siente saturada.

