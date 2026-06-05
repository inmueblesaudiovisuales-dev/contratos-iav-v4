#!/usr/bin/env bash
# phase-gate.sh — gates programáticos para aprobar una fase de un build por-fases.
# Convierte la revisión humana en checks automáticos. Sale 0 si la fase pasa, !=0 si falla.
# Uso: ./phase-gate.sh "<archivos,permitidos>" "<invariante_grep_1>" "<invariante_grep_2>" ...
#   - arg1: lista separada por comas de rutas/patrones que la fase TIENE permitido tocar.
#   - args siguientes (opcionales): patrones que DEBEN seguir existiendo (invariantes).
set -uo pipefail
FAIL=0
say(){ printf '%s %s\n' "$1" "$2"; }

# 1) Tests de lógica (ajusta el comando a tu proyecto)
if [ -f frontend/checklist-logic.test.js ]; then
  if node --test frontend/checklist-logic.test.js >/tmp/_gate_tests 2>&1; then
    say "OK " "tests"
  else say "XX " "tests FALLARON"; tail -5 /tmp/_gate_tests; FAIL=1; fi
fi

# 2) Sintaxis del JS inline de cualquier HTML tocado
for f in $(git diff --name-only HEAD~1 | grep -E '\.html$' || true); do
  python3 - "$f" <<'PY' >/tmp/_inline.js 2>/dev/null || true
import re,sys;h=open(sys.argv[1],encoding='utf-8').read()
print("\n;\n".join(re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>',h,re.S)))
PY
  if node --check /tmp/_inline.js 2>/tmp/_gate_syn; then say "OK " "sintaxis $f";
  else say "XX " "sintaxis $f"; cat /tmp/_gate_syn; FAIL=1; fi
done

# 3) Alcance: la fase solo tocó archivos permitidos
ALLOWED="${1:-}"
CHANGED=$(git diff --name-only HEAD~1)
for c in $CHANGED; do
  hit=0; IFS=',' read -ra pats <<< "$ALLOWED"
  for p in "${pats[@]}"; do [[ "$c" == $p ]] && hit=1; done
  [ "$hit" = 1 ] && say "OK " "alcance $c" || { say "XX " "FUERA DE ALCANCE: $c"; FAIL=1; }
done

# 4) Invariantes que deben seguir presentes (grep)
shift || true
for inv in "$@"; do
  if grep -rqF "$inv" . --include=*.js --include=*.html 2>/dev/null; then say "OK " "invariante: $inv";
  else say "XX " "INVARIANTE PERDIDA: $inv"; FAIL=1; fi
done

# 5) Sin emojis en lo tocado
for f in $CHANGED; do [ -f "$f" ] || continue
  python3 - "$f" <<'PY' || FAIL=1
import sys
s=open(sys.argv[1],encoding='utf-8',errors='ignore').read()
e=[c for c in s if 0x1F000<=ord(c)<=0x1FAFF or 0x2600<=ord(c)<=0x27BF]
print(("XX  emojis en %s: %s"%(sys.argv[1],set(e))) if e else ("OK  sin emojis %s"%sys.argv[1]))
sys.exit(1 if e else 0)
PY
done

[ "$FAIL" = 0 ] && { echo "== GATE: PASA =="; exit 0; } || { echo "== GATE: FALLA =="; exit 1; }
