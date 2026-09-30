# Sharawla RC1 Runtime Alignment — Practical Regression Handoff

Date: 2026-09-30

## Boundary

- Official base: `rc1-beta58-32-performance-hotfix@7c9f943930d9e8e4f0595bccf0a7a0a2b7e925c6`.
- Corrective source branch: `rc1-runtime-alignment-2026-09-30`.
- SOURCE ONLY. No Supabase deployment, Reset, destructive Cloud write, SH-0007 destructive action, or Production action is authorized by this work.
- SH-0005 and SH-0006 remain untouched.

## Practical evidence that reopened runtime integration only

SH-0007 on 10.5.4-beta.58.32 proved the native runtime itself healthy, while practical usage exposed integration gaps that static/source acceptance had not exercised:

- Offline sale replay succeeded and produced server receipts.
- Two new Offline `supplier_save` operations reached DLQ with SQLSTATE `22023`.
- Delivery driver/zone management did not preserve the expected immediate local screen result.
- Ingredients and Recipe screens could fail to open Offline because their initial screen reads still depended on Cloud availability.
- Business Summary did not remain above Home after Product Map navigation regrouping.
- HR navigation/permission polling loaded, but the new Attendance/Payroll extension schema and RPCs are not live on the Beta backend.

These are new contradictory runtime facts and therefore justify reopening only the affected integration surfaces, not previously closed Point-4 evidence.

## Source fixes in this branch

1. Business Summary
   - `businessSummary` is now the canonical implemented registry route.
   - Product Map order is `businessSummary -> home`.
   - Home remains independent; Dashboard does not hijack Home.

2. Delivery settings Offline RAW
   - Delivery Settings reads `delivery_drivers` and `delivery_zones` through the existing local-first operational merge.
   - `offlineV2Drivers` / `offlineV2Zones` remain visible before ACK and after restart.

3. Restaurant Food master screens
   - Ingredients / stock / units use resilient local-first reads.
   - Recipes use local-first product, variant, header, version, and cost reads.
   - `offlineV2FoodIngredients` and `offlineV2FoodRecipeVersions` are merged explicitly.
   - A local Recipe draft remains visible even before its Cloud recipe header exists.
   - Local Recipe version identity is preserved instead of coercing the local id to `NaN`.

4. Final Offline V2 dispatcher composition
   - New source artifact: `supabase-rc1-offline-v2-runtime-alignment-final-dispatcher.sql`.
   - It preserves the live Point-4 core for sale/return/base operations.
   - It isolates Reference and Modern helper dispatchers as private functions.
   - It adds dedicated bindings for current `close_pos_shift_v2`, delivery completion, delivery settlement, and Central Warehouse request create.
   - Retail suspend/resume remains routed through its dedicated idempotent event handlers.
   - Historical supply-request state paths now assign a server entity id before the generic ACK gate.
   - Only the final public dispatcher is granted to `authenticated`.

## Live Beta read-only findings

Project: `xihcxydjnzemflhedzor`.

The live core helper `sharawla_offline_v2_apply_event_core_v1(jsonb)` currently supports only sale, return, expense, shift_open, and historical shift_close binding. The installed client registers 59 Offline V2 operation types.

The following representative owners were confirmed absent live during this audit:

- `offline_food_supplier_save_v1`
- `offline_delivery_driver_save_v1`
- `offline_delivery_zone_save_v1`
- `offline_food_ingredient_save_v1`
- `offline_food_recipe_save_draft_v1`
- `offline_food_purchase_order_create_v1`
- `offline_food_purchase_receive_v1`
- `offline_restaurant_floor_save_v1`
- `offline_restaurant_table_save_v1`

The live backend does already contain current business functions needed by several new dispatcher bindings, including:

- `close_pos_shift_v2(bigint,numeric,jsonb,text)`
- `delivery_mark_delivered_v2(bigint,text,text)`
- `delivery_driver_settle_v2(bigint,bigint[],text)`
- `inventory_supply_request_create_v1(bigint,text,jsonb,text,text)`

The dedicated Offline settlement wrapper remains source-only and must be deployed before the final dispatcher if Beta deployment is later authorized.

## HR live readiness

Read-only prerequisite inspection confirmed live:

- `pgcrypto`
- `public.branches`
- `public.employees`
- `public.hr_employees`
- `public.permission_actions_v2`
- `public.employee_action_permissions_v2`
- `public.current_employee_id()`
- `public.has_action_permission_v2(text)`

The new HR extension itself is not live. Required new Attendance/Schedule/Leave/Staff/Geofence tables and RPCs are provided by `supabase-hr-attendance-payroll-extension-v1.sql` and are source-gated by `scripts/check-rc1-hr-live-contract-source.js`.

## Deployment dependency rule

No SQL is authorized yet.

If explicit Beta-only authorization is later given, deployment must be dependency-ordered and must not deploy one historical dispatcher as the final definition. The exact final public definition must be the Runtime Alignment dispatcher after all required owners/helpers exist.

At minimum, the deployment plan must include and verify:

- HR extension source, if HR runtime is part of the same Beta alignment window.
- Restaurant reference/config owners.
- Food PO/receiving/reference owners.
- Modern Food owners.
- Delivery settlement owner.
- Retail suspend/resume event handlers.
- Central Warehouse owners/runtime prerequisites.
- Final Runtime Alignment dispatcher LAST.
- Post-deploy `pg_get_functiondef`/signature/ACL checks and a client-operation binding scan.

## Required practical re-acceptance after a future authorized Beta deployment

Do not Zero-State first. Preserve the current DLQ evidence until the alignment deployment has been proven.

Re-test on SH-0007 only:

1. Existing supplier DLQ evidence remains untouched before deployment.
2. New Offline supplier create.
3. New Offline driver and zone create, immediate visibility, Reload, Restart.
4. Ingredients page opens Offline; create ingredient; immediate visibility; Restart.
5. Recipe page opens Offline; create draft; immediate visibility; Restart.
6. Reconnect and verify ACK reconciliation with no duplicate rows.
7. Delivery completion and driver settlement.
8. Central Warehouse request create/state transitions.
9. Shift close with `close_pos_shift_v2`.
10. Business Summary remains above Home.
11. HR pages open against the live extension.
12. Only after these pass: separately authorize and execute Zero-State, then run the official full Practical Runtime Acceptance from a true clean state.
