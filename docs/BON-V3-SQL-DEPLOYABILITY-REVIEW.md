# Bon V3 SQL Deployability Review

Status: SOURCE PRE-FLIGHT CLOSED / DEPLOYMENT 0

Repository evidence confirms the baseline signatures used by Bon V2/V3: `current_employee_id()`, `has_branch_access(bigint)`, and `create_pos_order_atomic(jsonb,jsonb,jsonb)`. The shift schema contains `branch_id`, `employee_id`, and the later additive `client_open_tx_id`. Legacy `shift_bon_counters` exists with shift and branch ownership.

The new branch counter is intentionally created by Bon Numbering Policy V1; it is not a historical prerequisite.

Required future application order is:

1. baseline deployability preflight
2. Bon Numbering Policy V1
3. Bon Reservation V2 scope-aware source
4. Trusted Device Context + Bon V3
5. Bon V3 sale helper
6. Bon V3 base sale owner

The preflight explicitly checks `gen_random_uuid()` rather than assuming extension/runtime availability.

Source review also found and closed a V2/V3 return-shape mismatch: the V2 reserve/consume functions intentionally return `jsonb`, while the V3 public wrappers expose `SETOF` typed V2 rows. V3 now explicitly rehydrates each V2 JSON result with `jsonb_populate_record(null::<table-row-type>, ...)` before returning it. The deployability gate rejects a direct scalar-JSON-as-composite bridge.

This is static/source validation only. It does not prove live Beta database state and performs no database write.
