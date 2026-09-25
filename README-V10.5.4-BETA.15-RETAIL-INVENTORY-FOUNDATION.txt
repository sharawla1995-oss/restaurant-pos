Sharawla POS V10.5.4-beta.15 — Retail Inventory Foundation

Scope:
- Retail-only inventory balances per branch/product using NUMERIC(14,3).
- Immutable movement ledger for opening, sale, return, adjustment and waste; future-safe movement types for purchasing/transfers.
- Retail checkout routes through create_retail_pos_order_atomic, wrapping the proven create_pos_order_atomic inside the same DB transaction.
- Retail returns route through create_retail_order_return_idempotent, wrapping the existing idempotent return flow and restocking atomically.
- Offline sale/return jobs persist engine=retail and use the Retail RPC when syncing.
- Retail return quantities support 0.001 precision; Restaurant behavior remains integer in the current UI.
- Retail inventory UI: balances, opening stock, adjustments, waste, low-stock thresholds, tracking toggle, negative-stock policy, latest movement ledger.

Safety:
- Restaurant create_pos_order_atomic and create_order_return_idempotent are NOT replaced.
- main.js, preload.js, update-ui.js, update-indicators.css remain unchanged from beta.14.
- No licensing, Canonical Fingerprint, Business Connection or Update Safety behavior changed.
- SQL migration is Beta operational-backend only and must be run before Retail beta.15 inventory tests.
