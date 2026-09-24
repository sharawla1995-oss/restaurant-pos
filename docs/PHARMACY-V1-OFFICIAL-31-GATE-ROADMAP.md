# Sharawla Pharmacy V1 — Official 31-Gate Closure Roadmap

Status: OFFICIAL DESIGN / DOCUMENTATION ONLY
Branch: beta56-offline-ownership-consolidation
Current runtime: 10.5.4-beta.58.26 candidate line
Production impact: NONE
DB deployment: NONE
Cloud mutation: NONE
Version change: NONE

This document is the corrected official closure roadmap for Sharawla Pharmacy V1.

"100% CLOSED" means:
- all agreed V1 scope is implemented or intentionally N/A;
- every applicable gate has evidence;
- no open Critical/High blockers remain;
- rollback/backup is defined where applicable;
- Production is not promoted until the complete closure chain passes.

It does NOT mean the product can never have a future bug.

---

# 0. Evidence model

Every Gate is tracked against these evidence dimensions:

- SOURCE
- CLOUD/DB
- RUNTIME
- ACCEPTANCE
- ROLLBACK

Each dimension must be one of:
- PASS
- FAIL
- OPEN
- N/A — with an explicit reason

Do not force a code/DB change merely to make every column non-N/A.

A Gate closes only when every applicable dimension is PASS or justified N/A.

---

# 1. Global hard boundary

Production remains frozen:

- SH-0005 — Top Burger الدقي — 10.5.3 CLEAN
- SH-0006 — Top Burger العشرين — 10.5.3 CLEAN

Do not:
- install Beta there;
- migrate/rebind;
- alter Canonical Fingerprint;
- activate Canonical Stock;
- activate Cutover;
- use Top Burger Production data for Pharmacy acceptance.

SH-0007 remains the isolated Restaurant Beta until Restaurant 58.26 G0-G3 closes.

Pharmacy final acceptance uses a dedicated isolated Pharmacy Business/device/backend.

---

# Gate 0 — Safety Baseline & Environment Lock

## Goal

Guarantee that Pharmacy work cannot affect Production and that every later Gate starts from a known reversible baseline.

## Required

- Restaurant SH-0007 58.26 G0-G3 closed first.
- dedicated Pharmacy Beta Business planned/provisioned later.
- dedicated Pharmacy operational backend.
- dedicated Pharmacy device.
- pinned source commit.
- pinned schema/migration baseline.
- database backup/checkpoint.
- app backup/restore path.
- rollback instructions.
- no Production connection.

## Evidence

SOURCE:
- pinned Git SHA.

CLOUD/DB:
- exact Pharmacy Business/Profile/Connection/backend identity.

RUNTIME:
- verified Pharmacy device only.

ACCEPTANCE:
- environment lock test.

ROLLBACK:
- known-good app + DB restore boundary.

## Current status

DESIGN: CLOSED
EXECUTION: NOT STARTED

---

# Gate 1 — Point4 Platform Baseline + Pharmacy Batch Ownership

## Correction from old plan

Do NOT reopen the entire Point4 investigation.

Platform baseline is already:
- Ownership Mapping = 61/61 CLOSED
- 46 pre-cutover contracts evidence-complete
- Canonical Stock = OFF
- Cutover = OFF

What Pharmacy still needs is a Pharmacy-specific ownership extension.

## Goal

For every Pharmacy stock-changing workflow:
- one business owner;
- one product-stock effect;
- one batch-stock effect;
- no double-write;
- no ambiguous return/transfer ownership.

## Required invariants

For tracked-batch products:

shared product stock delta
=
sum(batch stock deltas)

for:
- sale;
- return;
- receive;
- supplier return;
- adjustment;
- waste;
- transfer send;
- transfer receive;
- stock count;
- reversal/cleanup.

## Critical current gap

Pharmacy-specific return owner is missing.

Current sale-to-batch allocation is not yet bound to order_item_id.

## Current status

Platform Point4 baseline:
CLOSED

Pharmacy Batch ownership:
OPEN

---

# Gate 2 — Pharmacy Profile / Cloud Identity / Backend Security Baseline

## Goal

The system must know, server-side, that this Business is Pharmacy.

## Required

Cloud:
- POS Profile = pharmacy
- Activity Category = pharmacies
- feature eligibility resolved correctly
- Business Connection points to Pharmacy backend

Operational:
- trusted profile binding = pharmacy
- no client-supplied profile authority

Security baseline from day one:
- Profile guard
- Action V2
- Location scope
- ACL intent
- audit owner

## Important rule

Permissions/security are not postponed until Gate 22/23.

Every new Pharmacy mutation owner created after Gate 2 must already use the final security pattern.

Gate 22/23 become final role/security closure, not first-time protection.

## Current status

Design:
CLOSED

Runtime/DB implementation:
OPEN

---

# Gate 3 — Drug Master

## Goal

Complete authoritative medicine master data.

## Required fields

- trade name
- scientific name
- active ingredient
- strength
- dosage form
- manufacturer
- registration number
- barcode
- prescription_required
- controlled_drug
- track_batch
- reorder level
- substitute relations
- active/inactive

## UX split

Generic Products:
commercial product master.

Drug Catalog:
pharmacy metadata.

## Acceptance

- create/edit
- duplicate barcode rules
- required field rules
- inactive product behavior
- direct-RPC permission checks
- feature-aware visibility

## Current status

Foundation:
PRESENT

Closure:
OPEN

---

# Gate 4 — Units & Packs

## Goal

Close Pharmacy pack/unit conversion before purchasing, stock, POS and returns are considered complete.

## Required concepts

Examples:
- box
- strip
- tablet
- bottle
- unit

Each medicine may define:
- base stock unit
- purchase unit
- sale unit
- conversion factor

## Invariants

The same conversion authority must be used by:
- purchase
- receiving
- batch quantity
- sale
- return
- stock count
- transfer
- adjustment
- reports

No floating conversion drift.

Do not allow invalid fractional quantities for non-divisible units.

## Acceptance

Examples:
- 1 box = 10 strips
- 1 strip = 10 tablets
- receive boxes, sell tablets
- return tablets
- count strips/tablets
- reconcile to one canonical base unit

## Current status

Real gap:
OPEN

---

# Gate 5 — Suppliers, Purchasing, AP & Supplier Balance

## Goal

Close the complete supplier financial/stock chain.

## Required

Supplier
-> Purchase Request/PO where used
-> Supplier Invoice
-> Receive
-> Batch creation
-> Cost
-> Supplier Return
-> Supplier Payment
-> Supplier Balance / Payables

## Correction

Purchasing foundation exists.

What is NOT yet closed as a full financial system:
- supplier payment
- supplier payable balance
- supplier account statement
- payment reconciliation

Do not claim full Pharmacy purchasing closure until AP/payables are defined and accepted.

## Acceptance

- create supplier
- PO
- approve
- receive
- batch creation
- invoice
- partial/full payment
- return
- balance reconciliation
- duplicate/idempotent requests
- branch/location security

## Current status

Purchasing foundation:
PRESENT

AP/payables:
OPEN

---

# Gate 6 — Batch Engine

## Goal

Every tracked medicine movement preserves Batch identity.

## Required

Receiving creates:
- batch number
- expiry
- cost
- quantity
- branch
- supplier/receipt lineage

Every stock movement preserves Batch identity.

## Sale-line identity

Required:
pharmacy_order_batch_allocations must bind to exact order_item_id.

Do not rely only on product_id.

## Required workflows

- receive
- sale
- return
- transfer
- adjustment
- waste
- stock count
- supplier return

## Current status

Schema/foundation:
PRESENT

Full ownership/line identity:
OPEN

---

# Gate 7 — Expiry / FEFO / Near-Expiry

## Goal

Expiry control becomes backend-authoritative.

## Required

- block expired batch sale
- FEFO default
- deterministic batch ordering
- 30/60/90 alerts or configurable windows
- near-expiry view
- expired stock
- waste/write-off
- quantity + value exposure in reports

## Override

Non-FEFO override, if allowed:
- separate Action
- explicit reason
- immutable audit

## Current status

UI sort/expiry validation:
PARTIAL

Backend FEFO invariant:
OPEN

---

# Gate 8 — Pharmacy POS

## Goal

Full Pharmacy checkout, not just a Pharmacy-looking screen.

## Required

- fast barcode
- drug search
- scientific-name search
- customer/patient
- takeaway
- pickup
- delivery
- discounts
- configured tax rules
- configured payment methods
- mixed payment
- shift integration
- print
- batch allocation
- Rx/controlled/insurance gates
- canonical Point4 identity

## Correction

Service charge is NOT a mandatory Pharmacy concept.

If configured commercially:
support it.

Otherwise:
N/A.

## Current gaps

- sale currently Online-only
- batch/identity hardening open
- payment/discount/tax integration needs closure evidence
- customer link needs explicit acceptance

## Current status

Foundation:
PARTIAL

Closure:
OPEN

---

# Gate 9 — Customer / Patient Model

## Goal

Stop treating the patient relationship as an incidental customer field.

## Required design decision

Choose and document:

Option A:
Patient extends Customer.

Option B:
Separate Patient entity linked to Customer/guardian/account holder.

This must be explicit before Rx/Insurance closure.

## Required

- phone search
- duplicate prevention
- invoice linkage
- purchase history
- prescriptions
- insurance membership
- delivery addresses
- patient identity fields only where policy requires

## Privacy

Do not expose medical context to staff without the required role/action.

## Current status

Decision:
OPEN

---

# Gate 10 — Prescriptions

## Goal

Prescription enforcement is backend-authoritative and line-based.

## Required

- create prescription
- optional image/document
- prescriber metadata
- prescription items
- quantity
- partial dispensing
- complete
- cancel
- substitute evidence
- sale linkage
- return reversal

## Critical current gap

Today prescription_required is largely enforced by UI.

Required:
server rejects direct sale RPC without valid prescription when required.

## Fulfillment ledger

Record each dispense line:
- prescription item
- order item
- quantity
- dispensed product
- substitute if used
- branch
- employee
- transaction identity

## Current status

Foundation:
PRESENT

Backend closure:
OPEN

---

# Gate 11 — Controlled Drugs

## Goal

Controlled products cannot use unrestricted ordinary checkout.

## Required

- separate Action
- required Rx according to deployment policy
- immutable movement/audit record
- patient/prescriber evidence where configured
- cancellation/return authority
- audit report

## Jurisdiction rule

Legal requirements are deployment/jurisdiction-specific.

Sharawla Core must not invent legal limits without a configured policy.

Commercial closure for a jurisdiction requires legal requirements to be reviewed separately.

## Current status

Flag exists:
YES

Operational enforcement:
OPEN

---

# Gate 12 — Alternatives / Substitutes

## Goal

Safe explicit substitution, never silent replacement.

## Required

- same/configured active ingredient relation
- strength/form compatibility according to configured product rules
- user chooses substitute
- prescription lineage preserved
- optional reason
- Action permission
- audit

## Current status

Foundation:
PRESENT

POS/backend closure:
OPEN

---

# Gate 13 — Insurance

## Goal

Server-authoritative Pharmacy insurance accounting.

## Required

Company
-> Plan
-> Member
-> eligibility
-> copay
-> max coverage
-> prior approval
-> claim
-> review
-> approval/reject
-> settlement
-> reconciliation

## Critical corrections

Client-provided insurance split is not authority.

Backend calculates/validates:
- patient amount
- insurer amount
- coverage
- max coverage
- prior approval

Claim header must have claim line items.

## Current status

Schema/UI:
PRESENT

Financial closure:
OPEN

---

# Gate 14 — Returns

## Goal

Create a Pharmacy-specific return owner.

## Required

create_pharmacy_order_return_idempotent

Must:
- return exact order line
- restore/compensate exact original batch allocation
- prevent over-return
- preserve Point4 identity
- preserve prescription lineage
- reconcile insurance
- support disposition

## Disposition

At minimum:
- restock
- non_restock/quarantine
- waste where supported

Do not automatically put every returned medicine back into sellable stock.

## Critical current gap

Generic return does not restore Pharmacy batch stock.

## Current status

BLOCKER:
OPEN

---

# Gate 15 — Branch Transfers

## Goal

Preserve Pharmacy Batch identity across branches.

## Required lifecycle

Draft/Create
-> Send
-> In Transit
-> Partial Receive
-> Complete
-> Cancel where allowed

Transfer line preserves:
- product
- batch
- expiry
- quantity
- cost
- source
- destination

## Invariants

- source deduction
- no destination credit before receive
- partial receive tracked
- no duplicate receive
- exact batch identity retained

## Current status

Shared transfer foundation:
PRESENT

Pharmacy batch transfer closure:
OPEN

---

# Gate 16 — Delivery / Pickup

## Goal

Pharmacy delivery/pickup behaves as a real pharmacy order.

## Required

- patient/customer
- branch
- address
- delivery/pickup mode
- payment
- driver
- statuses
- final payment confirmation
- driver cash custody/settlement where shared
- Rx/insurance data remains linked
- controlled-drug policy respected

## Current status

Shared Delivery foundation:
PRESENT

Pharmacy-specific closure:
OPEN

---

# Gate 17 — Pharmacy Website

## Goal

Pharmacy web channel.

## Required

- catalog
- search
- branch selection
- stock availability
- pickup
- delivery
- upload prescription/request
- reservation
- oversell prevention
- tracking
- cancellation
- accept/reject intake
- lineage to final POS order

## Public security

Public endpoints are separate from employee Action permissions.

No anonymous direct table writes.

## Current status

Foundation:
PARTIAL

Closure:
OPEN

---

# Gate 18 — Offline Pharmacy

## Goal

Define and implement intentional Offline behavior.

## Important correction

"Closed" does NOT require every Pharmacy workflow to work Offline.

A workflow may be intentionally:
- OFFLINE_SAFE
or
- ONLINE_ONLY_FAIL_CLOSED

if this is explicit, tested and commercially documented.

## Candidate phases

Phase 0:
sale/return Online-only while integrity gaps are open.

Phase 1:
ordinary non-insurance, non-controlled sale.

Phase 2:
prescription-aware Offline only after safe prescription caching/anti-reuse.

Insurance:
initially Online-only unless rules can be safely validated Offline.

Controlled drugs:
explicit jurisdiction/deployment policy before Offline enablement.

## Current critical issue

Generic Pharmacy return must NOT fall into generic Offline return before Pharmacy return owner exists.

## Current status

Sale:
ONLINE-ONLY

Return fallback:
UNSAFE / must be blocked

Closure:
OPEN

---

# Gate 19 — Inventory Operations

## Goal

Complete day-to-day Pharmacy stock operations.

## Required

- stock overview
- count
- adjustment
- waste
- low stock
- reorder
- transfers
- purchasing
- stock history
- physical vs system reconciliation
- batch-level reconciliation

## Current status

Shared/Retail foundations:
PRESENT

Pharmacy full closure:
OPEN

---

# Gate 20 — Reports

## Required packs

- sales
- profit
- COGS
- inventory
- batch stock
- expiry
- near-expiry
- waste
- low stock
- purchases
- suppliers
- AP/payables
- returns
- transfers
- prescriptions
- controlled-drug audit
- insurance
- claims
- shifts
- users

## Costing rule

Historical COGS must use historical cost evidence.

Do not recalculate old sale COGS from current cost.

For Pharmacy, batch-level cost history must be authoritative before declaring reporting closed.

## Current status

Design contract:
PRESENT

Implementation:
OPEN

---

# Gate 21 — Printing

## Required

- customer receipt
- prescription/insurance info where appropriate
- purchase receive
- supplier return
- stock count
- transfer
- expiry report
- controlled-drug report where policy permits
- shift close
- reports
- direct printer role mapping

## Privacy

Do not print sensitive patient/insurance fields by default unless operationally required.

## Current status

Shared printing foundation:
PRESENT

Pharmacy closure:
OPEN

---

# Gate 22 — Permissions Final Closure

## Goal

Final Pharmacy role packs and effective user authorization.

## Roles

Examples:
- Admin
- Pharmacist
- Cashier
- Stock Clerk
- Purchasing
- Claims/Insurance
- Call Center
- Delivery

## Final model

Page
+ Action
+ Location
= effective authority

## Important correction

New owners must already be protected earlier.

This Gate verifies completeness and role templates; it is not the first security implementation.

## Current status

Design:
PRESENT

Implementation:
OPEN

---

# Gate 23 — Security & Audit Final Closure

## Required

- RLS
- branch isolation
- Profile guard
- Action authorization
- Location scope
- ACL hardening
- no anon/PUBLIC on employee mutation owners
- immutable audit for sensitive changes
- direct-RPC negative tests
- direct-REST bypass tests
- cross-profile isolation

## X-series dependencies

- X1 ACL
- X2 trusted Profile
- X3 Action + Location
- X4 negative cross-profile matrix

## Current status

Design:
CLOSED

Deployment/execution:
OPEN

---

# Gate 24 — Pharmacy Diagnostics

## Goal

One Pharmacy Diagnostics center with machine-readable PASS/FAIL.

## Checks

- Engine
- navigation/UI
- Profile
- Cloud runtime
- DB schema
- RPC presence
- permissions
- batch stock
- expiry
- FEFO
- prescriptions
- insurance
- claims
- website
- printing contract
- offline
- backup/update health

## Development rule

Diagnostics are added incrementally with each Gate.

Gate 24 is the consolidated diagnostics closure.

## Current status

Not implemented as final consolidated pack.

OPEN

---

# Gate 25 — Recovery / Crash / Power / Network

## Required scenarios

- restart during sale
- crash during sale
- power loss
- network loss
- lost ACK
- sync resume
- pending outbox
- update while pending
- backup
- restore
- rollback

## Stock requirement

No lost invoice.
No duplicate invoice.
No stock double-write.
No batch drift.

## Current status

Platform recovery foundations:
PRESENT

Pharmacy-specific acceptance:
OPEN

---

# Gate 26 — Full Pharmacy Acceptance Harness

## Goal

Consolidate all per-Gate tests into a final Pharmacy harness.

## Dataset

Realistic isolated Pharmacy dataset:
- ordinary medicine
- Rx medicine
- controlled fixture
- substitute
- two valid batches
- expired batch
- insurance plans
- patient
- supplier
- two branches

## Tests

- happy path
- negative path
- duplicate request
- idempotency
- concurrency
- restart
- online/offline according to policy
- direct security calls
- cleanup zero

## Development rule

Do not wait until Gate 26 to start writing tests.

Each Gate contributes its acceptance tests.

Gate 26 assembles the full suite.

## Current status

Acceptance V2 design:
CLOSED

Execution:
OPEN

---

# Gate 27 — Multi-Branch Acceptance

## Minimum

At least two Pharmacy branches.

Test:
- purchase
- receive
- batch
- transfer
- partial receive
- sale
- return
- stock count
- branch reports
- branch permissions
- zero cross-branch leakage

## Current status

OPEN

---

# Gate 28 — Windows Acceptance

## Required targets

- x64
- ia32 only if still commercially supported at release time

Hardware:
- receipt printer
- barcode scanner
- keyboard/mouse
- touch where target hardware supports it

Software:
- install
- update
- backup
- login
- restart
- offline/online
- identical accounting/stock outcome

## Important

If ia32 support is intentionally dropped before release:
mark N/A with an explicit product decision.
Do not maintain it accidentally.

## Current status

OPEN

---

# Gate 29 — Pharmacy UAT

## Goal

A realistic full working day.

## Example flow

Open shift
-> purchasing
-> receive batches
-> ordinary sale
-> prescription sale
-> substitute
-> insurance sale
-> return
-> transfer
-> expiry/waste
-> report
-> close shift

## Required

Run by someone acting as a real pharmacy operator, not just developer click-through.

Record:
- issues
- timing
- confusing UX
- missing operations
- printing
- scanner use

## Current status

OPEN

---

# Gate 30 — Final Closure

## Requirements

- zero open Critical blockers
- zero open High regressions
- all mandatory Gates closed
- sold optional capabilities closed
- checklist signed/evidenced
- source commit pinned
- DB migration set pinned
- Cloud configuration pinned
- backup ready
- rollback ready
- known limitations documented

## Official status

Only then:

SHARAWLA PHARMACY V1 — CLOSED

## Current status

OPEN

---

# Gate 31 — Release / Production Readiness

## Sequence

1. Pharmacy Stable candidate
2. second isolated Pharmacy test device
3. repeat critical acceptance
4. promotion approval
5. only then commercial Production Ready declaration

Do not make the first Pharmacy Beta device the sole release evidence.

## Official final status

Only after this Gate:

SHARAWLA PHARMACY V1 — PRODUCTION READY

## Current status

OPEN

---

# 32. Corrected execution order

Immediate prerequisite outside Pharmacy track:

Restaurant SH-0007 58.26
-> G0 Full Acceptance
-> G1 Shared Routes
-> G2 Touch
-> G3 Menu Cleanup

Then Pharmacy:

PH0 Safety / dedicated environment
-> PH1 Point4 + Batch ownership
-> PH2 trusted Pharmacy Profile/security baseline
-> PH3 Drug Master
-> PH4 Units/Packs
-> PH5 Purchasing + AP
-> PH6 Batch Engine
-> PH7 Expiry/FEFO
-> PH8 POS
-> PH9 Customer/Patient
-> PH10 Prescriptions
-> PH11 Controlled Drugs
-> PH12 Alternatives
-> PH13 Insurance
-> PH14 Returns
-> PH15 Transfers
-> PH16 Delivery/Pickup
-> PH17 Website
-> PH18 Offline Policy/Implementation
-> PH19 Inventory Operations
-> PH20 Reports
-> PH21 Printing
-> PH22 Permissions Final
-> PH23 Security/Audit Final
-> PH24 Diagnostics
-> PH25 Recovery
-> PH26 Full Acceptance
-> PH27 Multi-Branch
-> PH28 Windows
-> PH29 UAT
-> PH30 Final Closure
-> PH31 Release

---

# 33. Current highest-priority blockers

Before Pharmacy can move beyond foundations:

1. Pharmacy-specific return owner missing.
2. batch allocation not bound to exact order_item_id.
3. Units/Packs not closed.
4. Supplier AP/payments/balance not closed.
5. prescription requirement not backend-authoritative.
6. FEFO not backend-authoritative.
7. controlled-drug operational/audit owner missing.
8. insurance split/claim lines not server-authoritative.
9. Pharmacy Offline sale/return not closed.
10. Profile/Action/Location/ACL implementation still open.
11. dedicated Pharmacy Business/device/backend not yet provisioned.

---

# 34. Current official Pharmacy status

Design coverage:
SUBSTANTIAL / PREPARED

Runtime implementation:
PARTIAL

Dedicated Pharmacy runtime evidence:
NONE YET

Pharmacy Cloud Business count:
0

Production readiness:
NOT READY

Immediate project device gate:
Restaurant SH-0007 58.26 G0-G3

No Runtime/DB/Cloud/Production mutation was performed by this roadmap document.
