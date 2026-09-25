Sharawla POS 10.5.4-beta.16 — Retail Suppliers & Purchasing Foundation

Retail-only foundation built on the validated beta.15 inventory ledger.

Includes:
- Suppliers
- Purchase Orders (Draft -> Approved -> Partially Received -> Received)
- GRN receiving restricted to PO lines and remaining quantities
- Atomic inventory increase on GRN
- Last purchase cost + weighted-average cost per branch/product
- Supplier returns with inventory deduction
- Purchasing UI and supplier UI

Safety:
- Restaurant Engine is unchanged.
- Licensing, Canonical Fingerprint, Business Connection, updater safety and preload/main runtime are unchanged.
- Existing beta.15 sale/return inventory path is preserved.
- Apply beta.16 SQL only to isolated Beta backend before runtime test.
