# Backlog — App de metadatos (iav-metadata-app) y export

> **NO tocar `iav-metadata-app` hasta terminar el trabajo actual del checklist.** Esto son ideas capturadas
> (sesión 2026-06-08) para retomar en otra sesión. Orden y alcance se deciden después.

## 1. Manifiesto de sesión en el export JSON (lado checklist — el habilitador barato)
Hoy el export es por archivo. Agregar un **encabezado de sesión** (aditivo, `version:1` intacto) que "le hable"
a la app de metadatos con el contexto, además de los datos por archivo:
- **Equipo usado** en la sesión (Sony FX30, DJI Mini 4 Pro, DJI Air 3).
- **Resolución por cámara — y por orientación** (depende de la orientación, ver punto 4): no es un solo número.
- **Tipo de propiedad**.
- **Orientación de la sesión**: horizontal / vertical / ambas.
Self-documenting; es la base de todo lo de abajo.

## 2. Columnas XMP dedicadas (Premiere) — `xmpFields.ts`
Mapear a campos XMP-dm que Premiere muestra como columnas ordenables/filtrables:
- movimiento → `XMP-xmpDM:CameraMove` (con el token de pared/sentido anexado: `Reveal · pared izq`, `Push/Pull (in)`).
- plano → `XMP-xmpDM:ShotSize` (Abierto/Detalle).
Requiere extender `types.ts` + tests `xmpFields.test.ts` / `xmpWriter.int.test.ts`. (Ya estaba como fase diferida.)

## 3. Generar secuencias de Premiere (capacidad nueva, la pieza grande)
La app hoy solo escribe XMP a los archivos. Esto es otra cosa: que **arme secuencias de Premiere**.
- **Resolución de la secuencia = la real más PEQUEÑA** entre los clips usados. Razón: nunca escalar hacia arriba
  el material de 2.7K del Air 3 (upscalear se ve falso); todo queda nativo o reducido, nunca inventado.
- La app debe leer la **resolución real de los archivos** (la verdad está en el archivo); el manifiesto (punto 1)
  da el contexto/esperado.
- Salida posible: `.prproj` o un XML/FCPXML importable + bins organizados (por cámara / cuarto / tipo).
- Es un feature por sí solo; merece su propio brainstorm + spec cuando se retome.

## 4. Datos de cámara (resolución por orientación) — confirmados por Bruno
- **Sony FX30:** UHD (4K), horizontal o vertical.
- **DJI Mini 4 Pro:** UHD (4K).
- **DJI Air 3:** **2.7K en vertical** (en horizontal puede 4K, pero el flujo de Bruno es 2.7K vertical).
La resolución depende de cámara **y** orientación — por eso el manifiesto la declara así, y la app valida contra el archivo real.

## 5. Orientación (vertical/horizontal/ambas) — decisiones tomadas
- Se declara **por sesión** (no por toma): un recordatorio persistente en el loop ("Esta sesión: ambas").
- **Sin** aviso de restricción en campo (Bruno lo descartó), pero la resolución sí se considera como dato (alimenta el manifiesto y, a futuro, el armado de secuencias).
- Si algún día se quiere rastrear cobertura de verticales, ahí sí se etiquetaría por toma (no ahora).

## Orden sugerido (para la sesión futura)
1. Manifiesto de sesión en el export (lado checklist — barato).
2. Columnas XMP (lado metadatos).
3. Generar secuencias de Premiere (lado metadatos — el grande, con su propio brainstorm).
