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
