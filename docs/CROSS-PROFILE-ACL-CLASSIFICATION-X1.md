# Sharawla — Cross-Profile ACL Classification X1 Plan

Status: X1 PREPARATION / READ-ONLY / DOCUMENTATION ONLY
No ACL mutation is authorized by this file.

---

## 1. Current ACL reality

Audited families:
- logistics
- membership
- pharmacy
- retail
- service

Current explicit ACL counts:

| Family | Total | Default ACL null | anon EXECUTE | authenticated EXECUTE | neither client role |
|---|---:|---:|---:|---:|---:|
| logistics | 7 | 0 | 7 | 7 | 0 |
| membership | 8 | 0 | 8 | 8 | 0 |
| pharmacy | 9 | 0 | 9 | 9 | 0 |
| retail | 52 | 0 | 46 | 46 | 6 |
| service | 12 | 0 | 12 | 12 | 0 |

Important:
- all audited functions have explicit ACL state;
- this is not accidental default PUBLIC EXECUTE;
- many non-Retail families explicitly grant PUBLIC + anon + authenticated + service_role;
- Retail generally grants anon + authenticated + service_role on exposed functions, with 6 internal helpers limited to postgres/service_role.

Therefore X1 is an intentional ACL correction project, not merely cleanup of Postgres defaults.

---

## 2. Final ACL classes

Use four explicit classes.

### ACL-PUBLIC-READ

Use when anonymous callers intentionally need read/quote/catalog behavior.

Allowed:
- anon
- authenticated
- service_role
- postgres

PUBLIC role grant is not required when anon/authenticated are explicitly granted.

Still require:
- safe inputs;
- no private Business data leakage;
- no mutation except explicitly documented public calculation/cache behavior.

### ACL-PUBLIC-WRITE

Use only for intentionally public customer-origin operations such as website order submission.

Allowed:
- anon
- authenticated
- service_role
- postgres

Required:
- explicit public mutation contract;
- idempotency;
- branch/business validation;
- input limits;
- anti-abuse/rate limiting at the appropriate layer;
- no employee Action V2 dependency.

This class must remain rare.

### ACL-EMPLOYEE

Use for Business staff mutation/read owners.

Allowed:
- authenticated
- service_role
- postgres

Remove:
- anon
- PUBLIC

Required internally:
- auth.uid/current employee;
- trusted Profile/Capability guard;
- Action V2 where mutating/sensitive;
- Location scope where applicable.

### ACL-INTERNAL

Use for helper/trigger/reservation/stock internal functions not called directly by Business clients.

Allowed:
- postgres
- service_role only where service orchestration genuinely requires it.

Remove:
- anon
- authenticated
- PUBLIC

---

# 3. Logistics classification

## ACL-PUBLIC-READ candidate
- logistics_quote_v1

Reason:
- quote calculation is the only audited Logistics function without auth.uid/branch guard and appears intentionally read/calculation-like.

Must verify public data exposure before final X1.

## ACL-EMPLOYEE
- logistics_shipment_create_v1
- logistics_shipment_status_v1
- logistics_pickup_request_create_v1
- logistics_cod_collect_v1
- logistics_settlement_create_v1
- logistics_return_create_v1

Planned ACL:
- authenticated
- service_role
- postgres

Remove:
- anon
- PUBLIC

Do not execute ACL change before X2/X3 staging strategy is pinned so legitimate client calls are not broken accidentally.

---

# 4. Membership classification

All 8 current Membership functions are staff/business operations.

ACL-EMPLOYEE:
- membership_member_create_v1
- membership_plan_save_v1
- membership_subscribe_v1
- membership_renew_v1
- membership_freeze_v1
- membership_checkin_v1
- membership_class_save_v1
- membership_book_class_v1

Planned:
- authenticated + service_role + postgres
- remove anon/PUBLIC

No Membership function in the current audited family is classified as intentionally public in X1.

If a future public class booking/member portal exists, create a separate public owner instead of reopening the internal staff owner.

---

# 5. Pharmacy classification

All 9 audited Pharmacy functions are staff/business operations.

ACL-EMPLOYEE:
- pharmacy_adjust_batch
- pharmacy_receive_batch
- pharmacy_create_prescription
- pharmacy_update_claim_status
- pharmacy_update_web_rx_status
- pharmacy_save_substitute
- pharmacy_upsert_product_details
- pharmacy_save_insurance_company
- pharmacy_save_insurance_plan

Planned:
- authenticated + service_role + postgres
- remove anon/PUBLIC

If a website prescription upload path is needed, it must have a separately named public owner rather than exposing the staff status mutation owner.

---

# 6. Service classification

All 12 audited Service functions are currently staff/business operations.

ACL-EMPLOYEE:
- service_appointment_create_v1
- service_appointment_status_v1
- service_asset_save_v1
- service_catalog_save_v1
- service_installation_set_v1
- service_job_create_v1
- service_job_status_v1
- service_package_purchase_v1
- service_package_save_v1
- service_package_use_v1
- service_post_job_commissions_v1
- service_warranty_create_v1

Planned:
- authenticated + service_role + postgres
- remove anon/PUBLIC

Future customer self-booking must use a distinct public endpoint.

---

# 7. Retail classification

Retail needs finer separation.

## ACL-PUBLIC-READ

Candidate public/read helpers:
- retail_catalog
- retail_website_bootstrap
- retail_website_branch_open
- retail_website_catalog
- retail_website_offer_discount
- retail_website_quote
- retail_website_normalize_phone

Keep anon only if public website use is confirmed.

## ACL-PUBLIC-WRITE

- retail_create_website_order
- retail_create_website_order_identity_v1

These are website/customer-origin mutation owners.

They must remain separate from employee Retail authorization.

## ACL-INTERNAL

Already client-closed today:
- retail_reservation_identity_assert_projection_v1
- retail_reservation_identity_digest_v1
- retail_reservation_identity_immutable_v1
- retail_reservation_identity_resolve_mutation_v1
- retail_reservation_mutation_guard_v1
- retail_reserve_stock

Current state:
- no anon/authenticated EXECUTE.

Preserve this.

## ACL-EMPLOYEE

All remaining Retail staff owners, including:

Inventory:
- retail_inventory_adjust
- retail_inventory_set_item_policy
- retail_inventory_set_policy
- retail_post_stock_count
- retail_variant_inventory_adjust_v1

Purchasing:
- retail_purchase_order_create
- retail_purchase_order_create_v2
- retail_purchase_order_approve
- retail_purchase_receive
- retail_purchase_receive_v2
- retail_purchase_request_create_v1
- retail_purchase_request_submit_v1
- retail_purchase_request_decide_v1
- retail_purchase_request_convert_to_po_v1
- retail_supplier_return_create
- retail_supplier_return_create_v2
- retail_supplier_invoice_create_v1
- retail_supplier_invoice_approve_v1
- retail_landed_cost_allocate_v1
- retail_landed_cost_post_v1
- retail_reorder_rule_upsert_v1
- retail_reorder_suggestion_to_request_v1
- retail_supplier_create

Transfers:
- retail_transfer_create
- retail_transfer_receive

Offers:
- retail_offer_save
- retail_offer_set_active

Suspended sales:
- retail_suspend_sale
- retail_delete_suspended_sale

Product/variants:
- retail_set_product_settings
- retail_variant_axis_save_v1
- retail_variant_axis_value_save_v1
- retail_variant_combination_save_v1
- retail_variant_combination_set_active_v1

Authenticated Retail reads that should not be anon unless public use is proven:
- retail_variant_lookup_v1
- retail_variant_matrix_get_v1
- retail_website_order_details

These last three require exact caller audit before final ACL mutation.

---

# 8. Why PUBLIC should be removed from employee owners

Several non-Retail ACLs currently include:

`=X/postgres`

which is an explicit EXECUTE grant to PUBLIC.

Even if the function internally checks auth.uid(), keeping PUBLIC EXECUTE on a sensitive SECURITY DEFINER owner:
- expands the callable surface;
- makes accidental future guard regression more dangerous;
- obscures intended API audience.

Final employee owner policy:
- no PUBLIC;
- no anon;
- authenticated only as explicit client role;
- service_role only if operational tooling needs it;
- internal authorization still mandatory.

ACL hardening is defense in depth.
It does not replace owner guards.

---

# 9. X1 migration discipline

Do not issue one giant REVOKE across all functions.

Use family/batch boundaries:

X1-L — Logistics
X1-M — Membership
X1-P — Pharmacy
X1-S — Service
X1-R1 — Retail public/internal separation
X1-R2 — Retail employee owners

Each batch must record:
- exact signatures;
- starting ACL;
- final ACL;
- expected callers;
- negative anon call result;
- positive authenticated call path where permitted;
- rollback GRANT set.

---

# 10. Required preconditions before actual X1 mutation

Before applying ACL changes:

1. G0-G3 Restaurant gate remains closed/PASS.
2. Exact branch/head pinned.
3. Beta backend only.
4. No Production DB mutation.
5. Caller inventory completed for each function batch.
6. Public website callers identified for candidate public Retail functions.
7. X2/X3 implementation order chosen so ACL change cannot strand required staff flows.
8. rollback SQL prepared before execution.

---

# 11. Acceptance per employee owner

After ACL hardening:

- anon direct RPC -> permission denied before body execution;
- authenticated caller -> reaches internal authorization checks;
- unrelated Profile authenticated caller -> must still be denied by X2 once Profile guard lands;
- denied Action -> denied by X3;
- denied Location -> denied by X3;
- service_role only where intentionally retained.

Do not call X1 security-complete before X2/X3.

---

# 12. Current state

X0 Owner Inventory:
CLOSED.

X1 Classification:
CLOSED for design.

X1 DB mutation:
NOT STARTED.

X2 Profile/Capability:
NOT STARTED.

X3 Action + Location:
NOT STARTED.

X4 Cross-profile negative matrix:
NOT STARTED.

Immediate runtime gate remains SH-0007 58.26 G0 -> G3.
