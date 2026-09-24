# Sharawla — Cross-Profile Backend Authorization Audit

Status: READ-ONLY SECURITY AUDIT / DOCUMENTATION ONLY
Environment audited: isolated Beta operational backend
Runtime deployment: NONE
Database mutation: NONE
Production impact: NONE

---

## 1. Why this audit exists

Sharawla already isolates Profiles in UI/navigation/runtime routing.

That is not sufficient if profile-specific mutating RPCs remain directly callable by authenticated users from another Profile.

A backend owner must enforce its own:
- authentication;
- Action permission;
- Location/branch scope where applicable;
- Profile/Capability ownership.

Do not rely on a hidden page as authorization.

---

## 2. Confirmed permission inheritance context

Current `has_action_permission_v2()` behavior:

1. explicit employee Action override;
2. else legacy_permission;
3. else DENY.

Current `has_permission()` behavior:
- Admin -> allow;
- non-Admin -> persisted employee_permissions row only.

Legacy permission keys are not Profile-specific.

Read-only Beta evidence showed a Restaurant cashier with persisted keys such as `orders` and `customers` can appear inherited-allowed for Actions belonging to other domains.

This alone is not proof that a cross-profile mutation can execute.
Owner enforcement must be audited separately.

---

## 3. Profile-specific owner scan

Read-only scan of public functions by naming family:

| Family | Functions | SECURITY DEFINER | authenticated EXECUTE | anon EXECUTE privilege | auth.uid guard | Action V2 guard | Legacy permission guard | Branch guard | Profile guard hint |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| logistics | 7 | 7 | 7 | 7 | 6 | 0 | 0 | 6 | 0 |
| membership | 8 | 8 | 8 | 8 | 8 | 0 | 0 | 2 | 0 |
| pharmacy | 9 | 9 | 9 | 9 | 9 | 0 | 5 | 5 | 0 |
| retail | 52 | 46 | 46 | 46 | 36 | 0 | 29 | 30 | 0 |
| service | 12 | 12 | 12 | 12 | 12 | 0 | 1 | 6 | 0 |

Notes:
- `anon EXECUTE privilege=true` means the role has function EXECUTE privilege; it does not prove the call succeeds. Many functions still reject when `auth.uid()` is null.
- The scan searched function definitions for the existing Action V2 and Profile/Capability guard patterns. A future implementation may use a new explicit helper not present today.

---

## 4. Confirmed owner examples

### Logistics shipment create

`logistics_shipment_create_v1`

Confirmed checks:
- auth.uid required;
- has_branch_access(branch) required;
- idempotency/business validation.

Not present:
- Action V2 permission;
- Logistics Profile/Capability guard.

### Logistics shipment status

`logistics_shipment_status_v1`

Confirmed:
- auth.uid;
- branch access;
- state validation.

Not present:
- Action V2;
- Profile/Capability guard.

### Membership subscribe

`membership_subscribe_v1`

Confirmed:
- auth.uid;
- plan/business invariants;
- idempotency.

Not present:
- Action V2;
- Profile guard;
- branch/location scope.

### Membership check-in

`membership_checkin_v1`

Confirmed:
- auth.uid;
- branch access;
- subscription/visit invariants.

Not present:
- Action V2;
- Membership Profile/Capability guard.

### Service job create

`service_job_create_v1`

Confirmed:
- auth.uid;
- branch access;
- idempotency.

Not present:
- Action V2;
- Service Profile/Capability guard.

### Service job status

`service_job_status_v1`

Confirmed:
- auth.uid;
- branch access;
- status validation.

Not present:
- Action V2;
- Service Profile/Capability guard.

### Service asset save

`service_asset_save_v1`

Confirmed:
- auth.uid;
- legacy `customers` permission or Admin;
- business data validation.

Not present:
- Action V2;
- Service Profile/Capability guard.

This is an example where a shared legacy permission can cross a Profile boundary.

---

## 5. Security conclusion

Backend Profile isolation is not yet fully closed.

Current UI/Profile routing can hide these surfaces, but hidden navigation is not an authorization boundary.

For sensitive mutating profile-specific owners, the current pattern must be treated as a Cross-Profile authorization gap until:
- owner-level Profile/Capability authorization exists;
- owner-level Action permission exists;
- target Location scope is enforced where applicable;
- EXECUTE grants are intentionally scoped.

This finding belongs to:
- Permissions Final Closure;
- Cross-Profile Closure;
- AI prerequisites;
- V1 Production Ready security closure.

Do not expose Sharawla AI to an owner that has not passed this hardening gate.

---

## 6. SECURITY DEFINER grant rule

Many audited functions are in `public`, are SECURITY DEFINER, and currently report EXECUTE privilege for authenticated and anon roles.

For mutating internal Business owners, final design should not rely on PUBLIC EXECUTE plus an internal guard if the endpoint does not need public reachability.

Recommended final policy:
- revoke PUBLIC execute from sensitive SECURITY DEFINER functions;
- revoke anon execute from sensitive internal mutation functions;
- grant authenticated only where an authenticated Business user should call the owner;
- keep truly public/read-only quote endpoints separate and explicitly documented;
- retain internal `auth.uid()` / employee checks even after grant hardening.

Grant hardening does not replace Action/Profile/Location authorization.

---

## 7. Required Profile/Capability owner guard

Introduce one explicit backend contract rather than copy/paste ad hoc checks.

Conceptual owner precondition:

`assert_profile_capability_action_v2(expected_profile, feature_code, action_code, location_id)`

It should compose:
1. authenticated Business employee;
2. current Business/Profile resolution;
3. expected Profile or explicitly shared owner eligibility;
4. Feature/Capability enabled for that Business runtime contract where applicable;
5. Action V2 permission;
6. Location scope;
7. normal owner-specific invariant checks.

Exact implementation can differ, but all six authorization dimensions must remain visible and testable.

Do not trust a client-supplied Profile string as authority.
Profile must be resolved from trusted Business runtime data.

---

## 8. Shared owners vs profile-specific owners

Some owners may be intentionally shared between Profiles.

For a shared owner:
- explicit shared capability ownership must be documented;
- allowed Profiles must be an allowlist;
- unknown Profile fails closed;
- Action permission still applies;
- Location scope still applies.

For a Profile-specific owner:
- exact expected Profile must be enforced.

Do not keep implicit "Restaurant fallback" behavior.

---

## 9. Action V2 mapping requirement

Existing Action catalog contains many cross-profile codes, but audited legacy owners do not currently consume them.

Before an Action code is considered effective:
- identify the exact backend owner;
- wire `has_action_permission_v2` or the final composed evaluator into that owner;
- verify DENY at backend;
- test direct RPC manipulation.

Catalog rows alone are not enforcement.

---

## 10. Cross-profile hardening batches

### X0 — Owner inventory
Freeze:
- function signature;
- profile family;
- mutation/read classification;
- current grants;
- current auth/branch/legacy/action guards;
- intended Action code;
- target Location source.

### X1 — Grant hardening
For sensitive mutating SECURITY DEFINER owners:
- remove unintended PUBLIC/anon execute;
- retain only required callers.

Do not change business behavior in the same batch where possible.

### X2 — Profile/Capability guard
Add trusted profile/capability precondition.

Acceptance:
- intended Profile -> can proceed to next authorization checks;
- unrelated Profile -> backend deny;
- unknown Profile -> deny.

### X3 — Action + Location
Wire Action V2 and Location Scope.

Acceptance:
- page hidden is irrelevant;
- direct RPC with denied action -> backend deny;
- allowed action + denied location -> backend deny;
- allowed + correct profile + location -> normal business behavior.

### X4 — Cross-profile negative matrix
From Restaurant credentials attempt representative Retail/Pharmacy/Logistics/Membership/Service mutation owners.
Every unrelated Profile owner must deny before mutation.

Repeat from each supported Profile.

---

## 11. Relationship to Restaurant closure

This audit does not change the current G0-G3 Restaurant runtime gate.

Do not destabilize 58.26 before its pending Full Acceptance.

After Menu Cleanup closes:
- Permissions V2 Core Restaurant proceeds;
- cross-profile owner hardening is a mandatory platform security track before Cross-Profile Closure / AI / V1 Production Ready.

If a future Restaurant release is declared security-complete before Cross-Profile Closure, this audit must be explicitly addressed first.

---

## 12. Relationship to Sharawla AI

AI must never call a legacy owner merely because:
- the RPC exists;
- the user can reach the table;
- a legacy permission happens to match.

AI V1 allowlist may include only owners that have passed:
- Profile/Capability guard;
- Action V2;
- Location Scope;
- idempotency;
- authoritative audit.

Cross-profile owner hardening is therefore a hard prerequisite for any AI action that touches those families.

---

## 13. Acceptance evidence

For every hardened owner record:
- starting definition hash/signature;
- final definition;
- EXECUTE ACL;
- profile/capability negative test;
- Action deny test;
- Location deny test;
- allow test;
- idempotency test where applicable;
- audit evidence;
- rollback boundary.

No owner is marked CLOSED from UI behavior alone.

---

## 14. Current state

Audit finding:
**OPEN — Cross-Profile backend authorization is not fully closed.**

No fix has been deployed by this audit.

No Production database was touched.

No Runtime source/version changed.

Current immediate runtime gate remains:
SH-0007 10.5.4-beta.58.26 Full Acceptance.
