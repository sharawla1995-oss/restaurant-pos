# Sharawla Retail Closure Audit — 2026-09-24

Status: READ-ONLY / DOCUMENTATION ONLY
Branch: beta56-offline-ownership-consolidation
Runtime change: NONE
DB mutation: NONE
Cloud mutation: NONE
Production impact: NONE

This audit prepares Retail closure while the SH-0007 laptop is unavailable.

---

## 1. Executive result

Retail is not starting from zero.

Current source/backend already contains a substantial operating Retail product:

- Retail profile implemented and active in Sharawla Cloud.
- Retail Engine registered.
- Retail POS checkout.
- Barcode / decimal quantity / embedded-weight barcode flow.
- Hold / Resume suspended sales.
- Offers.
- Inventory balances + movement ledger.
- Stock count.
- Transfers.
- Suppliers.
- PO / approval / GRN / supplier returns.
- Advanced purchasing foundations and UI.
- Variants matrix + independent variant stock + variant-aware sale/return runtime.
- Retail website + reservation/order intake.
- Returns.
- Delivery/Pickup support in current Retail Engine.
- Offline sale / return / shift / expense.
- Acceptance harnesses for Retail core, offline and selected inventory/purchasing contracts.

Retail is therefore a closure/hardening project, not a greenfield build.

The main remaining work is:
1. current Retail runtime acceptance on a genuine isolated Retail Business/device;
2. Permissions/Profile backend hardening;
3. Retail-specific reporting/financial closure;
4. Offline closure for non-sale stock/purchasing operations;
5. acceptance modernization;
6. selected add-on entitlement/runtime tests.

---

## 2. Sharawla Cloud current state

Profile:
- code: retail
- implemented: true
- active: true

Confirmed Retail baseline profile features include:
- commerce.pos — required
- commerce.orders — required
- commerce.products — required
- inventory.stock — required
- commerce.barcode — optional enabled
- commerce.delivery — optional enabled
- commerce.pickup — optional enabled
- commerce.promotions — optional enabled
- commerce.returns — optional enabled
- commerce.website — optional enabled
- inventory.count — optional enabled
- inventory.purchasing — optional enabled
- inventory.receiving — optional enabled
- inventory.suppliers — optional enabled
- inventory.transfers — optional enabled

Implemented optional capabilities that are NOT automatically assigned to Retail profile:
- commerce.variants
- inventory.purchase_orders
- inventory.supplier_returns
- inventory.replenishment
- inventory.landed_cost
- inventory.multi_warehouse
- commerce.price_tiers
- commerce.quotations
- commerce.b2b_orders
and other implemented add-ons.

This is acceptable when those capabilities are intended to be commercial/Business-level options.

### Catalog mismatch to resolve

Current Cloud feature:
- commerce.weight_sales
- implemented=false
- planned

But current Retail runtime already contains:
- decimal quantity;
- kg/g/liter/ml unit support;
- embedded weight/price barcode logic.

Therefore the capability catalog does not yet cleanly describe the existing Retail weighted-sale behavior.

Before Retail commercial closure, decide whether:
- current weighted sale is baseline Retail behavior and commerce.weight_sales is a future advanced capability;
or
- commerce.weight_sales should become the controlling implemented Feature.

Do not leave an ambiguous capability code.

---

## 3. No current Retail Business in Sharawla Cloud

Read-only Cloud audit found:
- zero Businesses currently assigned POS Profile = retail.

Therefore there is currently no genuine Retail Business/device runtime context to certify.

SH-0007 remains the isolated Restaurant Beta Business/device and must not be casually repurposed before its pending Restaurant G0-G3 acceptance is closed.

### Recommended Retail acceptance topology

Create a dedicated isolated Retail Beta environment after the current Restaurant gate.

Preferred:
- new Beta Retail Business;
- dedicated Retail test device;
- dedicated Business Connection;
- dedicated operational backend cloned from the accepted Beta schema baseline.

Reason:
the current operational-backend security design is Business-scoped, and X2 trusted Profile binding is a single trusted operational Business/Profile identity.

Do not connect a Restaurant-bound and Retail-bound Business to the same future singleton-bound operational backend.

No Support Code is assigned by this design document.

---

## 4. Current Retail navigation surface

Current Retail Engine defines 22 pages:

1. Home
2. POS
3. Orders / invoices
4. Customers
5. Delivery Orders
6. Shifts
7. Inventory
8. Market Settings
9. Retail Offers
10. Promo Codes
11. Stock Count
12. Transfers
13. Suppliers
14. Purchasing
15. Website Management
16. Returns
17. Expenses
18. Products
19. Reports
20. Users
21. Settings
22. Delivery Settings

Current Retail Engine intentionally supports:
- delivery;
- pickup;
- no dine-in/table semantics.

This is the current product contract.

---

## 5. Page-by-page source status

### Core/shared pages

Home:
- present.
- profile-aware navigation.
- needs Retail runtime click acceptance.

Orders:
- shared Core order surface.
- Retail order-type/runtime behavior needs current acceptance.

Customers:
- shared customer UI.
- manual CRUD exists.
- Permissions V2 hardening still open.

Delivery Orders:
- supported by current Retail Engine.
- not Restaurant leakage.
- needs Retail runtime acceptance.

Delivery Settings:
- supported by current Retail Engine.
- driver/zone management exists.
- final Action V2 protection pending.

Shifts:
- shared shift flow.
- Offline open/close exists.
- Retail runtime acceptance required.

Expenses:
- shared.
- Offline expense exists.
- Permissions V2 owner hardening pending.

Returns:
- uses Retail return owner when profile is Retail.
- decimal return path exists.
- variant-aware bridge exists when Variants enabled.
- runtime acceptance required.

Products:
- shared product management.
- Retail Variants UI injects when commerce.variants is enabled.
- product/catalog Action V2 hardening pending.

Users:
- shared.
- Permissions V2 final user/action/location management pending.

Settings:
- shared Settings Hub path.
- Retail runtime/touch acceptance pending.

### Retail-specific pages

POS:
- dedicated renderRetailPOS.
- barcode scan.
- decimal quantities.
- weight/price embedded barcode decoding.
- Retail offers.
- Hold/Resume.
- order type support.
- delivery integration.
- variant bridge when enabled.

Inventory:
- Core Inventory Overview has Retail adapter.
- Retail detailed stock owner exists.
- product-level and variant-level balance support exists.
- runtime acceptance required.

Market Settings:
- unit type.
- decimal quantity.
- qty step/min qty.
- barcode mode / embedded-weight configuration.
- Retail only.

Retail Offers:
- percent.
- fixed.
- buy X get Y.
- second-half.
- branch and website support.
- edit/archive UI exists.

Stock Count:
- product stock count UI.
- posts ledger adjustment.
- acceptance has rollback/negative guard test.
- variant-level stock-count UX is not currently the primary count screen.

Transfers:
- send/receive flow exists.
- product-level transfer UI exists.
- server stock ledger movements exist.
- runtime acceptance needed.
- variant-transfer completeness requires explicit acceptance if Variants is sold.

Suppliers:
- Retail supplier UI exists.
- advanced supplier terms schema exists.
- Action/Profile hardening pending.

Purchasing:
- baseline PO / approve / GRN / supplier return exists.
- Advanced Purchasing UI is Feature-gated and injects additional workflows.

Website Management:
- Retail website backend/front-end contract exists.
- separate Retail website order intake UI exists.
- acceptance required under current Retail profile.

Promo Codes:
- shared promotion engine plus Retail Offers.
- stacking policy needs current Retail acceptance.

Reports:
- generic current report UI exists.
- this is a major Retail closure gap; see Reporting section.

---

## 6. Retail POS status

Confirmed current capabilities:

- normal barcode lookup;
- EAN/embedded weight/price barcode path;
- decimal quantities;
- configurable quantity steps;
- product availability by branch;
- Retail Offers;
- Hold / Resume suspended sale;
- mixed/shared payment infrastructure;
- takeaway / pickup / delivery;
- Retail-specific atomic sale owner;
- Retail-specific return owner;
- local-first Offline sale;
- local-first Offline return;
- Point4 inventory movement integration foundation.

### Variants

When commerce.variants is enabled:
- product can expose true stock-unit variants;
- picker supports combinations;
- SKU/barcode lookup exists;
- independent variant stock exists;
- sale payload carries variant identity;
- sale routes to variant-aware atomic owner;
- return routes to variant-aware return owner;
- Offline sale payload is enriched with variant identity.

Variants are implemented in Cloud but are not baseline-enabled for every Retail profile.

Therefore Variants closure needs:
- explicit entitlement on a Retail Beta Business;
- runtime test with actual size/color/etc.;
- barcode/SKU scan;
- sale;
- return;
- offline sale/sync;
- purchasing/receiving;
- report verification.

---

## 7. Inventory status

Current backend includes:
- retail_inventory_balances
- retail_inventory_movements
- retail_inventory_settings
- retail_variant_inventory_balances
- retail_variant_inventory_movements
- stock count tables
- transfer tables
- reservations
- inventory value adjustment table for Landed Cost.

Current Beta data proves the schema is actively exercised:
- products: 7
- product_variants: 8
- retail inventory balances: 3
- retail inventory movements: 59
- retail variant balances: 0 currently.

This is schema/runtime evidence, not Retail production acceptance.

### Open inventory closure items

- variant-aware stock count end-to-end;
- variant-aware transfer end-to-end where commercial contract requires it;
- stock movement history/report UI;
- valuation report;
- permission hardening;
- offline policy for manual adjustments/counts/transfers.

---

## 8. Purchasing status

Baseline Retail chain is present:

Supplier
-> PO
-> Approval
-> GRN
-> weighted average cost
-> Supplier Return

Current backend data:
- suppliers: 1
- purchase orders: 1
- goods receipts: 1
- supplier returns: 2

Current Retail Coverage acceptance includes a write roundtrip:
PO
-> Approve
-> GRN
-> Supplier Return
-> stock/cost restoration
-> cleanup zero.

### Advanced Purchasing

Feature-gated UI includes:

- Purchase Requests (PR)
  - create
  - submit
  - approve/reject
  - convert to PO

- Advanced PO
  - PO number
  - expected date
  - variant-aware lines

- Supplier Invoice
- 3-Way Match
- exception approval
- Replenishment rules
- suggestion -> PR
- Supplier Return V2
- Landed Cost allocation

Capabilities controlling advanced UI:
- inventory.purchase_orders
- inventory.supplier_returns
- inventory.replenishment
- inventory.landed_cost
- commerce.variants

All are currently implemented in Cloud, but several are add-ons/not baseline-enabled.

---

## 9. Landed Cost finding

The backend already contains:
- retail_landed_cost_allocate_v1
- retail_landed_cost_post_v1
- retail_inventory_value_adjustments_v1

The posting owner:
- checks authenticated user;
- checks inventory/admin legacy permission;
- checks branch access;
- posts an average-cost adjustment;
- rejects posting if stock already moved out/was adjusted after the receipt;
- supports both product and variant balances;
- is idempotent at adjustment-line level.

However current Advanced Purchasing UI only exposes allocation and explicitly describes valuation/COGS posting as a separate gate.

Therefore current product status is:

**Backend posting exists; POS operational posting UX + current acceptance are not closed.**

Retail closure must decide:
- expose Post action with strong confirmation + Action V2;
or
- keep Landed Cost allocation-only capability and do not sell “posted landed cost” yet.

Do not claim full Landed Cost product closure until this is resolved.

---

## 10. Website status

Retail website stack exists:

- bootstrap;
- catalog;
- branch open state;
- quote;
- offers;
- website order creation;
- reservation;
- order details;
- accept order;
- reject order;
- accepted order lineage.

Retail POS has a dedicated Website Orders intake UI:
- pending/active list;
- order details;
- accept;
- reject;
- link to POS order.

Current Beta data:
- retail_website_orders: 6.

Needs current isolated Retail acceptance:
- create;
- reservation;
- expiry;
- accept;
- reject;
- stock release;
- order lineage;
- payment state;
- pickup/delivery;
- Point4 identity;
- cleanup zero.

---

## 11. Offline status

### Confirmed local-first Offline operations

Current shared queue explicitly owns:
- sale;
- return;
- expense;
- shift_open;
- shift_close.

For Retail:
- sale sync -> create_retail_pos_order_atomic
- return sync -> create_retail_order_return_idempotent

Variant bridge enriches Offline Retail sale items when Variants is enabled.

Current E2E acceptance also contains:
- Retail Offline sale -> durable outbox -> sync -> return.
- lost ACK -> retry -> exactly one order.

### Not closed as Offline business operations

Current standard queue does NOT provide full standalone Offline workflows for:
- supplier creation;
- purchase request;
- PO;
- approval;
- GRN;
- supplier return;
- stock count;
- transfer;
- inventory adjustment;
- variant inventory adjustment;
- Landed Cost;
- website intake.

Offline V2 Inventory ledger/projection can represent inventory effects attached to supported local-first operations, but that is not equivalent to all inventory/purchasing workflows working offline.

Retail closure requires an explicit policy:

Option A:
- only POS/return/shift/expense are guaranteed Offline;
- management inventory/purchasing requires online.

Option B:
- expand local-first ownership to selected Retail management operations.

Do not imply Option B exists today.

---

## 12. Reports / financial closure

Current report UI is strong for generic operational sales:
- sales totals;
- returns;
- expenses;
- net sales;
- payment totals;
- discounts;
- delivery fees;
- product quantity/sales;
- channels;
- busy hours;
- drivers/zones;
- promos;
- return reasons;
- employee performance;
- shift filtering;
- print;
- CSV.

But current report fetches order_items without cost and aggregates by product_name.

It does NOT currently provide a Retail financial reporting pack for:

- COGS;
- gross profit;
- gross margin;
- inventory valuation;
- stock movement ledger;
- stock adjustment analysis;
- purchase/GRN totals;
- supplier return analysis;
- supplier statement/payables;
- PO/PR cycle metrics;
- invoice / 3-Way Match exceptions;
- Landed Cost impact;
- Replenishment performance;
- variant-level sales/profit/stock;
- slow/fast moving inventory;
- dead stock / ageing.

### Variant report gap

order_items stores:
- variant_id
- variant_name
- variant_sku
- variant_barcode

Current generic report does not select/use these fields.

Therefore variant-level reporting is not closed.

### Report terminology gap

Current generic Report filter UI still hardcodes:
- takeaway
- pickup
- delivery
- dinein labels

Retail Engine already exposes a profile-specific report order-type contract.

Retail closure should make Report filters consume the engine contract so:
- Retail shows Retail terminology;
- dine-in is not shown for Retail.

---

## 13. Permissions/security status

Retail backend security is not closed.

From the Cross-Profile audit:
- Retail family has 52 audited functions.
- 46 are SECURITY DEFINER and client-executable.
- 0 / 52 currently consume Action V2.
- many rely on legacy permissions and branch access.
- no trusted server-side Retail Profile guard exists yet.

This means UI/profile routing is stronger than backend authorization.

Retail closure requires the already-designed:
- X1 ACL hardening;
- X2 trusted Profile binding;
- X3 Action + Location;
- X4 cross-profile negative matrix.

Do not expose Retail operations to Sharawla AI before this closure.

---

## 14. Acceptance status

### Historical Beta23 suite

The old Full Retail Acceptance suite has useful checks:
- isolation lock;
- engine;
- decimal quantities;
- EAN13;
- inventory;
- suppliers/purchasing;
- offers;
- stock count;
- transfers;
- website;
- payments;
- idempotency;
- sale/return;
- offline/update/printing.

But one historical assumption is now stale:

It treats:
- deliveryOrders
- deliverySettings

as Restaurant leakage.

Current Retail Engine intentionally supports Delivery.

Therefore the Beta23 suite cannot be used unchanged as the final Retail gate.

### Current E2E / Retail coverage

Current newer acceptance includes:
- open-shift precondition;
- customer CRUD;
- Retail sale -> payment -> stock -> return;
- expense idempotency;
- Offline local-first sale -> sync -> return;
- lost ACK idempotency;
- cleanup zero.

Retail Coverage V53 adds:
- live products contract;
- Variants runtime contract when enabled;
- purchasing roundtrip;
- replenishment read model;
- transfer atomic guard;
- stock-count rollback guard.

This is a good base but not a complete Retail Product Closure gate.

---

## 15. Current Retail gaps by priority

### Priority R0 — Environment / acceptance
- no Retail Business currently exists in Cloud;
- no dedicated Retail device/runtime evidence;
- historical acceptance assumptions need modernization.

### Priority R1 — Security
- trusted Retail Profile owner guard;
- Action V2;
- Location scope;
- ACL hardening;
- direct REST/RLS bypass review.

### Priority R2 — Reports / finance
- COGS;
- margin/profit;
- inventory valuation;
- purchase/supplier reports;
- stock ledger;
- variant reports;
- Retail terminology.

### Priority R3 — Offline policy
Choose and document whether:
- management operations are online-only;
or
- selected purchasing/inventory operations become local-first.

### Priority R4 — Add-ons
Runtime closure for:
- commerce.variants;
- inventory.purchase_orders;
- inventory.supplier_returns;
- inventory.replenishment;
- inventory.landed_cost.

### Priority R5 — UX
- current 22-page click-through;
- touch pass;
- compact screens;
- no stale Beta17/Beta23 instruction text;
- remove old “run beta SQL first” messages from production-ready UI.

---

## 16. Retail closure gate proposal

### RG0 — Dedicated Retail Beta environment
- Retail Business.
- dedicated device.
- isolated backend.
- Cloud profile=retail.
- no Production data.

### RG1 — Navigation / Profile
- 22 pages.
- no Restaurant kitchen/tables leakage.
- Delivery remains intentionally present.
- profile terminology correct.

### RG2 — POS core
- barcode;
- decimal/weight;
- hold/resume;
- offers;
- payments;
- sale/return;
- pickup/delivery;
- Offline sale/return;
- lost ACK.

### RG3 — Inventory
- overview;
- detail;
- adjustments;
- count;
- transfer;
- ledger;
- permissions.

### RG4 — Purchasing
- suppliers;
- PO;
- approval;
- GRN;
- return;
- cleanup zero.

### RG5 — Advanced add-ons
Per entitled feature only:
- Variants;
- PR;
- invoice/3-way match;
- replenishment;
- Landed Cost.

### RG6 — Website
- public order;
- reservation;
- accept/reject;
- release;
- lineage;
- payment;
- cleanup.

### RG7 — Permissions / Cross-profile
- X1-X4 accepted for Retail.

### RG8 — Reports / finance
- sales;
- COGS;
- profit/margin;
- valuation;
- movement;
- purchasing;
- suppliers;
- variants where enabled.

### RG9 — Touch / Printing / Backup / Update
- touch pass;
- receipt;
- report print;
- backup/restore;
- updater health.

### RG10 — Retail Closure
Only after all mandatory baseline gates PASS.

Add-on gates may be commercially optional, but any advertised add-on must be independently CLOSED before sale.

---

## 17. Current closure classification

### Source/backend substantially ready
- Retail Engine
- POS
- barcode/decimal/weight runtime
- inventory
- suppliers
- baseline purchasing
- stock count
- transfers
- offers
- website
- returns
- delivery
- variants foundation/runtime
- advanced purchasing backend/UI foundations
- core Offline sale/return
- acceptance infrastructure

### Needs genuine Retail runtime evidence
- all 22 routes
- Retail Delivery/Pickup
- current Reports under Retail
- Retail Settings
- current Website intake
- Variants full flow
- Advanced Purchasing full flow
- Touch
- Printing
- Backup/Restore
- current update candidate under Retail

### Real implementation/closure gaps
- Retail-specific reporting/financial pack
- Profile/Action/Location backend security
- ACL hardening
- Offline policy/implementation for non-POS management operations
- modernized final Retail acceptance pack
- Landed Cost posting UX/product decision
- capability catalog alignment for weighted sales
- dedicated Retail Beta environment

---

## 18. Exact next work while no laptop

Read-only/design work can continue with:

1. Retail final menu grouping and product UX cleanup.
2. Retail Reports V1 contract.
3. Retail Permissions Action Matrix.
4. Retail Offline support matrix.
5. Retail Acceptance V2 design.
6. Retail Beta environment provisioning plan.

Do not deploy these while Restaurant G0-G3 remains open.

---

## 19. Current status

Retail Closure:
OPEN.

Retail is much closer than a new activity.
It already has a broad operational product foundation.

Immediate device work remains Restaurant SH-0007 58.26 G0-G3.

Retail preparation may continue in parallel as Documentation/Read-Only work.
