# Sharawla POS — Recipe Advanced V1 Foundation

## Status
Foundation implemented on the isolated SH-0007 Beta operational backend only.
No production operational backend was modified.

Sharawla Cloud capabilities remain Planned and unassigned:
- `food.prep`
- `food.production`
- `food.waste`
- `food.costing`

This foundation builds on Recipe Basic V1 and does not activate checkout stock deduction.

## Ingredient costing and yield
Existing `ingredients` is extended with:
- usable_yield_percent
- shelf_life_minutes

Existing `ingredient_stock` is extended with:
- average_unit_cost
- last_purchase_cost
- last_costed_at

`usable_yield_percent` allows cost to reflect trimming/processing loss while preserving purchase cost per raw base unit.

## Prep Items
New `food_prep_items`.

Design rule:
Every Prep Item produces exactly one existing Ingredient row.
This means a semi-finished item such as Top Burger Sauce uses the same ingredient stock model as purchased ingredients and can be consumed by another recipe without duplicate inventory ledgers.

Recipe headers now support a Prep Item target for `recipe_kind='prep'`.

## Production
New:
- `food_production_batches`
- `food_production_consumptions`

Captures:
- branch
- Prep Item
- active recipe version
- planned output
- actual output
- planned vs actual ingredient consumption
- unit-cost snapshot
- batch status
- operator/timestamps

Read model:
- `food_production_variance_v1`

It exposes output yield %, planned input cost, actual input cost and actual cost per output unit.

Important: completing a production batch does NOT post stock yet. Atomic input deduction/output addition is a later acceptance gate.

## Waste
New:
- `food_waste_reasons`
- `food_waste_events`

Reference reasons seeded:
- spoilage
- expiry
- prep_loss
- overproduction
- damage

Waste documents support Draft / Posted / Cancelled. At foundation stage, even a Posted row is only a document; stock posting RPC is not connected yet.

Read model:
- `food_waste_summary_v1`

## Historical Food Cost and Theoretical Usage
New immutable snapshot foundations:
- `food_order_item_consumption_snapshots`
- `food_order_item_cost_snapshots`

These are intentionally empty until checkout integration.
They will preserve the recipe version, ingredient quantities and cost at sale time so later price or recipe changes cannot rewrite historical profitability.

Read model:
- `food_theoretical_consumption_v1`

## Branch-level Recipe Cost
Read model:
- `food_recipe_branch_cost_v1`

Cost source priority:
1. branch ingredient weighted-average cost when available
2. legacy ingredient cost_per_unit fallback

Usable yield is applied to derive effective usable cost.

## Safety acceptance snapshot
After all four shared-engine foundations on SH-0007 Beta:
- Orders: 18
- Order Items: 22
- Retail inventory balances: 3
- Retail inventory movements: 28
- Purchase Orders: 1
- Goods Receipts: 1
- Ingredients: 0
- Ingredient Stock: 0
- Recipe Headers: 0
- Recipe Versions: 0
- Prep Items: 0
- Production Batches: 0
- Production Consumptions: 0
- Waste Events: 0
- Waste Reasons: 5 reference rows
- Sale consumption snapshots: 0
- Sale cost snapshots: 0

Sharawla Cloud runtime remained unchanged:
- SH-0005: 30 effective features, app 10.5.3
- SH-0006: 30 effective features, app 10.5.3
- SH-0007: 29 effective features, app 10.5.4-beta.35

## Gates before Advanced Recipes can become operational
1. Secured Prep/Production/Waste write RPCs.
2. Atomic production completion: deduct actual inputs + add output stock.
3. Idempotent waste posting/reversal.
4. Weighted-average ingredient purchasing integration.
5. Atomic checkout recipe resolver and ingredient deduction.
6. Return/reversal policy using original sale snapshots.
7. Offline queue and conflict-safe idempotency.
8. Recipe/Prep/Production/Waste POS UI.
9. Backup/restore coverage.
10. Food Cost / theoretical-vs-actual / waste / yield report packs.
11. SH-0007 full acceptance.

Until these gates pass, all Advanced Recipe capabilities remain Planned and unassigned.