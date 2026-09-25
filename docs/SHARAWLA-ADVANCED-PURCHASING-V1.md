# Sharawla POS — Advanced Purchasing Engine V1 Foundation

## Status
Foundation implemented on isolated SH-0007 Beta operational backend only.
No Sharawla Production operational backend was modified.

Relevant capability catalog entries remain Planned and unassigned:
- `inventory.purchase_orders`
- `inventory.supplier_returns`
- `inventory.replenishment`
- `inventory.landed_cost`

Purchase approvals are intentionally NOT a separate capability. Approval is workflow behavior inside `inventory.purchase_orders`.

## Existing baseline preserved
Sharawla already had a working Retail purchasing chain:
Supplier -> Purchase Order -> Approval -> Partial/Full Goods Receipt -> Weighted Average Cost -> Supplier Return.

The V1 Advanced Purchasing foundation extends that chain instead of replacing it.

## Added foundations
### Supplier commercial terms
Extended `retail_suppliers` with:
- email / address
- payment terms days
- credit limit
- default lead time
- notes

### Internal Purchase Requests
New:
- `retail_purchase_requests`
- `retail_purchase_request_items`

Lifecycle:
Draft -> Submitted -> Approved/Rejected -> Converted to PO.

RPCs:
- `retail_purchase_request_create_v1`
- `retail_purchase_request_submit_v1`
- `retail_purchase_request_decide_v1`
- `retail_purchase_request_convert_to_po_v1`

### Purchase Order enrichment
Existing `retail_purchase_orders` extended with:
- PO number
- expected date/time
- source purchase request
- currency code

### Workflow / approval audit
New:
- `retail_purchase_approval_events`
- `retail_purchase_workflow_events`

### Supplier Invoice / Three-way Match foundation
New:
- `retail_supplier_invoices`
- `retail_supplier_invoice_items`
- `retail_supplier_invoice_match_v1`

The match read model compares:
Purchase Order vs Goods Receipt vs Supplier Invoice.

### Landed Cost foundation
New:
- `retail_landed_costs`
- `retail_landed_cost_allocations`

Supports allocation methods:
- value
- quantity
- manual

Posting landed cost into inventory average cost is intentionally a later acceptance gate.

### Replenishment foundation
New:
- `retail_reorder_rules`
- `retail_reorder_suggestions_v1`

Supports branch/product min stock, target stock, reorder quantity, supplier preference and lead time.

## Safety acceptance snapshot
Before migration on SH-0007 Beta:
- Purchase Orders: 1
- PO Items: 1
- Goods Receipts: 1
- GRN Items: 1
- Supplier Returns: 2
- Suppliers: 1

After migration:
- all six counts unchanged
- Purchase Requests: 0
- Supplier Invoices: 0
- Landed Costs: 0
- Reorder Rules: 0

Therefore the migration added schema/workflow foundations without mutating existing operational purchasing data.

## Not active yet
The following remain future gates before any capability becomes implemented/assignable:
1. Purchasing UI for PR/PO/GRN/Invoice workflow.
2. Multi-level approval policy configuration.
3. Supplier invoice write/post RPCs.
4. Three-way match exception approval UI.
5. Landed-cost allocation/posting into weighted average cost.
6. Replenishment rule editor and suggestion-to-request flow.
7. Variant-aware purchasing/receiving.
8. Batch/expiry-aware receiving where applicable.
9. Offline queue compatibility.
10. Backup/restore inclusion.
11. Purchase reporting pack and SH-0007 acceptance tests.

Until those gates pass, the new catalog capabilities must remain Planned and unassigned.