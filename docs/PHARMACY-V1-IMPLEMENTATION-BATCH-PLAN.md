# Sharawla Pharmacy V1 — Implementation Batch Plan

Status: DOCUMENTATION / PRE-IMPLEMENTATION ONLY
Execution prerequisite: Restaurant SH-0007 G0-G3 PASS
Runtime/DB/Cloud mutation: NONE

This plan translates the official 31-Gate roadmap into small implementation batches.

Reference:
docs/PHARMACY-V1-OFFICIAL-31-GATE-ROADMAP.md

---

# Batch PH-P0 — Contract Freeze

## Goal

Freeze the exact Pharmacy V1 business contracts before implementation.

## Deliverables

- official owner map;
- exact tables/functions to extend;
- Action codes;
- Location source per owner;
- Profile requirement;
- Point4 identity requirement;
- Offline policy;
- rollback boundary.

## Must include

- Units/Packs canonical base unit model;
- sale-line/batch identity;
- return disposition;
- patient/customer model decision;
- supplier AP/payables model;
- insurance claim lifecycle;
- controlled-drug policy hooks;
- FEFO override policy.

## Exit

No unresolved business-rule ambiguity for the first implementation batches.

---

# Batch PH-P1 — Trusted Pharmacy Security Foundation

## Goal

Make all subsequent Pharmacy owners use the correct authorization model.

## Implement

- trusted operational profile binding = pharmacy;
- private profile assertion helper;
- Action V2 catalog additions required for Pharmacy;
- Action+Location evaluator integration;
- ACL plan for Pharmacy employee owners.

## Rules

No new Pharmacy mutation owner after PH-P1 may rely only on:
- UI visibility;
- legacy page permission;
- client-supplied profile;
- branch access alone.

## Acceptance

- Pharmacy profile passes;
- Restaurant/Retail/etc. profile fails before mutation;
- Action deny;
- Location deny;
- anon denied on employee mutation owner.

---

# Batch PH-P2 — Units & Packs Foundation

## Goal

Create one canonical unit-conversion authority.

## Model

At minimum:
- base stock unit;
- purchase unit;
- sale unit;
- conversion factor;
- divisibility rule.

## Example

1 box
= 10 strips

1 strip
= 10 tablets

Canonical stock:
tablets

## Owners

- unit/pack save
- conversion validation
- quantity normalization

## Acceptance

- receive boxes;
- stock stored canonically;
- sell tablets;
- return tablets;
- count strips/tablets;
- no rounding drift.

---

# Batch PH-P3 — Batch Lineage Schema

## Goal

Bind every Pharmacy batch effect to the exact commercial line.

## Extend

pharmacy_order_batch_allocations

Required:
- order_item_id
- allocated_quantity
- returned_quantity
- canonical line identity where needed

## Add

pharmacy_return_batch_allocations

## Rules

No post-sale matching by product_id.

Sale result already returns real order_item ids; bind inside the same transaction.

## Acceptance

- duplicate product lines remain distinct;
- one line can use multiple batches;
- one batch can serve multiple lines;
- partial return can identify exact source allocation.

---

# Batch PH-P4 — Pharmacy Sale Owner V2

## Goal

Harden the sale owner before adding more workflows.

## Owner

Upgrade/create a final Pharmacy sale owner preserving the accepted external contract where compatible.

## Required

- canonical UUID-v4 client_tx_id;
- document_uid;
- stable line_uid;
- product stock effect;
- batch stock effect;
- exact order_item allocation;
- customer/patient linkage;
- unit conversion;
- payment reconciliation;
- branch/location;
- idempotent retry.

## Must not yet fake

- prescription closure;
- controlled-drug closure;
- insurance closure.

Those are added in later batches but the sale owner must provide clean extension points.

## Acceptance

- normal non-Rx non-insurance sale;
- same payload retry exactly once;
- product/batch stock reconcile;
- duplicate product lines distinct;
- cleanup zero.

---

# Batch PH-P5 — Prescription + FEFO

## Goal

Move Rx and FEFO from UI advice to backend authority.

## Prescription

- backend requires Rx when product says so;
- validate prescription/line;
- prevent over-dispense;
- line-level dispense ledger;
- partial/full state derived.

## FEFO

- deterministic earliest-valid-expiry allocation;
- reject skipped earlier batch;
- optional override Action + reason + audit.

## Acceptance

- missing Rx direct-RPC denial;
- partial dispense;
- full dispense;
- over-dispense denial;
- expired batch denial;
- non-FEFO denial;
- authorized override.

---

# Batch PH-P6 — Controlled Drug Owner

## Goal

Create explicit controlled-drug operational boundary.

## Required

- dedicated Action;
- configured policy check;
- patient/prescriber evidence where required;
- immutable dispense audit;
- return/cancel audit integration;
- jurisdiction policy hook.

## Rule

Do not hard-code unverified legal rules in generic Core.

## Acceptance

- ordinary cashier denied;
- authorized pharmacist allowed according to configured policy;
- missing required evidence denied;
- audit immutable.

---

# Batch PH-P7 — Pharmacy Return Owner

## Goal

Eliminate generic Pharmacy return fallback.

## Owner

create_pharmacy_order_return_idempotent

## Required

- exact original order_item;
- exact original batch allocation;
- over-return protection;
- disposition;
- product stock restoration/compensation;
- batch stock restoration/compensation;
- prescription reversal evidence;
- insurance hook;
- canonical Point4 identity;
- idempotency.

## Immediate safety change

Before Pharmacy Offline is implemented:
generic Offline Pharmacy return must be blocked.

## Acceptance

- partial;
- multiple partials;
- full;
- multiple batches;
- expired original batch;
- non-restock disposition;
- duplicate retry;
- cleanup zero.

---

# Batch PH-P8 — Insurance V2

## Goal

Make insurance calculations and claim accounting server-authoritative.

## Implement

- member/policy linkage;
- plan rule evaluation;
- copay;
- max coverage;
- prior approval;
- claim header;
- claim items;
- allowed status transitions;
- settlement;
- return/claim adjustment.

## Do not trust

client-calculated:
- patient amount;
- insurer amount;
- coverage.

## Acceptance

- normal split;
- max coverage;
- missing approval deny;
- partial approval;
- reject;
- settle;
- insured return;
- totals reconcile.

---

# Batch PH-P9 — Alternatives

## Goal

Explicit, auditable substitution.

## Required

- configured substitute relation;
- no silent replacement;
- user selection;
- original vs dispensed product evidence;
- prescription integration;
- Action permission.

## Acceptance

- valid substitute;
- invalid substitute denied;
- direct-RPC bypass denied;
- prescription ledger keeps original/dispensed identity.

---

# Batch PH-P10 — Supplier Purchasing + AP

## Goal

Close both stock purchasing and supplier accounting.

## Purchasing

- supplier;
- PO;
- approval;
- supplier invoice;
- receive;
- batch creation;
- cost;
- supplier return.

## AP

Add/close:
- supplier payment;
- supplier balance;
- payable lifecycle;
- supplier statement;
- partial payments;
- reconciliation.

## Acceptance

- receive creates correct batches;
- invoice/receive reconcile;
- partial payment;
- full payment;
- return reduces payable according to accounting contract;
- balance statement reconciles.

---

# Batch PH-P11 — Batch Transfer + Inventory Operations

## Goal

Make every inventory workflow batch-aware.

## Include

- stock count;
- adjustment;
- waste;
- low stock;
- reorder;
- transfer send;
- in transit;
- partial receive;
- complete;
- cancel;
- movement history.

## Acceptance

- no product/batch drift;
- source/destination branch isolation;
- no duplicate receive;
- count variance correct;
- waste auditable.

---

# Batch PH-P12 — Customer / Patient

## Goal

Implement the chosen patient model.

## Before implementation

PH-P0 must decide:
- Customer extension
or
- separate Patient entity.

## Required

- invoice link;
- Rx link;
- insurance member link;
- phone duplicate handling;
- purchase history;
- privacy-aware access.

## Acceptance

- customer/patient search;
- correct invoice linkage;
- duplicate prevention;
- permission isolation.

---

# Batch PH-P13 — Delivery / Pickup

## Goal

Close Pharmacy order fulfillment outside the counter.

## Required

- pickup;
- delivery;
- patient/customer;
- address;
- branch;
- driver;
- payment;
- final status;
- shared settlement/cash custody;
- Rx/insurance continuity.

## Acceptance

- pickup;
- delivery;
- driver assignment;
- final payment;
- settlement;
- branch/location security.

---

# Batch PH-P14 — Pharmacy Website

## Goal

Close Pharmacy public channel.

## Required

- catalog/search;
- branch availability;
- pickup/delivery;
- prescription upload/request;
- stock reservation;
- oversell prevention;
- tracking;
- cancellation;
- accept/reject;
- POS lineage.

## Security

Use explicit public owners.
No anonymous direct table mutation.

---

# Batch PH-P15 — Offline Pharmacy

## Goal

Implement only the approved Offline-safe scope.

## Phase policy

At implementation time classify each workflow:

- OFFLINE_SAFE
- ONLINE_ONLY_FAIL_CLOSED

## Candidate first Offline sale

Only:
- non-insurance;
- non-controlled;
- safe cached batch state;
- canonical outbox identity.

## Required

- durable local data;
- batch allocation;
- outbox;
- sync;
- current authorization re-check;
- idempotency;
- conflict handling;
- product/batch reconciliation.

## Acceptance

- restart;
- lost ACK;
- duplicate retry;
- stock conflict;
- authorization revoked before sync.

---

# Batch PH-P16 — Reports / Costing / Finance

## Goal

Implement Pharmacy reporting contract.

## Include

- sales;
- historical COGS;
- profit;
- stock;
- batch stock;
- expiry;
- near-expiry value;
- waste;
- low stock;
- purchasing;
- suppliers;
- AP/payables;
- returns;
- transfers;
- prescriptions;
- controlled audit;
- insurance;
- claims;
- shifts/users.

## Rule

Historical COGS comes from historical evidence, not current cost recalc.

---

# Batch PH-P17 — Printing

## Goal

Close Pharmacy-specific print outputs.

## Include

- customer receipt;
- insurance details where required;
- receive;
- supplier return;
- stock count;
- transfer;
- expiry;
- shift close;
- reports.

## Device model

Use logical Printer Roles + device-local physical printer binding.

---

# Batch PH-P18 — Menu / UX Canonicalization

## Goal

Move Pharmacy UI to final registry-owned routing.

## Implement

- canonical Pharmacy routes;
- remove MutationObserver/setInterval ownership;
- feature-aware page gating;
- role-aware menu;
- cleaned terminology;
- no Beta/SQL internal messages;
- valid claim actions instead of arbitrary status dropdown.

## Reference

docs/PHARMACY-MENU-UX-CLEANUP-DESIGN.md

---

# Batch PH-P19 — Permissions / Security Final Sweep

## Goal

Prove every sensitive path is protected.

## Verify

- Profile
- Action
- Location
- ACL
- RLS
- audit
- direct RPC
- direct REST
- cross-profile matrix

## Role templates

- Admin
- Pharmacist
- Cashier
- Stock Clerk
- Purchasing
- Claims
- Call Center
- Delivery

---

# Batch PH-P20 — Diagnostics

## Goal

Assemble one Pharmacy Diagnostics surface.

## Include

- Engine
- Cloud/Profile
- DB
- RPC
- batch
- expiry
- Rx
- controlled
- insurance
- website
- permissions
- offline
- printing
- backup/update

Every test returns stable PASS/FAIL with stage/reason.

---

# Batch PH-P21 — Recovery / Chaos

## Goal

Prove resilience.

## Scenarios

- crash during sale
- crash during return
- power loss
- network loss
- lost ACK
- restart
- sync resume
- backup/restore
- update/rollback

No duplicate invoice.
No lost invoice.
No stock/batch drift.

---

# Batch PH-P22 — Full Acceptance Harness

## Goal

Consolidate all Gate tests.

## Requirements

- deterministic fixtures;
- two branches;
- realistic products;
- Rx;
- controlled fixture;
- insurance;
- supplier;
- multiple batches;
- online/offline policy;
- cleanup zero;
- concurrency;
- idempotency.

---

# Batch PH-P23 — Multi-Branch / Windows / UAT / Release

## This is not one code commit

It is the final operational acceptance sequence:

1. Multi-Branch acceptance.
2. Windows x64.
3. ia32 if still supported.
4. scanner.
5. printer.
6. backup/update/restart.
7. day-long Pharmacy UAT.
8. zero Critical/High blocker review.
9. Stable candidate.
10. second Pharmacy device validation.
11. Production Ready approval.

---

# Implementation discipline

Each executable batch must record:

- starting HEAD;
- exact changed files;
- DB migration artifact SHA;
- Cloud changes if any;
- runtime version;
- rollback instructions;
- static tests;
- DB verification;
- runtime evidence;
- acceptance result;
- final commit SHA.

Do not combine unrelated batches.

Examples of combinations to avoid:
- Units/Packs + Insurance
- Return owner + Website
- Controlled drugs + Offline
- AP/payables + Menu cleanup

---

# Exact start condition

No executable Pharmacy batch starts until:

Restaurant SH-0007:
- G0 PASS
- G1 PASS
- G2 PASS
- G3 CLOSED

and Pharmacy:
- PH0 environment/safety plan is explicitly authorized.

Until then:
this document is preparation only.
