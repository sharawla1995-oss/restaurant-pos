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

## 2026-10-16 Authorized Beta SQL apply — live result

- Owner granted scoped independent approval for Beta SQL + Central and Beta Edge only after key provisioning; no authorization to touch Top Burger Production, physical devices, retail tenant data, or launch website intake.
- GitHub workflow `Top Chicken Central-to-Beta Bridge - SOURCE ONLY / NO DEPLOY`, run **38828784178**, latest reviewed SHA `47543d61af7bc16e117ad31459d74336aa14a5b7`: **source-only PASS; isolated-postgres17 PASS**. Previous failed run was HMAC import algorithm lacking explicit `SHA-256`, fixed in `47543d61`.
- Pre-apply Beta inspection: receipt table absent, writer RPC absent, 0 Top Chicken entitlement rows, Central grants still Audit #168/#169.
- **Applied only to Supabase Beta `xihcxydjnzemflhedzor`** with Supabase `apply_migration`, exact GitHub SQL blob `ed045f146f4c22cb68cdc4f4c187de5326109722`, name `top_chicken_commercial_entitlement_lease_bridge_v1_20261016`, applied migration version **`20261016002013`**. Tool returned `success:true`. DO NOT REAPPLY.
- Verified live Beta: receipts table exists; writer RPC exists; service_role EXECUTE=true, authenticated EXECUTE=false, anon EXECUTE=false; receipts RLS=true, FORCE RLS=true; **receipt count = 0; Top Chicken operational entitlement count = 0**. No business data was granted or overwritten by the additive migration.
- Beta security advisors found this new private receipt table listed in the informational `RLS enabled, no policy` group, as intended for a service-only private auditing table. No new function mutable search_path advisory specific to this migration.
- **Central Edge and Beta Edge have NOT been deployed**, because both code candidates require the SAME fresh 64-character hex `TC_BRIDGE_HMAC_KEY` stored as server-only Edge secret in both Supabase projects. Current connected Supabase plugin has no Edge Secret management operation. Do not deploy a crashing/functionally unusable endpoint without this prerequisite, and do not commit/send secrets to chat.
- Next step is owner/authorized Cloud Browser session to generate a cryptographically random 32-byte value, store as `TC_BRIDGE_HMAC_KEY` in Central Admin project `ikppryeavoabnugcijeq` and Beta project `xihcxydjnzemflhedzor` through Supabase Dashboard → Edge Functions → Secrets. Do not echo, print, store in GitHub, or leak it. Once confirmed, deploy `top-chicken-commercial-proof` on Central and `top-chicken-commercial-sync` on Beta with `verify_jwt=false` and full explicit application-layer auth, then verify hosted signatures/nonce/central JWT/tenant-denial and real signed Beta audit receipts.
- **Separate operational readiness blocker**: 60-second commercial entitlement leases expire unless a secure refresher is called regularly before protected Beta operations; source bridge as-is only supports a Central administrator initiated sync. Do not call full POS CRUD LIVE-ready until reliable authenticated refresh, driver/supplier CRUD, and the outstanding Central `commerce.orders` / `commerce.pickup` grants are addressed by official control plane.

## 2026-10-16 commercial Bridge Edge v1 deployed (after owner approval)
- Authorized Work session reported `TC_BRIDGE_HMAC_KEY` securely stored in both Central and Beta with matching SHA-256 fingerprints; secret never exposed.
- Central `ikppryeavoabnugcijeq`: `top-chicken-commercial-proof` ACTIVE v1, verify_jwt=false with internal Central JWT + HMAC checks, Edge ID `49ceff68-1ff6-4c5d-a17f-6842e83d17a5`.
- Beta `xihcxydjnzemflhedzor`: `top-chicken-commercial-sync` ACTIVE v1, verify_jwt=false with internal bearer forwarding, signed Central proof/nonce/scope checks, Edge ID `94b62779-cfce-4f43-8448-9f2e38fcc8e5`.
- Both deployed from pinned RC9 source `813b8d21637248649f9f358538b73efb7eefac7f`. No other Edge redeployed, no other SQL run, no device touched.
- Read-only verification: Central `core.auth/users/permissions` and `commerce.delivery`/`inventory.suppliers` entitlement=true; `commerce.orders` and `commerce.pickup` still NOT_ENTITLED.
- **ACTIVE is deployment, NOT hosted end-to-end PASS**. No valid Central Admin JWT provided to call Beta sync; immediately after deployment Beta receipt count 0, operational entitlement count 0, live grants 0. Authenticated HMAC/nonce/JWT/tenant-negative hosted tests are PENDING.
- The signed sync endpoint accepts ONLY a Central Admin bearer via a secure client `POST https://xihcxydjnzemflhedzor.supabase.co/functions/v1/top-chicken-commercial-sync` with body `{}`; never share bearer in chat or files. Central JWT is distinct from Beta JWT.
- Leases are 60 seconds. A one-time admin sync will expire and is NOT a live POS delivery/supplier enablement; must securely refresh before protected Beta operations, honor Central revoke/expiry, and fail closed.
- Driver/supplier/customer/staff-PIN hosted CRUD, website order E2E, and SH-0008 install all remain NOT RUN, subject to their safety gates.

## 2026-10-16 final ongoing Top Chicken Beta continuation — operational refresh and RC9

**Important: Windows RC9 remains a disposable candidate, NOT approved physical install. Website live intake still OFF.**

**Central/Beta runtime update:** Deployed ONLY `top-chicken-commercial-proof` Central Edge **ACTIVE v2**, and `top-chicken-commercial-sync` Top Chicken Beta Edge **ACTIVE v2**. Both preserve `verify_jwt=false` gateway setting with explicit server authentication. New `beta_operator` path obtains Beta JWT identity with `auth.getUser`, confirms employee active, verified membership active, and branch 22 active before requesting exact 5-feature signed Central decision. Distinct `central_admin` mode still validates Sharawla Admin Central JWT. Central HMAC secret remains private. Central returns signed actor_id/mode/nonce, Beta rejects mismatch; Beta never trusts a client-supplied business or actor.

**POS source:** `app.js` on Top Chicken RC9 now renews current 60s Central-driven entitlements on demand with authenticated Beta staff before delivery driver and zone saves, driver assignment/settlement, suppliers and supplier returns, plus staff management. Strict scoped guard for Beta URL, business id and branch 22. Deny any critical write when Central is unreachable/disabled, no cross-tenant changes; only reuse cache with >12s lifetime. Legacy/Top Burger untouched. CI `Top Chicken Central-to-Beta Bridge - SOURCE ONLY / NO DEPLOY` pass at source SHA `1934dd20`: both `source-only` and isolated PostgreSQL17 PASS. In-process scoped refresh source checks 5/5 PASS. **This is source/CI evidence, NOT hosted Beta API request evidence.**

**Sharawla Admin UI:** Production deployment `dpl_ic5UGAKvMmruhWMgttE39noNxj8q` from `sharawla-admin` commit `50716f79305fb55ce27522cefcc87f47d0402e56` READY and bound to `sharawla-admin.vercel.app`. `commercial-management.html` includes manual signed sync button with receipt/expiry feedback and attempts one automatic sync when reopened using a fresh Central Admin session. A browser JWT is never saved in GitHub or chat.

**PIN4:** Originally malformed source SQL caused isolated PG17 failure. Fully corrected the only candidate `review-only/top-chicken-sh0008-pin4-login-NO-DEPLOY.sql` in commit `b188f6ac`; GitHub PIN4 `pin-source` + `isolated-postgres17` both PASS run `38831358060`. Applied to **Beta ONLY** as new additive migration `top_chicken_sh0008_pin4_login_guard_v1_20261016`, migration version **`20261016005003`**. Verify: login_attempt table exists, attempt/success RPCs exist, service_role can execute, anon/authenticated cannot; attempts count = 0. DO NOT REAPPLY. Existing employee identities, customer and order data untouched. **PIN Edge not deployed** and `TOP_CHICKEN_STAFF_PIN_SECRET` provisioning was NOT confirmed. PIN4 CANNOT be declared live-ready.

**Windows:** Isolated disposable x64 SH-0008 Windows RC9 in-place upgrade workflow run `38831238035` SUCCESS. SHA `522f86f6185141101681676e9dbfd185b302f7f8`. Artifact ID `12016364942`, name begins `TC-SH0008-rc9-DO-NOT-INSTALL-`; carries actual RC9 installer + regression evidence. **NOT released, NOT installed on SH-0008**, no update feed changed. Download artifact only for disposable tests; requires subsequent hosted Beta, credential and queue integrity validation before physical release.

**Still pending for end-to-end PASS:** verified actual signed Central/Beta sync receipt and 5 live leased rows (latest live read-only query returned 0); authenticated hosted driver/zone/supplier CRUD and Beta tenant-negative tests; PIN secret and reviewed staff/PIN Edge publication; Central official `commerce.orders` and `commerce.pickup` remain NOT_ENTITLED and block full website→POS lifecycle; follow-up Windows final artifact/device/queue tests and separate authorization before any physical installation or public intake. No direct SQL commercial grant, Beta reset, PR merge, production deploy or Top Burger operating data changes.

## 2026-10-16 scoped runtime follow-through (Beta only)
- New post-grant `commercial-management.html` on Sharawla Admin production uses live Central Admin login to POST exact empty-body request to the Beta sync Edge, shows receipt and TTL, and auto-tries once when the page is reopened with a valid Central Admin session; admin UI commit `50716f79305fb55ce27522cefcc87f47d0402e56`, Vercel `dpl_ic5UGAKvMmruhWMgttE39noNxj8q` **READY**. No client key/secrets other than published Supabase publishable API key.
- Beta edge `top-chicken-commercial-sync` now **ACTIVE v3**: verifies signed-in Beta actor + exact Top Chicken active employee/business membership + active branch 22 before requesting a server-only HMAC-signed decision; Central edge `top-chicken-commercial-proof` now **ACTIVE v3** and concurrently resolves exact 5 features at a single timestamp. Beta Edge accepts `x-sharawla-business` in CORS preflight (the desktop app sends it). Both retain Central Admin signed path. Prior isolated source and PG17 tests **PASS** (GitHub workflow `38832097168`, head `202ac4c9`).
- Desktop `app.js` Top Chicken guard calls Beta sync before delivery driver/zone, assignment, settlement, supplier and return RPC operations, and staff manager operations. It caches only the current signed-in actor/token's verified lease until 12 seconds before expiry; revocation/offline fails closed for affected writes. No other tenants touched. **Windows test run `38832097125` SUCCESS on disposable Windows; no installer published, no device installed**.
- Beta staff Edge `top-chicken-staff` upgraded **ACTIVE v3**, verify_jwt=true. The deployed code keeps legacy staff email creation and management, adds guarded PIN4 create path that explicitly fails `STAFF_PIN_SECRET_UNCONFIGURED` if separate `TOP_CHICKEN_STAFF_PIN_SECRET` is missing. This is source/deploy evidence only: no authenticated hosted create/permissions tests performed.
- PIN4 SQL already applied only Beta under migration `20261016005003`. New PIN4-login Edge is a separate candidate requiring validated independent secret and isolated Typecheck PASS before deployment. Do not send/commit the secret; do not treat Beta staff v3 ACTIVE as proof of PIN4 login readiness.
- Beta last read-only still had **0 entitlement sync receipts and 0 Top Chicken leased rows**; therefore no successful hosted Central-to-Beta signed roundtrip is proven, even though edges and UI are deployed.
- Central still `commerce.orders` and `commerce.pickup` `NOT_ENTITLED`; any real website order/checkout launch remains BLOCKED until official grant, hosted accepted lifecycle tests and separately approved public intake.

## 2026-10-16 Final Beta partial release checkpoint — do not call live-ready

**Runtime deployed, isolated tests PASS:**
- Central Edge `top-chicken-commercial-proof` ACTIVE **v3**: exact 5 commercial resolver calls concurrent within signed 5-second freshness bound, two authenticated modes (`central_admin` or verified `beta_operator` HMAC proof).
- Beta Edge `top-chicken-commercial-sync` ACTIVE **v3**: session/member/branch22 verification, signed actor/nonce/mode/tenant checks, exact 60-second five-feature lease SQL writer; Beta POS header `x-sharawla-business` now permitted in CORS preflight.
- Beta `top-chicken-staff` ACTIVE **v3** (`verify_jwt=true`): email staff create/manage preserved, PIN4 create guarded by `TOP_CHICKEN_STAFF_PIN_SECRET`. No confirmed secret provisioning or hosted create yet.
- Beta `top-chicken-pin-login` ACTIVE **v1** (`verify_jwt=false` with explicit throttled service-role SQL admission); pinned to Beta URL and refuses all actual login if `TOP_CHICKEN_STAFF_PIN_SECRET` is absent/short. All PIN SQL applied only Beta migration `20261016005003`, no reruns.
- Sharawla Admin `commercial-management.html` Production READY from commit `50716f79`; opens verified Central session, automatically calls Beta sync once, has manual retry/reporting button.

**Evidence:**
- Commercial bridge CI `38832097168` at SHA `202ac4c9`: `source-only` PASS + isolated `postgres17` PASS.
- PIN4 CI `38832312061` at SHA `7b621fc3`: `pin-source` PASS + isolated PostgreSQL17 PASS.
- SH-0008 disposable Windows in-place RC9 upgrade CI `38832097125` **SUCCESS**; artifact `12018015664`, `TC-SH0008-rc9-DO-NOT-INSTALL-cloud-approval-pending-202ac4c9ec4e2d33cc0829535dcbe9514161f528`. GitHub artifact exists but must NOT be released/installed pending hosted acceptance and queue/restore checks.
- Final live Beta read-only: `top_chicken_entitlement_sync_receipts_v1` = 0, `top_chicken_pin_attempts_v1` = 0, currently active Top Chicken lease entitlements = **0**. NO authenticated positive Cloud roundtrip or actual login/user/driver/supplier write has been performed. Thus **not operationally verified**.
- Central grant Audit #168/#169 for delivery/suppliers remain previous verified accepted central grants; `commerce.orders` / `commerce.pickup` remain NOT_ENTITLED.

**Next necessary user-side delegated auth work** (not a repeated approval): open `https://sharawla-admin.vercel.app/commercial-management.html?v=50716f79` in the currently authorized Central Admin browser session. If current login is stale, sign in anew using the UI. It auto-initiates signed Beta sync and shows receipt/errors. Never share JWT/password. Check Beta receipts/read grants immediately afterward. Separately provision a dedicated fresh server-only `TOP_CHICKEN_STAFF_PIN_SECRET` in **Beta only**, and verify presence without disclosing its value (existing `TC_BRIDGE_HMAC_KEY` is NOT a substitute).
**Still blocked:** Until hosted Beta authenticated CRUD and Windows install/restart+SQLite+offline queue backup are PASS, no physical SH-0008 installation, customer data manipulation, live website intake, feed update or merger. Do not claim finished.

## 2026-10-16 owner-approved continuation — verified sync + durable supplier + Windows RC9

### New live read-only evidence (this supersedes prior `0 receipts` snapshots)
- The authenticated Sharawla Admin UI showed `Beta: PASS` with receipt `b940976e-b0ca-4a63-b01e-b7934129722c`; **read-only Beta SQL independently confirmed this exact receipt** under `sharawla_internal.top_chicken_entitlement_sync_receipts_v1` at **2026-10-16 01:24:35.550551 UTC**.
- Beta operational entitlements now contain exact FIVE Top Chicken rows `core.auth`, `core.users`, `core.permissions`, `commerce.delivery`, `inventory.suppliers`, each `enabled=true`, source `tc-central-signed-commercial-v1`. Their **first lease expired at 2026-10-16 01:25:35.22 UTC**. This is proof the HMAC-signed Central-to-Beta write worked once, NOT proof of ongoing automatic POS refresh.
- Central resolver again returned `commerce.delivery=true` and `inventory.suppliers=true`; `commerce.orders=false` and `commerce.pickup=false`. Required for full website-to-POS order/pickup testing: official administrative commercial entitlement grants; not direct SQL.
- Beta inventory of reference data scoped to Top Chicken: drivers **0**, zones **24**, suppliers **0**. No synthetic supplier/driver records created. `food_supplier_save_v1` was found to be an older global definer owner, but the `mt1_business_write_guard_suppliers` trigger plus PV2 feature resolver protect the authenticated path. Better tenant-scoped receipt owner `offline_food_supplier_save_v1` already exists, accepts a request digest and durable UUID, and delegates to the existing owner.

### Source-only enhancement and gate outcomes
- Scoped `app.js` supplier flow now routes *only* Top Chicken branch-22 `food_supplier_save_v1` UI actions to `topChickenDurableSupplierSave()`, which validates actor/scope/input; hashes business/branch/actor/payload into a durable replay key without storing phone/name in the key, requires same `p_client_tx_id` on uncertain retries, calls existing `offline_food_supplier_save_v1`, rejects missing server receipts and clears the local key only after success. All other businesses still call `food_supplier_save_v1` unchanged. This uses the existing Beta `inventory.suppliers` lease refresh before the RPC and makes no SQL or Edge changes.
- New source-isolated test `tests/top-chicken/supplier-durable-bridge-regression.cjs` includes successful canonical receipt, uncertain result/replay, no PII in local retry key, tenant mismatch, missing actor, invalid supplier payload/ID, missing receipt, unchanged legacy path. Test wired into both source-only and Windows gates.
- Commercial source & **isolated PostgreSQL 17** run <https://github.com/sharawla1995-oss/restaurant-pos/actions/runs/38835634268>: **SUCCESS**, supplier-specific step **SUCCESS**. Windows x64 actual build and in-place same SQLite upgrade run <https://github.com/sharawla1995-oss/restaurant-pos/actions/runs/38835652585>: **SUCCESS**. Candidate head **`60d8fb1853f87aaa2e12f9ce780dad30aa8e9354`**, latest artifact name `TC-SH0008-rc9-DO-NOT-INSTALL-cloud-approval-pending-60d8fb1853f87aaa2e12f9ce780dad30aa8e9354` (GitHub Actions ephemeral artifact). There was no release promotion, update feed change, external device installation or production data write.
- `top-chicken-commercial-proof` and `top-chicken-commercial-sync` remained ACTIVE v3 without redeployment; after the first user-initiated Central Admin sync, the lease had expired. POS automated refresh was tested source-only but **not live with a Beta-logged-in employee**.
- **Outstanding, do not call live-ready**: valid Beta staff authentication+lease auto-refresh on real POS session, actual hosted driver/zone/supplier safe CRUD, receipt and foreign tenant proof; PIN4 private secret/hosted login acceptance (do not expose), `commerce.orders` base-package assignment and `commerce.pickup` add-on via authenticated audited Central Admin (only if owner specifically approves these commercial features), complete web order pickup/delivery end-to-end, SH-0008 actual backup/restore, local queue and Windows release approval. Real customer intake OFF.

## 2026-10-16 real Windows DevTools: HR appVisible crash + staff 503 — source fix only
- User-supplied photos of an already-running `10.5.19-rc.9` Windows instance (unknown whether physical SH-0008) show **two independent errors**: recurring `ReferenceError: appVisible is not defined` at `refreshPermissions` in `hr-attendance-admin-v1.js:29`, and POST to `https://xihcxydjnzemflhedzor.supabase.co/functions/v1/top-chicken-staff` returning HTTP **503** from `app.js` employee submit route. A third unrelated `app_notifications_v1` 404 causes safe notification polling pause.
- Precisely fixed the HR source crash by defining an Electron foreground visibility guard, checking `global.rpc`, coalescing overlapping 8s/auth-triggered refresh calls and handling synchronous/async permission failures in `hr-attendance-admin-v1.js`. Commit `b6f04a43b6378b2871a947ab5a40614fc0564ac8`.
- Added `tests/top-chicken/hr-visibility-permissions-regression.cjs` (8 groups: defined guard, visible/hidden, missing API, concurrent tick, rejected permission, local snapshot, auth listener preservation), gated by isolated source CI `.github/workflows/top-chicken-hr-503-source-NO-DEPLOY.yml` (GitHub run **38838751814 SUCCESS**) and Windows RC9 in-place gate run **38838729195** (at handoff: still building, verify final result separately).
- Independent read-only Beta query: `top_chicken_staff_create_receipts_v1` **0**, `top_chicken_staff_manage_receipts_v1` **0**, Top Chicken branch22 employees **2**. All relevant reserve/finish/manage functions exist on Beta. This **does not identify** the HTTP 503 code, nor prove the specific submitted operation made no side effects outside receipts. The service could return `STAFF_PIN_SECRET_UNCONFIGURED`, `STAFF_BACKEND_NOT_READY`, `STAFF_MANAGE_OUTCOME_UNCERTAIN`, etc. Do **not** claim a verified cause without exact Network Response JSON or trusted Edge logs.
- Relevant Supabase unified logs around ~02:03 UTC did not expose a matching `top-chicken-staff` response/error code; observed a 404 on the optional notifications table and function boot events. No write was made as part of this investigation.
- Previously added `app.js` scoped safe rendering of staff HTTP503 code (commit `add605545a7710b3d056215c09e78cbd7fc5cb3c`) is source-only and was **not present in the older Windows instance photographed**. The new Windows candidate should show safe diagnostic response details once independently approved/installed, not auto-retry create/manage.
- **Production safety**: no Supabase SQL/Edge migration, no real employee/driver/order writes, no device update, no production or Top Burger modification, no real website intake.
- Required next diagnostic: user's authorized DevTools **Network -> failed top-chicken-staff -> Response** screenshot (without Request Headers, Bearer token, or login credentials) to distinguish actual 503 code; alternatively hosted controlled auth test after necessary secrets. No blind resubmission of staff create/edit. Full staff/PIN4 and Windows release approval still pending.
