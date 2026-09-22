# Point 4 — Contract #11 Runtime Recovery Reconciliation

Status: RECONCILED FOR SOURCE IMPLEMENTATION
Contract: #11 `food_apply_order_consumption_v1(jsonb,jsonb)`
Recovered runtime evidence: `evidence/point4-runtime-recovery-2026-09-22/11-food_apply_order_consumption_v1.sql`
Recovered MD5: `9746c5e4627869e093caf71bc2449251`

## Runtime baseline
The immutable recovered `pg_get_functiondef` is the implementation baseline. Historical Git evidence is reconciliation evidence only and is not used to reconstruct or replace the recovered body.

## Historical reconciliation
- `839a1e48a80ee4a055f8056191f1023be133c697` — Recipe Basic atomic runtime foundation.
- `50a0ca0bd71593aea2e05eae65109d61d5ab84a5` — Beta42 preserves costing/snapshots for untracked recipe ingredients without stock movements.
- `6f7cb8a68f49bade32725e797ca25a0c1de4eb41` — dynamic runtime patch explicitly targets `public.food_apply_order_consumption_v1(jsonb,jsonb)`, requires the per-order-item cost-snapshot idempotency anchor, and removes the whole-result duplicate early return so existing Retail/Variant orders can receive missing Recipe posting.
- Current default-branch code search does not expose another tracked full definition of the helper. This is not a blocker because the recovered runtime body is frozen and integrity-verified.

No contradictory evidence was found in these identified lineage anchors.

## Contract reconciliation
Recovered behavior matches contract #11:
- branch comes from the saved order;
- input/saved lines are paired by ordinality;
- invalid/non-positive lines are skipped;
- `food_order_item_cost_snapshots(order_item_id)` is the per-item replay boundary;
- active sale recipe is selected product/variant-aware;
- base recipe lines apply removal mappings before consumption;
- modifier impacts are selected from submitted modifiers;
- untracked ingredients still produce consumption/cost evidence but do not touch `ingredient_stock`;
- tracked positive needs are the physical stock-affecting identities;
- cost and consumption snapshots remain part of historical semantics.

## Guard implementation invariant
The guarded source must preserve the recovered semantics. Before the first new-execution `ingredient_stock` insert it must:
1. perform replay classification and all read-only recipe/modifier/removal resolution;
2. freeze the complete actually-affected execution evidence, not merely ingredient IDs;
3. derive distinct tracked ingredient ownership identities from that frozen evidence;
4. call `inventory_stock_assert_legacy_write_allowed_v2` for every distinct tracked ingredient in deterministic order;
5. execute stock changes and snapshots from the same frozen evidence, with no post-guard recipe/modifier/removal rediscovery.

The immutable recovered SQL must never be edited. Guarded SQL belongs in a separate implementation file.

This reconciliation does not change the acceptance counter. #11 remains pending until semantic gate, PostgreSQL 16 CREATE, effective definition read-back, and final source comparison all PASS.
