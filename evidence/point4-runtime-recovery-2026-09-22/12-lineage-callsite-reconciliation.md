# Point 4 — Contract #12 Runtime Recovery Reconciliation

Status: RECONCILED FOR SOURCE IMPLEMENTATION
Contract: #12 `food_apply_return_consumption_v1(bigint,bigint,jsonb,text)`
Recovered runtime evidence: `evidence/point4-runtime-recovery-2026-09-22/12-food_apply_return_consumption_v1.sql`
Recovered MD5: `5e7cede708dcdf805a914f6ddc6dc3bb`

The immutable recovered runtime definition is the implementation baseline. Historical discovery is reconciliation evidence only; no recipe is recalculated for a return.

Recovered semantics and contract #12 agree:
- branch is resolved from the original order;
- advisory lock is keyed by return client transaction;
- `food_return_consumption_postings` is the whole-return replay boundary;
- affected ingredients come from historical `food_order_item_consumption_snapshots`, grouped by original order item and ingredient;
- return quantity is proportional to the original sold snapshot quantity;
- unit cost is the weighted historical snapshot cost;
- `restore_inventory` is true only when historical sale stock movement evidence exists for that original order item/ingredient;
- only positive restore quantities with `restore_inventory=true` are physical stock identities;
- return consumption snapshots are still written for positive restores even when stock is not restored;
- final posting preserves the original idempotency boundary.

Guard implementation invariant:
1. preserve validation, branch access, advisory lock and posting replay before ownership guarding;
2. freeze all positive historical return-consumption execution rows read-only, including order_item_id, ingredient_id, restore quantity, historical unit cost and restore_inventory;
3. derive the ownership set only from frozen rows where restore_inventory=true;
4. guard every distinct ingredient deterministically before the first `ingredient_stock` insert;
5. execute both stock restoration and return snapshots from the same frozen evidence;
6. do not query recipes, recipe lines, modifiers or removals; do not rediscover historical consumption/stock-movement provenance after the guard.

This reconciliation does not change the acceptance counter. #12 remains pending until all source gates pass.
