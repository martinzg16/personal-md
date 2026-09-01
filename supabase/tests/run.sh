#!/usr/bin/env bash
#
# Runs the schema's guarantees against a throwaway Postgres.
#
# Not `supabase db start`: that needs Docker, and what these tests assert -
# grants, RLS predicates, constraints and triggers - is plain Postgres. A local
# cluster costs a second and keeps the check runnable on a laptop with no
# Docker on it. `local-auth-stub.sql` supplies the two things Supabase provides
# and stock Postgres does not: the anon/authenticated roles, and an auth.uid()
# that reads the same setting PostgREST sets per request.
#
# Anything that depends on Supabase itself - the auth service, PostgREST's own
# behaviour - is out of scope here and is checked against a real project.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
here="$root/supabase/tests"

for candidate in /opt/homebrew/opt/postgresql@17/bin /usr/local/opt/postgresql@17/bin; do
  [ -d "$candidate" ] && PATH="$candidate:$PATH"
done
export PATH
command -v initdb >/dev/null || { echo "no postgres on PATH (brew install postgresql@17)"; exit 1; }

# initdb refuses a locale it cannot resolve, which is the default on a fresh mac shell.
export LC_ALL=C LANG=C

data="$(mktemp -d)/pg"
port="${BRIO_TEST_PGPORT:-5433}"
cleanup() { pg_ctl -D "$data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$(dirname "$data")"; }
trap cleanup EXIT

initdb -D "$data" -U postgres --auth=trust --locale=C --encoding=UTF8 >/dev/null
pg_ctl -D "$data" -o "-p $port -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" \
  -l "$data/server.log" start >/dev/null

export PGHOST=127.0.0.1 PGPORT="$port" PGUSER=postgres
psql -q -c "create database brio_test" postgres >/dev/null

run() { psql -q -v ON_ERROR_STOP=1 -d brio_test -f "$1" >/dev/null; }
run "$here/local-auth-stub.sql"
for migration in "$root"/supabase/migrations/*.sql; do run "$migration"; done

out="$(psql -d brio_test -f "$here/schema.test.sql" 2>&1)"
echo "$out" | grep -oE '(PASS|FAIL)  .*' || true

if echo "$out" | grep -q 'FAIL'; then
  echo
  echo "$out" | grep -E 'ERROR' || true
  exit 1
fi
echo
echo "$(echo "$out" | grep -c 'PASS  ') assertions passed"
