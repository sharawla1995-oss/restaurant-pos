# Sharawla Pharmacy Closure Audit — 2026-09-24

Status: READ-ONLY / DOCUMENTATION ONLY
Branch: beta56-offline-ownership-consolidation
Runtime change: NONE
DB mutation: NONE
Cloud mutation: NONE
Production impact: NONE

This audit prepares Pharmacy closure while the physical Beta laptop is unavailable.

## 1. Executive result

Pharmacy is implemented as a real Profile and already contains substantial UI/schema/runtime foundations:

- Pharmacy Profile implemented=true / active=true.
- Dedicated Pharmacy POS adapter.
- Drug master details.
- Batch/Lot tracking.
- Expiry views.
- FEFO-style client allocation.
- Prescription records.
- Substitute/alternative links.
- Insurance companies/plans.
- Insurance claim headers/status workflow.
- Website prescription-request schema.
- Delivery/Pickup shared capabilities.
- Shared inventory/purchasing/stock-count/transfer pages.
- Pharmacy diagnostics.
- A profile acceptance pack for selected Pharmacy setup flows.

However Pharmacy is NOT ready for product closure today.

Critical closure gaps exist in the core sale/return/compliance path:
1. no Pharmacy-specific return owner restores sold batch quantities;
2. prescription-required enforcement is UI-only, not authoritative backend enforcement;
3. controlled-drug handling has no dedicated sale guard/audit contract;
4. FEFO selection is client-side preference, not a backend invariant;
5. insurance claim items are not populated by the current Pharmacy sale owner;
6. prescription item fulfillment is not reconciled by sale;
7. Pharmacy POS is explicitly Online-only;
8. current acceptance does not test Pharmacy sale -> batch deduction -> return -> batch restore;
9. current Beta backend contains zero Pharmacy fixture/data rows;
10. no current Pharmacy Business/device exists in Sharawla Cloud.

Pharmacy is therefore a genuine implementation/closure project after Retail, not merely a click-through acceptance exercise.

---

## 2. Sharawla Cloud current state

Profile:
- code: pharmacy
- implemented: true
- active: true

Required/standard Pharmacy foundation:
- commerce.pos — required
- commerce.orders — required
- commerce.products — required
- inventory.stock — required
- inventory.batch — required
- inventory.expiry — required
- core auth/licensing/payments/permissions/shifts/users — required

Enabled optional capabilities include:
- commerce.barcode
- commerce.delivery
- commerce.pickup
- commerce.promotions
- commerce.returns
- commerce.website
- inventory.count
- inventory.purchasing
- inventory.receiving
- inventory.suppliers
- inventory.transfers
- pharmacy.alternatives
- pharmacy.claims
- pharmacy.controlled_drugs
- pharmacy.insurance
- pharmacy.prescriptions

Implemented add-ons not automatically Pharmacy-enabled include:
- commerce.variants
- inventory.purchase_orders
- inventory.supplier_returns
- inventory.replenishment
- inventory.landed_cost
- inventory.multi_warehouse
and other cross-profile commercial capabilities.

### Current Cloud environment gap

Read-only Cloud audit found:
- zero Businesses currently assigned Profile=pharmacy.

Therefore there is no genuine Pharmacy runtime certification environment today.

---

## 3. Current Pharmacy navigation

Current Pharmacy Engine exposes 26 pages:

1. Home
2. Pharmacy POS
3. Orders
4. Customers
5. Drug Catalog
6. Batches/Lots
7. Expiry & Alerts
8. Prescriptions
9. Insurance Companies/Plans
10. Insurance Claims
11. Delivery Orders
12. Shifts
13. Inventory
14. Stock Count
15. Transfers
16. Suppliers
17. Purchasing
18. Promo Codes
19. Website Management
20. Returns
21. Expenses
22. Products
23. Reports
24. Users
25. Settings
26. Delivery Settings

Current Pharmacy roles:
- admin
- cashier
- pharmacist
- callcenter
- delivery

This is a substantial product surface, but page visibility is not evidence that each workflow is closed.

---

## 4. Pharmacy-specific UI status

Dedicated Pharmacy pages exist:

### Drug Catalog
Shows/edits:
- scientific name
- active ingredient
- strength
- dosage form
- manufacturer
- registration number
- prescription_required
- controlled_drug
- track_batch
- reorder level

Supports:
- substitute/alternative relation.

### Batches
Supports:
- receive batch
- batch number
- expiry
- quantity
- cost
- sale price
- adjustment
- waste

### Expiry
Shows:
- expired
- 30-day window
- 31-90 day window
- remaining positive stock

### Prescriptions
Supports:
- prescription record creation
- doctor/customer details
- requested medicine information
- website request status handling

### Insurance
Supports:
- company
- plan
- copay
- max coverage
- prior approval flag

### Claims
Supports lifecycle labels:
- draft
- submitted
- approved
- partially_approved
- rejected
- settled
- cancelled

### Pharmacy POS
Supports:
- medicine search by name/barcode/ingredient/scientific/manufacturer
- visible valid batch stock
- prescription selector
- insurance company/plan/member/approval
- patient payment method
- batch allocation
- insurance claim header creation.

---

## 5. Pharmacy backend schema

Current Pharmacy tables:

- pharmacy_product_details
- pharmacy_batches
- pharmacy_batch_movements
- pharmacy_order_batch_allocations
- pharmacy_prescriptions
- pharmacy_prescription_items
- pharmacy_substitutes
- pharmacy_insurance_companies
- pharmacy_insurance_plans
- pharmacy_insurance_claims
- pharmacy_insurance_claim_items
- pharmacy_web_prescription_requests

Shared commercial tables remain:
- products
- orders
- order_items
- returns
- return_items
- payments
- shared Retail product inventory ledger.

No Pharmacy table trigger was found in the current Beta backend.

Therefore missing owner behavior is not being completed silently by triggers.

---

## 6. Current Beta data state

Read-only current Beta counts:

- pharmacy_product_details = 0
- pharmacy_batches = 0
- pharmacy_batch_movements = 0
- pharmacy_order_batch_allocations = 0
- pharmacy_prescriptions = 0
- pharmacy_prescription_items = 0
- pharmacy_substitutes = 0
- pharmacy_insurance_companies = 0
- pharmacy_insurance_plans = 0
- pharmacy_insurance_claims = 0
- pharmacy_insurance_claim_items = 0
- pharmacy_web_prescription_requests = 0

Therefore current Restaurant Beta backend provides schema/source evidence only for Pharmacy.

It provides no actual Pharmacy runtime data evidence.

---

## 7. Pharmacy sale owner

Current owner:
create_pharmacy_pos_order_atomic

Current high-level flow:

1. require auth.uid.
2. validate target branch access.
3. validate tracked-batch line allocation quantity equals sale quantity.
4. validate each selected batch:
   - same branch;
   - same product;
   - positive quantity;
   - active;
   - not expired;
   - sufficient stock.
5. apply Point4 legacy product-stock guard.
6. delegate shared product inventory/order creation to:
   create_retail_pos_order_atomic
7. deduct selected Pharmacy batch quantities.
8. create pharmacy_order_batch_allocations.
9. create pharmacy_batch_movements sale rows.
10. optionally mark prescription header dispensed.
11. optionally create insurance claim header.

This confirms the Pharmacy sale is layered over Retail product stock plus Pharmacy-specific batch stock.

Both layers must always reconcile.

---

## 8. Critical return gap

Current shared Returns UI does NOT route Pharmacy to a Pharmacy-specific return owner.

It chooses:
- Retail Profile -> create_retail_order_return_idempotent
- every non-Retail profile -> create_order_return_idempotent

Pharmacy therefore currently falls into generic return ownership.

Read-only DB scan found:
- no create_pharmacy_*return* owner;
- no pharmacy_*return* owner;
- no existing return owner touches:
  - pharmacy_order_batch_allocations
  - pharmacy_batches
  - pharmacy_batch_movements.

Therefore a Pharmacy return can restore generic/shared stock without restoring the original Pharmacy Batch stock.

This is a critical inventory integrity gap.

### Required closure

Introduce a Pharmacy return owner that:

- validates original Pharmacy order;
- resolves original order_item -> batch allocations;
- supports partial returns deterministically;
- restores quantities to the correct original batch(es), or follows a documented quarantine/return-batch policy;
- writes Pharmacy batch return movements;
- restores shared product inventory exactly once;
- preserves return payment lineage;
- is idempotent;
- is Point4-safe;
- handles prescription/insurance consequences;
- supports cleanup acceptance.

Until this exists:
Pharmacy Returns must not be called CLOSED.

---

## 9. Offline return risk

Generic shared Return UI supports Offline fallback.

Because Pharmacy currently uses that shared UI, a Pharmacy return may enter generic Offline return logic even though no Pharmacy Batch-return owner exists.

Required interim/final rule:

Until Pharmacy return ownership is implemented:
- block Pharmacy Offline returns explicitly;
- do not allow generic Offline queue to create a return that cannot restore Pharmacy batch stock.

After Pharmacy return owner exists:
- add a dedicated Pharmacy offline return payload/adapter only if Pharmacy Offline sale/return becomes an accepted capability.

---

## 10. FEFO status

Current Pharmacy UI allocation sorts valid batches by expiry date ascending.

This provides FEFO behavior in the normal UI path.

Backend create_pharmacy_pos_order_atomic validates:
- expiry not passed;
- quantity sufficient;
- branch/product match.

It does NOT enforce that the earliest valid-expiry batch was chosen.

Therefore FEFO is currently:
- UI behavior;
- not a backend invariant.

### Closure decision

If Pharmacy product contract advertises strict FEFO:
backend must enforce FEFO or require an explicit override Action/reason.

Recommended:
- default FEFO enforced;
- override requires Action:
  pharmacy.fefo.override
- override audit records reason and selected batches.

If FEFO is only advisory:
label it clearly as suggested picking order, not enforced FEFO.

---

## 11. Prescription enforcement gap

Pharmacy POS UI checks:
- if product prescription_required=true;
- and no prescription selected;
- block checkout.

Current create_pharmacy_pos_order_atomic does not inspect:
- prescription_required;
- pharmacy_prescription_items.

It only marks the selected prescription header:
status='dispensed'
and links order_id.

Therefore a direct RPC caller can bypass the UI prescription requirement.

Also:
- prescription line items are not reconciled to sold products/quantities;
- partial dispensing is not calculated;
- header can become fully dispensed without line-level fulfillment evidence.

### Required closure

Backend Pharmacy sale owner must:
- resolve prescription-required products;
- require valid prescription when needed;
- verify prescription belongs to branch/customer policy as defined;
- match sold product/alternative to prescription lines;
- track dispensed quantity per prescription line;
- support partial dispensing;
- derive header state:
  open / partially_dispensed / dispensed;
- prevent inappropriate reuse.

This requires additive prescription fulfillment state/history.

---

## 12. Controlled-drug gap

Cloud currently marks:
pharmacy.controlled_drugs
- implemented=true
- enabled for Pharmacy.

Product master stores:
controlled_drug=true/false.

Current Pharmacy sale owner does not inspect controlled_drug.

No dedicated controlled-drug sale ledger/approval/audit owner was found.

Therefore current Cloud capability overstates closure.

### Required closure

Before pharmacy.controlled_drugs can be commercially CLOSED:

- define controlled-drug policy;
- require prescription/doctor metadata as applicable to product rules;
- require dedicated Action permission;
- immutable dispense audit;
- customer/patient identity requirements where applicable;
- quantity/date controls according to configured business/legal policy;
- return/cancellation policy;
- report/export;
- branch/location scope.

Do not infer jurisdiction-specific legal rules in generic Core code.
Make regulatory policy explicit/configurable and validate per deployment jurisdiction.

Until then:
pharmacy.controlled_drugs = implementation present only at data-label level, not operationally closed.

---

## 13. Alternatives/Substitutes status

Current schema/UI supports:
- product -> substitute_product relation;
- active flag;
- notes.

Drug Catalog can add a substitute.

Current Pharmacy POS does not automatically:
- suggest substitute on out-of-stock;
- verify equivalent ingredient/strength;
- record substitution against prescription line.

Therefore pharmacy.alternatives is only partially closed.

Required V1 decision:
- manual reference only; or
- POS-assisted substitution.

If POS-assisted:
- selected substitute must be recorded;
- prescription fulfillment must link original requested drug and dispensed substitute;
- pharmacist Action permission may be required.

---

## 14. Insurance claim gap

Current Pharmacy sale can create pharmacy_insurance_claims header with:
- company
- plan
- member no
- approval no
- gross
- patient
- insurer
- status draft.

Current sale owner does NOT insert pharmacy_insurance_claim_items.

No trigger fills claim items.

Therefore claim header amount exists without line-level claim detail.

### Required closure

At sale time:
- generate claim items from covered sale lines;
- record gross/covered/patient amounts per line;
- reconcile claim item sum to claim header;
- define excluded/non-covered products;
- validate max coverage/copay/prior approval server-side;
- keep patient payment + insurer receivable distinct;
- update claim lifecycle with transition validation;
- report outstanding/settled claims.

Do not call pharmacy.claims financially closed before line-level reconciliation exists.

---

## 15. Insurance plan enforcement gap

Current UI calculates copay from plan and checks prior-approval input when required.

Current Pharmacy sale owner accepts caller-provided:
- gross_amount
- patient_amount
- insurer_amount
- company_id
- plan_id
- approval_no

It does not currently recalculate the plan economics from server-side plan rules in the shown owner body.

Therefore a manipulated client can potentially provide incorrect split values unless another owner/constraint prevents it.

Required:
- server-side plan lookup;
- validate company/plan active;
- calculate or validate copay/max coverage;
- enforce prior approval requirement;
- derive claim amounts server-side.

Client values should be request hints, not financial authority.

---

## 16. Expiry protection

Positive finding:

Backend sale rejects:
- expired batch;
- inactive batch;
- insufficient batch quantity.

This is a real backend safety boundary.

Expiry dashboard also surfaces:
- expired stock;
- near-expiry windows.

Still needed:
- expired stock quarantine/write-off workflow;
- permissioned waste/adjustment;
- expiry report;
- branch aggregation;
- alert/notification policy.

---

## 17. Batch receiving / adjustment

Current owners:
- pharmacy_receive_batch
- pharmacy_adjust_batch

Current cross-profile audit found:
- auth required;
- branch checks for both key batch flows;
- legacy permission present on some flows;
- no Action V2;
- no trusted Pharmacy Profile guard;
- anon EXECUTE currently present.

Required:
- trusted Profile=pharmacy;
- Action V2;
- Location scope;
- ACL hardening.

Suggested Actions:
- pharmacy.batch.receive
- pharmacy.batch.adjust
- pharmacy.batch.waste

Do not use one generic inventory permission for all risk levels if business roles need separation.

---

## 18. Pharmacy POS Offline status

Current Pharmacy UI explicitly blocks checkout when navigator is offline:

"بيع الباتشات والتأمين يحتاج اتصال إنترنت"

Pharmacy checkout directly calls create_pharmacy_pos_order_atomic.
It does not enter the Retail/Restaurant local-first sale queue.

Therefore:

Pharmacy sale Offline:
NOT SUPPORTED.

Pharmacy batch/prescription/insurance workflows:
ONLINE ONLY.

This is a major difference from Retail/Restaurant.

### Closure options

Option A — Pharmacy V1 Online-only sales
Not recommended if Sharawla markets universal Offline POS.

Option B — implement Pharmacy local-first sale/return
Requires local durable copies of:
- batch balances/expiry;
- allocations;
- prescription context;
- insurance constraints or explicit offline insurance restrictions.

Safer staged model:
- cash/non-insurance sale may become Offline when batch cache is trustworthy;
- insurance sale remains Online-only initially;
- prescription/controlled-drug offline policy must be explicit.

Do not copy Retail Offline behavior blindly.

---

## 19. Pharmacy transaction identity

Current Pharmacy UI constructs sale client_tx_id using timestamp/random string:
PH-<timestamp>-<random>

The request does not currently build the same canonical Point4 identity envelope used by hardened 58.26 acceptance paths.

create_pharmacy_pos_order_atomic delegates to Retail product-stock owner and currently operates through legacy compatibility where applicable.

Before future Point4/Cutover closure:
- Pharmacy sale/return must adopt canonical identity contract;
- idempotent retries must reuse the exact identity;
- batch movement identity must align with the document line/effect identity contract where required.

Do not weaken Point4 validation to preserve the legacy Pharmacy TX format.

---

## 20. Website prescription request status

Schema exists:
pharmacy_web_prescription_requests

Authenticated Pharmacy UI can read branch requests and update status.

Current RLS audit found only authenticated branch-read policy for this table.

No public/anon insert policy or dedicated public create RPC was found in the current inspected Pharmacy surface.

Therefore:
- Website prescription request intake schema exists;
- public creation path is not proven/closed by this audit.

commerce.website being enabled for Pharmacy does not prove a complete Pharmacy prescription-upload website flow.

Required:
- explicit public request owner;
- branch selection;
- image/storage security;
- phone validation;
- pickup/delivery fields;
- rate/abuse controls;
- status tracking;
- link to created prescription/order;
- privacy/retention policy.

---

## 21. Current Pharmacy acceptance weakness

Current profile acceptance:
pharmacy.core-flow

Tests:
- receive batch;
- verify batch quantity;
- adjust batch back to zero;
- create customer;
- create prescription;
- create insurance company;
- create insurance plan.

It does NOT test:
- Pharmacy POS sale;
- FEFO;
- expired batch sale rejection in a transaction fixture;
- prescription-required backend enforcement;
- controlled drug;
- insurance split;
- claim items;
- claim lifecycle;
- batch deduction on sale;
- Pharmacy return;
- batch restore on return;
- Offline;
- website prescription intake.

Therefore current pharmacy.core-flow cannot be used as Pharmacy Closure evidence.

---

## 22. Permissions / security

Current prefix-family cross-profile audit found 9 pharmacy_* functions.

Additionally, this Pharmacy audit discovered a critical non-prefix owner:
- create_pharmacy_pos_order_atomic

It is SECURITY DEFINER and currently executable by anon/authenticated roles, while internal auth/branch checks still apply.

The previous X0 prefix inventory is therefore not exhaustive for all Profile entrypoints.

Cross-profile owner inventory must be supplemented before X1-X4 implementation.

For Pharmacy specifically, final owners require:
- trusted Profile=pharmacy;
- Action V2;
- Location scope;
- ACL intent;
- direct-RPC negative tests.

---

## 23. Suggested Pharmacy Action families

Drug master:
- pharmacy.product_details.manage
- pharmacy.substitute.manage

Batch:
- pharmacy.batch.receive
- pharmacy.batch.adjust
- pharmacy.batch.waste

Prescription:
- pharmacy.prescription.create
- pharmacy.prescription.dispense
- pharmacy.prescription.edit
- pharmacy.prescription.cancel

Controlled:
- pharmacy.controlled_dispense
- pharmacy.fefo.override if strict FEFO is adopted

Insurance:
- pharmacy.insurance_company.manage
- pharmacy.insurance_plan.manage
- pharmacy.claim.create
- pharmacy.claim.submit
- pharmacy.claim.approve
- pharmacy.claim.settle

Website:
- pharmacy.web_rx.review
- pharmacy.web_rx.convert

Sale/return:
- sales.create
- returns.create

Underlying domain Actions remain required in addition to Pharmacy-specific high-risk Actions where appropriate.

---

## 24. Reports gaps

Pharmacy needs Retail/shared reports plus Pharmacy-specific reports:

- batch stock by expiry;
- near-expiry value;
- expired stock value;
- batch movement ledger;
- medicine sales;
- active ingredient/manufacturer sales;
- prescription-required sales;
- prescription fulfillment;
- controlled-drug dispense ledger;
- insurance claims outstanding/submitted/approved/rejected/settled;
- insurer receivable;
- patient vs insurer collections;
- substitute usage;
- wastage/expiry loss.

Generic Reports alone are not Pharmacy financial/compliance closure.

---

## 25. Dedicated Pharmacy Beta environment

Like Retail, current Cloud has zero Pharmacy Businesses.

Recommended after Restaurant and Retail environment architecture is accepted:

- dedicated Pharmacy Beta Business;
- Profile=pharmacy;
- active Pharmacy activity category;
- dedicated Cloud branch code;
- dedicated license/device;
- dedicated operational backend;
- trusted operational profile binding=pharmacy;
- seeded medicine/batch/prescription/insurance fixtures.

Do not reuse Restaurant SH-0007 backend.

---

## 26. Pharmacy closure priority

### PH0 — Environment
Dedicated Pharmacy Beta Business/device/backend.

### PH1 — Return integrity
Build Pharmacy-specific return owner and batch restoration.

### PH2 — Backend compliance
Prescription enforcement + line fulfillment.
Controlled-drug contract.
FEFO policy/override.

### PH3 — Insurance financial integrity
Server-side plan economics.
Claim items.
Claim lifecycle.
Receivable reporting.

### PH4 — Security
X1-X4 with Pharmacy entrypoint supplement.

### PH5 — Offline policy
Implement or explicitly constrain Pharmacy Offline.

### PH6 — Website prescription intake
Public request contract + privacy/security.

### PH7 — Reports
Expiry/batch/prescription/controlled/insurance reporting.

### PH8 — Acceptance V2
Full sale -> batch -> prescription/insurance -> return -> restore + cleanup.

### PH9 — Touch/Printing/Backup/Update

### PH10 — Pharmacy Closure

---

## 27. Current classification

### Substantially present
- Profile
- Pharmacy navigation
- Drug master schema/UI
- Batch schema/UI
- expiry UI
- prescriptions schema/UI
- substitutes schema/UI
- insurance company/plan UI
- claims header UI
- Pharmacy sale owner
- batch deduction
- shared Retail product stock integration
- delivery/pickup modules
- diagnostic/acceptance foundations

### Real closure gaps
- Pharmacy return owner/batch restore
- backend prescription enforcement
- prescription line fulfillment
- controlled-drug operational enforcement/audit
- backend FEFO or documented override policy
- insurance server-side economics
- insurance claim items
- Pharmacy Offline sale/return
- public website prescription creation path
- Pharmacy reports
- exhaustive Profile/Action/Location security
- dedicated Pharmacy Beta environment
- full Pharmacy transactional acceptance

---

## 28. Current status

Pharmacy Closure:
OPEN.

Current Cloud Profile:
implemented=true / active=true.

Current Pharmacy Business count:
0.

Current Beta Pharmacy data:
0 fixture rows across audited Pharmacy tables.

No Runtime/DB/Cloud mutation was performed by this audit.
