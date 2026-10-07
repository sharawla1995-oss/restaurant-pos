# Sharawla Beta Multi-Tenant V1 — Phase A Evidence

Status: **PHASE A ADDITIVE / SECURITY PROOF = PASS**
Operational status: **FULL TWO-TENANT CUTOVER NOT YET PASS — PHASE B REQUIRED**

Date: 2026-10-08

Scope:
- Repository: `sharawla1995-oss/restaurant-pos`
- Branch: `beta-multitenant-v1-prep`
- Beta Supabase only: `xihcxydjnzemflhedzor`
- Canonical current business: `91826502-590e-4afa-8826-2c0f4b99c490` (`تجريبي`)
- Top Burger Production project `kzokretuuigjhxjzdlmk`: untouched/out of scope
- SH-0005 / SH-0006: untouched
- SH-0007 physical device: untouched; no reset or re-license
- Top Chicken cutover: not started

## Phase A authorization boundary honored

Applied only additive/rollbackable Phase A work.

Not performed:
- no legacy FK drop
- no Primary Key replacement
- no global unique constraint/index removal
- no `supabase-beta-multitenant-v1-unique-cutover-DRAFT.sql`
- no Finalize/Cutover script
- no Production migration

## Canonical tenant identity

The live Beta dataset is now attached to the same canonical Sharawla Cloud business UUID already held by SH-0007:

`91826502-590e-4afa-8826-2c0f4b99c490`

No locally-generated tenant UUID is used.

Server-owned authorization now includes:
- `business_auth_memberships`
- `business_device_bindings`
- active employee + business membership binding
- optional device/business binding
- client business header is selector only, never authority

## Pre-change → post-change row counts

The directed pre-change audit captured these core counts. Post-Phase-A counts are unchanged:

| Table | Before | After |
|---|---:|---:|
| branches | 2 | 2 |
| employees | 3 | 3 |
| products | 9 | 9 |
| customers | 4 | 4 |
| orders | 4 | 4 |
| shifts | 5 | 5 |
| expenses | 2 | 2 |
| purchases | 2 | 2 |
| stock_movements | 15 | 15 |

Additional post-proof counts:
- categories = 2
- order_items = 4
- order_payments = 4
- suppliers = 4
- returns = 0
- business_settings = 1
- website_settings = 0
- hr_employees = 2
- food_recipe_headers = 2
- food_recipe_versions = 2
- food_recipe_lines = 2

No test residue remained after rollback-only attack/replay tests.

## Backfill / ownership evidence

Live Phase A evidence:
- tenant-owned tables: **249**
- unresolved ownership rows: **0**
- unresolved ownership tables: **0**
- parent tenant mismatch rows: **0**
- parent tenant mismatch constraints: **0**
- memberships: **3**
- device bindings: **1**

## Additive FK / unique / RLS evidence

Legacy structures preserved:
- legacy PK count: **255**
- legacy FK count: **844**
- legacy non-primary unique indexes: **192**

Added Phase A protection:
- business-aware composite FK mirrors: **588**
- business-scoped unique shadows (`mt1u_`): **191**
- business-scoped natural-PK shadows (`mt1pk_`): **53**
- restrictive tenant policies: **266**
- tenant write-guard triggers: **251**

No legacy PK/FK/global unique was removed.

## SH-0007 compatibility proof

A headerless authenticated request using the existing Beta Admin identity was tested to simulate the currently installed SH-0007 client.

Result:
- `current_business_id()` resolved exactly to `91826502-590e-4afa-8826-2c0f4b99c490`
- visible counts matched the owner/canonical-tenant counts for the tested core tables
- no tenant header was required because the authenticated user has exactly one active trusted tenant membership
- no device reset or re-license was required

This is a DB/API compatibility proof. The physical SH-0007 device was not touched in Phase A.

## Cross-tenant RLS/write attack evidence

Rollback-only Tenant B was created only inside test transactions.

A → B:
- read leak = 0
- update rows = 0
- delete rows = 0
- forged B selector did not widen access

B → A:
- own B row visible = 1
- A row leaks = 0
- A update rows = 0
- A delete rows = 0
- own B insert = 1
- cross-tenant insert denied with `CROSS_TENANT_WRITE_DENIED`
- forged A selector resolved to NULL

All rollback-only Tenant B rows disappeared after each test.

## Public RPC attack evidence

Legacy anonymous website-order overloads were found still executable by `anon` even though their bodies were not tenant-aware.

Phase A applied a narrow permission fix:
- 6-argument legacy `create_website_order`: `anon EXECUTE = false`
- 9-argument legacy `create_website_order`: `anon EXECUTE = false`
- latest 12-argument tenant-bound overload remains `anon EXECUTE = true`

Rollback-only Tenant B public attack against Tenant A branch:
- Restaurant branch RPC denied: `BRANCH_NOT_AVAILABLE`
- latest website-order RPC denied: `BRANCH_NOT_AVAILABLE`
- Retail branch open = false
- Retail catalog rows leaked = 0

## Offline runtime / replay evidence

Applied live to Beta:
- **53 / 53** Offline runtime receipt-touching functions are tenant-scoped
- **53 / 53** use hardened `pg_catalog, public` search path
- direct receipt/entity lookups are bound to `current_business_id()`

Same-tenant replay proof:
- first TX: non-replay success
- exact same TX + same digest: idempotent replay success
- customer rows created economically: 1
- receipt rows created: 1
- same TX + changed digest: rejected with `OFFLINE_CUSTOMER_REPLAY_MISMATCH`
- transaction rolled back; no test customer/receipt remained

## Expected Phase B blocker

Cross-tenant same-`client_tx_id` proof was executed.

Observed:
- Tenant B did **not** read Tenant A's receipt; the tenant-scoped lookup proceeded as a new B operation
- B then failed on the intentionally retained legacy global PK:
  - SQLSTATE: `23505`
  - constraint: `offline_customer_delivery_receipts_v1_pkey`
  - live legacy key remains `PRIMARY KEY (client_tx_id)`

This is the exact boundary between Phase A and Phase B.

Therefore:
- tenant lookup isolation = PASS
- same-tenant replay/idempotency = PASS
- cross-tenant same-TX coexistence = **BLOCKED BY LEGACY GLOBAL UNIQUENESS**
- changing that key is prohibited in Phase A and requires separate Phase B authorization

## Anonymous SECURITY DEFINER closure

A live pre-hardening snapshot showed:
- SECURITY DEFINER functions = **415**
- effective anon EXECUTE = **233**
- effective authenticated EXECUTE = **348**
- effective service_role EXECUTE = **415**
- anon-executable operational SECURITY DEFINER functions without an obvious tenant guard token = **79**

Phase A then applied an exact-signature public allowlist and removed inherited `PUBLIC` EXECUTE from every other SECURITY DEFINER while preserving the prior authenticated/service_role capability explicitly.

Post-hardening live evidence:
- effective anon EXECUTE = **21**
- effective authenticated EXECUTE = **348** — unchanged
- effective service_role EXECUTE = **415** — unchanged
- anon operational functions without tenant guard token = **0**

The remaining 21 anonymous SECURITY DEFINER functions are the intentionally public Restaurant/Retail/Web entry points and `request_business_id()`; the public smoke test remained PASS after the privilege change.

## SECURITY DEFINER view closure

Supabase security evidence identified 13 internal costing/inventory/retail views that originally executed with owner privileges and therefore could bypass caller RLS.

Phase A hardened exactly these 13 views:
- `product_variant_matrix_v1`
- `retail_reorder_suggestions_v1`
- `retail_supplier_invoice_match_v1`
- `retail_supplier_invoice_match_v2`
- `food_active_recipe_lines_v1`
- `food_recipe_cost_preview_v1`
- `food_theoretical_consumption_v1`
- `food_theoretical_consumption_net_v1`
- `food_waste_summary_v1`
- `food_recipe_branch_cost_v1`
- `food_production_variance_v1`
- `food_menu_costing_v1`
- `inventory_supply_catalog_live_v1`

Live post-hardening proof:
- security_invoker views = **13 / 13**
- anon SELECT on those views = **0 / 13**
- authenticated SELECT on those views = **13 / 13**
- every discovered base-table dependency used by the 13 views has:
  - authenticated SELECT
  - RLS enabled
  - `business_id`
  - a RESTRICTIVE tenant policy

Authenticated DB/API smoke on the current Beta tenant succeeded for all 13 views.

## Additional Phase B blockers preserved intentionally

Phase A deliberately retained legacy global constraints. The live schema still proves these important blockers:

- `employees_auth_user_id_key = UNIQUE(auth_user_id)`
  - prevents the same Auth user from owning a second employee row in another tenant while Phase A preserves global uniqueness.
- `offline_customer_delivery_receipts_v1_pkey = PRIMARY KEY(client_tx_id)`
  - proven to block the same client transaction id from coexisting independently in two tenants.
- `business_settings_id_check = CHECK(id = 1)` plus `PRIMARY KEY(id)`
- `website_settings_id_check = CHECK(id = 1)` plus `PRIMARY KEY(id)`
  - prevent a second tenant from owning its own legacy singleton `id=1` settings row until the prepared tenant-local settings cutover is authorized.

These are not Phase A failures; they are the exact legacy-global constraints that Phase B is intended to replace after separate authorization.

No persistent synthetic Tenant B was left in Beta. All Tenant B attack fixtures were rollback-only because a persisted tenant must use a canonical Sharawla Cloud business UUID; no new Cloud business write was authorized in Phase A.

## v10.5.15 / Top Chicken compatibility

Current conclusion:
- canonical Cloud `business_id` model is compatible with the planned Top Chicken tenant
- Restaurant v10.5.15 still needs the prepared small compatibility patch for tenant selector/context and tenant-local settings behavior before Top Chicken cutover
- Top Chicken must not be created/cut over until Phase B unique/FK cutover and final isolation regression are PASS

## Phase A final status

**PASS for additive foundation, current-tenant preservation, RLS/write isolation, public RPC isolation, and same-tenant Offline replay/idempotency.**

**NOT READY for full two-tenant production-style operation** because the intentionally retained global uniqueness still prevents the same client transaction identity from existing independently in two tenants.

## Exact next step

STOP here.

Request separate authorization for **Phase B — Final Unique/FK Cutover**.

Phase B must be limited to:
1. replace tenant-owned legacy global natural uniqueness with already-prepared business-scoped ownership,
2. convert receipt identity to `(business_id, client_tx_id)`,
3. make employee/auth identity and legacy singleton settings tenant-local without changing the canonical Sharawla Cloud business identity,
4. switch from legacy FK ownership to validated business-aware mirrors,
5. rerun symmetric A↔B attacks, same-TX cross-tenant replay, public RPC and security-invoker view regression,
6. stop again before Top Chicken cutover.

No Production / SH-0005 / SH-0006 / Top Chicken action is authorized by this report.
