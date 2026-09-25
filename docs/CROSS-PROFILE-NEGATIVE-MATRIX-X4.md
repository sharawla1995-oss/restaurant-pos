# Sharawla — Cross-Profile Negative Matrix X4

Status: X4 TEST DESIGN / DOCUMENTATION ONLY
Execution: NOT STARTED
DB mutation: NONE
Runtime change: NONE
Production impact: NONE

---

## 1. Purpose

Prove that an authenticated employee from one Sharawla Profile cannot directly call a mutation owner belonging to another Profile.

UI/navigation isolation is not evidence.

The test is backend-direct and must prove:
- wrong Profile -> denied before mutation;
- right Profile -> reaches Action/Location/business checks;
- denied Action -> denied;
- denied Location -> denied;
- allowed Profile+Action+Location -> normal owner behavior.

---

## 2. Required guard order

For profile-specific staff owners, expected authorization order:

1. authenticated employee resolution;
2. trusted operational Profile assertion;
3. Action V2;
4. Location scope where applicable;
5. entity/business invariant validation;
6. mutation.

Cross-profile mismatch should be rejected before any mutation.

A wrong-Profile call must not fail later merely because:
- entity does not exist;
- branch is invalid;
- quantity is invalid.

The Profile boundary itself must be observable in acceptance diagnostics.

---

## 3. Diagnostic result codes

Recommended normalized security outcomes:

- AUTH_REQUIRED
- PROFILE_MISMATCH
- ACTION_DENIED
- LOCATION_DENIED
- BUSINESS_INVARIANT_FAILED

Actual user-facing text may be friendlier.

Acceptance harness should retain a stable machine-readable reason code.

Do not expose secrets or internal SQL details.

---

## 4. Source Profile set

At minimum:

- restaurant
- retail
- pharmacy
- logistics
- membership
- service

Future:
- warehouse
- general
- other implemented profiles

Unknown Profile is always deny for profile-specific owner.

---

## 5. Representative target owners

### Restaurant

Representative:
- food_purchase_order_create_v1
- restaurant_table_session_open_v1

Expected Profile:
- restaurant

### Retail

Representative:
- retail_purchase_order_create_v2
- retail_inventory_adjust
- retail_variant_combination_save_v1

Expected Profile:
- retail

### Pharmacy

Representative:
- pharmacy_receive_batch
- pharmacy_create_prescription
- pharmacy_update_claim_status

Expected Profile:
- pharmacy

### Logistics

Representative:
- logistics_shipment_create_v1
- logistics_shipment_status_v1
- logistics_settlement_create_v1

Expected Profile:
- logistics

### Membership

Representative:
- membership_subscribe_v1
- membership_checkin_v1
- membership_freeze_v1

Expected Profile:
- membership

### Service

Representative:
- service_job_create_v1
- service_job_status_v1
- service_appointment_create_v1

Expected Profile:
- service

---

## 6. Primary cross-profile matrix

Legend:
- PM = must fail PROFILE_MISMATCH.
- OWN = expected Profile; proceed to Action/Location/business checks.

| Caller Profile | Restaurant owner | Retail owner | Pharmacy owner | Logistics owner | Membership owner | Service owner |
|---|---:|---:|---:|---:|---:|---:|
| restaurant | OWN | PM | PM | PM | PM | PM |
| retail | PM | OWN | PM | PM | PM | PM |
| pharmacy | PM | PM | OWN | PM | PM | PM |
| logistics | PM | PM | PM | OWN | PM | PM |
| membership | PM | PM | PM | PM | OWN | PM |
| service | PM | PM | PM | PM | PM | OWN |
| unknown | PM | PM | PM | PM | PM | PM |

No Restaurant fallback.

---

## 7. Same-profile authorization matrix

For each diagonal OWN cell run:

### Case A — Action denied
Profile:
correct

Action:
explicit DENY

Location:
allowed

Expected:
ACTION_DENIED
No mutation.

### Case B — broad Location denied
Profile:
correct

Action:
allowed

employee_branches:
does not include target

Expected:
LOCATION_DENIED
No mutation.

### Case C — Action-specific Location denied
Profile:
correct

Action:
allowed

Broad branch:
allowed

Action-specific scope:
restricted to another Location

Expected:
LOCATION_DENIED
No mutation.

### Case D — all authorization allowed
Profile:
correct

Action:
allowed

Location:
allowed

Expected:
owner proceeds to business validation/mutation.

---

## 8. Admin matrix

Admin behavior must be explicit.

Current accepted semantics:
- Action V2 returns true for Admin;
- has_branch_access returns true for Admin.

Profile guard must still apply to Admin operating inside a Business.

A Restaurant Business Admin is not allowed to invoke Retail owner solely because role=admin.

Sharawla platform/super-admin service operations are separate from Business Admin and must use dedicated Cloud/Admin paths.

---

## 9. Anonymous matrix

For ACL-EMPLOYEE owners after X1:

anon direct EXECUTE:
- should fail at ACL boundary.

Expected:
permission denied / endpoint unavailable before function body.

Do not use AUTH_REQUIRED as the only control if anon should not have EXECUTE at all.

For intentionally public owners:
- anon remains allowed according to public contract.

Examples:
- public quote/catalog;
- website order submission.

---

## 10. Public Retail separation

Do not apply employee Profile matrix blindly to public website functions.

Separate public acceptance:

### Read
- retail_catalog
- retail_website_bootstrap
- retail_website_branch_open
- retail_website_catalog
- retail_website_quote
- retail_website_offer_discount

Test:
- only intended public data;
- inactive/hidden data not leaked;
- no staff-only fields.

### Public write
- retail_create_website_order
- retail_create_website_order_identity_v1

Test:
- identity/idempotency;
- branch eligibility;
- stock/reservation contract;
- abuse/input validation;
- no employee permission bypass into staff RPCs.

---

## 11. Internal helper matrix

Internal Retail helpers such as reservation identity helpers must remain non-callable by anon/authenticated roles.

Test:
- anon EXECUTE denied;
- authenticated EXECUTE denied;
- intended internal owner still works.

---

## 12. Test-user requirement

Do not fake Profile by changing client-side state.

X4 requires genuine isolated Beta users/business contexts for each implemented Profile.

Each source test context must be bound through trusted operational Profile identity.

Required evidence per context:
- profile binding;
- employee id;
- broad Locations;
- Action overrides;
- test business/backend identity.

Do not reuse Production users.

---

## 13. Mutation safety

Negative cross-profile tests should require no committed mutation.

Guard order ensures wrong Profile fails before business mutation.

Positive diagonal tests should use:
- isolated fixtures;
- deterministic client_tx_id where owner supports idempotency;
- cleanup/rollback contract;
- residue verification.

Do not point X4 at Production.

---

## 14. Direct-RPC requirement

Run representative tests directly at backend RPC level.

Do not rely only on clicking UI.

For each negative case capture:
- caller profile;
- target owner;
- expected profile;
- returned reason code;
- before row/effect count;
- after row/effect count;
- mutation delta = 0.

---

## 15. Direct-REST bypass requirement

For flows where legacy UI still writes tables directly:

Test whether the underlying table RLS could bypass the newly guarded owner.

If direct REST can still perform the sensitive mutation:
X4 fails even if RPC owner is secure.

Owner hardening and RLS/REST hardening must agree.

---

## 16. Offline requirement

Where an operation can be queued offline:

1. create operation under allowed context;
2. before sync, revoke Action or Location;
3. sync;
4. backend must re-evaluate current authorization;
5. unauthorized replay remains unresolved and visible;
6. no silent mutation.

Cross-profile Profile binding change is a high-risk migration and must not be used as a casual offline test.

---

## 17. Evidence record per owner

Record:
- function signature;
- caller Profile;
- expected Profile;
- Action code;
- target Location source;
- ACL;
- result code;
- mutation before/after;
- audit record if allowed;
- client_tx_id/idempotency result where applicable.

---

## 18. X4 closure threshold

X4 is CLOSED only when:

- all 30 off-diagonal cells in the 6x6 matrix deny as PROFILE_MISMATCH;
- unknown Profile denies all profile-specific owners;
- every diagonal representative proves Action deny;
- every location-sensitive diagonal proves Location deny;
- every representative allow path behaves normally;
- anon ACL negative tests pass for ACL-EMPLOYEE owners;
- internal helpers remain client-closed;
- public endpoints remain intentionally functional;
- no direct REST bypass remains for the representative sensitive mutation set.

---

## 19. Relationship to AI

AI owner allowlist can only include a domain owner after its Profile family has passed X4.

If a Profile family is OPEN:
AI must not route actions into that family.

AI must never retry a PROFILE_MISMATCH by selecting a different Profile-specific RPC.

---

## 20. Relationship to release

X4 is mandatory before:
- Cross-Profile Closure;
- AI write enablement for those profile families;
- V1 Production Ready security closure.

It does not block the immediate SH-0007 Restaurant G0-G3 evidence collection.

---

## 21. Current state

X0 owner inventory:
CLOSED for design.

X1 ACL classification:
CLOSED for design.

X2 trusted Profile binding:
CLOSED for design.

X3 Action + Location:
CLOSED for design.

X4 negative matrix:
DESIGN CLOSED.

X1-X4 implementation/execution:
NOT STARTED.

Immediate runtime continuation:
SH-0007 10.5.4-beta.58.26 -> G0 -> G1 -> G2 -> G3.
