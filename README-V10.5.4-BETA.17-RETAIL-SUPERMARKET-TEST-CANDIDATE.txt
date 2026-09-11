Sharawla POS V10.5.4-beta.17 — Retail / Supermarket Market Test Candidate

Built on beta.16.
Adds isolated Retail-only supermarket core without changing Restaurant Engine or update/licensing runtime:
- Units + decimal quantities
- EAN-13 embedded weight/price barcode (configurable Prefix + PLU + divisor)
- Hold / Resume suspended sales
- Retail Offers Engine: percent, fixed, buy X get Y, second half price
- Stock Count posting to the existing Retail Inventory Ledger
- Inter-branch stock transfers with send/receive ledger movements
- Website-ready Retail catalog and stock reservation RPCs
- Existing suppliers / PO / GRN / weighted-average cost / supplier returns retained

The actual standalone website front-end is a separate artifact; beta.17 provides the Retail backend/API contract and exposes Website Management in the Retail engine.
Run supabase-v10-5-4-beta17-retail-market-core.sql on the isolated Beta operational backend before runtime acceptance.
