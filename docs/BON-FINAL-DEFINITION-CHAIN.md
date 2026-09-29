# Bon Final Definition Chain

Status: SOURCE + CI ONLY. No database deployment.

The final Bon SQL chain is intentionally ordered as:

1. Bon Numbering Policy V1
2. Online numbering migration (safe before V2 exists)
3. Bon Reservation V2
4. Trusted Device Context + Bon V3
5. Internal V3 sale-consumption helper
6. Final create_pos_order_atomic owner

The CI gate verifies every expected function has exactly one definition inside this deployment chain, dependencies appear before consumers, the final sale owner is the V3-aware owner, and the direct V2/V3 consumption bypasses remain closed.

Historical SQL files are not part of this deployment chain and must not be replayed after these RC1 artifacts.

This gate is source-order validation only; it does not assert live Beta schema compatibility and performs zero database writes.
