# Diseño — Meta B: tomas sugeridas por IA con fotos (PAR)

> Spec de diseño al 2026-06-09. Cierra el PAR (prompt generado en vivo + formato de import) de la Meta B
> del checklist, sobre la base de `buildPropuestaPrompt`/`parsePropuesta` ya existentes. Es la entrada para
> el plan por fases (build-from-plan). Complementa el handoff
> `docs/superpowers/PROMPT-CONTINUIDAD-2026-06-09-dictado-sugerencias.md` (sección 4, Meta B).

## Objetivo

Que la app genere un prompt que (a) le diga a Bruno qué espacios fotografiar y (b) instruya a Gemini, viendo
las fotos reales de la casa, a proponer tomas concretas y específicas por espacio (por ejemplo "push in en la
cocina", "detalle del candelabro en la sala"). Gemini regresa un JSON de sugerencias por cuarto que la app
valida y, tras un paso de revisar, deja en `state.guide.proposal`, que la captura ya consume como sugerencias
por cuarto.

## Decisiones tomadas con Bruno (cerradas)

1. Sin descripción de texto. Bruno no quiere escribir una descripción. La entrada de Gemini son las fotos; el
   prompt ya no usa ni pide `guide.descripcion`.
2. Mapeo foto-cuarto: libre, Gemini reconoce. Bruno sube las fotos en orden libre; el prompt lleva el árbol de
   pisos y cuartos con ids; Gemini identifica cada espacio y asigna cada sugerencia al id correcto. Se acepta
   que puede equivocarse y por eso hay un paso de revisar.
3. Espacios en el prompt: solo los espacios reales del checklist, agrupados por piso y zona (interior,
   exterior, amenidades). Gemini solo recibe ids reales, así que toda sugerencia mapea a algo que existe; los
   exteriores entran si ya están como espacios.
4. Sugerencias accionables: cada sugerencia es una toma concreta ligada a un espacio (acción + sujeto), no una
   guía mental. El formato actual ya lo expresa: `nombre` = la acción concreta, `shotType`/`movement` = el
   vocabulario cerrado, `enfoque` = el sujeto o encuadre.
5. Formato de regreso: el mismo de hoy. Se reutiliza `parsePropuesta` sin cambios.
6. El prompt con fotos REEMPLAZA al de texto (mismo punto de entrada; se retira el campo de descripción de ese
   flujo).

## Flujo

1. La app genera el prompt en vivo desde el estado (`buildPropuestaPrompt`, ahora con fotos).
2. Bruno fotografía todos los espacios listados (orden libre) y pega el prompt + las fotos en Gemini.
3. Gemini regresa el JSON de sugerencias por cuarto.
4. Bruno lo pega en la app. La app parsea y valida (`parsePropuesta`) y muestra un paso de REVISAR: la
   propuesta agrupada por cuarto, con el reporte de lo ignorado.
5. Bruno confirma (o quita). La propuesta queda en `state.guide.proposal`.
6. Durante la captura, `proposalShotsFor`/`suggestionsForTarget` muestran las sugerencias por cuarto (sin
   cambios respecto a hoy).

El import de la Meta B SOLO toca `state.guide.proposal`; jamás mediaFiles ni cobertura. Confirmar antes de
reemplazar (como ya hace el flujo actual).

## El prompt (generado en vivo)

`buildPropuestaPrompt(state)` se reescribe para fotos. Conserva el estilo de concatenación de string del
actual (`checklist-logic.js:1130`). Inyecta:

- La lista de espacios reales agrupados por piso y zona, cada uno con `id` y `nombre`. Esta lista cumple doble
  función: guía de qué fotografiar y tabla de ids para que Gemini mapee. Se arma desde `state.espacios`
  (usando `piso` y `zona`).
- Instrucción para Bruno (arriba): toma fotos de todos estos espacios, en el orden que quieras, y súbelas junto
  con este prompt.
- Instrucción para Gemini: recibirás fotos de la propiedad; identifica cada espacio y asígnalo al `id` correcto
  de la lista; propón tomas concretas y específicas de ESTA casa por espacio (ejemplos: "push in en la cocina",
  "detalle del candelabro en la sala"); `shotType` y `movement` SOLO del vocabulario cerrado; `nombre` = la
  acción concreta; `enfoque` = el sujeto o encuadre (nada de hora del día, clima ni logística); `priority`
  must o nice.
- Vocabulario cerrado de `shotType` (de `getShotTypes()`) y `movement` (de `getMovements()`), con sus ids y
  etiquetas, generado en vivo.
- Reglas duras (heredadas del prompt actual, adaptadas): básate en lo que VES en las fotos (reemplaza "básate
  en la descripción"); propón tomas solo para espacios de la lista; PROHIBIDO inventar espacios; usa solo ids
  exactos del vocabulario; si un espacio no tiene nada destacable, omítelo; responde ÚNICAMENTE el JSON, sin
  markdown ni texto adicional; máximo 6 tomas por espacio.

Se elimina del prompt la dependencia y las menciones a la descripción de texto.

## El formato de import (sin cambios)

```jsonc
{
  "porCuarto": {
    "<id de espacio>": [
      { "nombre": "Detalle del candelabro", "shotType": "detalle", "movement": "push_in",
        "enfoque": "Encuadra el candelabro de la sala en primer plano", "priority": "must" }
    ]
  }
}
```

`parsePropuesta(texto, state)` se reutiliza tal cual (`checklist-logic.js:1173`): limpieza tolerante de fences,
mapeo por id de espacio (respaldo por nombre normalizado), validación de `shotType`/`movement`, reporte de lo
ignorado, y límites `MAX_PER_ROOM=6` / `MAX_TOTAL=40`. Se aplica a `state.guide.proposal` y se consume con
`proposalShotsFor`/`suggestionsForTarget`. No hay cambios de esquema ni de consumo.

## Revisar y consumo

Se reutiliza el flujo existente de la propuesta IA en `checklist.html` (pegar el JSON, parsear, confirmar o
quitar, con el reporte de lo ignorado). Mejora mínima del MVP: al revisar, mostrar la propuesta agrupada por
cuarto para que Bruno detecte una asignación rara (dado que Gemini reconoce los cuartos y puede equivocarse).
Reasignar una sugerencia a otro cuarto en el momento de revisar queda como posible mejora futura, no en el MVP.

## Cambios de código (mínimos)

- Motor (`frontend/checklist-logic.js`): reescribir `buildPropuestaPrompt(state)` a la versión con fotos
  (espacios por piso y zona con ids; instrucciones de fotos; sin descripción). `parsePropuesta` sin cambios.
- Interfaz (`frontend/checklist.html`): el área de propuesta IA que ya existe; ajustar el texto del prompt y de
  la ayuda; quitar el campo de descripción de ese flujo; al revisar, agrupar la propuesta por cuarto.
- Pruebas: actualizar/añadir pruebas de `buildPropuestaPrompt` (lista por piso y zona con ids reales; vocabulario
  cerrado; sin descripción; instrucciones de fotos). Las pruebas de `parsePropuesta` siguen válidas.

Invariantes: sin emojis; acentos en texto visible, ids/clases sin acentos; `buildExport` y el esquema de export
no cambian; `node --test` queda verde por arriba del baseline.

## Fuera de alcance (decidir después de ver el resultado real)

- Si la propuesta con fotos vuelve obsoleta la librería fija de sugerencias. Se decide al ver el resultado, no
  ahora.
- Reasignación de sugerencias por cuarto en el paso de revisar.
