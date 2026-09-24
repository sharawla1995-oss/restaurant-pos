# Sharawla Retail V1 — Official Closure Roadmap

Status: OFFICIAL DESIGN / DOCUMENTATION ONLY
Branch: beta56-offline-ownership-consolidation
Production impact: NONE
Runtime change: NONE
DB/Cloud mutation: NONE

This document is the official Retail/Market V1 closure roadmap.

"Retail V1 CLOSED" means:
- all mandatory baseline scope is implemented and accepted;
- every sold Add-on has its own accepted closure;
- security/reporting/offline/product rules are explicit;
- rollback and evidence exist;
- no Critical/High blocker remains.

---

# Evidence model

Every Gate is tracked against:

- SOURCE
- CLOUD/DB
- RUNTIME
- ACCEPTANCE
- ROLLBACK

State:
- PASS
- FAIL
- OPEN
- N/A with explicit reason

A Gate closes only when every applicable dimension is PASS or justified N/A.

---

# Global hard boundary

Production remains frozen:

- SH-0005 — Top Burger الدقي — 10.5.3 CLEAN
- SH-0006 — Top Burger العشرين — 10.5.3 CLEAN

SH-0007 remains Restaurant Beta until Restaurant 58.26 G0-G3 closes.

Retail final acceptance uses:
- dedicated Retail Business;
- dedicated Retail device;
- dedicated Retail operational backend.

Do not repurpose SH-0007 for Retail convenience.

Canonical Stock:
OFF

Cutover:
OFF

---

# R0 — Safety Baseline / Dedicated Retail Environment

## Goal

Create a completely isolated Retail test environment.

## Required

- Restaurant SH-0007 G0-G3 closed first.
- Retail Business in Sharawla Cloud.
- Profile=retail.
- Activity Category=retail / التجارة والتجزئة.
- dedicated Cloud branch.
- dedicated license.
- dedicated device.
- dedicated Business Connection.
- dedicated operational backend.
- pinned source/schema.
- backup + rollback.

## Current state

Design:
CLOSED

Provisioning:
NOT STARTED

Current Retail Cloud Business count:
0

---

# R1 — Point4 / Retail Stock Ownership Baseline

## Goal

Preserve one owner for every Retail stock movement.

Platform Point4 is not reopened.

Required Retail ownership evidence for:
- sale;
- return;
- adjustment;
- stock count;
- transfer;
- purchase receive;
- supplier return;
- variant stock where enabled;
- reservation/website stock.

## Invariant

No double-write.

Every committed business movement creates one authoritative stock effect and one idempotent replay identity where required.

## Current state

Foundation:
SUBSTANTIAL

Runtime closure:
OPEN

---

# R2 — Retail Profile / Capability / Security Baseline

## Goal

Backend knows this Business is Retail.

## Required

- trusted Profile=retail;
- no client-selected Profile;
- feature eligibility from Cloud;
- Action V2;
- Location scope;
- ACL intent;
- cross-profile isolation.

Every new sensitive Retail owner from this Gate onward uses:

trusted Profile
AND Action
AND Location where applicable
AND business invariants.

## Current state

Design:
CLOSED

Implementation:
OPEN

---

# R3 — Product / Catalog Master

## Goal

Complete normal Retail product master.

## Required

- product name
- category
- price
- barcode
- active/inactive
- branch availability
- cost source
- stock tracking flag
- low-stock setting
- website visibility where enabled

## Acceptance

- create/edit
- duplicate barcode rules
- active/inactive behavior
- branch availability
- permission/location protection

## Current state

Foundation:
PRESENT

Closure:
OPEN

---

# R4 — Units / Decimal / Barcode / Weighted Sales

## Goal

Make quantity and barcode behavior explicit.

## Baseline Retail

Current runtime already supports:
- decimal quantity;
- kg/g/liter/ml style quantity;
- normal barcode;
- embedded weight/price barcode paths.

## Capability alignment issue

Cloud currently has commerce.weight_sales as planned/not implemented while runtime already has weighted/embedded behavior.

Before closure choose:

A. decimal/fraction quantity = baseline Retail and commerce.weight_sales controls advanced scale/embedded barcode behavior;

or

B. commerce.weight_sales becomes the controlling implemented Feature.

## Acceptance

- decimal quantity
- step/min
- normal barcode
- EAN/embedded barcode
- rounding
- return of decimal quantity
- stock reconciliation

## Current state

Runtime foundation:
PRESENT

Capability contract:
OPEN

---

# R5 — Retail POS Core

## Goal

Complete daily counter sale.

## Required

- fast barcode/search
- product selection
- customer
- takeaway / Retail sale
- pickup where enabled
- delivery where enabled
- discounts
- promo/offer calculation
- configured payment methods
- mixed payment
- shift precondition
- printing
- atomic sale
- idempotency
- stock deduction

## Acceptance

- normal sale
- mixed payment
- discount
- decimal sale
- delivery/pickup
- retry exactly once
- cleanup zero

## Current state

Foundation:
SUBSTANTIAL

Runtime closure:
OPEN

---

# R6 — Returns

## Goal

Close Retail returns against exact original sale evidence.

## Required

- partial return
- full return
- decimal return
- no over-return
- original order-item lineage
- payment refund
- stock restore
- cost history preserved
- idempotent retry

## Variants

When enabled:
return preserves variant identity.

## Current state

Foundation:
PRESENT

Runtime/security closure:
OPEN

---

# R7 — Customers

## Goal

Close Retail customer management without making every cashier a CRM admin.

## Required

- phone lookup
- create
- edit
- addresses
- duplicate prevention
- import if sold
- order history

## POS rule

Sale-owned minimal customer resolve/create may be allowed separately from full manual CRM editing.

## Current state

Foundation:
PRESENT

Permissions closure:
OPEN

---

# R8 — Offers / Promotions / Discounts

## Goal

Make Retail pricing rules deterministic.

## Required

Retail Offers:
- percent
- fixed
- buy X get Y
- second-half
- product scope
- start/end
- active/archive
- website flag

Promo:
- validity
- scope
- expiry
- branch/product/category
- stacking policy

Manual discount:
separate Action.

## Acceptance

- best-rule behavior
- no total discount > subtotal
- disabled/expired offers ignored
- web/POS parity where promised

## Current state

Foundation:
PRESENT

Closure:
OPEN

---

# R9 — Inventory Operations

## Goal

Close day-to-day Retail stock.

## Required

- overview
- detailed balances
- tracked/untracked
- manual adjustment
- low stock
- movement ledger
- physical/system reconciliation

## Acceptance

- positive/negative adjustment
- zero invalid
- location permission
- ledger balance_after correct
- no stock drift

## Current state

Foundation:
PRESENT

Closure:
OPEN

---

# R10 — Stock Count

## Goal

Close count posting and variance control.

## Required

- system qty
- counted qty
- variance
- post
- rollback on invalid line
- audit
- branch scope

## Variants

Variant-aware stock count required only if the sold Variants contract includes it.

## Current state

Foundation:
PRESENT

Closure:
OPEN

---

# R11 — Transfers

## Goal

Close branch-to-branch Retail stock movement.

## Required lifecycle

Create
-> Sent / In Transit
-> Receive
-> Complete
-> Cancel where allowed

## Invariants

- source deduction
- no destination credit before receive
- duplicate receive prevented
- correct branch authorization

## Variants

If Variants are sold with transfer support:
preserve variant identity.

## Current state

Foundation:
PRESENT

Closure:
OPEN

---

# R12 — Suppliers / Baseline Purchasing

## Goal

Close normal Retail purchasing.

## Required

Supplier
-> PO
-> approval
-> GRN
-> cost update
-> supplier return

## Acceptance

- partial/full receive
- weighted average cost
- supplier return
- stock/cost reconciliation
- cleanup zero
- idempotency

## Current state

Foundation:
SUBSTANTIAL

Runtime closure:
OPEN

---

# R13 — Variants Add-on

## Feature

commerce.variants

## Goal

Close stock-unit variants independently.

## Required

- axes
- values
- combinations
- SKU
- barcode
- active/inactive
- independent variant stock
- POS picker
- scan
- sale
- return
- offline sale/sync
- purchasing receive

## Optional contract decisions

Explicitly decide whether Variants V1 includes:
- stock count
- transfers
- reporting
- website variant selection

Any advertised capability must be accepted.

## Current state

Implementation:
PRESENT

Entitlement/runtime closure:
OPEN

---

# R14 — Advanced Purchasing Add-ons

## Features

- inventory.purchase_orders
- inventory.supplier_returns
- inventory.replenishment
- inventory.landed_cost

## Workflows

- Purchase Requests
- submit
- approve/reject
- convert to PO
- Supplier Invoice
- 3-Way Match
- exception handling
- Reorder rules
- suggestion -> PR
- Supplier Return V2
- Landed Cost allocation

## Landed Cost critical decision

Backend posting exists.

Product must explicitly decide:
- allocation-only
or
- allocation + inventory valuation posting.

Do not market full Landed Cost posting until UI/security/reporting acceptance passes.

## Current state

Foundation/UI/backend:
PRESENT

Commercial/runtime closure:
OPEN

---

# R15 — Delivery / Pickup

## Goal

Close Retail non-counter fulfillment.

## Required

Pickup:
- branch
- customer
- ready/completed

Delivery:
- address
- zone
- fee
- driver
- status
- final payment
- cash custody/settlement

No Restaurant kitchen/table dependency.

## Current state

Shared Delivery foundation:
PRESENT

Retail runtime closure:
OPEN

---

# R16 — Retail Website

## Goal

Close public Retail ordering.

## Required

- branch selection
- open state
- catalog
- quote
- offers
- reservation
- create order
- idempotency
- reservation expiry
- accept
- reject
- release
- pickup
- delivery
- payment state
- accepted POS order lineage

## Rule

Website order + final POS order must not double-count revenue.

## Current state

Foundation:
PRESENT

Runtime closure:
OPEN

---

# R17 — Offline Retail

## V1 recommended product promise

Guaranteed Offline:
- login/bootstrap under accepted cached/grace rules
- sale
- return for sufficiently cached orders
- shift open/close
- expenses
- local printing

Online-required initially:
- suppliers
- purchasing
- stock count
- transfers
- manual inventory management
- advanced purchasing
- website intake
- admin/settings
- full reports

## Optional future expansion

- Hold/Resume
- adjustment
- stock count
- transfer
- supplier return
- GRN
- PR/PO only with safe approval semantics

## Closure rule

An operation can be intentionally ONLINE_ONLY and still be CLOSED if:
- this is explicit;
- UI is fail-visible;
- acceptance verifies it.

## Current state

POS-critical Offline:
SUBSTANTIAL

Management Offline:
NOT IMPLEMENTED

---

# R18 — Retail Reports / Finance

## Required

- sales
- returns
- discounts
- payment
- COGS
- gross profit
- gross margin
- inventory valuation
- stock movement ledger
- stock count variance
- purchasing
- supplier returns
- supplier invoices
- Landed Cost impact
- replenishment
- variant profitability/stock when enabled
- slow/fast/dead stock

## Historical cost rule

Use sale-time order_items.cost.

Return COGS reversal uses original order-item cost.

Do not recalculate historical COGS from current cost.

## Current state

Design:
CLOSED

Implementation:
OPEN

---

# R19 — Printing / Touch / UX

## Printing

- customer receipt
- return receipt
- shift
- stock count
- transfer
- purchasing receive
- supplier return
- reports

## Touch

- POS
- Customers
- Orders
- Inventory
- Count
- Transfers
- Purchasing
- Products
- Reports
- Settings

## Menu/UX

Final groups:
1. الرئيسية
2. المبيعات
3. الطلبات والقنوات
4. الأصناف والتسعير
5. المخزون
6. الموردون والمشتريات
7. المالية والتقارير
8. الموقع والتوصيل
9. الإدارة والإعدادات

Remove:
- customer-facing Beta/SQL instructions
- stale Market-only generic terminology
- DOM-only Website Orders route ownership

## Current state

Design:
CLOSED

Runtime cleanup:
OPEN

---

# R20 — Permissions / Cross-Profile / Audit Final Closure

## Required

- trusted Profile=retail
- Action V2
- Location scope
- ACL hardening
- RLS alignment
- direct RPC negative tests
- direct REST bypass tests
- audit
- cross-profile matrix

## Representative expected failures

- PROFILE_MISMATCH
- ACTION_DENIED
- LOCATION_DENIED

## Current state

Design:
CLOSED

Deployment/execution:
OPEN

---

# R21 — Diagnostics / Recovery

## Diagnostics

One Retail diagnostics pack checks:
- Engine/Profile
- Cloud/runtime config
- navigation
- products
- inventory
- purchasing
- variants when entitled
- website
- permissions
- offline
- printing
- backup/update

## Recovery

Test:
- restart
- crash
- network loss
- lost ACK
- sync resume
- pending outbox
- backup/restore
- update/rollback

No:
- duplicate invoice
- lost invoice
- stock drift

## Current state

Partial platform foundations:
PRESENT

Retail consolidated closure:
OPEN

---

# R22 — Full Retail Acceptance Harness

## Dataset

Deterministic isolated Retail fixtures.

## Baseline

- customer
- products
- tracked stock
- decimal product
- barcode product
- offer
- supplier
- two branches
- delivery zone/driver
- website product

## Add-on fixtures

Only when entitled:
- variants
- advanced purchasing
- landed cost

## Required

- happy paths
- negative paths
- duplicate requests
- concurrency
- offline/online
- cleanup zero
- stock/cost reconciliation

## Current state

Acceptance V2 design:
CLOSED

Execution:
OPEN

---

# R23 — Multi-Branch / Windows / UAT

## Multi-Branch

At least two Retail branches:
- purchase
- transfer
- sale
- return
- count
- reports
- branch permissions

## Windows

- x64
- ia32 only if still commercially supported
- barcode scanner
- receipt printer
- update
- backup
- restart
- offline/online

## UAT

One realistic Retail working day:
- open shift
- receive
- sale
- hold/resume
- promo/offer
- delivery/pickup
- return
- count
- transfer
- reports
- close shift

## Current state

OPEN

---

# R24 — Final Closure / Release

## Baseline closure

All mandatory Retail Gates PASS.

## Add-ons

Every sold optional Feature independently PASS.

## Required

- zero Critical blockers
- zero High regressions
- source pinned
- DB migration set pinned
- Cloud config pinned
- backup
- rollback
- limitations documented
- second isolated Retail device validation

## Official states

After baseline closure:
SHARAWLA RETAIL V1 — CLOSED

After release validation:
SHARAWLA RETAIL V1 — PRODUCTION READY

## Current state

OPEN

---

# Corrected execution order

Immediate prerequisite:

Restaurant SH-0007 58.26
-> G0
-> G1
-> G2
-> G3

Then Retail:

R0 Environment
-> R1 Point4 ownership
-> R2 Retail Profile/security baseline
-> R3 Product Master
-> R4 Units/Decimal/Barcode
-> R5 POS
-> R6 Returns
-> R7 Customers
-> R8 Offers/Promos
-> R9 Inventory
-> R10 Stock Count
-> R11 Transfers
-> R12 Baseline Purchasing
-> R13 Variants if sold
-> R14 Advanced Purchasing Add-ons if sold
-> R15 Delivery/Pickup
-> R16 Website
-> R17 Offline policy/implementation
-> R18 Reports/Finance
-> R19 Printing/Touch/UX
-> R20 Security Final
-> R21 Diagnostics/Recovery
-> R22 Full Acceptance
-> R23 Multi-Branch/Windows/UAT
-> R24 Final Closure/Release

---

# Current highest-priority Retail blockers

1. no dedicated Retail Business/device/backend yet.
2. no genuine current Retail runtime acceptance.
3. trusted Retail Profile/Action/Location/ACL implementation open.
4. Retail Reports/Finance implementation open.
5. weighted-sales capability contract ambiguous.
6. final Offline commercial promise not formally approved.
7. historical Beta23 acceptance has stale Delivery assumptions.
8. Menu/UX still contains developer-era setup messages/route ownership.
9. Variants/Add-ons need separate entitlement acceptance.
10. Landed Cost posting product decision remains open.

---

# Current official Retail status

Design coverage:
SUBSTANTIAL / PREPARED

Runtime implementation:
SUBSTANTIAL

Dedicated Retail runtime evidence:
NONE YET

Retail Cloud Business count:
0

Production readiness:
NOT READY

Immediate device gate:
Restaurant SH-0007 58.26 G0-G3

No Runtime/DB/Cloud/Production mutation was performed by this document.
