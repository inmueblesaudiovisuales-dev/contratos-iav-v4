# Spec — Rediseño de drone: escalas en vez de pseudo-cuartos

**Fecha:** 2026-06-08. **Repo:** `contratos-iav-v4` (`frontend/checklist-logic.js` + `frontend/checklist.html`).
Revisa/revierte parte de F17/F18 (drone-como-piso). No toca `iav-metadata-app`.

## Problema
El modelo actual hace del **drone un piso** cuyos "cuartos" son sujetos aéreos (Fachada aérea, Roof/terraza,
Golden hour…). Eso mezcla **lugares, escalas de contexto y condiciones** como si fueran cuartos, cuando son
**tomas**. En "Armar cuartos" te obliga a curar pseudo-cuartos irrelevantes.

## Principio (mismo patrón que Terreno)
El drone **no es una lista de cuartos que curas**; es una **lane que vuelas**, y sus sujetos aéreos son **tomas
sugeridas** — igual que Terreno (un solo sujeto, sus puntos son tomas sugeridas).

## Estructura

### Drone fuera de "Armar cuartos" → interruptor
- En "Armar cuartos" el drone deja de ser un piso con chips. Pasa a un **interruptor "incluir tomas de drone"**
  (`state.guide.incluirDrone`, boolean). Sin curar pseudo-cuartos.

### Drone en Captura → objetivos por escala
Con el drone incluido, la lane de drone presenta **objetivos fijos por escala** (no se curan), materializados como
targets especiales (`kind:'drone'`, con `scale`), análogo a cómo Terreno materializa su sujeto único:
- **Propiedad** — la casa/lote/edificio en sí, pegado.
- **Amenidades** — del coto/fraccionamiento o del edificio (solo si aplica: privada/coto/depto).
- **Inmediato / colonia** — la calle y lo de junto.
- **Ubicación / contexto** — lejos, contexto espacial.

Dentro de cada escala, las **tomas sugeridas** salen del pool aéreo filtrado por escala + tipo de propiedad
(`suggestionsForTarget` para un target de drone devuelve las tomas de su escala).

### Sin golden hour
Se elimina "Golden hour" del vocabulario (no lo usan; graban cuando pueden).

### Cámara
`camerasForEspacio` sigue dando cámaras drone (Air 3 + Mini 4 Pro) a los targets de escala. **Decisión a confirmar
en revisión:** simplificar a que el drone viva SOLO en su lane (quitar el híbrido "cámara drone en espacios
exteriores" de F18), porque la escala "Propiedad" ya cubre eso. Alternativa conservadora: mantener el híbrido.
*Recomendación: simplificar (un solo lugar para el drone).*

## Contenido — tomas sugeridas (curado con Bruno)

### Toma canónica (must en TODOS los tipos)
- **Salida a contexto** — reveal en reversa: cerrado en la propiedad, sales muy alto y lejos para ubicarla en la
  zona. La toma de cierre. (Absorbe los "Reveal de la casa/lote/quinta" sueltos.) Movimiento: pull-out + ascenso.

### Terreno — lista única (14; sin sesgo por subtipo)
Must: Cenital de límites · Establecimiento desde altura · Referencia de escala (coche/persona para dimensión) ·
Acceso/frente a calle · Vista que vende · Dónde iría la casa · Salida a contexto.
Opcionales: Órbita del terreno · Topografía/barrido lateral · Fly-through del lote · Cercanía a vialidades ·
Referencia a un hito · Entorno/desarrollo vecino · Perímetro/colindancias.

### Casa — *vende fachada, volumen y entorno*
- Propiedad: Fachada aérea [must] · Órbita de la casa [must] · Salida a contexto [must] · Patio/jardín/alberca
  aéreo · Roof/azotea · Vista que vende · Cenital giratorio [must] · Contrapicado de fachada · Órbita ascendente ·
  Fly-through · Reveal con primer plano · Reveal sobre barda [situacional, solo si hay muro/portón].
- Amenidades (si privada/coto): casa club · alberca común · áreas verdes.
- Inmediato/colonia: calle y acceso · la cuadra/vecindario.
- Ubicación: ubicación en la ciudad · cercanía a vialidades · hito.

### Quinta — *vende extensión, terrenos y amenidades (el "wow" de escala)*
- Propiedad: Salida a contexto [must] · Órbita de la propiedad [must] · Alberca/palapa aérea [must] · Cenital
  giratorio [must] · casa principal/fachada aérea · jardines/áreas verdes · cancha/cabañas/área de evento · Vista
  desde terraza · Reveal de la vista.
- Inmediato: acceso/caseta/entrada · entorno natural (bosque, lago, montaña).
- Ubicación: cómo se llega · ubicación regional.

### Departamento — *vende el edificio, LA VISTA y la UBICACIÓN*
- Edificio (Propiedad): Exterior del edificio [must] · La vista desde esa altura [must] · Salida a contexto
  [must] · el balcón/terraza del depto desde fuera · Reveal de la vista.
- Amenidades del edificio: Roof garden/terraza común [must] · alberca/áreas comunes · lobby/acceso.
- Inmediato/colonia: La zona/colonia [must] · la calle.
- Ubicación: ubicación en la ciudad · vialidades · hito.

### Catálogo de movimientos "standout" (se reusan donde aplican)
Cenital giratorio · Órbita ascendente · Fly-through/pasada · Contrapicado de fachada · Reveal con primer plano
(parallax) · Vista desde terraza/alberca · Reveal de la vista · Reveal sobre barda [situacional].

## Datos / modelo (motor)
- `DRONE_SCALES`: constante `[{id:'propiedad',...},{id:'amenidades', appliesWhen},{id:'inmediato',...},{id:'ubicacion',...}]`.
- Pool aéreo (reemplaza/extiende `AERIAL_SUBJECTS`): cada toma `{ id, label, shotType, movement, scale, must,
  tipos:['casa'|'quinta'|'departamento'|'terreno'|'all'], situacional? }`. Sin golden hour.
- `droneScaleTargets(state)`: devuelve los targets de escala que aplican (amenidades solo si privada/coto/depto).
- `suggestionsForTarget(state,'drone', target)`: para un target de escala, devuelve el pool filtrado por
  `scale` + tipo de propiedad, must primero.
- `suggestedAerialSubjects`/lo que hoy sesga por tipo se reorganiza alrededor de escalas (aditivo donde se pueda).

## UI (checklist.html)
- "Armar cuartos": quitar el piso Drone con chips; agregar el interruptor "incluir tomas de drone".
- Captura: la lane de drone materializa los targets de escala (al incluir drone), navegables como cuartos; cada
  uno con sus tomas sugeridas aéreas. Reusa el loop R1 y la barra de navegación de cuarto.

## Migración / compatibilidad (gate)
- `version:1` intacto. `normalizeChecklistData` debe **seguir cargando estado viejo**: las tomas de drone ya
  pegadas a espacios (pseudo-cuartos del modelo F17/F18) **no se pierden** — esos espacios siguen siendo targets
  válidos aunque el modelo nuevo no los cree. El piso "Drone" viejo simplemente ya no se ofrece en Armar cuartos.
- Backend (`worker/`) intocable. Aditivo donde se pueda; sin emojis; español formal con acentos; áreas ≥44px.

## No-objetivos (YAGNI)
- Sin sesgo por subtipo de terreno (lista única).
- Sin golden hour ni condiciones de hora.
- Sin manifiesto de sesión / orientación / secuencias Premiere (eso es backlog de metadatos, otra sesión).

## Verificación
- Unit tests: `droneScaleTargets` por tipo (amenidades solo donde aplica); `suggestionsForTarget` de cada escala
  devuelve las tomas correctas y "Salida a contexto" como must en todos los tipos; sin golden hour en el pool;
  migración de estado viejo con drone-piso no pierde tomas; `version:1` intacto.
- Playwright: "incluir drone" en Armar cuartos (sin pseudo-cuartos); en Captura la lane de drone muestra las 4
  escalas con sus tomas sugeridas; drone alcanzable donde toca; estado viejo carga.
