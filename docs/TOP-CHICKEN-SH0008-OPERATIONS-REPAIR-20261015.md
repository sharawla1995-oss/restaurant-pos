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

## Continuation: Central entitlement bridge policy candidate (2026-10-16)

**SOURCE ONLY / NO DEPLOY.** The branch gained:
- `supabase/functions/top-chicken-entitlement-bridge/policy.mjs`: a pure, tenant-locked, allowlisted Central commercial-decision validator for exactly thirteen operational feature codes. Requires observed business/profile/feature/override flags, matching per-feature Central resolver identity, allowed grant provenance and timestamps. Converts negative/revoked/expired decisions to explicit disabled rows. Positive leases are limited to 10 seconds from observation and cannot outlast the Central expiry. Rejects stale/future snapshots, mismatched tenants, missing features, unknown provenance and invalid timestamps. **Not an authenticated Edge endpoint or a database writer.**
- `tests/top-chicken/entitlement-bridge-policy.mjs`: 17 isolated test groups and 28 local V8 assertions PASS against the fetched GitHub source. No Supabase writes, PG17 migration, Windows installation or hosted API call is part of these tests.
- `.github/workflows/top-chicken-sh0008-entitlement-bridge-policy-NO-DEPLOY.yml`: path-scoped source-only Node CI; the GitHub Actions run must be checked separately, not inferred from file presence.

**Blocking implementation gates**: the actual Bridge still needs an independently reviewed, privileged Beta SQL receipt/lease writer with actor/tenant/branch verification, monotonic source observation lock, auditable changes, revocation and expiry behavior; a server-only Edge Central reader validating decisions directly (never browser-supplied) and authenticated Beta actor; a secure operating trigger before every affected RPC; isolated actual PG17 restoration and affected-only tests. Existing direct SQL local entitlements must NOT be enabled or copied from any other business. A successful policy preview must never be used as authorization to perform operations.

**Central commercialization**: live read-only catalog shows feature_class `standard` for `commerce.orders` and `add_on` for `commerce.delivery`, `commerce.pickup`, `inventory.suppliers`. No Top Chicken base-package or paid-addon grant currently exists. The published `ACC_RUNTIME` package contains `commerce.orders` only, not the other required POS features. Do not assume it is an adequate launch package or create paid grants without a separate explicit business-owner approval.

**No changes** were made to Central commercial assignments, Beta SQL/Edge, any device, receipts, queues, customer data, production services, website intake or PR #46 merge state. Source policy alone cannot fix the 404 or the current authorization failures.

## 2026-10-16 Official Top Chicken grant completed; Beta bridge review-only candidate

### Central successfully activated — no repeat grants
User activated exactly two features using the authenticated Sharawla Admin commercial management UI. Verified by **live Central resolver and grant records**:
- `commerce.delivery`: entitled=true, active add-on grant `87b87c9e-f66f-4070-ac38-de7693e31256`, **Audit #168**, actor `33f3f7d6-60ce-40e1-831b-7e111be1b505`.
- `inventory.suppliers`: entitled=true, active add-on grant `22be77ee-d23a-4d0e-a8da-c377667818a3`, **Audit #169**, same actor.
- Business `5358328c-9724-49aa-affc-1bce8be90f92` ONLY; no grant expiry. Do not duplicate these grants or change Top Burger's state.

**Fresh live Beta read-only**: operational entitlement rows for Top Chicken = **0**. Beta `sharawla_internal.operational_feature_entitled_v1` requires this tenant's own live rows and validates membership-derived actor identity; the existing `top_chicken_staff_actor_authorized_v1` additionally requires all three `core.auth`, `core.users`, `core.permissions` rows. Therefore a bridge that checks this function before first sync has an authorization deadlock. Central grants the three core features automatically (CORE_INCLUDED), but Beta has not yet received them. Two Top Chicken branch-22 admins have existing linked Beta Auth and active membership; do not manufacture an admin user. CRITICAL: the Central grant Audit #168/#169 admin actor is NOT a Beta branch-22 admin identity, so using the Central JWT against Beta Auth or requiring Beta staff membership for Central commercial sync is incorrect.

**Still ungranted in Central**: `commerce.orders` (standard base-package entitlement) and `commerce.pickup` (add-on) are `NOT_ENTITLED`. Do not bypass official commercial management or infer these grants from the restaurant Profile. Full website-to-POS order lifecycle CANNOT be declared PASS simply because delivery and suppliers were granted.

### Review-only source candidate; not deployed
New branch code includes:
1. `supabase/functions/top-chicken-entitlement-bridge/central-decision.mjs`: strict real-Central-resolver-shaped five-feature proof policy: core.auth/users/permissions plus commerce.delivery and inventory.suppliers; 60s expiry, scope/time/provenance/revocation/negative evidence checks. **19 local isolated JS groups, 24 assertions PASS**; not hosted Edge or PG17.
2. `supabase/functions/top-chicken-entitlement-bridge/hmac.mjs`: strict server-only SHA-256 HMAC helpers for a separate 32-byte hex secret.
3. `supabase/functions/top-chicken-commercial-proof/index.ts`: review-only **Central-only** Edge proof endpoint. Allows ONLY HMAC-verified requests pinned to Top Chicken and exact five Central resolver read operations, then signs response.
4. `supabase/functions/top-chicken-commercial-sync/index.ts`: review-only **Beta-only** Edge endpoint. Accepts only a Central Admin Bearer token (Beta JWT validation must be disabled at the gateway, because the issuer is a DIFFERENT Supabase project), forwards it over server-to-server signed transport, checks Central-signed administrator identity and decisions, and calls one restricted Beta RPC with exact five lease rows.
5. `review-only/top-chicken-commercial-lease-bridge-NO-DEPLOY.sql`: **additive** private Beta audit receipt table and strictly service_role-executable atomically scoped 5-feature lease upsert. The trusted Central Admin actor is bound in the signed proof checked by the Beta Edge (not forged into Beta employees); service_role-only RPC, exact-code whitelist, monotonic observation version, 60s TTL, receipt-based idempotent same-nonce replay, stale rejection, foreign tenant unchanged. **This SQL has NOT been executed in Beta**.
6. `tests/top-chicken/central-five-feature-lease.mjs`, `central-signed-bridge-scope.mjs`, and `commercial-lease-pg17-{fixture,assertions}.sql`; source-only CI `.github/workflows/top-chicken-commercial-sync-NO-DEPLOY.yml` includes PostgreSQL 17 isolated fixture and execution of candidate there. **Actual PG17 CI result MUST be observed; do not call it PASS based on source existence**.

### Independent approval and readiness gates
- First verify actual CI `source-only` and `isolated-postgres17` jobs PASS, inspect migration SQL no unintended owner/tenant drift, and confirm restore procedure.
- Obtain independent approval to **apply only the new review-only SQL to Top Chicken Beta**. NOT the existing four 15-Oct migrations, no DDL on Central, no direct business entitlement INSERT.
- Separate approval to **deploy only Central `top-chicken-commercial-proof` Edge** (server-only Central service-role key) and to set `TC_BRIDGE_HMAC_KEY` securely on Central and Beta.
- Separate approval to **deploy only Beta `top-chicken-commercial-sync` Edge**; verify JWT, active actor, scope, signed proof, audit receipt, force Central revoke/expiry, negative grant and foreign Beta tenant, and legacy rows unchanged.
- **Very important:** 60-second leases need a tested refresh trigger before relevant POS actions, and fail closed when Central is offline; an admin's one-time sync is not an operationally persistent enablement. Do NOT claim fully-working supplier/driver functions before implementing this refresh and hosted CRUD tests.
- Delivery order lifecycle still depends on official Central base-package grant of `commerce.orders` (and pickup flows separately on `commerce.pickup`), plus existing PIN4 SQL, staff and PIN Edge review/publication, and real website→POS testing.
- No physical SH-0008 installation or local queue reset, no true website intake until distinct device and go-live approvals.

**Explicit status**: Central commercial grants PASS; bridge source in progress/review-only; Beta entitlement sync NOT LIVE; PG17/hosted Edge and Windows/post-install validations NOT CLAIMED.

### 2026-10-16 crucial cross-project Auth fix (source only)
A live read-only Beta check confirmed Central Audit actor `33f3f7d6-60ce-40e1-831b-7e111be1b505` has **zero** matching Beta staff-admin rows. The bridge source was corrected: Central Edge verifies a **Central** user JWT with `cloud.auth.getUser` AND active `sharawla_admins`, returns `actor_user_id` in its HMAC-signed proof; Beta Edge accepts that Central JWT only as an opaque header forwarded to Central, checks HMAC/nonce/timestamps/actor against the Central signed response, then calls the restricted Beta service_role SQL writer. **Central and Beta Edge must both deploy with verify_jwt=false for this cross-project authenticated handshake**, enforced by the explicit application-layer checks; neither must expose service keys or HMAC secrets to the browser. The SQL receipt contains actual Central actor identity, not a forged Beta employee. Unauthenticated, non-admin, tampered, stale, or foreign-tenant grants must fail. Do not deploy until PG17 source tests and hosted negative Auth tests prove this chain.

Note that this is a **commercial control-plane bridge**, not permission to perform POS operations as the Central actor. POS employees on Beta still authenticate with their own Beta identities and membership-derived roles.
