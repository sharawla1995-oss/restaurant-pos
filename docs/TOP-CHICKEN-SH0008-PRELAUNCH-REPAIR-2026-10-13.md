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
