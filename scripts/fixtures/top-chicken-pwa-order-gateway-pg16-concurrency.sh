#!/usr/bin/env bash
# Disposable CI PostgreSQL 16 container ONLY — NEVER points at Supabase.
set -euo pipefail
pg_container="tc-pwa-gate-db"
testdir="$(mktemp -d)"
trap 'rm -rf "$testdir"' EXIT
call_sale() {
  local tx="$1" total="$2"
  docker exec -i "$pg_container" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 <<SQL
SELECT set_config('tc_test.uid','a1111111-1111-4111-8111-111111111111',false);
SELECT set_config('tc_test.business','5358328c-9724-49aa-affc-1bce8be90f92',false);
SELECT set_config('tc_test.employee','1001',false);
SELECT set_config('tc_test.allow_branch','yes',false);
SELECT public.top_chicken_pwa_create_order_v1(
  public.tc_fixture_order('$tx',$total),
  '[{"product_id":9,"quantity":1,"unit_price":100,"total":100}]'::jsonb,
  '[{"method":"cash","amount":100}]'::jsonb,
  '$tx');
SQL
}
count_tx() {
  docker exec "$pg_container" psql -X -At -U postgres -d postgres -v ON_ERROR_STOP=1 -c     "SELECT count(*) FROM public.orders WHERE client_tx_id='$1'"
}
# Exact duplicate submitted by two different DB sessions at the same instant.
same="dddddddd-dddd-4ddd-8ddd-dddddddddddd"
call_sale "$same" 100 >"$testdir/same-a.log" 2>&1 & a=$!
call_sale "$same" 100 >"$testdir/same-b.log" 2>&1 & b=$!
wait "$a" || { cat "$testdir/same-a.log"; exit 1; }
wait "$b" || { cat "$testdir/same-b.log"; exit 1; }
test "$(count_tx "$same")" = "1" || { echo "Concurrent exact replay duplicated sale"; exit 1; }

# Changed payload raced under one client_tx_id: exactly one winner, one conflict.
diff="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
call_sale "$diff" 100 >"$testdir/diff-a.log" 2>&1 & a=$!
call_sale "$diff" 101 >"$testdir/diff-b.log" 2>&1 & b=$!
set +e
wait "$a"; status_a=$?
wait "$b"; status_b=$?
set -e
if ! { { test "$status_a" = 0 && test "$status_b" != 0; } || { test "$status_b" = 0 && test "$status_a" != 0; }; }; then
  echo "Expected exactly one successful changed-payload race";
  cat "$testdir/diff-a.log" "$testdir/diff-b.log"; exit 1
fi
if ! grep -q 'TRANSACTION_REPLAY_CONFLICT' "$testdir/diff-a.log" "$testdir/diff-b.log"; then
  echo "Missing digest rejection evidence"; exit 1
fi
test "$(count_tx "$diff")" = "1" || { echo "Concurrent changed replay duplicated sale"; exit 1; }
echo "TC_PWA_PG16_CONCURRENT_REPLAY_PASS exact=same-once changed=one-winner-one-conflict"
