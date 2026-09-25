# Sharawla — Cross-Profile Owner Inventory X0

Status: X0 OWNER INVENTORY / READ-ONLY / DOCUMENTATION ONLY
Environment audited: isolated Beta operational backend
Production impact: NONE
Runtime change: NONE
DB mutation: NONE

This document freezes the current cross-profile backend owner surface before X1-X4 hardening.

---

## 1. Scope

Audited public function families:

- retail_*
- pharmacy_*
- logistics_*
- membership_*
- service_*

Current aggregate:

| Family | Functions | SECURITY DEFINER | anon EXECUTE | authenticated EXECUTE | auth.uid guard | Action V2 guard | legacy permission guard | branch guard |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| logistics | 7 | 7 | 7 | 7 | 6 | 0 | 0 | 6 |
| membership | 8 | 8 | 8 | 8 | 8 | 0 | 0 | 2 |
| pharmacy | 9 | 9 | 9 | 9 | 9 | 0 | 5 | 5 |
| retail | 52 | 46 | 46 | 46 | 36 | 0 | 29 | 30 |
| service | 12 | 12 | 12 | 12 | 12 | 0 | 1 | 6 |

Total functions: 88.

Critical fact:
**0 / 88 audited functions currently consume has_action_permission_v2().**

This does not mean all 88 are unsafe.
Some are public/read-only helpers, some are internal helpers, and many have auth/branch/business invariant checks.
It means Action V2 enforcement is not yet wired at this profile-specific owner surface.

---

## 2. Hardening classification

Each owner belongs to one of four classes:

### A — Public/read-only by design
Examples:
- retail_catalog
- retail_website_bootstrap
- retail_website_branch_open
- retail_website_catalog
- retail_website_quote
- logistics_quote_v1

These require explicit documentation of why anonymous/public reachability is intended.
Do not apply authenticated mutation policy blindly.

### B — Internal helper
Examples include Point4/reservation identity helpers that currently have no anon/authenticated EXECUTE.

These should remain internal and must not be promoted to public Business APIs.

### C — Authenticated Business mutation
These require:
- trusted Profile/Capability guard;
- Action V2;
- Location scope where applicable;
- intentional EXECUTE ACL;
- normal business invariants.

### D — Public customer-origin mutation
Example:
- retail website order creation path.

These must use a separate explicitly public contract and must never inherit employee Action semantics accidentally.
They still require business/branch validation, anti-abuse/idempotency and public data boundaries.

---

# 3. Logistics owner inventory

## Current functions

1. logistics_quote_v1(bigint,numeric)
   - public/read candidate;
   - no auth.uid;
   - no branch guard;
   - no Action V2.
   - classify separately from internal staff mutations.

2. logistics_shipment_create_v1(...)
   - SECURITY DEFINER;
   - auth.uid guard;
   - branch guard;
   - no Action V2;
   - no Profile guard.

   Intended Action:
   - logistics.shipment.create

3. logistics_shipment_status_v1(...)
   - auth.uid;
   - branch guard;
   - no Action V2/Profile guard.

   Intended Action:
   - logistics.shipment.status

4. logistics_pickup_request_create_v1(...)
   - auth.uid;
   - branch guard;
   - no Action V2/Profile guard.

   Required new/confirmed Action:
   - logistics.pickup_request.create

5. logistics_cod_collect_v1(...)
   - auth.uid;
   - branch guard;
   - no Action V2/Profile guard.

   Required Action:
   - logistics.cod.collect

6. logistics_settlement_create_v1(...)
   - auth.uid;
   - branch guard;
   - no Action V2/Profile guard.

   Existing closest Action:
   - logistics.cod.settle

7. logistics_return_create_v1(...)
   - auth.uid;
   - branch guard;
   - no Action V2/Profile guard.

   Required Action:
   - logistics.return.create

## Logistics target

Expected Profile:
- logistics

Location:
- originating/owning branch for staff mutation paths.

Public quote:
- remains a separately documented public/read path if intentionally exposed.

---

# 4. Membership owner inventory

## Current functions

1. membership_member_create_v1
   - auth.uid;
   - no branch guard;
   - no Action/Profile guard.

   Required Action:
   - membership.member.create

2. membership_plan_save_v1
   - auth.uid;
   - no branch guard;
   - no Action/Profile guard.

   Required Action:
   - membership.plan.manage

3. membership_subscribe_v1
   - auth.uid;
   - no branch guard;
   - no Action/Profile guard.

   Existing closest Action:
   - membership.subscription.manage

4. membership_renew_v1
   - auth.uid;
   - no branch guard;
   - no Action/Profile guard.

   Existing closest Action:
   - membership.subscription.manage

5. membership_freeze_v1
   - auth.uid;
   - no branch guard;
   - no Action/Profile guard.

   Existing Action:
   - membership.freeze

6. membership_checkin_v1
   - auth.uid;
   - branch guard;
   - no Action/Profile guard.

   Existing Action:
   - membership.checkin

7. membership_class_save_v1
   - auth.uid;
   - branch guard;
   - no Action/Profile guard.

   Required Action:
   - membership.class.manage

8. membership_book_class_v1
   - auth.uid;
   - no branch guard detected;
   - no Action/Profile guard.

   Required Action:
   - membership.class.book

## Membership target

Expected Profile:
- membership

Location policy:
- check-in and branch-hosted class operations require Location.
- member/plan/subscription ownership needs an explicit Business-wide vs Location-scoped decision; do not infer branch scope from UI alone.

---

# 5. Pharmacy owner inventory

## Current functions

1. pharmacy_adjust_batch
   - auth.uid;
   - legacy permission;
   - branch guard;
   - no Action/Profile guard.

   Required Action:
   - pharmacy.batch.adjust
   or explicit reuse of inventory.adjust only if Pharmacy stock semantics are intentionally shared.

2. pharmacy_receive_batch
   - auth.uid;
   - legacy permission;
   - branch guard;
   - no Action/Profile guard.

   Required Action:
   - pharmacy.batch.receive

3. pharmacy_create_prescription
   - auth.uid;
   - branch guard;
   - no Action/Profile guard.

   Required Action:
   - pharmacy.prescription.create

4. pharmacy_update_claim_status
   - auth.uid;
   - legacy permission;
   - branch guard;
   - no Action/Profile guard.

   Required Action:
   - pharmacy.claim.status

5. pharmacy_update_web_rx_status
   - auth.uid;
   - branch guard;
   - no Action/Profile guard.

   Required Action:
   - pharmacy.web_rx.status

6. pharmacy_save_substitute
   - auth.uid;
   - legacy permission;
   - no branch guard detected;
   - no Action/Profile guard.

   Required Action:
   - pharmacy.substitute.manage

7. pharmacy_upsert_product_details
   - auth.uid;
   - legacy permission;
   - no branch guard detected;
   - no Action/Profile guard.

   Required Action:
   - pharmacy.product_details.manage

8. pharmacy_save_insurance_company
   - auth.uid;
   - no branch guard detected;
   - no Action/Profile guard.

   Required Action:
   - pharmacy.insurance_company.manage

9. pharmacy_save_insurance_plan
   - auth.uid;
   - no branch guard detected;
   - no Action/Profile guard.

   Required Action:
   - pharmacy.insurance_plan.manage

## Pharmacy target

Expected Profile:
- pharmacy

Location:
- batch/prescription/claim/web-rx branch mutation paths use target branch scope.
- insurance/substitute/product-detail configuration needs an explicit Business-wide policy.

---

# 6. Service owner inventory

## Current functions

1. service_appointment_create_v1
   - auth.uid;
   - branch guard;
   - no Action/Profile guard.

   Existing Action:
   - service.appointment.manage

2. service_appointment_status_v1
   - auth.uid;
   - branch guard;
   - no Action/Profile guard.

   Existing Action:
   - service.appointment.manage

3. service_job_create_v1
   - auth.uid;
   - branch guard;
   - no Action/Profile guard.

   Existing Action:
   - service.job.manage

4. service_job_status_v1
   - auth.uid;
   - branch guard;
   - no Action/Profile guard.

   Existing Actions:
   - service.job.manage
   - service.job.complete for final completion transition

5. service_asset_save_v1
   - auth.uid;
   - legacy customers permission;
   - no branch guard detected;
   - no Action/Profile guard.

   Required Action:
   - service.asset.manage

6. service_catalog_save_v1
   - auth.uid;
   - no branch guard detected;
   - no Action/Profile guard.

   Required Action:
   - service.catalog.manage

7. service_installation_set_v1
   - auth.uid;
   - branch guard;
   - no Action/Profile guard.

   Required Action:
   - service.installation.manage

8. service_package_save_v1
   - auth.uid;
   - no branch guard;
   - no Action/Profile guard.

   Required Action:
   - service.package.manage

9. service_package_purchase_v1
   - auth.uid;
   - no branch guard;
   - no Action/Profile guard.

   Required Action:
   - service.package.purchase

10. service_package_use_v1
    - auth.uid;
    - no branch guard detected;
    - no Action/Profile guard.

    Required Action:
    - service.package.use

11. service_warranty_create_v1
    - auth.uid;
    - no branch guard detected;
    - no Action/Profile guard.

    Existing closest Action:
    - service.warranty.manage

12. service_post_job_commissions_v1
    - auth.uid;
    - branch guard;
    - no Action/Profile guard.

    Required Action:
    - service.commission.post

## Service target

Expected Profile:
- service

Branch-bound work:
- appointments/jobs/installations/commission posting.

Business-wide configuration:
- catalog/packages/assets/warranty rules need explicit location semantics before hardening.

---

# 7. Retail owner inventory

Retail contains 52 functions.

Six are currently non-SECURITY-DEFINER/internal-style helpers in the audited family.
Forty-six report SECURITY DEFINER and current anon/authenticated EXECUTE privilege.
No Retail function in this family currently consumes Action V2.

## A. Public/read website surface

Candidate intentionally public/read helpers:
- retail_catalog
- retail_website_bootstrap
- retail_website_branch_open
- retail_website_catalog
- retail_website_offer_discount
- retail_website_quote
- retail_website_normalize_phone

These must be documented separately from employee mutation owners.

## B. Public website mutation surface

- retail_create_website_order
- retail_create_website_order_identity_v1

These are not employee-action owners.
They require explicit public order security/idempotency/identity contracts.
Do not add employee Action V2 merely because they mutate.

## C. Internal reservation/identity helpers

Current non-public/internal-style functions include:
- retail_reservation_identity_assert_projection_v1
- retail_reservation_identity_digest_v1
- retail_reservation_identity_immutable_v1
- retail_reservation_identity_resolve_mutation_v1
- retail_reservation_mutation_guard_v1
- retail_reserve_stock

These are not normal employee endpoints and must stay internal according to their current ownership contract.

## D. Retail employee mutation groups

### Inventory
- retail_inventory_adjust
- retail_inventory_set_item_policy
- retail_inventory_set_policy
- retail_post_stock_count
- retail_variant_inventory_adjust_v1

Intended Actions:
- inventory.adjust
- retail.inventory.policy.manage (new if policy management is not intentionally covered by inventory.adjust)
- retail.stock_count.post (or explicit shared stock-count Action if shared Core owner is final)

### Purchasing
- retail_purchase_order_create
- retail_purchase_order_create_v2
- retail_purchase_order_approve
- retail_purchase_receive
- retail_purchase_receive_v2
- retail_supplier_return_create
- retail_supplier_return_create_v2
- retail_purchase_request_create_v1
- retail_purchase_request_submit_v1
- retail_purchase_request_decide_v1
- retail_purchase_request_convert_to_po_v1
- retail_supplier_invoice_create_v1
- retail_supplier_invoice_approve_v1
- retail_landed_cost_allocate_v1
- retail_landed_cost_post_v1
- retail_reorder_rule_upsert_v1
- retail_reorder_suggestion_to_request_v1

Existing reusable Actions where semantics match:
- purchasing.request.create
- purchasing.request.approve
- purchasing.po.create
- purchasing.po.approve
- purchasing.receive
- purchasing.supplier_return

Additional actions required where semantics differ:
- purchasing.invoice.create
- purchasing.invoice.approve
- purchasing.landed_cost.allocate
- purchasing.landed_cost.post
- purchasing.reorder.manage

### Suppliers
- retail_supplier_create

Required/Reusable:
- purchasing.suppliers.manage or a shared supplier-management Action.

### Transfers
- retail_transfer_create
- retail_transfer_receive

Required/Reusable:
- retail.transfer.create / retail.transfer.receive
or a documented shared transfer Action if one Core owner is authoritative.

### Offers
- retail_offer_save
- retail_offer_set_active

Required:
- retail.offers.manage

### Suspended sales
- retail_suspend_sale
- retail_delete_suspended_sale

Required:
- retail.sales.suspend
- retail.sales.resume/delete according to final business semantics.

### Product/variants
- retail_set_product_settings
- retail_variant_axis_save_v1
- retail_variant_axis_value_save_v1
- retail_variant_combination_save_v1
- retail_variant_combination_set_active_v1

Required:
- retail.product_settings.manage
- retail.variants.manage

### Read/lookups requiring profile visibility but not mutation Action
- retail_variant_lookup_v1
- retail_variant_matrix_get_v1
- retail_website_order_details

These still need explicit profile/read authorization if not intentionally public/shared.

---

# 8. Profile guard contract

Every profile-specific employee owner must use trusted server-side Business/Profile resolution.

Conceptual guard:

assert_profile_capability_action_v2(
  expected_profile,
  feature_code,
  action_code,
  location_id
)

Required composition:
1. auth.uid() mapped to current employee;
2. current Business resolved from trusted runtime/business context;
3. actual Profile resolved server-side;
4. expected Profile or explicit shared-owner allowlist;
5. required Feature/Capability eligibility where applicable;
6. Action V2 permission;
7. broad + Action-specific Location scope;
8. owner-specific invariants.

Do not accept client-provided Profile as authority.

---

# 9. ACL hardening contract

For sensitive employee mutation owners:

- revoke PUBLIC EXECUTE unless intentionally public;
- revoke anon EXECUTE;
- grant authenticated only where direct Business client calling is intended;
- retain internal auth/profile/action/location guards even after ACL tightening.

Public website/customer endpoints are separate contracts.

Internal helpers should remain non-public.

---

# 10. Action catalog expansion rule

Do not add one Action per function blindly.

Actions represent user authority, not implementation details.

Reuse an existing Action when:
- business meaning is the same;
- risk level is the same;
- location semantics are the same.

Create a new Action when:
- approval vs create differs;
- financial/stock risk differs;
- configuration vs transaction differs;
- cross-location authority differs.

---

# 11. X1-X4 execution order

X0 — Owner Inventory:
CLOSED by this document for discovery baseline.

X1 — EXECUTE grant hardening:
- classify public/internal/employee owners;
- harden ACLs without changing business behavior where possible.

X2 — Profile/Capability guards:
- unrelated Profile must fail before mutation.

X3 — Action + Location:
- wire Action V2 + Location scope.

X4 — Negative matrix:
- Restaurant credentials against Retail/Pharmacy/Logistics/Membership/Service;
- repeat from each supported Profile.

---

# 12. AI gate

Sharawla AI V1 may only call owners that have passed:
- X1 ACL intent;
- X2 Profile guard;
- X3 Action + Location;
- idempotency where applicable;
- authoritative audit.

No legacy owner becomes AI-callable merely because it exists.

---

# 13. Current status

X0 owner inventory: CLOSED for current Beta schema snapshot.

X1-X4: NOT STARTED.

No DB write.
No Runtime change.
No Production change.

Immediate runtime continuation remains:
SH-0007 10.5.4-beta.58.26 -> G0 -> G1 -> G2 -> G3.
