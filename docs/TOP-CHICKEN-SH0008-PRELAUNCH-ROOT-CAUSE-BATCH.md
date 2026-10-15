# Top Chicken Beta SH-0008 — consolidated prelaunch repair candidate

**Status: SOURCE-ONLY / DRAFT / NOT DEPLOYABLE.** Date: 2026-10-15.
Base `release/top-chicken-sh0008-primary-v10.5.19-candidate` at `ee030278fe09d37b7ab5e83c305672bcee849410`.
Beta project `xihcxydjnzemflhedzor`, business `5358328c-9724-49aa-affc-1bce8be90f92`, branch 22, device SH-0008.
Top Burger Production and SH-0005/0006/0007, physical SH-0008, licensed configuration, Restaurant Profile, customer data and the pending local queue remain unchanged.

## Changes staged in this source branch

- Driver and delivery-zone create/edit/deactivate/toggle: only the Top Chicken branch-22 path routes through pre-existing audited/idempotent RPCs `offline_delivery_driver_save_v1` and `offline_delivery_zone_save_v1`. The original REST behavior for all other businesses is left in place. Retry keeps the exact actor-bound client transaction and digest.
- The automatic offline replay hold now applies to an **unknown startup identity on the Beta endpoint** and to Top Chicken in branch 22. A persisted consent from a prior launch does **not** silently resume retries; manual consent is needed again during each application session. No queue/receipt mutations were performed by this change.
- Top Chicken request tenant selector is derived from a signed-in employee whose server-side business is Top Chicken and selected branch is 22, not a stale global variable. A header is a selector, never an authorization grant. Server-owned membership/RLS/branch/entitlement checks remain authoritative.
- The optional V14 notification reader, when the Top Chicken Beta backend responds that `app_notifications_v1` is missing, stops re-polling a known-missing table for the remainder of the process; it does not silently fabricate a successful inbox or mark notifications as read. Other businesses retain their original path.
- Top Chicken's dedicated updater now reports which read/download/backup stage failed, without publishing to `/releases/latest` or bypassing Central license verification.

## Targeted source tests

- Existing `tests/top-chicken/delivery-reference-crud-regression.cjs`: scoped RPC route, digest, uncertain-outcome retry, tenant/branch rejection and non-Top-Chicken fallback.
- New `tests/top-chicken/prelaunch-root-cause-batch-regression.cjs`: unknown-identity pause, fresh session consent, TC branch isolation, tenant selector, missing notifications backoff, dedicated update stages.
- Standalone isolated JavaScript execution of modified snippets: **20/20 PASS**; source syntax for `app.js`, `main.js`, notification module, regression script: PASS.
- These are **not** Windows/Cloud/Auth/E2E tests and do not authorize a release, installation or publication. CI for this head has not been established at this checkpoint.

## Known blockers — do not bypass

1. **Cloud entitlement**: `sharawla_internal.operational_business_identity_v1` resolves to a legacy Beta business (`91826502-590e-4afa-8826-2c0f4b99c490`), and `operational_feature_entitlements_v1` grants are recorded for that business rather than Top Chicken. The source RPC may still be denied or evaluate the wrong tenant. Implement a server-verified **Top Chicken tenant-specific entitlement resolver** with denial for disabled/expired features, forged selectors, another branch, and a non-member; independently test legacy Beta unchanged. Do not change the shared Restaurant Profile.
2. **Modifier quantity schema mismatch**: `public.order_item_modifiers.quantity` is absent on Beta. Existing `supabase-v10-5-15-modifier-quantity.sql` is **NOT SAFE to replay wholesale**: besides adding a column/backfill, it replaces the shared `create_pos_order_atomic` function. A **new limited additive migration** must be reviewed against the currently deployed canonical function bodies and tested in isolated PostgreSQL with tenant isolation. Website modifiers need a separate requirement and compatibility review; do not silently replace exact counts with 1.
3. **Notifications backend**: `public.app_notifications_v1` is absent. The new guard avoids repeated 404s but **does not implement notifications**. A scoped compatible owner/schema is needed before declaring the notification feature PASS.
4. **Staff Edge**: Top Chicken UI uses `top-chicken-staff` after routing from `smart-function`, but this function is not deployed on Beta. Neither the legacy Edge nor direct table writes should be used as an insecure fallback. Create an independently reviewed tenant-bound authenticated staff endpoint and validate create/edit/disable/password/permissions without affecting another business; needs explicit Edge deployment permission.
5. **Financial offline queue**: the SH-0008 local job type, full `client_tx_id`, original immutable digest and exact error are not yet readable from the remote tools. No replay, payload edit, delete, reset or migration until the operator provides read-only device diagnostics, Cloud receipt comparison, and separate approval.
6. **Updater toast**: the observed automatic background update error cannot be attributed to a specific stage without a new local main-process diagnostic. The release feed still points at `10.5.19-rc.3` with no installable assets; no `rc.8` release should be inferred from a successful CI artifact.
7. **Beta website acceptance**: `website_orders_enabled=false` for branch 22; zero Top Chicken website orders at audit. No live order intake until isolated test approval and pickup/delivery/payment/print/order-status PASS.

## Independent authorization gates

- **A (SQL)**: exact signed limited SQL payload + isolated PostgreSQL PASS + rollback/backup; approval must explicitly authorize deployment to this Beta project. No destructive reset.
- **B (Edge)**: exact source, authentication/tenant tests, deployment scope and rollback; independent approval.
- **C (Entitlements)**: exact Top Chicken feature grants, expiry/revoke tests and audit trail; independent approval. Do not copy the legacy Beta tenant's grants wholesale.
- **D (device)**: read-only SH-0008 sync diagnostics, saved local database backup, candidate installer hash/Windows full restart evidence, independent installation approval.
- **E (test intake)**: permission to enable only strictly isolated website E2E test ingress with no real customer orders; never open live ordering until full acceptance.

These gates are not satisfied by the blanket request to fix source code.

## Evidence already verified (do not rerun without impacted changes)

- Windows `10.5.19-rc.8` GitHub run `38656612541` successful, but this only covers the CI test machine.
- POS order 887 has server receipts/audit for `new → preparing → ready`; shift 65 remains open.
- `GET delivery_drivers/delivery_zones` returned 200; direct `POST` returned 403 with PostgreSQL 42501.
- Beta showed `line_uid` replay failures and missing modifier-quantity queries. A log count is not a count of unique invoices.
- Existing Top Chicken customers/addresses, menu/images, employees/licensing were not modified.

**NO SQL / NO Edge deploy / NO Cloud entitlement writes / NO physical device changes / NO queue retry / NO Production release** in this batch.

## Update 2026-10-15 — real disposable PostgreSQL 16 evidence (NO DEPLOY)

New review-only SQL, absent from executable deployment workflow:

- `review-only/top-chicken-sh0008-quantity-additive-NO-DEPLOY.sql`: refuses existing quantity columns, existing rows or existing trigger owner; adds only the quantity column, legacy default trigger and 1..99 check; never replaces `create_pos_order_atomic` / `create_food_pos_order_atomic_v1` or modifies existing RLS/entitlements.
- `review-only/top-chicken-sh0008-tenant-feature-owner-NO-DEPLOY.sql`: proposes a scoped feature resolver for verified Top Chicken users that returns **DENY** until TC own grant is approved separately; other Beta identities retain the existing singleton-based decision. No user, device, profile or entitlement data is changed by this artifact.
- `tests/top-chicken/isolated-pg16-*.sql`: disposable fixture simulates membership and single-business binding. Test covers own-tenant feature, denied missing/disabled/expired feature, forged selector/anonymous denial, legacy behavior, explicit/legacy modifier quantities, invalid qty, shared owner sentinel.
- `.github/workflows/top-chicken-sh0008-pg16-review-only.yml` uses a fresh ephemeral **postgres:16** service; no Supabase credentials, no project connection, no remote database writes.

Evidence:
- [PG16 first run #38666282292 — SUCCESS](https://github.com/sharawla1995-oss/restaurant-pos/actions/runs/38666282292).
- [PG16 drift/re-apply negative run #38666400198 — SUCCESS](https://github.com/sharawla1995-oss/restaurant-pos/actions/runs/38666400198).
- Retry of either review-only SQL against a changed fixture correctly aborts; unexpected existing quantity or Top Chicken feature grants fail closed.
- These are **fixture-based** PostgreSQL 16 tests, **NOT** a backup/restore of real Beta and **NOT** the complete deployed PostgreSQL source bodies. The actual Beta database remains unchanged.

### Independent gates still open

1. No Cloud Admin approval to grant specific Top Chicken entitlements; the tenant fix deliberately remains deny-by-default.
2. No independent authorization to apply either reviewed SQL file; no schema change in Beta has occurred.
3. No real Beta backup/restore or signed pre/post migration snapshots. A true restoration rehearsal is mandatory before any SQL deployment.
4. No isolated/authenticated validation of Top Chicken's undeployed staff Edge service; no Edge deployment approval.
5. No device-side read-only description of the SH-0008 pending sync operation; no retry, delete or installation.
6. No website-to-POS Beta E2E with isolated intake; branch 22 real-order intake remains disabled.

No approval for one gate implies approval for any other gate.

## Follow-up 2026-10-15 — staff add actual Beta-schema compatibility

- Real Beta introspection found `employees_username_no_at` and `employees_username_format`: the employee's internal username must be **no @ and 3–40 characters**. Former source attempted to store the Auth email in this field and would fail even after Edge deployment.
- Corrected `review-only/top-chicken-sh0008-staff-create-NO-DEPLOY.sql` to keep the full valid login email in `auth.users.email`, and produce a deterministic, tenant-safe internal `tc_<name>_<email-hash>` username without @, with SQL uniqueness/length checks. No shared constraint was relaxed.
- Updated PG16 fixtures to enforce both real Beta checks, not just the earlier simplified mock. Tested two different email domains with the same local-part and verified distinct internal usernames.
- UI now labels the internal identifier separately in the Top Chicken edit form, makes the create form require a real email and 8-character password; username-only Supabase Auth login is **not implemented**.
- [Staff source & disposable PG16 Run #38672106460 — SUCCESS](https://github.com/sharawla1995-oss/restaurant-pos/actions/runs/38672106460); source and PG16 jobs both green. Prior failed runs were fixture mismatches corrected before this PASS.
- Read-only live Beta snapshot still contains **2 Top Chicken employees, 2 memberships, 0 Top Chicken operational entitlements, 0 deployed staff receipt tables**; `top-chicken-staff` remains absent from deployed Edge Functions. Real account creation is therefore **NOT YET FUNCTIONAL** on SH-0008. This source CI evidence does not authorize deployments.
- Existing modify/deactivate/password actions also need an audited secure server owner before being claimed as operational PASS; the currently staged Edge implements staff **creation only**.
