#!/usr/bin/env bash
# Disposable GitHub Actions PostgreSQL16 only; no Supabase/external DB.
set -euo pipefail
d="$(mktemp -d)"
trap 'rm -rf "$d"' EXIT
call_close() {
 local shift="$1" amount="$2" tx="$3"
 docker exec -i tc-pwa-gate-db psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 <<SQL
SELECT set_config('tc_test.uid','a1111111-1111-4111-8111-111111111111',false);
SELECT set_config('tc_test.business','5358328c-9724-49aa-affc-1bce8be90f92',false);
SELECT set_config('tc_test.employee','1001',false);
SELECT set_config('tc_test.allow_branch','yes',false);
SELECT public.top_chicken_pwa_close_shift_v1($shift,$amount,'$tx');
SQL
}
count_receipts() {
 docker exec tc-pwa-gate-db psql -X -At -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "SELECT count(*) FROM public.top_chicken_pwa_shift_close_receipts_v1 WHERE shift_id=$1"
}
same="12345678-1234-4234-8234-123456789abc"
call_close 5004 40 "$same" >"$d/a" 2>&1 & a=$!
call_close 5004 40 "$same" >"$d/b" 2>&1 & b=$!
wait "$a" || { cat "$d/a"; exit 1; }
wait "$b" || { cat "$d/b"; exit 1; }
test "$(count_receipts 5004)" = 1 || { echo 'DUPLICATE_CLOSE_RECEIPTS'; exit 1; }

diff="23456789-2345-4345-8345-23456789abcd"
call_close 5005 46 "$diff" >"$d/c" 2>&1 & a=$!
call_close 5005 47 "$diff" >"$d/d" 2>&1 & b=$!
set +e
wait "$a"; ra=$?
wait "$b"; rb=$?
set -e
if ! { { test "$ra" = 0 && test "$rb" != 0; } || { test "$rb" = 0 && test "$ra" != 0; }; }; then
 echo 'EXPECTED_ONE_SHIFT_WINNER'; cat "$d/c" "$d/d"; exit 1
fi
grep -q 'SHIFT_CLOSE_REPLAY_CONFLICT' "$d/c" "$d/d" || { echo 'MISSING_CLOSE_CONFLICT'; exit 1; }
test "$(count_receipts 5005)" = 1 || { echo 'CHANGED_CLOSE_DUPLICATED'; exit 1; }
echo 'TC_PWA_PG16_CONCURRENT_SHIFT_CLOSE_PASS one original receipt and payload conflict'
