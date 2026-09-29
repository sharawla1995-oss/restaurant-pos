# Bon V3 Base Sale Owner Closure

Status: SOURCE OWNER REPLACEMENT / DEPLOYMENT 0 / ACTIVATION BLOCKED

Owner review on the RC branch established that Restaurant, Retail, Variant Retail and Food/Retail sale wrappers converge on `create_pos_order_atomic` for the durable order write. Food applies recipe consumption after the underlying sale; Retail/Variant wrappers delegate invoice/payment creation to the base owner.

Therefore Trusted Bon consumption belongs once in the base sale owner, immediately before its first `orders` insert. Duplicating consumption in wrappers would create unnecessary replay/concurrency surfaces.

The V3 replacement is derived from the accepted V1 sale-integration body and preserves its authentication, branch/employee/shift validation, item totals, promo locking/revalidation, payment validation, order/items/modifiers/payments writes, promo redemption, audit logging and idempotent sale replay.

For a sale with `bon_reservation`, the owner now requires the opaque trusted context and calls `pos_consume_sale_bon_v3`. Replay checks the V2 consumption ledger. It does not trust a request fingerprint and does not call Bon V1.

The owner checks branch ownership but deliberately does not force every reservation to equal the cashier shift. SHIFT versus BRANCH ownership is validated by the frozen reservation mode in Bon V3/V2. This is required for branch-wide Bon numbering.

Sales without `bon_reservation` retain the existing online numbering path.

No SQL is deployed by this commit.
