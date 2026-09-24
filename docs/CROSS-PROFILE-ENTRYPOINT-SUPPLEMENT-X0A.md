# Sharawla — Cross-Profile Entrypoint Supplement X0A

Status: READ-ONLY / DOCUMENTATION ONLY
DB mutation: NONE
Runtime change: NONE
Production impact: NONE

This supplement corrects the scope limitation of the original X0 name-prefix inventory.

## 1. Why X0A exists

Original X0 scanned function families whose names START with:
- retail_
- pharmacy_
- logistics_
- membership_
- service_

That produced:
- 88 functions.

During Pharmacy Closure Audit, a critical owner was found outside that naming pattern:
- create_pharmacy_pos_order_atomic

A broader read-only scan searched for profile tokens ANYWHERE in public function names.

It found 21 additional functions.

Therefore:
- original 88 remains a valid prefix-family inventory;
- it is NOT an exhaustive profile entrypoint inventory.

Current named profile-token surface:
- 88 prefix-family functions
- + 21 additional named entrypoints
- = 109 functions

This still does not prove there are no shared/generic functions with profile-specific behavior under names that contain no profile token.

## 2. Additional Retail entrypoints

Staff/internal/public classification is required.

### Staff Retail order owners

- create_retail_pos_order_atomic(jsonb,jsonb,jsonb)
- create_retail_order_return_idempotent(bigint,text,text,jsonb,jsonb,text)
- create_retail_variant_pos_order_atomic_v1(jsonb,jsonb,jsonb)
- create_retail_variant_order_return_idempotent_v1(bigint,text,text,jsonb,jsonb,text)

Current:
- SECURITY DEFINER
- authenticated executable
- anon executable
- auth guard
- branch guard
- no Action V2

These are critical Retail staff mutation owners and must be included in X1-X4.

### Retail website staff intake owners

- accept_retail_website_order(bigint)
- accept_retail_website_order_identity_v1(text,text)
- reject_retail_website_order(bigint,text)
- reject_retail_website_order_identity_v1(text,text,text)

These are staff-side acceptance/rejection owners.
They require:
- Retail Profile guard;
- Action V2;
- Location;
- ACL intent.

### Retail public/customer website owners

- cancel_retail_website_order_customer(text,text)
- cancel_retail_website_order_customer_identity_v1(text,text,text)
- track_retail_website_order(text,text)

These are public/customer-facing owners and must NOT be treated as employee Action endpoints.

Keep them in a public API security class:
- ownership proof / phone/order verification;
- rate abuse controls;
- minimal data exposure;
- no staff permission semantics.

### Retail internal identity owner

- expire_retail_website_order_identity_v1(text)

Currently no anon/authenticated execute.

Preserve internal classification unless architecture explicitly changes.

### Food/Retail bridging owners

- create_food_retail_pos_order_atomic_v1(jsonb,jsonb,jsonb,boolean)
- create_food_retail_pos_order_atomic_with_context_v1(jsonb,jsonb,jsonb,boolean,jsonb)
- create_food_retail_order_return_idempotent_v1(bigint,text,text,jsonb,jsonb,text,boolean)

These are cross-domain shared/bridge owners.

Do NOT classify them as ordinary Retail-only purely by name.

They require explicit shared-owner allowlist semantics:
- intended profiles;
- caller owners;
- internal/public ACL;
- Action/Location inheritance or internal-only execution.

## 3. Additional Pharmacy entrypoint

Critical:
- create_pharmacy_pos_order_atomic(jsonb,jsonb,jsonb,jsonb,bigint,jsonb)

Current:
- SECURITY DEFINER
- anon executable
- authenticated executable
- auth.uid guard
- branch guard
- no Action V2

This is the Pharmacy sale owner.

It must be added to:
- X1 ACL hardening;
- X2 Profile=pharmacy guard;
- X3 sales.create + Location;
- X4 cross-profile negative matrix.

The original X0 count of 9 pharmacy_* functions therefore excluded the single most important Pharmacy transaction owner.

## 4. Additional Logistics public web owners

- web_logistics_pickup_v1(...)
- web_logistics_track_v1(...)

Current:
- SECURITY DEFINER
- anon/authenticated executable
- no auth.uid guard.

These appear intentionally public/customer web entrypoints.

They belong to public Logistics API security, not staff Action V2.

Required:
- branch/business resolution;
- anti-abuse;
- data minimization;
- status/ownership verification;
- no staff mutation leakage.

## 5. Additional Membership public web owners

- web_membership_book_class_v1(...)
- web_membership_request_v1(...)

Current:
- SECURITY DEFINER
- anon/authenticated executable
- no auth.uid guard.

These are public/member acquisition/booking surface candidates.

Keep separate from employee:
- membership_book_class_v1
- membership_subscribe_v1
- etc.

## 6. Additional Service public web owner

- web_service_booking_v1(...)

Current:
- SECURITY DEFINER
- anon/authenticated executable
- no auth.uid guard.

This is a public/customer booking surface candidate.

It must have a public security contract distinct from staff:
- service_appointment_create_v1
- service_job_create_v1
- etc.

## 7. Revised inventory status

Original X0:
- PREFIX-FAMILY INVENTORY = CLOSED.

X0A:
- NAMED PROFILE-TOKEN SUPPLEMENT = CLOSED.

Overall exhaustive backend owner inventory:
- NOT YET CLAIMED COMPLETE.

Reason:
a generic/shared function may implement profile-sensitive behavior without a profile token in its name.

Before final X1-X4 execution, owner inventory must also include:
- runtime call graph entrypoints;
- navigation-owned RPCs;
- profile adapters;
- public web adapters;
- shared Core owners used by multiple Profiles.

## 8. Revised count

Read-only named scan:

- original prefix family = 88
- additional non-prefix named entrypoints = 21
- named token total = 109

Do not use 109 as a claim that the entire database has exactly 109 profile-sensitive owners.

It is the current name-discoverable profile surface.

## 9. X1 implications

Employee owners discovered in X0A must join ACL hardening.

Do NOT revoke anon from deliberately public web functions.

Classification examples:

ACL-EMPLOYEE:
- create_retail_pos_order_atomic
- create_retail_order_return_idempotent
- create_retail_variant_pos_order_atomic_v1
- create_retail_variant_order_return_idempotent_v1
- create_pharmacy_pos_order_atomic
- Retail staff accept/reject website order owners

ACL-PUBLIC:
- Retail customer track/cancel
- web_logistics_*
- web_membership_*
- web_service_booking_v1

ACL-INTERNAL:
- expire_retail_website_order_identity_v1
- internal food/retail bridge variants according to caller audit.

## 10. X4 implications

Add representative negative calls:

Restaurant credentials -> create_retail_pos_order_atomic
Expected:
PROFILE_MISMATCH after X2.

Restaurant credentials -> create_pharmacy_pos_order_atomic
Expected:
PROFILE_MISMATCH.

Pharmacy credentials -> create_retail_variant_pos_order_atomic_v1
Expected:
PROFILE_MISMATCH unless an explicit shared-owner adapter is designed.

Retail credentials -> create_pharmacy_pos_order_atomic
Expected:
PROFILE_MISMATCH.

Public website owners are NOT tested using this employee-profile mismatch model.
They get separate public API abuse/data-boundary tests.

## 11. AI implication

Sharawla AI allowlist inventory must use actual hardened owners, not prefix scans.

Never omit a critical owner because its name begins with "create_" rather than the Profile name.

## 12. Current state

X0 prefix inventory:
CLOSED as a limited baseline.

X0A named supplement:
CLOSED.

Exhaustive semantic owner inventory:
OPEN until call-graph/adapter inventory is reconciled.

X1-X4 implementation:
NOT STARTED.

No DB/Runtime/Production mutation.
