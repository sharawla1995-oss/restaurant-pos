# Top Chicken SH-0008 prelaunch repair — 2026-10-13
Status: SOURCE PREPARATION ONLY. No DB writes, deploys, device changes, or cleanup authorized.

## Scope
Beta Supabase xihcxydjnzemflhedzor; business 5358328c-9724-49aa-affc-1bce8be90f92; branch 22. Never touch Top Burger Production or SH-0005/SH-0006/SH-0007. SH-0008 may not be modified before isolated validation and approval.

## Confirmed diagnosis
1. Delivery status PATCH orders id 886 returned 403 permission denied. Authenticated role lacks UPDATE on public.orders. Do not solve with broad GRANT or weakened RLS; implement server-authorized status transition with actor, branch, tenant, status transition, idempotency, audit, and test forbidden cross-tenant/cross-branch calls.
2. Employee form requires type=email and calls smart-function action=create; validate backend account provisioning and atomic role/branch/permission assignment. Do not create live users during tests.
3. Windows updater reads update-config.json and userData/update-channel.json, selecting generic stable/beta GitHub releases. Current SH-0008 advertises V10.5.18. Avoid UI-only hiding; implement fail-closed per-device product/channel release eligibility, with update check and install both gated. Never change existing production device channels.
4. Operational test cleanup: 13 orders, 1 website order, 1 shift, 3 returns, 0 expenses, 0 driver settlements as of read-only snapshot; preserve 5860 customers plus addresses, products, prices, images, delivery zones, settings, and device/license identity. Counts may change.
## Cleanup blockers
- No verified recoverable backup/restore test.
- No complete FK/dependent-table inventory and finance/offline receipt impact audit.
- No proof SH-0008 local SQLite/offline queue is drained; no active shift clearance.
- No authorization to delete or reset counters.
Do not DELETE/TRUNCATE/RESET, alter counters, deploy, or install. After repair tests, re-inventory, create verified backup, run isolated restore/cleanup rehearsal, show exact rows and rollback, request final explicit deletion approval.

## Implementation progress (source-only)
- `main.js`: SH-0008 canonical license device ID is blocked from generic GitHub updater feed before fetching a release. Commit `5558432c4e3850cb3926c4bf29a8612553a4e73b`. Dedicated release feed remains future work. Installed SH-0008 is unchanged.
- `app.js`: create-employee form switched from required email to username; create action no longer passes misleading email. Server `smart-function` version 2 explicitly rejects usernames containing @, creates an internal email, and requires admin authorization. Commit `96ae5867445e5894fa4d9cf9b892924d4353acc1`. Runtime tests not yet executed.
- Delivery order modal uses direct `PATCH orders` for preparing and ready, and other paths use direct PATCH for delivered. Authenticated role lacks table UPDATE in Beta. Needs safe audited RPC and client migration, plus isolated end-to-end test; **not fixed**.
- Backup/restore and local offline drain **not verified**; deletion is not authorized. No deploy, SQL writes, or device update occurred.

## Required validation before release
1. Verify updater on isolated Windows Electron instance with canonical device SH-0008, assert generic feed never queried, no download/install; verify non-SH-0008 behavior unchanged. Do not simulate by rebinding real device identities.
2. Test username creation with isolated admin and tenant/branch scoping; confirm permissions saved, login works, duplicate/invalid input rejected and no orphan auth accounts.
3. Implement status transition RPC in isolated Beta only after reviewing authoritative business permissions and permitted state graph; test unauthorized cross-tenant/branch, duplicate, changed payload, all delivery states.
4. Confirm site→POS delivery/pickup and printing, then take restorable snapshot and audit all FK descendants and offline replay receipts.
5. Obtain **separate final approval** before any operational test data removal and invoice counter restart.
