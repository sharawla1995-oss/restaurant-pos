Sharawla POS V10.5.4-beta.14 — Retail Checkout + Barcode MVP

Scope
- Enables page `pos` for POS Profile `retail`.
- Adds a Retail-only checkout renderer; Restaurant renderPOS remains the fallback path and its existing markup/logic is preserved after the Retail guard.
- Barcode scanner workflow: exact match against products.barcode, Enter adds one unit, repeated scans increment quantity.
- Product lookup by name or barcode and clickable Retail product cards.
- Reuses the existing branch price override, shift requirement, payment methods, discounts/tax/service calculation, atomic checkout, local-first offline sale queue and receipt pipeline.
- Barcode UI is gated by the `barcode` module.

Intentionally not included yet
- Retail stock decrement / inventory ledger semantics.
- Retail-specific returns semantics.
- Supplier/purchases/advanced inventory.
- Restaurant delivery/kitchen/tables/website behavior in Retail.

Protected areas not changed by this phase
- main.js / preload.js update safety and installer flow.
- Canonical Fingerprint / license verification / Business Connection / Runtime Config contracts.
- Restaurant Engine file and Sharawla Runtime Core file.

Runtime acceptance
1. SH-0007 on Beta business profile=retail opens normally.
2. Retail home exposes نقطة البيع / الكاشير.
3. Opening POS shows Retail checkout (no delivery/order-type restaurant controls).
4. A product with barcode can be scanned; Enter adds it; repeated scan increments quantity.
5. Sale requires open shift and can complete with configured payment method.
6. Restart stays retail without reactivation.
7. Switch Beta business temporarily back to restaurant and confirm Restaurant checkout is unchanged.
