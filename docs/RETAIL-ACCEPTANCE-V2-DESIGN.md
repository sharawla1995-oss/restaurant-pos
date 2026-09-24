# Sharawla Retail Acceptance V2 Design

Status: DESIGN / DOCUMENTATION ONLY
Execution environment: dedicated isolated Retail Beta only
Runtime change: NONE
DB mutation: NONE

This replaces historical Retail acceptance assumptions that no longer match the current Retail product.

## 1. Why V2 is required

Historical Beta23 acceptance was valuable, but one key assumption is now stale:

It treated:
- deliveryOrders
- deliverySettings

as Restaurant leakage.

Current Retail Engine intentionally supports:
- Delivery;
- Pickup;
- no Dine-in/Tables/Kitchen semantics.

Therefore final Retail acceptance must test the current product contract, not historical menu assumptions.

## 2. Environment lock

Retail Acceptance V2 must run only when all are true:

- verified Beta device;
- Retail Business;
- POS Profile = retail;
- dedicated Retail operational backend;
- non-Production environment;
- Canonical device identity verified;
- Business Connection matches the Retail Business;
- Runtime profile implemented=true and active=true.

Do not run write acceptance:
- on SH-0005;
- on SH-0006;
- against Top Burger Production;
- against a Restaurant-bound operational backend.

Recommended:
dedicated Retail Beta Business + dedicated device + dedicated backend.

## 3. Feature-aware acceptance

The acceptance runner must classify tests as:

MANDATORY BASELINE
- always required for Retail baseline.

ENTITLED ADD-ON
- required only if Feature is enabled/entitled.

NOT ENTITLED
- must not expose/runtime-enable the feature.

Do not mark disabled add-on tests as failures.

Do not mark an entitled feature SKIPPED without a concrete blocker.

## 4. Baseline Retail capability set

Mandatory baseline acceptance should cover:

- commerce.pos
- commerce.orders
- commerce.products
- inventory.stock

And optional baseline-profile features when enabled:
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

## 5. Add-on acceptance

Conditional feature packs:

### Variants
Feature:
commerce.variants

Required tests:
- matrix CRUD;
- SKU uniqueness;
- barcode uniqueness;
- POS picker;
- barcode/SKU scan;
- independent variant stock;
- variant sale;
- variant return;
- offline variant sale/sync;
- purchasing receive into variant stock;
- supplier return from variant stock;
- variant report once Reports V1 exists.

### Advanced PO
Feature:
inventory.purchase_orders

Required:
- PR if exposed by contract;
- PO;
- approval;
- partial/full GRN;
- idempotency;
- audit events.

### Supplier Returns
Feature:
inventory.supplier_returns

Required:
- product return;
- variant return;
- stock/cost restore;
- idempotency.

### Replenishment
Feature:
inventory.replenishment

Required:
- rule create/edit;
- suggestion read model;
- suggestion -> PR;
- invalid/zero rule guard.

### Landed Cost
Feature:
inventory.landed_cost

Required:
- allocate;
- value/quantity methods;
- post if product advertises posting;
- inventory valuation update;
- reject unsafe post after outbound stock movement;
- idempotent re-post;
- report impact.

If posting remains intentionally not exposed, the Feature must be described commercially as allocation-only until posting UX is closed.

## 6. Navigation acceptance

Current Retail pages to smoke:

1. home
2. pos
3. orders
4. customers
5. deliveryOrders
6. shifts
7. inventory
8. marketSettings
9. retailOffers
10. promoCodes
11. stockCount
12. transfers
13. suppliers
14. purchasing
15. websiteManagement
16. returns
17. expenses
18. products
19. reports
20. users
21. settings
22. deliverySettings

Rules:
- every allowed page opens;
- no empty render;
- no Restaurant Kitchen/Tables leakage;
- delivery is allowed when commerce.delivery is enabled;
- pickup is allowed when commerce.pickup is enabled;
- dine-in/table controls must not appear;
- Retail terminology must be used.

## 7. POS baseline pack

### Product catalog
- active product list;
- branch availability;
- search;
- normal barcode.

### Decimal/weight
When Retail weighted/decimal behavior is in scope:
- quantity step;
- direct decimal;
- kg/g/liter/ml;
- embedded weight barcode;
- embedded price barcode;
- EAN13 checksum where applicable.

### Cart
- add;
- increase/decrease;
- exact decimal rounding;
- remove;
- customer link;
- discount;
- promo;
- Retail Offer stacking policy.

### Hold/Resume
- hold sale;
- resume;
- cart/customer/financial state preserved;
- no duplicate suspended sale residue.

### Checkout
- takeaway;
- pickup when entitled;
- delivery when entitled;
- mixed/configured payments;
- open shift required;
- atomic persistence;
- payment rows reconcile;
- inventory deduction.

## 8. Sale / Return / Offline pack

### Sale
- canonical client_tx_id;
- Point4 identity;
- exactly-once replay;
- payment reconciliation;
- stock deduction.

### Return
- partial;
- full;
- decimal quantity;
- original line lineage;
- stock restore;
- payment refund rows;
- exactly-once retry.

### Offline
- force network offline;
- local sale succeeds;
- durable outbox;
- restart;
- reconnect;
- sync exactly once;
- stock reconcile;
- return;
- lost ACK;
- retry once.

Offline support matrix:
docs/RETAIL-OFFLINE-SUPPORT-MATRIX.md

Do not test management operations as Offline unless they are explicitly added to the support matrix.

## 9. Inventory pack

### Overview
- product balances;
- low stock;
- tracked/untracked;
- variant balance where enabled.

### Adjustment
- positive;
- negative;
- zero rejected;
- unauthorized branch rejected.

### Stock count
- valid count posts;
- negative counted quantity rejected;
- transaction rollback;
- variance correct;
- ledger movement correct.

### Transfer
- different branches required;
- source deduction;
- destination not credited before receive;
- receive credit;
- duplicate receive prevented;
- branch authorization.

When Variants entitled:
add variant count/transfer acceptance only if the commercial feature promises those workflows.

## 10. Suppliers / Purchasing pack

Baseline:
- supplier create/read;
- PO create;
- PO approval;
- GRN;
- partial/full receive;
- weighted average cost;
- supplier return;
- cleanup zero.

Acceptance must verify:
- no stock drift;
- no cost drift after compensated roundtrip;
- client_tx idempotency;
- correct branch;
- employee audit fields.

## 11. Website pack

Retail public website flow:

- bootstrap;
- branch visibility/open state;
- catalog;
- quote;
- offer calculation;
- order create;
- reservation;
- reservation expiry;
- duplicate/idempotent create;
- POS pending intake;
- details;
- accept;
- stock revalidation;
- accepted_order_id lineage;
- reject;
- reservation release;
- pickup;
- delivery;
- payment state.

Revenue must not double-count public website order plus accepted POS order.

## 12. Delivery pack

If commerce.delivery is enabled:

- zone load;
- fee;
- customer address;
- driver optional at checkout;
- assign driver;
- out-for-delivery;
- delivered;
- final payment method;
- cash custody;
- driver settlement;
- shift close blockers.

Retail Delivery must reuse accepted delivery settlement contracts where shared.

No Restaurant kitchen requirement is implied.

## 13. Offers / Promo pack

Retail Offers:
- percent;
- fixed;
- buy X get Y;
- second half;
- product-specific;
- all-products;
- start/end;
- archive;
- website_enabled.

Promo:
- valid;
- invalid;
- expiry;
- scope;
- stacking policy.

Verify:
automatic = best of promo or offer according to current Retail Engine policy;
manual authorized discount occurs only according to accepted business rule;
total discount never exceeds subtotal.

## 14. Reports pack

Until Retail Reports V1 is implemented:
- current generic report can be smoke-tested;
- Retail Closure remains financially OPEN.

Final Reports gate references:
docs/RETAIL-REPORTS-V1-CONTRACT.md

Required later:
- profile-aware order labels;
- COGS;
- profit/margin;
- valuation;
- movements;
- purchasing;
- supplier;
- variant report when enabled;
- screen/print/export reconciliation.

## 15. Security pack

Retail Closure cannot be security-complete until:

X1:
ACL hardening.

X2:
trusted Retail Profile binding.

X3:
Action + Location.

X4:
cross-profile negative matrix.

Direct calls using Restaurant credentials against representative Retail mutation owners must fail PROFILE_MISMATCH before mutation.

Retail employee wrong Action:
ACTION_DENIED.

Retail employee wrong Location:
LOCATION_DENIED.

Direct REST bypass for sensitive owners must be closed.

## 16. Touch pack

Representative screens:
- POS;
- Customers;
- Orders;
- Inventory;
- Stock Count;
- Transfers;
- Purchasing;
- Products;
- Reports;
- Settings.

Requirements:
- no hover-only critical action;
- large tap targets;
- dialogs reachable;
- tables scroll;
- barcode focus does not trap navigation;
- quantity controls touch-usable.

## 17. Printing pack

Verify:
- Retail customer receipt;
- order type text;
- decimal quantities;
- variant labels/SKU where needed;
- return receipt;
- shift report;
- report print.

Printer role migration may later replace legacy direct customer/prep mapping.

## 18. Backup / restore / update pack

Verify:
- Retail-specific tables included in backup/restore;
- Native Offline queue survives restart;
- update gate sees pending Offline queue;
- update health passes;
- rollback does not lose Retail local data;
- current version starts on Retail profile without Restaurant fallback.

## 19. Cleanup contract

Every write acceptance run gets:
- unique run_id;
- tagged fixtures;
- deterministic/idempotent transaction identities;
- cleanup owner;
- residue scan.

Required final:
cleanup residue = 0.

Stock/cost before/after must reconcile.

Do not delete unrelated Retail test data.

## 20. Readiness scoring

Critical baseline tests:
- Environment lock
- Profile
- Navigation
- POS sale
- return
- payment reconciliation
- stock
- Offline sale/sync
- cleanup

Add-on critical tests are activated only for entitled features.

MANUAL remains MANUAL.

SKIPPED requires reason.

BLOCKED means Retail cannot be called CLOSED if the blocked test is mandatory for the sold feature set.

## 21. Retail Closure result

Final result classes:

BASELINE_CLOSED
- all mandatory Retail V1 baseline gates PASS.

ADDON_CLOSED(feature)
- that optional feature independently passes.

SECURITY_CLOSED
- X1-X4 pass.

FINANCIAL_REPORTING_CLOSED
- Retail Reports V1 passes.

PRODUCTION_READY
- baseline + sold add-ons + security + reporting + touch/printing/backup/update accepted.

## 22. Current state

Retail Acceptance V2 design:
CLOSED.

Implementation:
NOT STARTED.

Historical Beta23 suite:
useful evidence source, not final authority.

Current Retail runtime closure:
OPEN pending dedicated Retail Beta environment.
