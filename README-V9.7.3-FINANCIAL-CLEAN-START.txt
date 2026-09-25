Top Burger POS V9.7.3 - Financial Clean Start

Changes
1) New POS sales created by create_pos_order_atomic are recorded with payment_status = confirmed because POS payment is collected at checkout.
2) Financial reports now subtract returns from net sales.
3) Refund payment rows are subtracted from payment-method totals.
4) Product sales in reports are shown net of returned quantities/values.
5) Shift product report is net of return items.
6) Report payment filters/KPIs use the branch payment methods dynamically instead of only hard-coded Cash/Wallet/InstaPay.
7) Closed-shift stored zero values are preserved correctly.
8) Uncollected website payments no longer inflate payment-method/cash-drawer totals. Website cash is treated as collected when the order is delivered/completed (or payment is explicitly confirmed).
9) A shift cannot close while a website pickup/takeaway order is still pending, just like pending delivery orders.

Install
- Upload/deploy this folder as the POS.
- Run supabase-v9-7-3-financial-clean-start.sql once in Supabase SQL Editor.
- This SQL is safe to re-run.

Clean-start note
- No backfill of old invoices is included. This version is designed for the planned clean start after test data is reset.
- Do NOT reset catalog, branches, users, settings, promo configuration, or payment methods unless intentionally desired.

Recommended acceptance test before live use
A. Open a shift with 500 opening cash.
B. Cash sale 100 -> payment_status confirmed; expected cash 600.
C. Mixed sale 200 (100 cash + 100 wallet) -> expected cash 700; wallet 100.
D. Return 50 cash -> net sales and cash both drop by 50; expected cash 650.
E. Add expense 20 -> expected cash 630.
F. Close shift with 630 -> difference 0.
G. Verify the financial report shows the same net sales, refunds, payment totals and expenses.
