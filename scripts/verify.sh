#!/usr/bin/env bash
# Lance toutes les vérifications et écrit un rapport unique : verify-report.txt
# Usage : bash scripts/verify.sh   (prérequis : Node 20+, Docker démarré)
set -u
cd "$(dirname "$0")/.."
REPORT=verify-report.txt; : > "$REPORT"
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
declare -a RESULTS
step() { # step "nom" commande...
  local name="$1"; shift
  echo "=== $name ===" | tee -a "$REPORT"
  if "$@" >>"$REPORT" 2>&1; then RESULTS+=("OK    $name"); else RESULTS+=("ÉCHEC $name"); echo "(voir détails ci-dessus)" >>"$REPORT"; fi
}
need() { command -v "$1" >/dev/null 2>&1 || { echo "Outil manquant : $1" | tee -a "$REPORT"; exit 1; }; }
need node; need npm; need docker

step "npm install"            npm install --no-audit --no-fund
[ -f supabase/config.toml ] || step "supabase init" npx supabase init --force
step "supabase start"         npx supabase start
step "migrations (db reset)"  npx supabase db reset
if command -v psql >/dev/null; then
  step "test isolation RLS (psql)" psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation.sql
else
  step "test isolation RLS (docker)" bash -c 'docker exec -i "$(docker ps --filter name=supabase_db -q | head -1)" psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/rls_isolation.sql'
fi
step "test isolation phase 2" bash -c 'if command -v psql >/dev/null; then psql "$0" -v ON_ERROR_STOP=1 -f supabase/tests/rls_phase2.sql; else docker exec -i "$(docker ps --filter name=supabase_db -q | head -1)" psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/rls_phase2.sql; fi' "$DB_URL"
step "types (tsc --noEmit)"   npx tsc --noEmit
step "tests unitaires"        npm test
step "build Next.js"          env NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder npm run build

echo; echo "===== RÉSUMÉ =====" | tee -a "$REPORT"
printf '%s\n' "${RESULTS[@]}" | tee -a "$REPORT"
echo; echo "Envoyez le contenu de $REPORT (ou au moins les lignes ÉCHEC et l'erreur associée)."
