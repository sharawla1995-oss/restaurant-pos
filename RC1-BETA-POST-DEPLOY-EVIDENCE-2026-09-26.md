# Sharawla POS RC1 — Beta Post-Deploy Evidence

Recorded: 2026-09-26
Candidate source version: 10.5.4-beta.58.31
Beta project only: xihcxydjnzemflhedzor (sharawla beta restaurant test / SH-0007)
Production SH-0005 / SH-0006: untouched.
Canonical Stock: OFF. Cutover: OFF.

## Preflight
Before the controlled Beta write, the reviewed Restaurant definitions matched the pinned values:
- Offline Outer: a269349dbc9a71f453e12699bc0617ce
- create_pos_order_atomic: a677482d9944aa8ae40003408506c7c1
- create_food_pos_order_atomic_v1: c6de3f95f85c6bb2f9d4854c1d7c5a8c
- create_order_return: 3fe18445ec4e05799bd8bebdeeb716c9
- create_order_return_idempotent: 8fb379d606004c895befb2b0f9787586

## Delivery guard
Migration rc1_delivery_required_fields_guard_v1 applied successfully on Beta.
Post-verification:
- rc1_assert_delivery_required_fields_v1 exists.
- anon and authenticated cannot directly EXECUTE the trigger function.
- Egyptian phone guard present.
- same-branch active delivery-zone guard present.
- trg_00_rc1_delivery_required_fields_v1 exists and sorts before trg_assign_order_numbers.
- numbering trigger remains present.

## Offline Outer V3
A controlled attempt to apply the source artifact refused at its precondition because the live Outer MD5 had changed to 48bf4a78084065e0a7a55d1dafa4083e. No overwrite/bypass was performed.
Read-only post-verification of that live definition showed all required V3 markers already present:
- authoritative replay / idempotent_replay
- Customer -> Sale customer_dependency_mapping and customer receipt binding
- customer/address dependency handling including p_address_save_tx
- pending Sale -> Return source_order_item_index mapping
- deterministic row_number() over(order by oi.id) server line mapping
- authenticated parent Sale receipt guard
- current customer/status/driver owner families
- owner postgres, SECURITY DEFINER, search_path=public
- anon blocked; authenticated and service_role EXECUTE retained

The live Outer was therefore preserved rather than overwritten blindly. Its current verified MD5 is 48bf4a78084065e0a7a55d1dafa4083e.

## Source validation
After allocating 10.5.4-beta.58.31, full npm run check completed PASS, including all consolidated RC1 gates and existing Point 4 / Offline / Permissions / Restaurant / Online Orders checks.

## Remaining boundary
No Windows installer was produced in this environment because the handed-off source workspace contains no node_modules/electron-builder installation. No SH-0007 device install was performed here. Practical device acceptance remains required before RC1 closure.
