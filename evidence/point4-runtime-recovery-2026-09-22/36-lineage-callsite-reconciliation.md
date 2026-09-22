# Point 4 — Contract #36 Runtime Recovery Reconciliation

Status: RECONCILED FOR SOURCE IMPLEMENTATION
Contract: #36 `sharawla_acceptance_cleanup_v2(text)`
Recovered runtime evidence: `evidence/point4-runtime-recovery-2026-09-22/36-sharawla_acceptance_cleanup_v2.sql`
Recovered MD5: `7cfc62b59f6057a3efae6cdd9a70489f`

#36 is accepted independently from #35. Its immutable recovered body is the baseline.

Before cleanup it performs active-employee/run validation, retail zero-stock-drift validation, and a separate pharmacy batch-zero validation. It then freezes IDs for logistics, membership, service, purchasing and pharmacy records and preserves domain-specific child-before-parent cleanup ordering before generic returns/orders/expenses/inventory/receipts/customer cleanup and final `sharawla_acceptance_scan_v2`.

Point 4 addition only: after both zero-state gates and before the first cleanup DELETE, freeze distinct matching `branch_id + product_id` identities from acceptance `retail_inventory_movements`, guard all deterministically, then preserve the recovered cleanup sequence. Ownership must not be rediscovered after guarding.

This reconciliation does not change the acceptance counter.
