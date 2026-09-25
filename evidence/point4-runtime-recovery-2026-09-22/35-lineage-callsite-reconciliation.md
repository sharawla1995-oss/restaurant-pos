# Point 4 — Contract #35 Runtime Recovery Reconciliation

Status: RECONCILED FOR SOURCE IMPLEMENTATION
Contract: #35 `sharawla_acceptance_cleanup_v1(text)`
Recovered runtime evidence: `evidence/point4-runtime-recovery-2026-09-22/35-sharawla_acceptance_cleanup_v1.sql`
Recovered MD5: `d7068d4e1d6a3124fb3d3b4946882ed1`

The immutable recovered runtime definition is the implementation baseline.

Recovered semantics match the contract boundary:
- authenticated active employee and run-id validation happen first;
- stock drift is computed from matching `retail_inventory_movements`, grouped by branch/product, and cleanup fails if any net drift remains;
- cleanup IDs are collected only after the zero-drift gate;
- cleanup preserves the recovered child-before-parent delete ordering;
- matching `retail_inventory_movements` are deleted only after returns/orders/expenses cleanup;
- customer deletion retains all recovered cross-domain reachability checks;
- `sharawla_acceptance_scan_v1` remains the final post-cleanup scan.

Point 4 addition only:
1. after validation and zero-stock-drift success, freeze the distinct matching `branch_id + product_id` ownership identities from `retail_inventory_movements`;
2. guard every frozen identity deterministically before the first cleanup DELETE;
3. execute the original cleanup ordering without rediscovering the ownership set.

No historical full-body discovery is required. This reconciliation does not change the acceptance counter.
