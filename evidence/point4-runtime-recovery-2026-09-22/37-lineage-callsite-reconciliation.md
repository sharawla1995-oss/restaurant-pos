# Point 4 — Contract #37 Runtime Recovery Reconciliation

Status: RECONCILED FOR SOURCE IMPLEMENTATION
Contract: #37 `sharawla_acceptance_cleanup_v3(text)`
Recovered runtime evidence: `evidence/point4-runtime-recovery-2026-09-22/37-sharawla_acceptance_cleanup_v3.sql`
Recovered MD5: `ca7846b9e2e6fa3593b7bcacdb4f4111`

#37 is accepted independently from #35/#36. The immutable recovered V3 body is the baseline.

V3 preserves active-employee/run validation, retail zero-stock-drift and pharmacy batch-zero gates. Its cleanup graph extends V2 purchasing cleanup with separately frozen GRN and supplier-return IDs plus supplier-return items and purchase workflow events. Logistics, membership, service, pharmacy, purchasing, generic orders/returns/expenses/inventory/receipts/customer cleanup ordering and final `sharawla_acceptance_scan_v3` are baseline semantics.

Point 4 addition only: after both zero-state gates, freeze distinct matching acceptance `branch_id + product_id` identities from `retail_inventory_movements`, guard all deterministically before the first cleanup DELETE, then preserve V3 cleanup without ownership rediscovery.

This reconciliation does not change the acceptance counter.
