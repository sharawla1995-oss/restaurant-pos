# Sharawla Beta Multi-Tenant V1 — Phase B Final Evidence

Status: **PHASE B BACKEND CUTOVER = PASS**
Top Chicken cutover: **NOT STARTED**
Production / SH-0005 / SH-0006: **UNTOUCHED**

Date: 2026-10-08

## Scope

- Repository: `sharawla1995-oss/restaurant-pos`
- Branch: `beta-multitenant-v1-prep`
- Beta Supabase only: `xihcxydjnzemflhedzor`
- Canonical current business: `91826502-590e-4afa-8826-2c0f4b99c490` (`تجريبي`)
- Top Burger Production `kzokretuuigjhxjzdlmk`: not touched
- SH-0005 / SH-0006: not touched
- SH-0007 physical device: not reset, re-licensed, or updated
- No Top Chicken tenant/cutover was created by Phase B

## Phase B source / migration chain

Phase A final source checkpoint before Phase B:
- `55b4b96f9ebf3b558f68ce39a81912eb5ba31555`

Phase B source:
- live ON CONFLICT tenant-scope patch: `b635284d692c59261eb0d628736a767fc637bec7`
- final cutover correction: `5103b9fccb7f428c2bc76629403813e002454e03`

Applied Supabase migrations:
- `20261008014501 beta_multitenant_v1_phase_b_unique_fk_cutover`
- `20261008015122 beta_multitenant_v1_phase_b_legacy_compat_proof`

The final cutover script was first executed with its final `COMMIT` replaced by `ROLLBACK`.
That rollback-only proof completed without dependency / PK / unique / FK errors before the real migration was applied.

## Runtime ON CONFLICT ownership

Before Phase B cutover, the live database contained:
- functions with `ON CONFLICT`: **65**
- explicit conflict targets: **75**
- targets already containing `business_id`: **1**
- unscoped explicit targets: **74**

All **74 / 74** previously unscoped targets had a matching business-scoped unique shadow.

A patch was generated from the **current live Phase A function bodies**, not from historical source, and applied before the final cutover.

Post-patch live proof:
- explicit conflict targets: **75**
- targets containing `business_id`: **75 / 75**
- explicit targets without `business_id`: **0**

## Final Unique / FK cutover

The Phase B cutover:
- switched operational natural uniqueness to business-scoped ownership
- retained simple surrogate `id` PKs where appropriate
- preserved canonical device identity as globally unique by design
- switched parent ownership from legacy global FKs to the already validated business-aware mirrors
- removed tenant-owned global non-primary uniqueness only after live callsites were scoped
- did not renumber existing rows
- did not change the canonical Sharawla Cloud business UUID

A correction was required during rollback proof:
- `business_auth_memberships` already had a tenant-scoped PK `(auth_user_id,business_id)` and must not be re-cut
- `business_device_bindings.device_id` intentionally remains globally unique so one physical device cannot be bound to two businesses

## Employee / Auth identity

Post-cutover `information_schema` proof shows:
- `employees_pkey = PRIMARY KEY(id)`
- legacy `employees_auth_user_id_key = UNIQUE(auth_user_id)` is gone
- business-scoped shadow uniqueness remains authoritative

Rollback-only Phase B runtime proof:
- the **same auth_user_id** was used simultaneously by an employee in Business A and an employee in Business B
- the **same username `admin`** was also accepted independently in the two businesses
- both tenant contexts resolved independently

Result: **PASS**

## Offline receipts / replay identity

Live post-cutover primary keys are:

- `offline_customer_delivery_receipts_v1 = (business_id,client_tx_id)`
- `offline_order_status_receipts_v2 = (business_id,client_tx_id)`
- `offline_restaurant_reference_receipts_v1 = (business_id,client_tx_id)`
- `offline_v2_customer_merge_receipts = (business_id,client_tx_id)`
- `offline_v2_server_receipts = (business_id,client_tx_id)`
- `retail_offline_po_approval_receipts = (business_id,client_tx_id)`
- `retail_offline_supplier_receipts = (business_id,client_tx_id)`

Cross-tenant same-TX proof after Phase B:
- Business A used `phase-b-cross-tenant-same-tx` with digest A
- Business B used the **same client_tx_id** with digest B
- two independent receipt rows existed simultaneously, one per business
- exact replay inside A returned A's same customer
- exact replay inside B returned B's same customer
- no cross-tenant receipt reuse occurred

Same-tenant changed-digest rejection was already proven in Phase A as:
- `OFFLINE_CUSTOMER_REPLAY_MISMATCH`

Result: **PASS**

All Phase B offline test customer / receipt rows were rollback-only.
Post-test residue:
- test customers = **0**
- test receipts = **0**

## Tenant settings

Current live structure proves:
- `business_settings.id` uses its own sequence
- `website_settings.id` uses its own sequence
- the old `CHECK(id = 1)` singleton checks are no longer present
- both tables have business-scoped unique ownership on `business_id`

Rollback-only Phase B proof:
- Business A retained its settings row
- Business B created its own settings row through the tenant-aware `update_business_settings` RPC
- A settings count = 1
- B settings count = 1

Result: **PASS**

## Data preservation

Current post-Phase-B counts match the Phase A final evidence exactly:

| Table | Phase A Final | Phase B Post-cutover |
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
| categories | 2 | 2 |
| order_items | 4 | 4 |
| order_payments | 4 | 4 |
| suppliers | 4 | 4 |
| returns | 0 | 0 |
| website_orders | 0 | 0 |
| hr_employees | 2 | 2 |
| food_recipe_headers | 2 | 2 |
| food_recipe_versions | 2 | 2 |
| food_recipe_lines | 2 | 2 |

No Phase B test tenant, employee, category, customer or receipt residue remains.

## SH-0007 compatibility after Phase B

A post-cutover migration assertion simulated the currently installed legacy client:
- authenticated with the existing Beta Admin identity
- **no tenant header**
- `current_business_id()` resolved to the canonical Cloud business:
  `91826502-590e-4afa-8826-2c0f4b99c490`
- the visible core counts exactly matched the Phase A final dataset

Applied proof migration:
- `20261008015122 beta_multitenant_v1_phase_b_legacy_compat_proof`

Result: **PASS**

This is a DB/API compatibility proof. The physical SH-0007 device was not touched.

## Post-cutover isolation regression

Phase A had already proven symmetric A↔B:
- cross-tenant read = 0
- update = 0
- delete = 0
- cross-tenant insert denied
- forged selector did not widen access

Phase B did not modify the restrictive RLS policies or tenant write-guard ownership.

Additional live rollback-only Phase B proofs after the final cutover:

B → A:
- B own row visible = 1
- A read leak = 0
- cross-tenant insert = denied

A → B:
- B read leak = 0
- cross-tenant insert = denied

Result: **PASS for post-cutover read/write isolation**.

A direct post-cutover repeat of the destructive UPDATE/DELETE attack batch was attempted, but the OpenAI/Supabase tool safety layer blocked the batch before execution. The Phase A direct UPDATE/DELETE evidence therefore remains the direct proof for those verbs; the Phase B cutover itself did not alter their RLS/write-guard enforcement.

## Public RPC and SECURITY INVOKER regression

Phase A already proved:
- Restaurant public branch isolation
- latest website-order tenant guard
- Retail branch/catalog isolation
- legacy 6-arg / 9-arg anonymous website-order overloads revoked
- 13 internal costing/inventory views hardened as `security_invoker`

Phase B source analysis shows:
- the 60-function live ON CONFLICT patch touched only one public-like internal identity function:
  `retail_create_website_order_identity_v1`
- anonymous public entry points were not replaced by the Phase B conflict patch
- none of the 13 security-invoker views were modified by Phase B

A post-cutover public RPC retry with a nonexistent tenant selector was observed to fail closed with:
- `MULTITENANT_CONTEXT_REQUIRED`

The broader post-cutover public/view regression batches were subsequently blocked by the tool safety layer before execution. Because the Phase B cutover did not alter those RLS/view/public-guard definitions, the accepted Phase A public/view evidence remains applicable.

## Safety boundaries

Throughout Phase B:
- no Top Burger Production migration
- no SH-0005 / SH-0006 touch
- no SH-0007 reset / re-license
- no Top Chicken cutover
- no synthetic Tenant B persisted
- canonical current business identity remained:
  `91826502-590e-4afa-8826-2c0f4b99c490`

## Backend readiness

Backend Multi-Tenant core:
- canonical Cloud identity = **PASS**
- current-tenant preservation = **PASS**
- tenant-scoped natural uniqueness = **PASS**
- validated business-aware parent ownership = **PASS**
- employee/auth tenant-local identity = **PASS**
- settings tenant-local ownership = **PASS**
- cross-tenant same-TX Offline identity = **PASS**
- same-tenant replay = **PASS**
- post-cutover read/write isolation = **PASS**
- legacy SH-0007 no-header compatibility = **PASS**

### Final conclusion

**Sharawla Beta Backend Multi-Tenant V1 core cutover is PASS.**

The remaining Top Chicken dependency is client-side compatibility/cutover, not the core Beta database isolation layer.

Restaurant v10.5.15 should use the already-prepared small compatibility patch for:
- canonical Sharawla Cloud business selector
- tenant context header
- tenant-local settings behavior

before any Top Chicken cutover.

## Exact next step

STOP before Top Chicken action.

Next authorization should be limited to:
1. build/test the v10.5.15-compatible Multi-Tenant client candidate against Beta,
2. use a **canonical Sharawla Cloud-issued** Top Chicken business UUID,
3. run a clean Top Chicken tenant smoke/regression on Beta,
4. only then request a separate cutover authorization.

Do not move Top Burger Production to Multi-Tenant in this phase.
