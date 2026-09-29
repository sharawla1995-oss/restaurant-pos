# Bon V3 SQL Deployability Review

Status: SOURCE PRE-FLIGHT CLOSED / DEPLOYMENT 0

Repository evidence confirms the baseline signatures used by Bon V2/V3: `current_employee_id()`, `has_branch_access(bigint)`, and `create_pos_order_atomic(jsonb,jsonb,jsonb)`. The shift schema contains `branch_id`, `employee_id`, and the later additive `client_open_tx_id`. Legacy `shift_bon_counters` exists with shift and branch ownership.

The new branch counter is intentionally created by Bon Numbering Policy V1; it is not a historical prerequisite.

Required future application order is:

1. baseline deployability preflight
2. Bon Numbering Policy V1
3. Bon Numbering Policy V1 online migration (safe while V2 is still absent; reservation count reports null)
4. Bon Reservation V2 scope-aware source
5. Trusted Device Context + Bon V3
6. Bon V3 sale helper
7. Bon V3 base sale owner

The online numbering migration no longer has a hard creation-time dependency on the V2 reservation table: its policy preflight uses `to_regclass` and reports `active_reservations_v2: null` until V2 exists. Any future policy transition must be rechecked after V2 is deployed, before activation.

The preflight explicitly checks `gen_random_uuid()` rather than assuming extension/runtime availability.

Source review also found and closed a V2/V3 return-shape mismatch: the V2 reserve/consume functions intentionally return `jsonb`, while the V3 public wrappers expose `SETOF` typed V2 rows. V3 now explicitly rehydrates each V2 JSON result with `jsonb_populate_record(null::<table-row-type>, ...)` before returning it. The deployability gate rejects a direct scalar-JSON-as-composite bridge.

The V2 reserve/consume RPCs are also internal-only in the V3 design. Direct `authenticated` execution is revoked because V2 accepts a fingerprint parameter and exposing it would let a client bypass the V3 trusted-device context. Authenticated POS callers reserve through V3; the SECURITY DEFINER V3 wrapper invokes V2 under the server-owned function boundary.

Bon consumption is stricter: both `pos_consume_reserved_bon_v3` and `pos_consume_sale_bon_v3` are internal-only. An authenticated client must not be able to burn a reserved number independently of the sale. The public sale entry remains `create_pos_order_atomic`, which invokes the internal helper before the first durable order write in the same database transaction.

A reserved sale now persists both the exact `bon_number` and its frozen `bon_numbering_mode` into the order row. This is required so the online numbering trigger can verify the caller's frozen scope against the current branch policy and so the correct policy-scoped unique index applies to the persisted reserved Bon.

This is static/source validation only. It does not prove live Beta database state and performs no database write.
