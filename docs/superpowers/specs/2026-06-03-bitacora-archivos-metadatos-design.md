# IAV Checklist — Registro de Archivos y Metadatos

**Fecha:** 2026-06-03  
**Ronda propuesta:** R55  
**Estado:** Spec aprobada conceptualmente, pendiente de revision final  
**Alcance:** `frontend/checklist.html` y `frontend/checklist-logic.js`  

---

## Objetivo

Convertir la captura de Video y Drone en un registro confiable archivo-por-archivo.

Cada archivo creado por una camara debe corresponder a un registro de checklist, incluso cuando:

- La toma no sirve.
- Se encendio y apago la camara sin grabar contenido util.
- El contenido no pertenece a la propiedad.
- Se olvido registrar el archivo inicialmente.

El resultado debe permitir que un programa futuro relacione los registros con archivos reales y escriba metadatos compatibles con Adobe Premiere.

R55 no construye el programa de metadatos ni modifica archivos multimedia.

---

## Alcance

### Incluido

- Registro archivo-por-archivo para Video y Drone.
- Secuencias independientes por camara.
- Sony principal, Osmo Pocket 3 y Drone DJI.
- Marcado manual de tomas buenas.
- Descartes con motivo.
- Insercion de archivos olvidados.
- Reinicio o correccion de secuencia.
- Cierre orientado a reconciliar checklist contra la camara.
- Vista Edicion preparada para el futuro emparejamiento de archivos.
- Datos neutrales que despues puedan mapearse a metadatos de Premiere.

### No incluido

- Cambios al flujo de Foto normal.
- Cambios al flujo de Recorrido 360.
- Lectura directa de tarjetas o camaras.
- Carga de archivos de video.
- Escritura de metadatos.
- Exportador para Premiere.
- Label Color.
- Soporte para dos videografos registrando Video simultaneamente.

---

## Principio Central

> Cada toque de registro representa exactamente un archivo creado por la camara activa.

Registrar ocurre despues de detener la grabacion, porque en ese momento el operador sabe si el archivo contiene una toma normal o un descarte.

Si la camara no creo un archivo, no se registra nada y no se consume consecutivo.

---

## Modelo de Camaras y Secuencias

Las secuencias son independientes:

| Modo | Camara predeterminada | Uso |
|------|------------------------|-----|
| Video | Sony principal | Interiores y video normal |
| Video | Osmo Pocket 3 | Bloques consecutivos ocasionales |
| Drone | Drone DJI | Tomas aereas |

Reglas:

- Video inicia con `Sony principal`.
- Drone inicia con `Drone DJI`.
- Osmo Pocket 3 se activa manualmente desde Video.
- Cambiar de camara cambia el siguiente archivo esperado, pero no cambia la escena activa.
- Cada camara recuerda su propia secuencia durante toda la propiedad.
- Normalmente solo una persona registra Video/Drone; R55 no resuelve concurrencia entre operadores.

### Inicio de secuencia

Al utilizar una camara por primera vez, checklist solicita el ultimo archivo existente antes de comenzar:

```text
Sony principal
Ultimo archivo existente: 20260520_PIB2818

Siguiente esperado: PIB2819
```

Checklist debe detectar y almacenar:

- Nombre de ejemplo completo.
- Segmento consecutivo.
- Anchura del consecutivo.
- Prefijo y sufijo alrededor del consecutivo cuando sean estables.

Para archivos DJI:

```text
DJI_20260517111742_0245_D
```

Solo se considera predecible el consecutivo `0245`. El timestamp puede cambiar en cada archivo y no debe generarse artificialmente.

La interfaz mostrara:

```text
Drone DJI · Siguiente identificador: 0246
```

El programa futuro relacionara el identificador con el nombre completo real.

---

## Flujo Principal de Campo

La captura de Video y Drone debe mostrar siempre:

- Escena activa.
- Camara activa.
- Siguiente archivo o identificador esperado.
- Cantidad de archivos registrados.
- Cantidad de tomas marcadas como buenas.

Ejemplo:

```text
SALA
Sony principal · Siguiente PIB2819

[ Registrar toma ]
[ Registrar descarte ]

3 archivos · 1 buena
```

### Registrar toma

- Consume el siguiente consecutivo de la camara activa.
- Usa el espacio seleccionado como escena.
- Se registra inicialmente con `good = false`.
- La primera toma normal de una escena es `Toma 1`; las siguientes incrementan su numero.
- No pregunta por intencion antes de registrar.

### Registrar descarte

Consume el siguiente consecutivo y solicita un motivo breve:

- `Vacio / accidental`
- `Toma fallida`
- `No relacionado`

Reglas:

- Todos los descartes tienen `good = false`.
- `Vacio / accidental` y `Toma fallida` conservan la escena activa.
- `No relacionado` usa `scene = Sin escena`.
- Los descartes cuentan para reconciliar la secuencia, pero no cubren una escena.

### Marcar buenas

- Ninguna toma empieza como buena.
- Cada toma normal puede marcarse o desmarcarse como buena.
- El flujo recomienda una o dos buenas por escena.
- No existe limite obligatorio.
- Tres o mas buenas muestran una advertencia discreta.
- Una escena sin buenas muestra una advertencia en Cierre, pero no bloquea continuar.

No se mostraran botones temporales despues de registrar.

---

## Presentacion Dentro de Cada Escena

Video y Drone dejan de mostrar solamente `hecho/pendiente`.

Ejemplo:

```text
Sala
3 archivos · 1 buena

[ Registrar toma ]

PIB2821  Toma 3                 [ Marcar buena ]
PIB2820  Toma fallida
PIB2819  Toma 1      BUENA      [ Quitar buena ]
```

Reglas:

- Mostrar primero los archivos mas recientes.
- Mantener el boton de registro como accion principal.
- Las acciones de correccion viven en las filas o en un menu secundario.
- Foto y 360 conservan el comportamiento actual.

---

## Archivos Olvidados

El operador puede insertar un archivo olvidado antes de un registro existente.

Ejemplo inicial:

```text
PIB2818  Sala
PIB2819  Cocina
PIB2820  Comedor
```

Al insertar un archivo antes de Cocina:

```text
PIB2818  Sala
PIB2819  Sin identificar
PIB2820  Cocina
PIB2821  Comedor
```

Reglas:

- La insercion consume el consecutivo faltante.
- Los registros posteriores dentro del mismo tramo de secuencia incrementan su consecutivo.
- No modifica otras camaras.
- El archivo insertado comienza con:
  - `kind = omitted`
  - `scene = Sin identificar`
  - `good = false`
- Despues puede asignarse a una escena, convertirse en toma o descarte y recibir una nota.
- La interfaz debe pedir confirmacion antes de reajustar registros posteriores.

---

## Saltos Reales y Nuevos Tramos

Un cambio raro de tarjeta, reinicio de contador o salto real no debe reajustar registros anteriores.

La accion `Iniciar nuevo tramo` solicita un nuevo ultimo archivo existente o siguiente identificador.

Cada tramo conserva:

- Camara.
- Ejemplo de nombre.
- Consecutivo inicial.
- Consecutivo siguiente.
- Fecha/hora de inicio.

Los archivos olvidados solo reajustan registros dentro de su tramo.

---

## Correcciones Permitidas

Cada registro puede corregirse posteriormente:

- Cambiar escena.
- Marcar o quitar `Good`.
- Cambiar entre toma y descarte.
- Cambiar motivo de descarte.
- Agregar o editar nota.
- Corregir identificador.

Cambiar un registro de camara debe tratarse como una operacion avanzada:

- Se elimina del tramo original.
- Se inserta en el tramo destino.
- Requiere confirmacion por el posible reajuste de consecutivos.

Eliminar un registro no debe ocurrir silenciosamente. La opcion predeterminada sera convertirlo en descarte para conservar la reconciliacion.

---

## Datos Guardados

R55 debe guardar datos neutrales y no depender directamente de nombres internos de Premiere.

### Camara

```text
id
label
mode
kind: sony | dji
activeSegmentId
```

### Tramo de secuencia

```text
id
cameraId
exampleFilename
counterStart
counterNext
counterWidth
prefixHint
suffixHint
createdAt
```

### Registro de archivo

```text
id
cameraId
segmentId
fileCounter
fileToken
sceneId
scene
scenePath
shotNumber
kind: take | discard | omitted
discardReason: empty | failed | unrelated | null
good: true | false
note
author
createdAt
```

Reglas:

- `fileToken` es la referencia legible mostrada en checklist, por ejemplo `PIB2819` o `0246`.
- `scenePath` conserva jerarquia: `Recamara principal > Bano`.
- Los registros son la fuente de verdad para Video y Drone.
- Los estados resumidos por espacio se derivan de los registros y no deben competir con ellos.
- La estructura debe seguir guardandose dentro del JSON existente de checklist; R55 no requiere cambios de D1 ni adapter.

---

## Mapeo Futuro a Premiere

R55 solo prepara estos datos:

| Campo Premiere | Fuente R55 |
|----------------|------------|
| `Camera Roll` | Label de camara |
| `Client` | Cliente o propiedad |
| `Scene` | `scenePath` |
| `Shot` | Toma N o motivo de descarte |
| `Good` | `good` |
| `Log Note` | `note` |
| `Description` | Resumen generado de escena, toma y estado |
| `Tape Name` | Folio |
| `File Name` | Archivo real emparejado por el programa futuro |

No se utilizara `Label Color`.

R55 no debe cambiar automaticamente el nombre real del archivo.

---

## Cierre

Cierre debe permitir reconciliar el final de cada camara:

```text
SONY PRINCIPAL
Checklist termina en PIB2847
Confirma que la camara termina en PIB2847
```

Tambien debe mostrar:

- Camaras sin secuencia iniciada.
- Escenas clave sin archivos.
- Escenas con archivos pero ninguna toma buena.
- Escenas con tres o mas buenas.
- Archivos omitidos sin identificar.
- Cantidad de descartes por motivo.
- Tramos nuevos o saltos de secuencia.

La comparacion contra el ultimo archivo real se confirma manualmente; R55 no lee la camara.

---

## Edicion

Edicion debe priorizar las tomas buenas por escena:

```text
SALA
Buenas: PIB2819
Otras: PIB2818, PIB2820
Descartes: PIB2821
```

Debe permitir revisar por:

- Escena.
- Camera Roll.
- Buenas.
- Otras tomas.
- Descartes.
- Archivos omitidos o sin identificar.
- Notas.

Esta vista es una referencia humana y una preparacion de datos; no exporta metadatos en R55.

---

## Compatibilidad y Migracion

- Los checklist existentes deben continuar abriendo.
- Los registros Video/Drone anteriores permanecen visibles en historial como registros legacy.
- R55 no intentara inventar nombres de archivo para capturas anteriores.
- Al iniciar por primera vez una secuencia R55, solo los nuevos archivos participan en reconciliacion.
- Foto y 360 conservan su logica y estados actuales.
- Desactivar Video o Drone conserva sus secuencias e historial.

---

## Manejo de Errores

- No permitir registrar Video/Drone sin camara activa y secuencia iniciada.
- Confirmar antes de insertar un archivo olvidado o moverlo entre camaras.
- Mostrar claramente cuando el siguiente consecutivo fue corregido manualmente.
- Nunca renumerar otra camara ni otro tramo.
- Nunca borrar historial por cambiar servicios activos.
- Si guardar falla, conservar la interfaz actual de reintento y sincronizacion.

---

## Criterios de Aceptacion

1. Foto y 360 funcionan exactamente como antes.
2. Video y Drone registran un archivo por toque despues de detener la grabacion.
3. Sony, Osmo y Drone mantienen secuencias independientes.
4. DJI muestra y relaciona el consecutivo sin intentar predecir timestamps.
5. Toma y descarte consumen exactamente un consecutivo.
6. Un evento donde no se creo archivo no requiere registro.
7. Ninguna toma comienza como buena.
8. Se pueden marcar y desmarcar buenas manualmente.
9. Los descartes distinguen vacio, fallida y no relacionada.
10. Un archivo olvidado puede insertarse reajustando solo su tramo.
11. Un salto real puede iniciar un nuevo tramo sin modificar registros anteriores.
12. Cierre ayuda a reconciliar el ultimo consecutivo y detectar escenas sin buenas.
13. Edicion agrupa buenas, otras y descartes por escena.
14. Los datos guardados contienen lo necesario para un futuro programa de metadatos.
15. No se cambia D1, adapter ni archivos multimedia.

