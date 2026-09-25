# Sharawla Retail V1 — Implementation Batch Plan

Status: DOCUMENTATION / PRE-IMPLEMENTATION ONLY
Execution prerequisite: Restaurant SH-0007 G0-G3 PASS
Runtime/DB/Cloud mutation: NONE

Reference:
docs/RETAIL-V1-OFFICIAL-CLOSURE-ROADMAP.md

---

# RET-P0 — Contract Freeze

## Goal

Freeze unresolved product-policy decisions before code changes.

## Decisions

- weighted sales capability split;
- Retail V1 Offline commercial promise;
- Variants sold scope:
  - sale/return only?
  - purchasing?
  - count?
  - transfers?
  - website?
  - reports?
- Landed Cost:
  - allocation-only
  - or allocation + posting
- ia32 release support
- add-on package/entitlement list.

## Exit

No business-rule ambiguity blocks implementation.

---

# RET-P1 — Trusted Retail Security Foundation

## Implement

- trusted operational profile binding=retail;
- Profile assertion;
- Action V2 additions;
- Action+Location evaluator integration;
- ACL hardening staging.

## Acceptance

- Retail Profile allowed;
- Restaurant/Pharmacy/etc. denied before mutation;
- Action deny;
- Location deny;
- anon denied on employee owners.

---

# RET-P2 — Product / Catalog Owner Hardening

## Scope

- products
- categories
- branch availability
- Retail product settings
- barcode
- decimal settings

## Actions

- catalog.products.manage
- catalog.categories.manage
- catalog.branch_availability.manage
- retail.product_settings.manage

## Acceptance

- direct REST cannot bypass protected owner;
- invalid duplicate barcode rejected;
- branch availability enforced.

---

# RET-P3 — POS / Sale Owner Closure

## Scope

- create_retail_pos_order_atomic
- checkout
- payment
- discounts
- decimal quantities
- order types

## Required

- canonical Point4 identity;
- exact retry;
- Action+Location;
- payment reconciliation;
- stock effect once;
- cleanup zero.

---

# RET-P4 — Return Owner Closure

## Scope

- create_retail_order_return_idempotent
- variant owner when enabled

## Required

- original order-item lineage;
- partial/full return;
- decimal quantity;
- no over-return;
- stock restore;
- original historical cost;
- refund payments;
- idempotency.

---

# RET-P5 — Customers

## Scope

- manual customer create/edit/address/import;
- POS minimal customer resolve/create.

## Rule

Cashier sale should not automatically grant broad CRM edit rights.

## Acceptance

- phone duplicate prevention;
- sale customer link;
- manual edit permission;
- direct bypass denied.

---

# RET-P6 — Offers / Promo / Manual Discount

## Scope

- Retail Offers
- Promo Codes
- stacking
- manual discounts

## Required

- deterministic best-rule behavior;
- total discount <= subtotal;
- manual discount Action;
- website parity where promised.

---

# RET-P7 — Inventory Owner Hardening

## Scope

- balances
- adjustment
- stock policy
- low stock
- movement ledger

## Required

- inventory.adjust
- retail.inventory.policy.manage
- branch/location
- audit.

---

# RET-P8 — Stock Count

## Scope

- retail_post_stock_count
- final count Action

## Required

- transaction atomicity;
- invalid line rollback;
- variance correctness;
- ledger movement.

---

# RET-P9 — Transfers

## Scope

- retail_transfer_create
- retail_transfer_receive
- cancel if supported

## Required

- source/destination authorization;
- no duplicate receive;
- in-transit semantics;
- stock reconciliation.

---

# RET-P10 — Baseline Purchasing

## Scope

- supplier
- PO
- approval
- receive/GRN
- supplier return

## Required

- Action mapping;
- branch/location;
- idempotency;
- weighted average cost;
- cleanup zero.

---

# RET-P11 — Variants Add-on Closure

## Feature

commerce.variants

## Implement/verify

- axes
- values
- combinations
- SKU/barcode
- active state
- variant stock
- POS
- sale
- return
- offline sale
- purchasing receive

Additional workflows only if RET-P0 marks them in sold scope.

---

# RET-P12 — Advanced Purchasing Add-ons

## Scope

- PR
- submit
- approve/reject
- convert to PO
- supplier invoices
- 3-Way Match
- replenishment
- supplier return V2
- landed cost

## Landed Cost

If posting is sold:
- guarded Post action;
- inventory valuation update;
- report impact;
- unsafe-post rejection;
- idempotency.

---

# RET-P13 — Delivery / Pickup

## Scope

- pickup completion
- driver assignment
- delivered
- final payment
- settlement
- cash custody

## Rule

No Restaurant Kitchen/Table dependency.

---

# RET-P14 — Retail Website

## Scope

- bootstrap/catalog
- quote
- reservation
- order create
- accept/reject
- release
- payment
- pickup/delivery
- POS lineage

## Security

Public owners explicit.
No anonymous direct table mutation.

---

# RET-P15 — Offline Product Closure

## Baseline

Guarantee:
- sale
- return
- shift open/close
- expense
- printing

## Required

- durable local state;
- restart;
- lost ACK;
- exact replay;
- authorization re-check;
- update pending guard.

## Online-only

Management operations remain fail-visible Online-only unless RET-P0 explicitly expands scope.

---

# RET-P16 — Reports / Finance

## Implement

- sales
- COGS
- profit/margin
- inventory valuation
- movement ledger
- counts
- purchasing
- suppliers
- invoices
- landed cost
- replenishment
- variant reporting when enabled

## Rule

Historical return COGS uses original sale-line cost.

---

# RET-P17 — Menu / UX / Canonical Routes

## Implement

Final navigation groups.
Canonical Website Orders route.
Feature-aware visibility.
Role-aware visibility.
Remove:
- run-SQL messages
- stale Market-only terminology
- Restaurant leakage.

---

# RET-P18 — Printing / Touch / Device Roles

## Scope

- receipt
- return receipt
- shift
- reports
- inventory/count/transfer/purchasing prints where sold
- logical printer roles
- touch pass

---

# RET-P19 — Security Final Sweep

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

## Roles

- Cashier
- Call Center
- Stock Clerk
- Purchasing
- Manager
- Admin

---

# RET-P20 — Diagnostics / Recovery

## Diagnostics

- Retail Engine
- Profile
- Cloud config
- products
- POS
- inventory
- purchasing
- variants/add-ons
- website
- permissions
- offline
- printing
- backup/update

## Recovery

- restart
- crash
- network loss
- lost ACK
- sync resume
- backup/restore
- update rollback

---

# RET-P21 — Full Acceptance Harness

## Dataset

- normal product
- decimal product
- barcode/weighted fixture
- tracked stock
- offer
- customer
- supplier
- two branches
- delivery fixture
- website fixture

Optional:
- variant
- advanced purchasing
- landed cost

## Required

- happy/negative
- duplicate requests
- concurrency
- offline/online
- cleanup zero
- stock/cost reconciliation

---

# RET-P22 — Multi-Branch / Windows / UAT / Release

## Sequence

1. two-branch acceptance;
2. x64;
3. ia32 if supported;
4. barcode scanner;
5. receipt printer;
6. touch target where applicable;
7. backup/update/restart;
8. realistic day-long Retail UAT;
9. zero Critical/High blockers;
10. Stable candidate;
11. second Retail device;
12. Production Ready approval.

---

# Implementation discipline

Each executable batch records:

- starting HEAD;
- changed files;
- SQL/migration artifact SHA;
- Cloud changes if any;
- runtime version;
- rollback;
- static tests;
- DB verification;
- runtime evidence;
- acceptance result;
- final commit SHA.

Do not combine unrelated batches.

Examples:
- Variants + Reports
- Landed Cost + Website
- Offline + Menu cleanup
- Security + commercial entitlement catalog expansion

---

# Exact start condition

No executable Retail batch starts until:

Restaurant SH-0007:
- G0 PASS
- G1 PASS
- G2 PASS
- G3 CLOSED

and Retail R0 environment provisioning is explicitly authorized.

Until then:
this plan remains preparation only.
