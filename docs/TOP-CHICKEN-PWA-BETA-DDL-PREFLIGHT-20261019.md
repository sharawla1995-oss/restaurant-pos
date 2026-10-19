# Top Chicken Beta PWA — DDL preflight / 2026-10-19

**Decision: NO-GO — NOT DEPLOYED.** Owner approved *conditional* Beta-only DDL after a current verified restorable backup. Backup prerequisite is not met.

## Verified read-only facts
- Target project: `xihcxydjnzemflhedzor` (Supabase project reports ACTIVE_HEALTHY, PostgreSQL 17).
- Organization `jhqfsdqkrgzzygvtjgtl`: **Free** plan. Supabase connector does **not** expose Backup/Create Backup/Verify Restore functions.
- Branch 22 belongs to Top Chicken business `5358328c-9724-49aa-affc-1bce8be90f92` (exactly one matching branch).
- 3 active employees bound to branch 22; 2 shifts currently open in Beta at preflight read.
- Existing canonical functions found: `create_pos_order_atomic`, `close_pos_shift_idempotent`, `shift_cash_metrics_v2`.
- Proposed new receipt tables: `top_chicken_pwa_order_receipts_v1`, `top_chicken_pwa_shift_close_receipts_v1` — neither exists.
- Proposed new functions: `top_chicken_pwa_create_order_v1`, `top_chicken_pwa_close_shift_v1` — neither exists.
- Proposed SQL source: `sql/top-chicken-pwa-create-order-gateway-v1-DRAFT-NOT-DEPLOYED.sql` and `sql/top-chicken-pwa-close-shift-server-metrics-v1-DRAFT-NOT-DEPLOYED.sql`.
- GitHub Actions isolated PostgreSQL 16 tests PASS, including concurrent exact/changed-payload replay and mock cash/shift closure. This does **not** replace live tenant-JWT authorization or real Supabase restore verification.
- Prior project notes mention synthetic backup/fixture or CI closure but **no identified current dump, location, or successful restore evidence** as of this preflight.

## Gate before a live DDL migration
1. Back up the **entire current Beta database**, including the 2 open shifts and previously imported customers/orders, using a supported trusted backup mechanism; do not upload raw PII to GitHub artifacts, public chat, or public web storage.
2. Verify current timestamp, storage location, integrity and **restoreability in an isolated environment**, without changing the Beta project.
3. Run target-schema compatibility and negative JWT/branch role tests on an isolated clone or suitable authorized fixture. Test both migrations as a single reviewed source set, with exact SHA tracking, before any Beta apply.
4. Explicitly confirm scope is Top Chicken Beta only. Keep Top Burger Production, SH-0005/06/07/08, and all live orders untouched. No PWA write enablement at this DDL stage.
5. Only then: apply migrations using Supabase `apply_migration` (not arbitrary SQL execution), check deployed function ACLs, receipt RLS/grants, and read-only Central/Beta path; stop on any inconsistency.

## Safe rollback *plan*, not an authorization to execute
The drafts only create two new receipt tables and two new functions; they are not replacements of canonical writers. If deployed and later abandoned **before any receipts are written**, require reviewer approval to drop the two new functions first, then the two tables. **Never delete receipts after writes**; use reconciled archival and explicit data-safety approval. A rollback plan is not a substitute for a verified database backup.

## What was NOT done
- No Supabase migration or SQL apply.
- No Beta data write, shift change, order creation, app/site redeployment or real-jwt financial E2E.
- No production Top Burger, Central Admin, license, device or SH-0008 changes.
- No claim of a restorable backup or operational readiness.

This checkpoint is intentionally stop-safe. The previously deployed Vercel PWA remains **read-only**.
