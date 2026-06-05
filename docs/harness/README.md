# Harness: build-from-plan

Herramienta reusable para construir proyectos por micro-fases con verificación automática
y revisión sobre git (ver la sesión de planeación de "Modo Guiado de tomas").

## Contenido
- `build-from-plan/SKILL.md` — skill orquestador (despacha un subagente por fase, verifica con el gate, aprueba, sigue).
- `build-from-plan/phase-gate.sh` — gates programáticos (tests, sintaxis, alcance de archivos, invariantes por grep, sin emojis).

## Instalación (nivel usuario, sirve en cualquier repo)
Copia el skill a tu carpeta de skills de Claude Code:

```bash
mkdir -p ~/.claude/skills/build-from-plan
cp docs/harness/build-from-plan/SKILL.md       ~/.claude/skills/build-from-plan/SKILL.md
cp docs/harness/build-from-plan/phase-gate.sh  ~/.claude/skills/build-from-plan/phase-gate.sh
chmod +x ~/.claude/skills/build-from-plan/phase-gate.sh
```

Luego, en cualquier proyecto con un plan por fases en `docs/`, invoca `/build-from-plan`.
