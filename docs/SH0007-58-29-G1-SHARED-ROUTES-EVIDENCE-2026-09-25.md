# SH-0007 — 10.5.4-beta.58.29 — G1 Shared Restaurant Routes Evidence

Date: 2026-09-25
Device: SH-0007
Branch: TEST
Profile: restaurant

## Manual route verification

### Suppliers
PASS

Observed:
- Suppliers page opened normally.
- Add Supplier action visible.
- Supplier columns are restaurant/shared supplier fields.
- No Retail SKU/Variant/product leakage visible.

### Purchasing
PASS

Observed:
- Page title: مشتريات الخامات والاستلام
- Purchase Order action visible.
- Workflow is ingredient/raw-material purchasing.
- No Retail Variant/SKU purchasing leakage visible.

### Stock Count
PASS

Observed:
- Page title: جرد الخامات
- Raw-material count columns include material, unit, system balance, actual count, variance.
- No Retail product/variant count leakage visible.

### Transfers
PASS

Observed:
- Page title: تحويلات الخامات
- Transfer action visible.
- Source -> destination workflow visible.
- No Retail product/variant transfer leakage visible.

## Gate decision

G1 — Shared Restaurant Routes:
PASS / CLOSED

The four shared routes use the Restaurant/Food presentation expected for the Restaurant profile.

## Next gate

G2 — Representative Touch Pass

Representative screens:
- POS
- Customers
- Orders
- Kitchen / Delivery
- Inventory Overview
- Settings

Touch acceptance:
- primary actions reachable;
- no hover-only critical action;
- large tap targets;
- scrollable tables/cards;
- dialogs usable on compact/touch display.

No Production system was touched.
