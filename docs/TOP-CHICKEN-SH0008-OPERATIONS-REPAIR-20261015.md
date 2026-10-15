# Top Chicken SH-0008 — employee, delivery, supplier, customer, test queue source candidate
Date: 2026-10-15. Status: SOURCE-ONLY; production release NO-GO.

## Scope and protections
Only repository `sharawla1995-oss/restaurant-pos` branch
`codex/top-chicken-sh0008-rc9-prelaunch-no-deploy`.
Target: Top Chicken business `5358328c-9724-49aa-affc-1bce8be90f92`, Beta Supabase
`xihcxydjnzemflhedzor`, branch 22, device SH-0008.
Top Burger Production, legacy Beta tenant and SH-0005/SH-0006/SH-0007 unaffected.
No SQL/Edge deploy, no entitlement write, no device installer, no local queue clear, no live website intake.

## Implemented in source
1. Staff new users may be created with lowercase Latin username (3..32 chars) and
   four-digit PIN. The dedicated `top-chicken-staff` candidate provisions a synthetic
   Auth email and server-secret HMAC-derived strong Auth credential.
   Secret `TOP_CHICKEN_STAFF_PIN_SECRET` must be provisioned to both functions
   before deployment; never expose it to clients or SQL. Old admin email Auth
   remains unchanged. New `top-chicken-pin-login` candidate gets a real Supabase
   Auth session only after the service-role PostgreSQL admission gate and verification.
   PIN4 offline login intentionally fails closed. PIN reset NOT implemented.
2. `review-only/top-chicken-sh0008-pin4-login-NO-DEPLOY.sql` contains the
   isolated account-level 5-attempt / 15-minute lock and success audit.
   3 core Beta grants are required and rechecked at success, including expiry/revocation.
3. A Top Chicken-only add-customer control is now present in customers list and
   POS. Server RLS/tenant selector, normalized phone uniqueness, and binding
   to a default customer address remain authoritative.
4. Delivery driver and zone create error messages now expose the exact commercial
   entitlement blocker rather than leaving the user with a silent failed tap.
   Both still call existing audited/idempotent `offline_delivery_*_save_v1` RPCs.
5. Supplier saving still calls `food_supplier_save_v1` which is the authoritative
   owner; the UI clarifies when `inventory.suppliers` is denied. No alternative
   financial writer or entitlement bypass was introduced.
6. Previous Beta-style `SH-0008` test sync reset remains only in source.
   It makes an on-device local SQLite backup, marks unsynced operations
   `discarded`, clears only local queue JSON and never deletes Cloud transactions.
   Because local pending operations could include actual sales, never install or
   invoke reset before operator verifies affected transactions are disposable.

## Live read-only findings from Beta (not assumptions)
- Top Chicken Beta operational feature grants: **0**.
- Central Admin commercial resolver `core.auth`, `core.users`,
  `core.permissions`: entitled=true.
- Central commercial resolver `commerce.delivery` and
  `inventory.suppliers`: entitled=false, `NOT_ENTITLED`.
- Required action features from Beta action/profile lookup:
  `delivery.drivers.manage` -> `commerce.delivery`;
  `delivery.zones.manage` -> `commerce.delivery`;
  `food.suppliers.manage` -> `inventory.suppliers`.
- Branch 22: 24 zones, zero drivers; two active admin employees without action
  overrides. Customer table already has Top Chicken-scoped normalized-phone
  UNIQUE index and tenant RLS/write guards.

## Independent gates before any claimed live PASS
1. Central authenticated, audited commercial entitlement action by a real
   authorized Sharawla Admin for Top Chicken **only**, for
   `commerce.delivery` and `inventory.suppliers`. Do not fabricate access
   or grant those by Beta direct SQL.
2. Independently review/build an authenticated, audited cross-project
   entitlement sync bridge. It must verify central source and actor, grant/revoke
   only this business, bind version+expiry, fail closed, and leave the legacy
   Beta business untouched. Current Beta has zero grants; adding staff PIN
   SQL alone will not make staff creation work.
3. Reviewed independent migration approval to apply PIN login SQL on Beta;
   provide recovery plan before deployment; do not rerun the already applied
   four 2026-10-15 Beta migrations.
4. Separate approval to deploy only `top-chicken-staff` candidate update and
   `top-chicken-pin-login` (verify_jwt=false, server admission on each attempt).
   Set a fresh 32+-character server-only secret in project Edge secrets.
5. Authenticated hosted end-to-end: staff create then login, wrong PIN lock,
   active/disabled/revoked/expired, driver and zone CRUD, supplier create,
   customer create (from both surfaces), branch 22 isolation, and regression
   tests against another Beta tenant.
6. Windows in-place upgrade and local restart+SQLite persistence + queue inspection
   on disposable Windows before any physical SH-0008 release approval.
7. With user approval, install on SH-0008 and separately authorize any test queue
   reset. Don't open website orders for real customers before a full website→POS
   acceptance run.

CI results are separately linkable from GitHub Actions.

## 2026-10-16 scoped continuation (SOURCE ONLY / NO DEPLOY)

This section supplements the 2026-10-15 handoff; the historical records above are not a current deploy preflight.

### Source changes since pinned RC9 9485795c

- `71e535cd`: PIN4 staff creation now requires exactly one branch ID (22), a strict UUID-shaped request ID, and the existing staff permission allowlist **before** reserving a receipt or creating a Supabase Auth user. This closes a real orphan/uncertain-Auth risk from malformed permission input.
- `ff81e2fd`: targeted PIN4 input regressions for empty/duplicate branches, invalid permissions and request IDs.
- `186accf3`: *candidate, not applied* PIN SQL success gate refuses to clear an active lockout; requires a matching, existing admitted attempt and row lock. A delayed successful Auth response can no longer reset a concurrent lock.
- `af8be0a4`: isolated PG17 SQL regression added for locked-success denial and post-expiry legitimate attempt (execution status must be verified in Actions; source change is not PG17 PASS).
- 8 dynamically executed in-process isolated PIN payload checks against the fetched source were PASS; this is not hosted Auth/Edge and not PG17.
- The SQL modification is in **only** `review-only/top-chicken-sh0008-pin4-login-NO-DEPLOY.sql`. None of the four already-applied 15-Oct migrations was modified or re-run.

### Direct live read-only observations (2026-10-16)

- Beta `xihcxydjnzemflhedzor` reports PostgreSQL 17.6. All four 2026-10-15 named migrations exist in `supabase_migrations.schema_migrations`: staff-create, staff-manage, verified-tenant-feature-owner, modifier-quantity-additive. **DO NOT REAPPLY.**
- Beta: two Top Chicken employees, zero delivery drivers, 24 branch-22 zones, zero rows for this business in `sharawla_internal.operational_feature_entitlements_v1`.
- Beta Edge inventory: `top-chicken-staff` ACTIVE v1 with `verify_jwt=true`. `top-chicken-pin-login` absent. PIN attempt table and login RPC absent.
- Central `ikppryeavoabnugcijeq` commercial resolver, evaluated read-only for the Top Chicken business at the query time: `core.auth`, `core.users`, `core.permissions` entitled, but `commerce.delivery`, `inventory.suppliers`, `commerce.orders`, `commerce.pickup` all `NOT_ENTITLED`. The `restaurant` profile is active. Module overrides for `pos`, `pickup`, `delivery` and `inventory` are enabled but are not commercial grants.

### Stop gates / permissions

1. Do not run direct Beta SQL entitlement grants or clone the legacy tenant; design/review tenant-only, authenticated/audited Central decision-to-Beta synchronization including disable, expiry, version, stale-decision deny, and other-tenant rejection. Commercial enablement requires separate user approval via the actual Central Admin control plane, and may have package/add-on implications.
2. PIN4 review-only migration and Edge updates require **independent** approvals and verified restoration/rollback prerequisites; never reapply the four 15-Oct migrations. Fresh server-only PIN secret must be provisioned. Hosted login, lockout and Auth have **not** been run. No PIN offline login or reset.
3. Real Beta CRUD writes (driver, delivery zone, customer+address, supplier), website pickup/delivery E2E, SQL/Edge publication, Windows device install, queue reset/replay and public intake remain **NOT RUN / BLOCKED** until their respective approvals and prerequisites.
4. Earlier RC9 Windows validation cannot be transferred to an untested modified installer. No new Windows release/feed has been created. Top Burger Production and SH-0005/06/07/08 unchanged by this continuation.

**Current state**: Source repair progressed, runtime is **NOT LIVE READY**. Do not turn CI/source success into hosted PASS.
