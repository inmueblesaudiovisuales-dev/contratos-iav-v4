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

## 6. Sync de proyectos por git (en vez de iCloud) — workflow del equipo
Problema: hoy todo vive en una carpeta de iCloud y se sincroniza TODO (incluida la media pesada). Bruno quiere que
**solo se sincronicen los archivos chicos** (el `.aep` de After Effects, el `.prproj` de Premiere, el JSON de
metadatos, notas) **y la media NO** (subir media cuesta y es lento). iCloud no hace esa distinción (todo-o-nada).

**Solución: git con `.gitignore`** (ya usan GitHub).
- Repo privado (uno "proyectos" o uno por proyecto). Cada proyecto = carpeta con `.aep`, `.prproj`, JSON de
  metadatos, notas.
- `.gitignore` excluye la media (`*.mp4 *.mov *.mxf *.wav *.cr3 *.dng *.braw`, cachés de AE/Premiere, proxies,
  renders). La media nunca sube.
- Cada quien hace `pull` → baja todo el contexto de todos los proyectos en segundos (KB), sin transferir GB.
- Bonus: versionado de los `.aep`/`.prproj` (puedes regresar a una versión anterior); iCloud no lo da.
- Caveats: al abrir un proyecto sin la media, AE/Premiere muestra "media offline" (relinkeas al editar; para
  contexto no importa). `.aep`/`.prproj` son binarios: git los versiona pero no hace merge — ok para equipo de 3
  donde un proyecto lo lleva una persona.
- Para Fer/Danna sin terminal: **GitHub Desktop** (botón Pull/Push) o un script de sync de un clic.
- Alternativa (cero git): Dropbox "Online-only"/Smart Sync — media como placeholder en la nube, archivos chicos
  locales; pero la media SÍ ocupa almacenamiento en la nube y se sube una vez. Menos limpio que git.
- **Pendiente cuando se retome:** armar la estructura del repo + el `.gitignore` con extensiones de media y cachés
  de AE/Premiere como referencia.

## Orden sugerido (para la sesión futura)
1. Manifiesto de sesión en el export (lado checklist — barato).
2. Columnas XMP (lado metadatos).
3. Generar secuencias de Premiere (lado metadatos — el grande, con su propio brainstorm).
4. (Aparte) Migrar el sync de proyectos de iCloud a git (workflow del equipo, no toca código de las apps).
