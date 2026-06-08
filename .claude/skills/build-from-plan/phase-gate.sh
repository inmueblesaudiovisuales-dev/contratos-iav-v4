#!/usr/bin/env bash
# phase-gate.sh — gates programáticos para aprobar una fase de un build por-fases.
# Convierte la revisión humana en checks automáticos. Sale 0 si la fase pasa, !=0 si falla.
# Uso: ./phase-gate.sh "<archivos,permitidos>" "<invariante_1>" "<invariante_2>" ...
#   - arg1: lista separada por comas de rutas/patrones que la fase TIENE permitido tocar.
#   - args siguientes (opcionales): patrones que DEBEN seguir existiendo (invariantes).
set -uo pipefail
FAIL=0
say(){ printf '%s %s\n' "$1" "$2"; }

# --- Configuracion: autodescubrimiento (A) con fallback a .phase-gate.json (B) ---
TEST_CMD=""
GREP_INCLUDE="--include=*.js --include=*.html"

# A: autodescubrimiento por stack
if [ -f package.json ] && python3 -c "
import json,sys
d=json.load(open('package.json'))
sys.exit(0 if d.get('scripts',{}).get('test') else 1)
" 2>/dev/null; then
  TEST_CMD="npm test"
  GREP_INCLUDE="--include=*.js --include=*.ts --include=*.html"
elif [ -f Cargo.toml ]; then
  TEST_CMD="cargo test"
  GREP_INCLUDE="--include=*.rs"
elif [ -f pyproject.toml ] || [ -f setup.py ]; then
  TEST_CMD="python -m pytest"
  GREP_INCLUDE="--include=*.py"
elif [ -f go.mod ]; then
  TEST_CMD="go test ./..."
  GREP_INCLUDE="--include=*.go"
elif [ -f Makefile ] && grep -q "^test:" Makefile 2>/dev/null; then
  TEST_CMD="make test"
fi

# B: .phase-gate.json overrides o completa lo autodescubierto
if [ -f .phase-gate.json ]; then
  CFG_TEST=$(python3 -c "
import json
d=json.load(open('.phase-gate.json'))
print(d.get('test_cmd',''))
" 2>/dev/null || true)
  CFG_GREP=$(python3 -c "
import json
d=json.load(open('.phase-gate.json'))
exts=d.get('grep_include',[])
print(' '.join('--include='+e for e in exts))
" 2>/dev/null || true)
  [ -n "$CFG_TEST" ] && TEST_CMD="$CFG_TEST"
  [ -n "$CFG_GREP" ] && GREP_INCLUDE="$CFG_GREP"
fi

# 1) Tests
if [ -n "$TEST_CMD" ]; then
  if $TEST_CMD >/tmp/_gate_tests 2>&1; then
    say "OK " "tests ($TEST_CMD)"
  else
    say "XX " "tests FALLARON ($TEST_CMD)"
    tail -5 /tmp/_gate_tests
    FAIL=1
  fi
else
  say "--" "tests: sin comando detectado (agrega test_cmd a .phase-gate.json)"
fi

# 2) Sintaxis JS inline en HTML tocado
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
  if grep -rqF "$inv" . $GREP_INCLUDE 2>/dev/null; then say "OK " "invariante: $inv";
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
