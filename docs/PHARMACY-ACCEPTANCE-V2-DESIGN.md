# Sharawla Pharmacy Acceptance V2 Design

Status: DESIGN / DOCUMENTATION ONLY
Execution: NOT STARTED
Target: dedicated isolated Pharmacy Beta environment

## 1. Purpose

Replace the current limited Pharmacy setup test with a product-level Pharmacy acceptance.

Historical/current pharmacy.core-flow tests only:
- batch receive;
- batch adjustment;
- prescription create;
- insurance company;
- insurance plan.

That is not sufficient for Pharmacy Closure.

Pharmacy Acceptance V2 must prove:
Sale -> Batch -> Prescription/Insurance -> Return -> Batch Restore
plus security, expiry, reports and cleanup.

## 2. Environment lock

Run writes only when:

- verified Beta device;
- Cloud Business Profile=pharmacy;
- dedicated Pharmacy operational backend;
- Business Connection points to that backend;
- trusted operational Profile binding=pharmacy;
- no Production identity/backend;
- isolated acceptance fixtures.

Do not run on:
- SH-0005
- SH-0006
- Top Burger Production
- Restaurant SH-0007 backend
- future Retail Beta backend.

## 3. Feature-aware runner

Classify each test:

MANDATORY
- required Pharmacy baseline.

ENTITLED
- run only when optional capability is entitled.

NOT ENTITLED
- assert feature is not exposed/usable.

MANDATORY Pharmacy baseline:
- commerce.pos
- commerce.orders
- commerce.products
- inventory.stock
- inventory.batch
- inventory.expiry

Optional feature packs:
- pharmacy.alternatives
- pharmacy.prescriptions
- pharmacy.controlled_drugs
- pharmacy.insurance
- pharmacy.claims
- commerce.delivery
- commerce.pickup
- commerce.website
- inventory.count
- inventory.purchasing
- inventory.suppliers
- inventory.transfers

## 4. Navigation pack

Smoke all current Pharmacy pages:

1. home
2. pos
3. orders
4. customers
5. pharmacyCatalog
6. pharmacyBatches
7. pharmacyExpiry
8. pharmacyPrescriptions
9. pharmacyInsurance
10. pharmacyClaims
11. deliveryOrders
12. shifts
13. inventory
14. stockCount
15. transfers
16. suppliers
17. purchasing
18. promoCodes
19. websiteManagement
20. returns
21. expenses
22. products
23. reports
24. users
25. settings
26. deliverySettings

Leakage:
- no Restaurant Kitchen/Tables/Food Recipes.
- no Retail Market Settings/Offers unless explicitly shared by a future contract.
- Delivery is allowed when entitled.
- no Dine-in.

## 5. Drug master pack

Create/update fixture medicine with:

- scientific_name
- active_ingredient
- dosage_form
- strength
- manufacturer
- registration_no
- prescription_required
- controlled_drug
- track_batch
- storage notes/temperature
- pack size
- unit
- reorder level.

Verify:
- values persist;
- unauthorized Action denied;
- wrong Profile denied;
- ordinary user cannot bypass by direct RPC.

## 6. Batch receive pack

Create at least three batches for one product:

Batch A:
- earliest valid expiry
- positive quantity

Batch B:
- later valid expiry
- positive quantity

Batch C:
- expired
- positive fixture quantity only if test setup safely permits it

Verify:
- receive idempotency if owner supports it;
- branch;
- product;
- batch no;
- cost;
- price;
- quantity;
- movement ledger;
- expiry dates.

Negative:
- invalid expiry;
- zero/negative receive;
- wrong branch;
- unauthorized employee.

## 7. FEFO pack

For strict FEFO target:

Sale 1:
- quantity less than Batch A.
Expected:
- only Batch A allocation.

Sale 2:
- quantity exceeds remaining Batch A.
Expected:
- exhaust A then consume B.

Attempt explicit selection of later Batch B while A is available:
- without override -> FEFO_DENIED
- with pharmacy.fefo.override + reason -> allowed only if product policy permits.

If final product policy makes FEFO advisory instead:
the test must be reclassified and the product must not advertise strict FEFO.

## 8. Expired stock pack

Attempt sale from Batch C:
Expected:
DENY.

Attempt inactive batch:
DENY.

Attempt quantity > available:
DENY.

Verify:
- no shared product order created;
- no Retail product stock changed;
- no Pharmacy batch movement created.

Guard must fail atomically.

## 9. Pharmacy sale baseline

Create open shift.

Sell ordinary batch-tracked medicine.

Verify:
- one order;
- correct items;
- payments;
- shared Retail product inventory deduction;
- Pharmacy batch allocation;
- Pharmacy batch quantity deduction;
- Pharmacy batch movement;
- same branch;
- canonical transaction identity;
- exact retry returns same order/no duplicate effect.

Required after Point4 Pharmacy hardening:
- UUIDv4 canonical identity contract.

Current PH-timestamp-random format is not acceptance target.

## 10. Prescription-required pack

Product:
prescription_required=true.

Attempt direct backend sale with no prescription:
Expected:
PRESCRIPTION_REQUIRED / deny.

Create prescription with line for product.

Sale with matching prescription:
Expected:
PASS.

Verify line fulfillment:
- requested quantity;
- dispensed quantity;
- remaining quantity;
- partial state when partial;
- dispensed state only after complete fulfillment.

Attempt unrelated prescription:
DENY.

Attempt reuse beyond remaining quantity:
DENY.

Attempt substitute:
follow Alternatives pack.

## 11. Alternatives pack

Feature:
pharmacy.alternatives

Create:
A prescribed product
B approved substitute

Test:
- view suggested/manual substitute;
- select B;
- record original requested product;
- record dispensed substitute;
- preserve prescription fulfillment quantity;
- pharmacist Action enforced if required.

Negative:
- substitute relation inactive;
- unrelated product;
- incompatible policy.

Do not accept a substitute merely because client sends another product id.

## 12. Controlled-drug pack

Feature:
pharmacy.controlled_drugs

Requires final controlled-drug policy implementation first.

Test:
- controlled flag detected server-side;
- dedicated Action;
- required prescription/patient/prescriber metadata according to configured policy;
- immutable dispense audit;
- quantity/date rule;
- branch;
- user;
- order;
- batch;
- return/cancel policy.

Negative:
- normal cashier without controlled Action;
- no prescription where required;
- missing identity/prescriber fields;
- direct RPC bypass.

Until these tests are implementable:
pharmacy.controlled_drugs is NOT CLOSED even if Cloud says implemented=true.

## 13. Insurance sale pack

Feature:
pharmacy.insurance

Create:
- active company;
- active plan;
- copay;
- max coverage;
- prior approval requirement.

Sale:
- patient portion;
- insurer portion.

Backend must derive/validate amounts from plan.

Verify:
- order total;
- patient payment;
- insurance payment/receivable representation;
- claim header;
- claim items;
- claim item totals reconcile to claim header;
- plan/company relationship;
- member/approval fields.

Negative:
- inactive company;
- inactive plan;
- plan belongs to other company;
- missing prior approval;
- client manipulates patient/insurer split;
- exceeds coverage.

## 14. Claims lifecycle pack

Feature:
pharmacy.claims

Allowed transitions must be explicit.

Example lifecycle:
draft
-> submitted
-> approved / partially_approved / rejected
-> settled

Also:
cancelled according to policy.

Test:
- illegal backward transition denied;
- Action permissions per lifecycle risk;
- submitted_at;
- settled_at;
- notes/audit;
- insurer receivable closes only on settled according to financial design.

Do not let a client choose arbitrary status value without transition validation.

## 15. Pharmacy return pack

Critical mandatory gate after Pharmacy return owner exists.

Sale:
- product allocated across one/two batches.

Partial return:
- restore correct quantity to original batch allocation(s), or documented quarantine owner.

Full return:
- restore remaining quantity.

Verify:
- shared product stock restored exactly once;
- Pharmacy batch stock restored exactly once;
- Pharmacy batch return movement;
- return items/payment;
- batch lineage;
- original order preserved;
- idempotent retry.

Insurance return:
- claim adjustment/cancellation according to state.

Prescription return:
- fulfillment state policy applied intentionally.

Controlled-drug return:
- dedicated policy/audit.

Until this pack can PASS:
Pharmacy Closure is BLOCKED.

## 16. Offline pack

References:
docs/PHARMACY-OFFLINE-SUPPORT-MATRIX.md

Current expected:
- Pharmacy online sale only.

Mandatory current test:
- offline checkout clearly blocked before mutation;
- generic Pharmacy offline return blocked.

Future PH-OFF-1:
ordinary non-insurance/non-controlled sale local-first acceptance.

Do not mark Offline Pharmacy PASS merely because the app shell loads.

## 17. Website prescription pack

Feature:
commerce.website + pharmacy.prescriptions

Only after public request owner exists.

Test:
- public submit;
- branch;
- phone;
- image/storage access;
- pickup/delivery;
- rate/abuse guard;
- authenticated pharmacy inbox;
- review;
- convert to prescription;
- link status;
- customer tracking if supported;
- privacy/retention.

No direct anonymous table INSERT should be introduced as a shortcut without a controlled contract.

## 18. Delivery/Pickup pack

If entitled:
- Pharmacy order type;
- customer/address;
- delivery zone/fee;
- driver;
- final payment;
- settlement/cash custody.

Medicine/batch rules remain enforced regardless of delivery channel.

No Kitchen dependency.

## 19. Shared inventory/purchasing pack

When enabled:
- Inventory Overview Pharmacy adapter/presentation;
- suppliers;
- purchasing;
- stock count;
- transfers.

Critical design question:
shared Retail product stock + Pharmacy batch stock must reconcile.

A purchase/transfer affecting Pharmacy products must define how batch identity moves.

Do not claim generic product transfer closes Pharmacy batch transfer automatically.

If batch-level transfer is absent:
inventory.transfers for Pharmacy must be constrained or product contract clarified.

## 20. Reports pack

Required final Pharmacy reporting:

- sales;
- COGS/profit where applicable;
- batch stock;
- expiry;
- near-expiry value;
- expired value;
- batch movements;
- prescription fulfillment;
- controlled drug ledger;
- insurance claims;
- insurer receivable;
- patient/insurer split;
- alternatives;
- waste/expiry loss.

Screen/export totals reconcile.

## 21. Permissions/security pack

X1:
ACL classification/hardening including create_pharmacy_pos_order_atomic.

X2:
trusted Profile=pharmacy.

X3:
Action + Location.

X4:
negative calls from Restaurant/Retail/etc.

Representative direct tests:
- wrong Profile -> PROFILE_MISMATCH
- action denied -> ACTION_DENIED
- location denied -> LOCATION_DENIED.

Public website owners get separate public API tests.

## 22. Touch pack

Test:
- Pharmacy POS;
- Catalog;
- Batches;
- Expiry;
- Prescriptions;
- Insurance;
- Claims;
- Inventory;
- Purchasing;
- Reports;
- Settings.

No hover-only critical controls.

Batch/claim tables must be usable on touch/compact screens.

## 23. Printing pack

Verify:
- Pharmacy sale receipt;
- medicine names;
- batch info where business/legal policy requires it;
- prescription reference where appropriate;
- insurance patient/insurer split where appropriate;
- return receipt;
- shift report;
- reports.

Do not print sensitive patient/insurance data unnecessarily.

## 24. Backup/update pack

Verify Pharmacy-specific data in backup/restore:
- product details;
- batches;
- movements;
- allocations;
- prescriptions/items;
- substitutes;
- insurance companies/plans;
- claims/items;
- website prescription requests.

Update pending guard must preserve Offline policy/state.

## 25. Cleanup contract

Acceptance run gets unique run ID.

Cleanup must:
- delete only tagged fixtures;
- restore shared Retail product stock;
- restore Pharmacy batch stock;
- clean claims/items;
- clean prescription/items;
- clean substitutes;
- clean acceptance customer;
- residue=0.

Cleanup must not delete unrelated medicine/batch data.

## 26. Readiness result classes

PHARMACY_BASELINE_CLOSED:
- drug master
- batch
- expiry
- sale
- return
- permissions
- core reports accepted.

FEATURE_CLOSED(code):
- prescriptions
- alternatives
- insurance
- claims
- controlled drugs
- website
etc. independently accepted.

PHARMACY_PRODUCTION_READY:
- baseline
- all sold/entitled features
- security
- offline policy
- touch/printing/backup/update
accepted.

## 27. Current state

Pharmacy Acceptance V2:
DESIGN CLOSED.

Execution:
NOT STARTED.

Current pharmacy.core-flow:
insufficient for product closure.

Critical blocking test:
Pharmacy Sale -> Batch Deduction -> Pharmacy Return -> Batch Restore.

No Runtime/DB/Cloud mutation.
