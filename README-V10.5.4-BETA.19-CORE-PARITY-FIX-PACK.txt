Sharawla POS V10.5.4-beta.19 — Core Parity Fix Pack

STATUS: WORK IN PROGRESS — Beta only. Production/Stable 10.5.3 must not be touched.
BASE: v10.5.4-beta.18

Architecture rule
=================
Every capability must be classified before implementation:
1) SHARAWLA CORE — shared platform behavior.
2) SHARED MODULE — optional module behavior (Website, Inventory, Delivery, etc.).
3) PROFILE-SPECIFIC — Restaurant/Retail/Shipping/etc. behavior.

Confirmed beta.19 parity work
=============================
[ ] Retail Orders / Invoices page: expose shared sales-document UI without Restaurant-only actions.
[ ] Order Details: customer receipt/reprint is Core; preparation receipt remains Restaurant-only.
[ ] Retail Returns: support decimal/weight quantities using product/profile quantity policy; no Math.floor/step=1 assumption.
[ ] Shift Close: move Restaurant pending-delivery checks behind profile-aware behavior.
[ ] Website Notifications: shared Website notification framework; profile chooses source and destination page.
[ ] Retail Website Reject: replace browser prompt() with Sharawla internal modal; keep same reject RPC.
[ ] Reports: profile-driven order/status filters instead of Restaurant-only fixed values.
[ ] Payments: one supported payment-method contract across POS, Website and Returns.
[ ] Retail Offline Sale/Return: regression-protect existing engine dispatch to retail atomic RPCs.

Already verified
================
PASS: Retail offline sale jobs are tagged engine=retail and sync through create_retail_pos_order_atomic.
PASS: Retail offline return jobs sync through create_retail_order_return_idempotent.
PASS: Online Retail checkout uses create_retail_pos_order_atomic.

Regression gates
================
- Restaurant behavior must remain unchanged unless a Core extraction is explicitly backward-compatible.
- Licensing / Canonical Fingerprint / Business Connection / Runtime Core contracts protected.
- Update / Backup / Rollback protected.
- Direct Printing and Offline/Sync protected.
- Windows x64/ia32 support protected.
- Stable /releases/latest must remain v10.5.3 while beta.19 is prerelease.

Runtime acceptance required before closing beta.19
==================================================
- Restaurant regression.
- Retail cash + mixed payment sale.
- Retail decimal/weight sale and partial return.
- Offline Retail sale -> reconnect -> inventory deduction exactly once.
- Offline Retail return -> reconnect -> inventory restoration exactly once.
- Website new-order notification + dedupe.
- Website accept and reject + reservation release/consume.
- Orders/Invoices details + customer receipt reprint.
- Shift close and reports under Retail profile.
