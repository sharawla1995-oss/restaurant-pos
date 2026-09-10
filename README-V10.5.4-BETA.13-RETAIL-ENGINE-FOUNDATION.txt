Sharawla POS V10.5.4-beta.13 — Retail Engine Foundation

Scope
- Add retail-engine.js as a second profile engine beside Restaurant.
- Keep Restaurant as explicit bootstrap compatibility default.
- Runtime Config still chooses the exact engine by pos_profile.
- Retail Phase 1 exposes only a safe shell: Home, Customers, Shifts, Inventory, Expenses, Products, Reports, Users, Settings.
- Cashier, Orders, Returns, Delivery, Kitchen, Tables and Website operational flows are intentionally NOT exposed by Retail Phase 1.
- No changes to Retail transaction semantics yet.

Protected behavior
- No change to licensing RPC contracts.
- No change to Canonical Fingerprint.
- No change to Business Connection flow.
- No change to updater Gate A/B/C, SHA-256, backup, health, LKG or rollback.
- No change to Restaurant operational page rules beyond bootstrapDefault metadata.
- No app.js sales/delivery/payment/printing logic change.

Next runtime gate
1. Build/install only on Beta device.
2. Use a Retail test Business/Profile and enabled modules.
3. Confirm Runtime Config selects retail.
4. Confirm Restaurant-only pages are hidden.
5. Confirm Restaurant regression separately before advancing to Retail checkout.
