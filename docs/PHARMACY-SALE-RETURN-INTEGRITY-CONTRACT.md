# Sharawla Pharmacy Sale / Return / Prescription / Insurance Integrity Contract

Status: DESIGN / READ-ONLY / DOCUMENTATION ONLY
Implementation: NOT STARTED
DB mutation: NONE
Runtime change: NONE
Production impact: NONE

Purpose:
close the integrity gaps around Pharmacy sale, return, batch stock, prescriptions, controlled-drug handling and insurance before Pharmacy can be called commercially closed.

---

## 1. Current confirmed owner

Current Pharmacy sale owner:

create_pharmacy_pos_order_atomic(
  p_order jsonb,
  p_items jsonb,
  p_payments jsonb,
  p_batch_allocations jsonb,
  p_prescription_id bigint,
  p_insurance jsonb
)

Current behavior:
- requires auth.uid();
- checks branch access;
- validates batch branch/product/active/expiry/quantity;
- validates total batch allocation quantity for tracked products;
- applies Point4 legacy product-stock guard;
- calls create_retail_pos_order_atomic;
- deducts Pharmacy batch quantities;
- writes pharmacy_order_batch_allocations;
- writes pharmacy_batch_movements;
- may mark prescription header dispensed;
- may create insurance claim header.

Current create_pos_order_atomic return includes:
- order
- items

The returned items contain real order_item ids.

This gives Pharmacy a clean in-transaction point to bind batch allocations to exact sale lines.

---

## 2. Critical current gaps

Confirmed:

- no Pharmacy-specific return owner exists;
- generic Pharmacy return currently falls to create_order_return_idempotent;
- generic return does not restore pharmacy_batches;
- no Pharmacy trigger repairs this later;
- pharmacy_order_batch_allocations currently stores order_id/product_id/batch_id/quantity but not order_item_id;
- prescription-required check is currently UI-only;
- prescription line fulfillment is not recorded;
- prescription header may be marked fully dispensed without line reconciliation;
- FEFO is a UI allocation strategy, not a backend invariant;
- controlled_drug flag is not enforced by the sale owner;
- insurance claim header can be created without claim items;
- insurance split is accepted from client input instead of derived authoritatively from plan rules;
- Pharmacy sale is currently Online-only;
- Pharmacy sale client_tx_id is not yet on the final canonical Point4 UUID-v4 envelope.

Until these are closed, Pharmacy sale/return/compliance is OPEN.

---

## 3. Exact sale-line to batch identity

### Current problem

Batch allocation is currently keyed only by:
- order_id
- product_id
- batch_id

That is insufficient when:
- the same product appears on multiple order lines;
- one line is partially returned;
- line-level prescription/insurance evidence is needed.

### Required additive fields

Extend pharmacy_order_batch_allocations with at least:

- order_item_id bigint NOT NULL
- source_line_uid text NULL initially
- allocated_quantity numeric NOT NULL
- returned_quantity numeric NOT NULL default 0

Existing quantity may be retained/migrated as allocated_quantity if compatibility requires.

Recommended uniqueness:
- order_item_id
- batch_id
- optional source_line_uid/effect identity according to final Point4 contract

### Sale payload

Each p_item should have stable canonical line identity.

Each batch allocation should identify the corresponding sale line, preferably by:
- line_uid

The Pharmacy owner maps input line_uid/index to the returned real order_item id from:
v_result.items

Then inserts allocation with:
- order_id
- order_item_id
- product_id
- batch_id
- allocated_quantity
- source_line_uid

Do not infer allocation by product_id after the sale.

---

## 4. Canonical transaction identity

Pharmacy sale must adopt the same identity discipline as hardened Point4 flows:

- client_tx_id = UUID v4
- document_uid = UUID v4
- source_document_id = uuid:<document_uid>
- line_uid = UUID v4 per sale line
- stable effect_line_key where required
- retry reuses the exact same payload/identity

Do not use:
- timestamp-based PH-... identifiers;
- Math.random;
- regenerated IDs on retry.

The Pharmacy batch movement layer must preserve/refer to the same transaction identity.

---

## 5. Backend prescription-required enforcement

The Pharmacy sale owner, not the renderer, is authoritative.

For each sold product:

1. read pharmacy_product_details;
2. if prescription_required=false:
   - no prescription required by this rule.
3. if prescription_required=true:
   - p_prescription_id is required;
   - prescription must exist;
   - prescription must belong to the target branch;
   - prescription must be in an allowed open/partially-dispensed state;
   - sold product must match an eligible prescription line or an explicitly authorized substitute;
   - requested/dispensed quantity must not exceed remaining prescription quantity.

Direct RPC cannot bypass this.

---

## 6. Prescription fulfillment ledger

Do not mark the header "dispensed" merely because a prescription id was passed.

Introduce an immutable fulfillment table conceptually:

pharmacy_prescription_dispense_lines

Fields:
- id
- prescription_id
- prescription_item_id
- order_id
- order_item_id
- requested_product_id nullable
- dispensed_product_id
- substitute_relation_id nullable
- quantity
- employee_id
- branch_id
- client_tx_id
- created_at

Derive remaining quantity from:
prescription item quantity
minus
sum(valid dispense quantities)

Header state is derived:
- open
- partially_dispensed
- dispensed

Cancellation/return must create compensating evidence rather than deleting fulfillment history.

---

## 7. Substitution / alternatives

If the sold product differs from the prescription item:

Require:
- active pharmacy_substitutes relation OR explicit authorized override policy;
- pharmacist-level Action where configured;
- record original requested product/name;
- record dispensed substitute;
- record reason/notes where policy requires.

Suggested Action:
- pharmacy.substitute.use

Existing configuration Action:
- pharmacy.substitute.manage

Do not silently treat any same-ingredient product as equivalent unless the configured pharmacy policy says so.

---

## 8. FEFO backend invariant

Current UI sorts valid batches by earliest expiry.

Final default rule:

For tracked-batch products, backend validates allocation against FEFO:
- active batch only;
- unexpired batch only;
- earliest expiry first;
- consume earliest valid stock until requested quantity is fulfilled;
- deterministic tie break by received_at/id.

If caller allocation skips an earlier valid batch:
- reject by default.

Override:

Action:
- pharmacy.fefo.override

Requirements:
- explicit reason;
- employee id;
- selected batches;
- available earlier batches;
- timestamp;
- immutable audit.

FEFO override never permits:
- expired batch;
- inactive batch;
- insufficient batch quantity.

---

## 9. Controlled-drug backend gate

Current controlled_drug flag alone is not an operational control.

For products marked controlled_drug:

Require a dedicated server-side policy gate before sale.

Suggested Actions:
- pharmacy.controlled.dispense
- pharmacy.controlled.override only if a deployment policy explicitly allows overrides

Required evidence:
- order/order_item;
- product;
- batch;
- patient/customer reference where configured;
- prescription reference where required by configured policy;
- prescriber metadata where configured;
- employee/pharmacist;
- quantity;
- branch;
- transaction identity;
- timestamp;
- reason/approval evidence where applicable.

Use an immutable dispense-event/audit record.

Jurisdiction-specific legal rules must be configured/validated per deployment.
Do not hard-code assumed legal limits in generic Sharawla Core without an explicit jurisdiction policy.

Until this owner/audit exists:
pharmacy.controlled_drugs must not be treated as commercially CLOSED.

---

## 10. Insurance plan authority

Client-provided insurance amounts are not financial authority.

Backend must load:
- company;
- plan;
- active status;
- copay rule;
- max coverage;
- prior-approval requirement;
- any configured product/category eligibility rules.

Backend derives or validates:
- gross eligible amount;
- patient amount;
- insurer amount;
- approval requirement.

If prior approval is required:
- missing/invalid approval evidence -> reject.

The sum must reconcile:
patient_amount + insurer_amount = covered/gross amount according to the plan contract.

Do not trust arbitrary p_insurance split values.

---

## 11. Insurance claim line items

When an insured sale is created:

Insert claim header AND line items in the same transaction.

Extend pharmacy_insurance_claim_items where needed with:
- order_item_id
- plan_id if line-specific rules require it
- eligibility/coverage reason
- client/effect identity where required

Each claim item records:
- product
- quantity
- gross amount
- covered amount
- patient amount

Header totals are the sum of claim items.

No header-only claim is considered financially complete.

---

## 12. Claim lifecycle

Allowed states should be transition-validated.

Conceptual lifecycle:

draft
-> submitted
-> approved | partially_approved | rejected
-> settled

Optional:
cancelled under explicit rules.

Do not allow arbitrary state jumps through a generic status dropdown.

Suggested Actions:
- pharmacy.claim.create
- pharmacy.claim.submit
- pharmacy.claim.review
- pharmacy.claim.settle
- pharmacy.claim.cancel

Each transition records:
- previous state
- new state
- employee
- timestamp
- notes/reason
- financial impact if any

---

## 13. Pharmacy-specific return owner

Required owner:

create_pharmacy_order_return_idempotent(...)

It must be the only normal Pharmacy return mutation owner.

It must not route through the generic non-Pharmacy return path.

### Inputs

At minimum:
- original order_id
- reason
- notes
- returned order_item quantities
- refund payments
- canonical client_tx_id
- Point4 return identity
- return disposition where required

### Validation

- original order exists;
- order belongs to current Pharmacy branch/business;
- original order has Pharmacy batch allocations where product is tracked;
- quantity does not exceed remaining returnable quantity;
- Action permission;
- Location permission;
- canonical identity;
- idempotent retry.

---

## 14. Batch restoration on return

For each returned order_item:

1. load original pharmacy_order_batch_allocations;
2. compute already returned quantity per allocation;
3. determine remaining restorable quantity;
4. allocate return quantity deterministically back to original batch allocation(s);
5. lock each pharmacy_batches row;
6. increase batch quantity for restockable return;
7. write pharmacy_batch_movements movement_type=return;
8. write immutable Pharmacy return-batch allocation evidence;
9. update returned_quantity / derive returned total.

Recommended new table:

pharmacy_return_batch_allocations

Fields:
- return_id
- return_item_id
- original_order_batch_allocation_id
- batch_id
- quantity
- disposition
- client_tx_id
- created_at

This preserves lineage from:
sale order item -> sold batch -> return item -> restored batch.

---

## 15. Return disposition

Medication return stock treatment must be explicit.

At minimum distinguish:
- restock
- non_restock / quarantine
- waste where business policy permits

Do not automatically put every refunded medication back into sellable batch stock.

If V1 launches before quarantine/non-restock stock ownership is implemented:
- allow only explicitly restockable Pharmacy returns;
- reject unsupported disposition rather than silently restoring saleable stock.

Do not fake a non-restock return by restoring stock and then adjusting it outside the same authoritative transaction.

---

## 16. Expired batch on return

A return may refer to a batch that has since expired.

If disposition=restock:
- quantity may be restored to the original batch ledger;
- expired status still prevents future sale;
- it must appear in expiry/write-off reporting.

Do not create a fresh unexpired batch.

If local policy requires quarantine instead:
use the explicit non-saleable disposition owner.

---

## 17. Shared product stock reconciliation

Pharmacy tracks both:
- shared Retail/product stock;
- Pharmacy batch stock.

For every tracked-batch sale/return:

The net product stock effect must equal the net sum of Pharmacy batch effects.

Acceptance invariant:

shared_product_delta
=
sum(pharmacy_batch_delta)

for the same commercial movement.

A transaction is rejected if the two layers cannot be reconciled.

---

## 18. Return effects on prescriptions

If returned product came from a prescription fulfillment:

Create reversal/compensation evidence.

Do not delete the original dispense record.

Prescription remaining quantity/state must be recalculated.

Example:
fully dispensed
-> partial return
-> may become partially_dispensed according to policy.

If returned medication is not legally/reoperationally dispensable again, that affects stock disposition, not the historical prescription ledger truth.

---

## 19. Return effects on insurance

If an insured order is returned:

The Pharmacy return owner must reconcile:
- patient refund;
- insurer receivable reduction;
- claim line quantities/amounts;
- claim header totals/status;
- settlement state.

If claim is already settled:
- create an explicit adjustment/credit workflow;
- do not silently rewrite settled history.

A generic cash refund is insufficient for an insured return.

---

## 20. Offline boundary

Current Pharmacy POS intentionally blocks sale offline.

Current generic Return UI can fall into Offline queue.

Immediate safety requirement before Pharmacy runtime acceptance:
- explicitly block Pharmacy offline return until Pharmacy return ownership exists.

No generic Offline Pharmacy return is permitted.

Future Offline Pharmacy design must separately decide:
- cash sale;
- prescription sale;
- controlled-drug sale;
- insurance sale;
- returns.

Do not inherit Retail Offline behavior automatically.

---

## 21. Suggested staged Offline roadmap

Phase 0:
- Pharmacy sale/return online-only while integrity owner is closed.

Phase 1 candidate:
- non-insurance, non-controlled sale with trusted cached batch state.

Phase 2:
- prescription-aware offline only if prescription cache/anti-reuse rules are safe.

Insurance:
- remain Online-only initially unless policy/rules can be validated offline safely.

Controlled drugs:
- explicit deployment policy required before any offline enablement.

Every Offline phase requires:
- durable batch snapshot;
- branch/device scoping;
- idempotent owner;
- conflict behavior;
- current authorization re-check on sync;
- exact stock reconciliation.

---

## 22. Permissions

Required/expected Actions:

Sale:
- sales.create
- pharmacy.prescription.dispense
- pharmacy.substitute.use
- pharmacy.fefo.override
- pharmacy.controlled.dispense

Return:
- returns.create
- pharmacy.return.restock
- pharmacy.return.non_restock if implemented

Insurance:
- pharmacy.claim.create
- pharmacy.claim.submit
- pharmacy.claim.review
- pharmacy.claim.settle
- pharmacy.claim.cancel

Batch:
- pharmacy.batch.receive
- pharmacy.batch.adjust
- pharmacy.batch.waste

Configuration:
- pharmacy.product_details.manage
- pharmacy.substitute.manage
- pharmacy.insurance_company.manage
- pharmacy.insurance_plan.manage

All branch-sensitive actions also require Location scope.

Trusted Profile=pharmacy remains mandatory.

---

## 23. ACL / Profile security

Current Pharmacy owners are SECURITY DEFINER and client-callable, including create_pharmacy_pos_order_atomic.

Final staff owner contract:

- trusted Profile=pharmacy;
- authenticated employee;
- Action permission;
- Location scope;
- domain invariants;
- no anon/PUBLIC EXECUTE for employee mutation owners.

Public website prescription/request endpoints must be separate explicit public contracts.

---

## 24. Acceptance — sale

Fixture:
- tracked product;
- two valid batches with different expiries;
- one expired batch;
- prescription-required product;
- controlled flag fixture;
- insurance plan fixture.

Test:
1. FEFO sale;
2. batch deduction;
3. shared product deduction;
4. allocation -> exact order_item_id;
5. movement ledger;
6. direct-RPC missing prescription denial;
7. expired batch denial;
8. non-FEFO denial;
9. FEFO override authorized/unauthorized;
10. insurance server recalculation;
11. claim items = header totals;
12. canonical retry exactly once.

Cleanup:
zero residue and stock/cost reconciliation.

---

## 25. Acceptance — return

Test:
1. partial return of one order item;
2. correct original batch restored;
3. second partial return;
4. no over-return;
5. multiple-batch sale -> deterministic restoration;
6. shared stock == batch stock delta;
7. idempotent retry;
8. prescription fulfillment reversal;
9. insured return claim adjustment;
10. expired original batch behavior;
11. unauthorized Action/Location denial;
12. direct generic return path rejected/not used for Pharmacy.

Cleanup:
zero residue.

---

## 26. Closure threshold

Pharmacy Sale/Return Integrity is CLOSED only when:

- sale allocation is line-bound;
- canonical identity is used;
- prescription requirement is backend-enforced;
- prescription line fulfillment is recorded;
- FEFO is authoritative or explicitly labeled advisory with controlled override policy;
- controlled-drug path has explicit backend/audit owner;
- insurance calculations are server authoritative;
- insurance claim items reconcile;
- Pharmacy-specific return owner exists;
- batch restoration is correct/idempotent;
- prescription/insurance return effects are reconciled;
- generic Offline Pharmacy return is blocked until supported;
- security Profile/Action/Location/ACL checks pass.

---

## 27. Current state

Design:
CLOSED.

Implementation:
NOT STARTED.

Current Pharmacy sale owner:
PARTIAL / NOT CLOSED.

Current Pharmacy return owner:
MISSING.

Current prescription backend enforcement:
OPEN.

Current insurance financial closure:
OPEN.

Current Pharmacy Offline:
ONLINE-ONLY for sale; generic return fallback is an integrity risk and must be blocked before runtime closure.

No DB/Runtime/Cloud mutation was performed by this design.
