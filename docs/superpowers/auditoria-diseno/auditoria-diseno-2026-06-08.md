# Auditoría de diseño — checklist.html (2026-06-08)

**Qué es:** bitácora de producción usada en campo desde el celular por un equipo de 3 (Fer/foto, Danna/360,
Bruno/video+drone). North star: *casi invisible en campo, indispensable en edición*; cada acción frecuente = 1 toque.
**Contexto de uso:** móvil, a una mano, con sol/reflejos, a veces sin señal. **Etapa:** producto funcional; este pase
es **pulido visual de toda la app** (Track 2). Identidad actual: papel cálido (#FFFDF8) + canto dorado + display serif
para nombres de cuarto.

**Evidencia:** capturas en `docs/superpowers/auditoria-diseno/` (A setup, B lista de cuartos, C loop vacío,
D loop con toma, E cierre, F edición) a 390×844.

---

## Impresión general
La información y los flujos están bien pensados; el problema es **ejecución visual despareja**: casi todo se resuelve
con la misma tarjeta blanca con borde de 1px, así que las pantallas se ven como una pila de cajas de igual peso —
funcional pero plano ("utilitario"). La mejor pantalla (B, lista de cuartos) demuestra que el lenguaje correcto ya
existe; hay que llevarlo al resto. La mayor oportunidad: **jerarquía y respiración**, y **disciplinar el dorado**.

## Usabilidad
| Hallazgo | Severidad | Recomendación |
|---|---|---|
| En **Cierre (E)** el botón primario dorado queda **tapado por la barra de pestañas** fija | Crítico | Padding inferior en el scroll (≥ alto de la tab bar + safe-area) para que ningún CTA quede oculto |
| **Edición (F)**: la tarjeta "Exportar para edición" parte el texto en una columna angostísima ("para/edición/1 archivo/JSON…") | Alto | Reflujo: título en una línea, descripción a ancho completo, botones debajo o en fila propia |
| El **loop (D)** apila 7–8 bandas de igual peso (header, nav, cámara, sugeridas, lista, recién grabada, Toma, tabbar); el ojo no encuentra foco hasta el botón Toma | Alto | Reducir cajas: fundir "recién grabada" con la lista; jerarquizar Toma como única acción dominante |
| Navegación de cuarto repartida en **dos filas** (header "Propiedad/opciones" + barra ‹·Cambiar·Siguiente›) | Moderado | Unificar en una sola zona de navegación; el header solo nombre+piso |
| Iniciar tramo de cámara interrumpe el primer "Toma" con un diálogo | Moderado | Aceptable, pero el diálogo puede sentirse más guiado (placeholder de ejemplo más claro) |

## Jerarquía visual
- **Qué atrae primero:** en el loop compiten dos focos del mismo tamaño — el serif "Sala" y el mono gigante del
  consecutivo ("PIB2820"). Deberían tener pesos distintos: el cuarto manda; el consecutivo es dato de apoyo.
- **Flujo de lectura:** vertical monótono; sin agrupación visual, todo pide la misma atención.
- **Énfasis:** el botón **Toma** sí domina (bien). Pero "Siguiente", la cámara activa y el folio también usan dorado,
  diluyendo qué es realmente la acción principal.

## Consistencia
| Elemento | Inconsistencia | Recomendación |
|---|---|---|
| Tarjetas | Casi todo es la misma caja blanca borde 1px; sin hablar peso/importancia | Escala de elevación: superficie base, tarjeta sutil, tarjeta destacada |
| Dorado (`--gold`) | Hace de marca, estado activo, acción primaria y acento a la vez | Reservarlo para **la acción primaria**; estados activos con tinte neutro/tinta |
| Tipografía | Muchos tamaños 9–11px mezclados; saltos sin escala clara | Escala tipográfica definida (p. ej. 12/14/16/20/28) y úsala consistente |
| Espaciado | Gaps parejos y apretados (3–6px) en todos lados | Escala de espaciado (4/8/12/16/24) con ritmo entre secciones |

## Accesibilidad (medido sobre los tokens reales)
- **Contraste de texto:** `--ink-3 #948D80` sobre papel ≈ **3.0–3.3:1** → **falla AA** para texto normal (exige 4.5:1),
  y se usa en micro-texto (folio, "sin tomas", "siguiente archivo", caption de cámara a **9–11px**). Subir a un gris
  más oscuro (≈ `#6E6658` o `--ink-2`) para esos textos.
- **Texto blanco sobre dorado** (botón "Siguiente", chip activo) ≈ **2.2:1** → falla. Usar **tinta oscura sobre dorado**
  (≈ 8.9:1) o un dorado más profundo para fondos con texto.
- **Tamaño de texto:** hay texto a **9px**; en campo con sol es ilegible. Mínimo práctico 12–13px para datos, 11px solo
  para etiquetas muy secundarias.
- **Áreas táctiles:** `mini-btn` 34px, `tab` 38px, `mode-btn` 42px → por debajo de **44px** recomendado. Subir los
  controles frecuentes (cámara, favorita/buena, nav de cuarto) a ≥44px.

## Lo que funciona bien
- El **display serif** para nombres de cuarto da identidad y se siente premium (pantalla B es el mejor ejemplo).
- La paleta papel+dorado es cálida y propia; el concepto es bueno, solo está mal racionado.
- El **botón Toma** grande con su token "+1 · PIB2820" es exactamente el tipo de acción de 1 toque que pide el campo.
- La información de Cierre (faltantes, conciliación por cámara, línea de tiempo) está bien estructurada.

## Recomendaciones prioritarias (rumbo Track 2)
1. **Sistema de tokens antes de pintar.** Definir y aplicar 4 escalas: espaciado (4/8/12/16/24), tipografía
   (12/14/16/20/28 + el serif para títulos), elevación (3 niveles de superficie), y **rol del color** (dorado = acción
   primaria; estados activos en tinta; semánticos verde/rojo/azul solo para significado). Esto arregla de raíz "plano"
   y "utilitario".
2. **Rediseñar el loop con un solo foco.** Header limpio (cuarto+piso) → navegación unificada → tarjeta de cámara con el
   consecutivo como dato secundario → lista de tomas → **Toma** como única acción dominante. Menos cajas, más aire.
3. **Arreglar contraste y tamaños** (accesibilidad de campo): subir micro-texto a ≥12px y a tinta que pase AA; tinta
   oscura sobre dorado; áreas táctiles ≥44px. Es lo que más se nota bajo el sol.
4. **Corregir los dos quiebres de layout**: CTA tapado en Cierre y la tarjeta de exportar en Edición.

**Cómo lo propongo ejecutar:** primero los **tokens + el loop** como pantalla de referencia (R1), lo subo al preview,
**tú validas el feel en el celular**, y solo con tu OK propago el mismo sistema a setup, cobertura, cierre y edición.
