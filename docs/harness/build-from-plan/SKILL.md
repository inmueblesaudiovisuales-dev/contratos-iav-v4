---
name: build-from-plan
description: Construye un proyecto por fases a partir de un plan en el repo, una fase a la vez, con gates programáticos y revisión sobre git. Úsalo cuando ya exista un plan con fases numeradas (F1, F2, …) en docs/ y quieras ejecutarlas con verificación automática y mínima intervención humana.
---

# build-from-plan

Orquesta un build por micro-fases. El PLAN en el repo es la fuente de verdad; el GIT es la memoria
compartida; los GATES son la revisión. El humano solo aprueba excepciones.

## Requisitos previos
- Un plan en `docs/.../<plan>.md` con: secciones de diseño, una lista "MICRO-FASES" (F1, F2, …) con
  alcance acotado por fase, dependencias, y para cada fase: archivos permitidos, verificación y tests.
- Una rama de trabajo dedicada (nunca `main`).
- `phase-gate.sh` en el repo (o junto a este skill).

## Procedimiento (por cada fase pendiente)
1. **Selecciona** la siguiente fase no completada cuyas dependencias estén satisfechas (lee el plan +
   el tracker de commits `git log --oneline`).
2. **Despacha** un subagente builder con un prompt mínimo y autocontenible:
   - "Trabajas en <repo>, rama <branch>. Lee SOLO el plan en <ruta>. Implementa SOLO la fase {Fn}: <bullet>.
     Reglas: aditivo/opt-in; no toques otras fases; <invariantes del proyecto>; sin emojis. Al terminar
     corre los tests, haz UN commit `Rxx — {Fn}: …` y push. No sigas con otra fase."
3. **Verifica con el gate** (no confíes en el resumen del builder):
   `git fetch && git checkout <branch> && git pull`
   `./phase-gate.sh "<archivos permitidos de la fase>" "<invariante1>" "<invariante2>"`
   Además: lee el `git show` del commit y corre los tests tú mismo.
4. **Decide**:
   - Gate PASA + diff coherente con el plan → aprueba, marca el tracker, ve a la siguiente fase.
   - Gate FALLA o ambigüedad → re-despacha al MISMO builder con la lista puntual de correcciones
     (sin limpiar su contexto) hasta que pase; o escala al humano si es una decisión de diseño.
5. **Contexto**: cada fase = subagente nuevo (contexto fresco). El orquestador NO acumula el código,
   solo conclusiones y el tracker. Relee el plan/diff cuando haga falta.

## Invariantes típicos a pasar como args del gate
- Contratos que no deben romperse (versiones de esquema, formatos de export).
- "Con la feature apagada, nada cambia" (opt-in).
- Archivos fuera de alcance = falla.

## Reglas duras
- Una fase = un commit = una unidad de revisión. Nada a `main`, nada de deploy, nada de PR salvo que se pida.
- El plan es la única fuente de verdad; si una fase exige cambiarlo, actualiza el plan primero y registra por qué.
- Paraleliza solo fases marcadas como independientes en el plan.
