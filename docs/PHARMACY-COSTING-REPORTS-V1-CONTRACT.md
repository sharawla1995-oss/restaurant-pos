# Sharawla Pharmacy Costing & Reports V1 Contract

Status: DESIGN / READ-ONLY
Implementation: NOT STARTED
DB mutation: NONE
Runtime change: NONE

## 1. Critical costing finding

Current Pharmacy sale spans two stock layers:

1. shared Retail product stock;
2. Pharmacy batch stock.

Current Pharmacy POS sends order_items.cost from the general product cost.

Current pharmacy_order_batch_allocations stores:
- order_id
- product_id
- batch_id
- quantity

It does NOT store a sale-time batch cost snapshot.

Current pharmacy_batch_movements also does not store unit_cost.

Current pharmacy_receive_batch uses upsert on:
(branch_id, product_id, batch_no, expiry_date)

When the same batch key is received again, current owner:
- increases quantity;
- replaces batch.cost with the latest received cost.

Therefore joining a historical sale allocation to pharmacy_batches.cost later is NOT a reliable historical COGS source.

This must be fixed before Pharmacy profit/valuation reports are called closed.

## 2. Cost ownership decision

Pharmacy COGS must be derived from actual batch allocation cost, not arbitrary current product.cost.

For every sold batch allocation, persist:

- batch_id
- quantity
- unit_cost_snapshot
- cost_total_snapshot

Recommended additive fields on pharmacy_order_batch_allocations:
- unit_cost_snapshot numeric
- cost_total_snapshot numeric

These values are immutable after sale creation.

## 3. Same-batch re-receipt cost rule

Current behavior:
latest receipt replaces batch.cost.

Target V1 valuation behavior:
use weighted average cost for remaining quantity + new receipt when the same logical batch receives additional stock.

Conceptually:

new_avg =
(old_remaining_qty * old_avg_cost + received_qty * received_unit_cost)
/
(old_remaining_qty + received_qty)

Persist receipt movement cost evidence.

Recommended pharmacy_batch_movements additive fields:
- unit_cost_snapshot
- value_delta

For receive:
value_delta = received_qty * received_unit_cost.

For sale:
value_delta = -sold_qty * sale allocation unit_cost_snapshot.

For return:
value_delta = returned_qty * original sale allocation unit_cost_snapshot.

For adjustment/waste:
cost source must be explicit.

Do not infer historical movement value from current pharmacy_batches.cost.

## 4. Sale cost calculation

When Pharmacy sale allocates across batches:

Example:
Batch A:
2 units @ 10

Batch B:
1 unit @ 14

Sale quantity:
3

Sale COGS:
2*10 + 1*14 = 34

The order line may store:
- weighted line cost = 34 / 3

but authoritative Pharmacy COGS remains batch allocation snapshots.

If order_items.cost is preserved for shared generic reporting:
set it server-side from authoritative Pharmacy allocation cost, not client product cost.

The client must not be cost authority.

## 5. Return cost calculation

Pharmacy return must reverse original COGS using original sale allocation snapshot.

Do not:
- use current product cost;
- use current batch cost;
- choose a new batch cost.

Partial return allocation should reverse the original sold batch allocations deterministically.

If original sale used:
A 2 units @10
B 1 unit @14

and return 1 unit:
the return policy must define deterministic source allocation, e.g. reverse latest/explicit sold allocation or map exact units.

The policy must preserve value reconciliation.

## 6. Batch valuation

Current Pharmacy inventory value:

sum(
  pharmacy_batches.quantity
  * pharmacy_batches.cost
)

is valid only if pharmacy_batches.cost represents current average cost for remaining stock.

After target weighted-cost rule is implemented, this becomes a valid current valuation source.

Historical valuation requires movement/value snapshots or periodic snapshots.

## 7. Expired stock valuation

Report separately:

- valid stock value
- near-expiry stock value
- expired stock value
- inactive/quarantine stock value when such state exists

Expired stock remains an asset/stock quantity until disposal accounting is posted; do not silently exclude it from inventory reconciliation.

Operational sale availability and accounting valuation are different concepts.

## 8. Waste / expiry loss

When batch waste/disposal occurs:

Required:
- quantity
- unit cost at movement
- value loss
- reason
- employee
- branch
- batch
- expiry status
- timestamp

Report:
expiry/waste loss = sum(abs(value_delta)) for accepted disposal movement types.

Do not use current cost retroactively.

## 9. Pharmacy sales report

Show:
- orders
- gross sales
- discounts
- returns
- net merchandise revenue
- Pharmacy COGS
- gross profit
- gross margin
- patient payments
- insurer amount separately.

Group by:
- branch
- product
- active ingredient
- manufacturer
- prescription-required flag
- controlled flag where authorized
- order channel.

Sensitive controlled/patient details require dedicated permission.

## 10. Batch sales report

Show:
- batch number
- product
- expiry date
- sold quantity
- returned quantity
- net quantity
- unit cost snapshot
- COGS
- sale revenue
- gross profit.

Useful for:
- batch profitability
- recalls
- expiry analysis.

## 11. Expiry report

Buckets:
- expired
- 0-30 days
- 31-60
- 61-90
- >90

Show:
- branch
- product
- batch
- expiry
- quantity
- unit cost
- stock value
- sale price
- potential revenue
- supplier where known.

Do not use only row count.
Value/quantity matters.

## 12. Batch movement ledger

Source:
pharmacy_batch_movements

Future required fields:
- movement
- quantity_delta
- balance_after
- unit_cost_snapshot
- value_delta
- reference
- employee
- client_tx_id
- timestamp.

Filters:
- branch
- product
- batch
- movement type
- date
- employee.

## 13. Prescription report

Show:
- prescription
- customer/patient
- doctor
- date
- requested items/quantity
- dispensed items/quantity
- remaining
- substitute used
- order link
- status.

Metrics:
- open
- partial
- dispensed
- cancelled
- substitution rate.

Do not expose patient data to generic Reports permission only.

Suggested permission:
pharmacy.prescription_report.view.

## 14. Controlled-drug report

Only after controlled workflow exists.

Show:
- immutable dispense/return events
- patient/customer identifier according to policy
- prescriber
- product
- batch
- quantity
- order/return
- employee
- branch
- timestamp
- override/reason.

Permission:
pharmacy.controlled_report.view.

Audit/report retention follows configured jurisdiction/business policy.

## 15. Insurance report

Sources:
- pharmacy_insurance_claims
- pharmacy_insurance_claim_items
- order/payments.

Show:
- company
- plan
- claim
- order
- gross
- patient amount
- insurer amount
- status
- submitted date
- settled date
- item-level coverage.

Metrics:
- draft
- submitted
- approved
- rejected
- outstanding insurer receivable
- settled amount
- average settlement days.

Do not compute item metrics until claim items are populated reliably.

## 16. Insurer receivable

Insurer amount is not cash received at sale.

Financial model:

Patient payment:
cash/wallet/etc. collection.

Insurer amount:
receivable until settled.

Claim settlement:
reduces insurer receivable and records collection.

Do not count insurer amount as immediate cash in shift cash.

This must align with core accounting/treasury before Pharmacy financial closure.

## 17. Alternatives report

When pharmacy.alternatives is operational:

Show:
- prescribed/requested product
- substituted product
- quantity
- reason/notes
- pharmacist
- order
- prescription.

Metrics:
- substitution rate
- top substituted products.

## 18. Supplier / purchasing report

Pharmacy uses shared purchasing plus batch receipts.

Final Pharmacy purchasing report must link:
- Supplier
- PO/GRN
- Product
- Batch number
- Expiry
- Received quantity
- Cost
- Supplier return
- Remaining quantity/value.

Generic product receive without batch identity is not enough for batch-tracked Pharmacy products.

## 19. Return report

Show:
- return id
- original order
- product
- original batch allocation
- restored/quarantined batch
- quantity
- reversed COGS
- refund
- claim/prescription consequence.

Until Pharmacy return owner exists:
report is not closable.

## 20. Public/website prescription metrics

After public request path exists:

Show aggregate operational metrics:
- new requests
- reviewed
- converted
- rejected/cancelled
- pickup/delivery split
- response time.

Avoid exposing uploaded medical images in generic report exports.

## 21. Permissions

Suggested:
- reports.sales.view
- reports.cost.view
- reports.profit.view
- pharmacy.batch_report.view
- pharmacy.expiry.view
- pharmacy.prescription_report.view
- pharmacy.controlled_report.view
- pharmacy.claim.view_financial
- reports.export

Location scope:
branch-aware.

Business-wide insurer master reports can use explicit Business authority.

## 22. Report architecture

Use server-side report owners/read models.

Do not fetch unbounded Pharmacy tables into renderer for aggregation.

Requirements:
- date/branch filters server-side
- pagination
- same contract for screen/export
- deterministic totals
- currency precision
- sensitive-field redaction by permission.

## 23. Acceptance fixture

Need at least:
- two batch costs
- sale across batches
- partial return
- expired stock
- waste
- prescription partial/full
- substitute
- insurance claim
- claim settlement
- controlled fixture when capability ready.

Verify:
- movement value
- sale COGS
- return reversal
- current valuation
- report/export totals.

## 24. Closure prerequisites

Before Pharmacy Reports V1 can close:

1. Pharmacy batch cost snapshot implemented.
2. Same-batch receipt costing rule fixed.
3. Pharmacy return owner implemented.
4. Prescription line fulfillment implemented.
5. Claim items implemented.
6. insurer receivable/accounting semantics agreed.
7. controlled-drug workflow implemented for its report.
8. Action + Location enforcement.

## 25. Current state

Pharmacy Reports/Costing design:
CLOSED.

Historical Pharmacy COGS authority:
NOT RELIABLE with current allocation schema for batch-level historical costing.

Implementation:
NOT STARTED.

No DB/Runtime/Cloud mutation.
