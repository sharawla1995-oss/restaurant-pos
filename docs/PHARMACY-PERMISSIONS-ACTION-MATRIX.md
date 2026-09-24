# Sharawla Pharmacy Permissions Action Matrix

Status: DESIGN / READ-ONLY
Implementation: NOT STARTED
DB mutation: NONE
Runtime change: NONE

## 1. Current finding

Current Action Permissions V2 catalog contains shared:
- customers
- delivery
- finance
- inventory
- purchasing
- reports

but contains no active pharmacy.* Action codes.

Pharmacy therefore needs an additive Pharmacy authority catalog before backend closure.

## 2. Pharmacy POS

### sales.create
Shared platform Action.

Owner:
create_pharmacy_pos_order_atomic

Location:
order branch.

Additional Pharmacy-specific checks remain independent:
- prescription;
- controlled drug;
- batch;
- insurance.

### returns.create
Shared platform Action.

Future owner:
create_pharmacy_order_return_idempotent_v1

Location:
original order branch.

## 3. Drug master

### pharmacy.product_details.manage
NEW

Owner:
pharmacy_upsert_product_details

Business-wide product master.

Controls:
- scientific name
- active ingredient
- dosage form
- strength
- manufacturer
- registration
- prescription_required
- controlled_drug
- batch tracking
- storage/reorder settings

### pharmacy.substitute.manage
NEW

Owner:
pharmacy_save_substitute

Business-wide drug-substitution master.

Feature prerequisite:
pharmacy.alternatives when the capability is commercially enforced.

## 4. Batch stock

### pharmacy.batch.receive
NEW

Owner:
pharmacy_receive_batch

Location:
target branch.

### pharmacy.batch.adjust
NEW

Owner:
pharmacy_adjust_batch with normal adjustment movement types

Location:
batch branch.

### pharmacy.batch.waste
NEW

Owner:
pharmacy_adjust_batch when movement_type=waste

Location:
batch branch.

Waste is separated from adjustment because risk/audit semantics differ.

### pharmacy.fefo.override
NEW / HIGH RISK

Only if strict backend FEFO becomes the accepted product rule.

Use:
allow selecting a later-valid batch while earlier valid stock exists.

Requirements:
- reason;
- audit;
- pharmacist/manager role template only by default.

## 5. Prescriptions

Feature:
pharmacy.prescriptions

### pharmacy.prescription.create
NEW

Owner:
pharmacy_create_prescription

Location:
prescription branch.

### pharmacy.prescription.edit
NEW

Future guarded owner required.

### pharmacy.prescription.dispense
NEW

Used by Pharmacy sale/fulfillment owner.

This does not replace sales.create.
Both may be required:
- sales.create
- pharmacy.prescription.dispense

### pharmacy.prescription.cancel
NEW

Future owner.

### pharmacy.web_rx.review
NEW

Owner:
review/convert website prescription request.

Location:
request branch.

### pharmacy.web_rx.convert
NEW

Owner:
convert public request to internal prescription/order context.

Location:
request branch.

## 6. Controlled drugs

Feature:
pharmacy.controlled_drugs

### pharmacy.controlled_dispense
NEW / HIGH RISK

Required in addition to:
- sales.create
- pharmacy.prescription.dispense when prescription is required.

Backend determines controlled_drug from trusted product master.

Client cannot self-declare ordinary drug.

### pharmacy.controlled_return
NEW / HIGH RISK

Only after controlled-drug return policy is defined.

Return permission does not automatically imply controlled-drug return.

### pharmacy.controlled_report.view
NEW / SENSITIVE READ

Used for controlled dispense/return audit report.

## 7. Insurance master

Feature:
pharmacy.insurance

### pharmacy.insurance_company.manage
NEW

Owner:
pharmacy_save_insurance_company

Business-wide.

### pharmacy.insurance_plan.manage
NEW

Owner:
pharmacy_save_insurance_plan

Business-wide.

## 8. Insurance claims

Feature:
pharmacy.claims

### pharmacy.claim.create
NEW

Normally invoked transactionally by Pharmacy sale owner.

User still requires underlying sales/insurance authority according to final owner contract.

### pharmacy.claim.submit
NEW

Transition:
draft -> submitted.

### pharmacy.claim.review
NEW

Transitions:
submitted -> approved / partially_approved / rejected

This can represent insurer/reviewer authority if handled inside Business workflow.

### pharmacy.claim.settle
NEW / FINANCIAL

Transition:
approved/partial -> settled

Should be manager/finance by default.

### pharmacy.claim.cancel
NEW

Allowed states must be explicit.

### pharmacy.claim.view_financial
NEW / SENSITIVE READ

For insurer/patient split and receivable reports.

## 9. Expiry

inventory.expiry is a Cloud capability, not an employee Action.

Suggested employee Actions:

### pharmacy.expiry.view
NEW

Read expiry dashboard.

### pharmacy.expiry.dispose
NEW

Maps to controlled waste/disposal owner.

Can reuse pharmacy.batch.waste if no separate disposal workflow exists.

## 10. Alternatives

Feature:
pharmacy.alternatives

### pharmacy.substitute.use
NEW

Needed only if POS substitution requires pharmacist authority.

If alternatives are informational only:
- view can follow Pharmacy Catalog page permission;
- management still uses pharmacy.substitute.manage.

## 11. Inventory / purchasing

Reuse shared Actions where semantics match:

- inventory.adjust only for shared product-level adjustments not Pharmacy batch-specific.
- purchasing.request.create
- purchasing.request.approve
- purchasing.po.create
- purchasing.po.approve
- purchasing.receive
- purchasing.supplier_return
- inventory transfer/count Actions from final platform matrix.

Important:
Pharmacy batch identity must be part of receiving/transfer semantics before shared generic owners can be considered Pharmacy-closed.

## 12. Customers

Reuse:
- customers.create

Add platform actions from Permissions V2:
- customers.edit
- customers.address.manage
- customers.import

Patient/customer is not automatically a medical record entitlement.

## 13. Delivery / Pickup

Reuse:
- delivery.mark_delivered
- delivery.payment.change_at_delivery
- delivery.settlement.view
- delivery.settlement.create

Add:
- orders.driver.assign
- delivery.drivers.manage
- delivery.zones.manage
- pickup.complete

Medicine compliance remains enforced regardless of channel.

## 14. Reports

Shared:
- reports.export

Add Pharmacy-sensitive reads:
- reports.sales.view
- reports.cost.view
- reports.profit.view
- pharmacy.batch_report.view
- pharmacy.expiry.view
- pharmacy.prescription_report.view
- pharmacy.controlled_report.view
- pharmacy.claim.view_financial

Location scope:
branch-limited where data belongs to branch.

Insurance company/plan master may be Business-wide.

## 15. Role templates

Templates are defaults only.

### Pharmacy Cashier
Suggested:
- sales.create
- customers.create
- ordinary returns only if business permits
- no batch adjustment
- no controlled dispense by default
- no claim settlement.

### Pharmacist
Suggested:
- sales.create
- pharmacy.prescription.dispense
- pharmacy.substitute.use
- pharmacy.batch read
- controlled dispense only if explicitly granted.

### Stock Clerk
Suggested:
- pharmacy.batch.receive
- pharmacy.batch.adjust
- pharmacy.batch.waste as policy allows
- inventory count/transfer
- purchasing receive.

### Insurance/Claims Clerk
Suggested:
- claim submit/review according to process
- no inventory adjustment
- no controlled dispense.

### Manager
May receive:
- FEFO override
- claim settlement
- batch waste
- controlled actions
- profit/financial reports

but all remain explicit.

### Admin
Current Admin Action semantics preserved.

Trusted Profile=pharmacy still applies.

## 16. Backend composition

Pharmacy employee mutation owner must eventually require:

trusted Profile=pharmacy
AND
Action permission
AND
Location scope when applicable
AND
feature entitlement/capability when optional
AND
domain invariants

Examples:

Ordinary sale:
Profile pharmacy
+ sales.create
+ branch
+ valid batch.

Prescription medicine:
above
+ pharmacy.prescription.dispense.

Controlled:
above
+ pharmacy.controlled_dispense.

Insurance claim settlement:
Profile pharmacy
+ pharmacy.claim.settle
+ branch/Business scope
+ legal status transition.

## 17. Public website separation

Public Pharmacy website request submission is not an employee Action.

Use a separate public owner.

Employee review/convert uses:
- pharmacy.web_rx.review
- pharmacy.web_rx.convert.

Do not expose staff RPCs anonymously.

## 18. Acceptance

Representative tests:

- wrong Profile -> PROFILE_MISMATCH
- Action denied -> ACTION_DENIED
- Location denied -> LOCATION_DENIED
- Feature not entitled -> FEATURE_DENIED where applicable
- direct RPC cannot bypass
- direct REST cannot bypass
- Admin remains Profile-bound
- high-risk transitions audit actor/reason.

## 19. Current state

Pharmacy Action Matrix:
DESIGN CLOSED.

Current active pharmacy.* Action rows:
0.

New Action rows:
NOT CREATED.

Backend wiring:
NOT STARTED.

No DB/Runtime/Cloud mutation.
