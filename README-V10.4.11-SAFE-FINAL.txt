Top Burger POS V10.4.11 — SAFE FINAL

Based directly on V10.4.10.

Changes only:
1) Direct print no longer opens the saved-receipt preview when every enabled receipt is already configured for auto print. Manual/reprint remains available from order details.
2) All 58/80mm printed output now uses bold text, including shift reports and reports.
3) Windows auto update now exposes real download progress, Windows taskbar progress, visible error state, and a clear installing state.
4) Old SQL migrations were moved to legacy-sql. Do not run them on a current database.
5) supabase-v10-4-11-SAFE-WEBSITE-INTEGRATION.sql is the only current SQL patch in the root. It explicitly preserves website pickup -> pickup and retains phone tracking/cancel rules.
6) Delivery screen label changed to "متابعة الطلبات" because it also contains website pickup.

No changes intended to: sales calculations, returns calculations, reports logic, offline queue/sync, backups, customers/import, promos, product pricing/modifiers, permissions, or website order status workflow.

Windows compatibility remains Electron 22.3.27 / electron-builder 22.10.5 / x64.
