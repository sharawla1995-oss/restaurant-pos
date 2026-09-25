TOP BURGER POS V10.4.6 — FULL STATIC AUDIT
Date: 2026-09-08

Reviewed: POS/web shared frontend, Electron desktop bridge, printing, orders, order details, returns,
financial calculations, expenses, shifts, branch settings, branch product overrides, delivery zones,
website-order backend integration, offline queue, update/build files, Supabase migrations.

FIXES APPLIED IN THIS AUDITED SOURCE
1) Restored order-details flow (openOrderDetails) that regressed in V10.4.5.
2) Direct/Silent Electron print improved; browser/mobile fallback retained.
3) Fixed create_pos_order_atomic SQL column/value mismatch by adding client_tx_id to the INSERT column list.
4) Fixed return totals for tax-inclusive branches: embedded tax is no longer added a second time.
5) Added returns_allow_closed_shifts to persisted/reloaded app settings.
6) POS now loads branch_products and applies per-branch availability and price_override.
7) POS now enforces branch discount_mode (both / amount / percent).
8) Delivery-zone fee is applied when a zone/address is selected; admin zone add/edit supports fee.
9) Accepted website pickup orders remain visible and can be completed, so they do not silently block shift close.
10) Removed duplicate returnReceiptHTML / printReturnReceipt / renderUsers function definitions.
11) Shift metrics/report now totals all payment methods dynamically (including Visa/custom methods), while cash drawer reconciliation still uses cash only.

ACCOUNTING FORMULAS VERIFIED
Order total = subtotal - discounts - promo + tax (only when prices are tax-exclusive) + service + delivery fee.
Net sales in reports = non-cancelled order totals - return totals.
Net after expenses = net sales - expenses.
Expected cash drawer = opening cash + net cash collections - expenses.
Returns reduce payment-method totals using return_payments.

IMPORTANT LIMITS / ITEMS THAT REQUIRE LIVE OR WEBSITE-SOURCE TESTING
- This archive contains the POS/shared frontend and Supabase integration, but not the separate public customer website frontend source. Backend integration can be audited here; the public site's UI/request payload cannot be fully certified without its source.
- create_website_order in the included SQL stores delivery_fee=0. If the public website is expected to calculate delivery-zone fees, its source/API contract must be reviewed before changing this safely.
- Supabase functions validate transaction structure, payment sum, shift/branch/employee, item subtotals, promo redemption and idempotency, but some financial totals are supplied by the client. Full server-side repricing would be an additional hardening layer.
- Driver settlement currently settles delivered cash order totals. Whether cash refunds/returns should reduce what a driver owes is a business-rule decision and should be confirmed before changing it.
- Static audit and syntax checks cannot replace one connected end-to-end test on Supabase + Windows printer + phone/browser before production rollout.

SYNTAX CHECKS
node --check app.js : PASS
node --check main.js : PASS
node --check preload.js : PASS
