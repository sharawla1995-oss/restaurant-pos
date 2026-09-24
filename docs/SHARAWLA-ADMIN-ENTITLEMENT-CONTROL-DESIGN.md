# Sharawla Admin — Capability, Commercial Entitlement and Runtime Access Control

Status: DOCUMENTATION / READ-ONLY DESIGN
Runtime deployment: NONE
Cloud schema deployment: NONE
Production impact: NONE

This document replaces the stale reference to a non-existent Admin V4 branch/document.
It records the Admin control model against the Cloud contracts that exist today.

---

## 1. Existing Cloud control layers

### Capability / eligibility

Current Admin RPC:
`admin_get_business_feature_matrix_v2(uuid)`

This resolves, per Business:
- Feature code/domain/name;
- feature_class;
- implemented;
- Profile enabled/required;
- Activity Category override/required;
- baseline enabled/required;
- Business override;
- effective_enabled;
- inheritance_source;
- dependencies.

This layer answers:

**Is this capability structurally eligible for this Business/Profile/Activity?**

It is NOT the commercial entitlement authority for paid/packaged features.

### Commercial entitlement

Current Admin contracts include:
- `admin_commercial_business_state_v1`
- `admin_commercial_effective_feature_v1`
- `admin_commercial_assign_base_package_v1`
- `admin_commercial_grant_paid_addon_v1`
- `admin_commercial_set_addon_status_v1`
- `admin_commercial_set_base_status_v1`
- package catalog/detail/publish helpers.

Commercial state uses:
- commercial_packages;
- commercial_package_features;
- business_package_entitlements;
- business_paid_addons.

This layer answers:

**Has Sharawla commercially entitled this Business to the Feature now?**

### Runtime access

Current device access authority:
- `evaluate_sharawla_feature_access_cloud_v2`
- signed Runtime Snapshot V2.

This layer composes:
- verified device identity;
- runtime environment;
- commercial entitlement;
- Business override;
- dependency resolution;
- readiness;
- trusted environment policy.

This layer answers:

**May this verified device actually use the Feature now?**

---

## 2. Admin UX must keep the three states separate

For every commercial/root capability, Admin should display three independent states:

1. **Eligible**
   - derived from Capability Matrix / profile/category rules.

2. **Entitled**
   - derived from commercial package or paid add-on state.

3. **Runtime Allowed**
   - derived from Runtime Access / signed Snapshot decision.

Never merge these into one checkbox.

Example:

| Feature | Eligible | Entitled | Runtime Allowed |
|---|---|---|---|
| food.kitchen_stations | Yes | No | No |
| support.center | Yes | Yes | Yes |
| ai.operator | Yes | Suspended | No |

A Business Feature override is configuration/control.
It must not create a paid commercial entitlement.

---

## 3. Root feature control model

### food.kitchen_stations

Class:
- add_on

Eligibility:
- Restaurant/Cafe V1 only.

Required:
- false.

Commercial rule:
- no automatic entitlement;
- Sharawla Admin grant required.

Dependency:
- food.kitchen

Runtime:
- signed Snapshot V2 ALLOW required.

Local POS setting:
- may configure an already entitled feature;
- may not self-entitle.

### support.center

Class:
- standard/package capability for V1.

Eligibility:
- cross-profile where Support Center is implemented.

Required:
- false.

Commercial rule:
- included by selected support-enabled package or explicit commercial entitlement;
- not self-enabled by Business.

Dependencies:
- core.licensing
- core.audit

Runtime:
- signed Snapshot V2 ALLOW required.

### ai.operator

Class:
- add_on

Eligibility:
- cross-profile where AI integration is implemented/readiness-approved.

Required:
- false.

Commercial rule:
- explicit Sharawla Admin paid add-on or equivalent commercial entitlement;
- OFF by default.

Dependencies:
- core.permissions
- core.audit

Runtime:
- signed Snapshot V2 ALLOW required.

Business local setting:
- cannot self-entitle;
- can only configure behavior after entitlement.

---

## 4. Recommended Admin Business detail layout

### Tab A — Capability Matrix

Source:
`admin_get_business_feature_matrix_v2`

Show:
- Feature;
- domain;
- Profile eligibility;
- Activity Category eligibility;
- required;
- implemented;
- dependency list;
- Business override;
- inheritance source.

Actions:
- Business override enable/disable only where policy allows.
- Reset Business override.

Warning:
This tab does not sell/entitle paid capabilities.

### Tab B — Commercial Plan

Source:
`admin_commercial_business_state_v1`

Show:
- active base package;
- package version;
- starts/expires;
- lifecycle status;
- paid add-ons;
- add-on status;
- starts/expires.

Actions:
- assign base package;
- change/suspend base entitlement according to existing lifecycle;
- grant paid add-on;
- suspend/reactivate/cancel paid add-on.

### Tab C — Effective Entitlement

Source:
`admin_commercial_effective_feature_v1`

For selected Feature show:
- entitled true/false;
- reason_code;
- source package/add-on where available;
- validity window.

This is the commercial truth view.

### Tab D — Runtime Access

Source:
Runtime access evaluator / device snapshot inspection.

For each Business device show:
- Support Code;
- device status/revoked;
- runtime_environment;
- feature decision;
- reason_code;
- readiness_status;
- blocked_by;
- dependency_reason;
- snapshot ID;
- sequence;
- expires_at.

This is the device truth view.

---

## 5. Admin action semantics

### Granting an Add-on

Admin chooses:
- Business;
- Feature;
- starts_at;
- expires_at optional.

The action must use the existing commercial grant owner, not write `business_features` as a substitute.

After successful commercial change:
1. entitlement state changes;
2. Runtime Snapshot remains unchanged until refresh/new signed snapshot;
3. device receives the new decision only through the trusted snapshot path.

### Suspending an Add-on

Admin suspension must:
- update commercial lifecycle;
- not delete historical entitlement rows;
- cause next Runtime evaluation to deny;
- produce a new signed Snapshot decision on refresh.

### Business Feature override

Use only for supported operational override semantics.

Do not use it to:
- sell an add-on;
- create entitlement;
- bypass readiness;
- bypass dependency;
- force Runtime ALLOW.

---

## 6. Kitchen Stations control flow

Expected Admin flow:

Business
-> Commercial Plan
-> Add-on: Kitchen Stations
-> Grant
-> Runtime Access
-> verify food.kitchen_stations ALLOW on intended Beta device
-> POS exposes Kitchen Stations configuration.

If Entitled=true but Runtime Allowed=false:
Admin must show the reason instead of pretending activation succeeded.

Possible reasons include:
- dependency denied;
- readiness not ready;
- environment denied;
- device untrusted;
- Business override disabled;
- snapshot not refreshed.

---

## 7. Support Center control flow

Expected Admin flow:

Business
-> Commercial Plan / Support Plan
-> support.center entitlement
-> Runtime Access decision
-> POS Support Center appears.

Support staff/Admin view later should include:
- Tickets;
- Messages;
- Diagnostics;
- Escalations;
- History;
- plan/status;
- Business/device reference.

The support system must derive Business scope from verified device identity for device-originated tickets.

Do not trust arbitrary client business_id.

---

## 8. Sharawla AI control flow

Expected Admin flow:

Business
-> Commercial Plan
-> Add-on: Sharawla AI Operator
-> Grant
-> Runtime Access
-> verify ai.operator ALLOW
-> Business Admin may assign AI user permissions inside the Business POS.

Sharawla Admin controls product entitlement.
Business Admin controls which of its authorized employees may use the entitled AI capability.

These are separate authorities.

### User-level AI authority

Cloud Feature:
- ai.operator

Operational Action Permissions:
- ai.use
- ai.read
- ai.create
- ai.modify
- ai.approve
- ai.historical_correction

AI cannot exceed:
- underlying domain Action Permission;
- target Location Scope;
- normal business owner invariants.

---

## 9. Status badges

Recommended badges in Admin:

### Eligibility
- ELIGIBLE
- NOT ELIGIBLE
- REQUIRED
- PLANNED / NOT IMPLEMENTED

### Commercial
- ENTITLED
- NOT ENTITLED
- SCHEDULED
- SUSPENDED
- EXPIRED
- CANCELLED

### Runtime
- ALLOWED
- DENIED
- BLOCKED BY DEPENDENCY
- READINESS BLOCKED
- ENVIRONMENT BLOCKED
- DEVICE BLOCKED
- SNAPSHOT STALE / UNAVAILABLE

The UI should never label a capability simply “Active” without saying which layer is active.

---

## 10. Catalog expansion prerequisite

Current Cloud facts:
- Feature catalog = 107;
- sealed validated readiness baseline = 107/107;
- current Runtime Snapshot V2 transition code still contains a fixed 107 expectation.

Therefore Admin must not expose controls for a newly inserted root Feature until the Catalog Expansion Gate is closed.

Required sequence:
1. make Snapshot completeness catalog-driven while still at 107;
2. prove SH-0007 signed Snapshot health;
3. add new Feature + complete readiness generation atomically;
4. verify expanded signed Snapshot;
5. only then expose commercial Admin controls for that new Feature.

Do not create a UI checkbox for a Feature whose Runtime catalog/readiness transition is incomplete.

---

## 11. Admin acceptance matrix

For each root Feature:

### Not eligible
- commercial grant action disabled/rejected;
- Runtime denied.

### Eligible but not entitled
- Capability tab = Eligible;
- Commercial tab = Not Entitled;
- Runtime = Denied.

### Entitled but readiness blocked
- Commercial tab = Entitled;
- Runtime = Denied with readiness reason.

### Entitled + ready + trusted device
- Runtime = Allowed.

### Suspended/cancelled
- Commercial state reflects lifecycle;
- next Runtime evaluation = Denied;
- next signed Snapshot = Denied.

### Business override disabled
- Commercial entitlement may remain valid;
- Runtime must deny if the override is a valid disable layer;
- Admin must display that distinction.

---

## 12. Audit requirements

Every Sharawla Admin mutation affecting commercial access must log:
- Sharawla Admin actor;
- Business;
- Feature/package;
- action;
- previous state;
- new state;
- effective time;
- reason/notes where applicable;
- created_at.

Do not rely on UI-only history.

Commercial audit is separate from Business operational audit.

---

## 13. Support / AI product packaging rule

Do not model every button/action as a separate Cloud Feature.

Cloud root product entitlements:
- support.center
- ai.operator
- food.kitchen_stations

User-level operations belong to Permissions V2.

This avoids Feature catalog explosion and preserves the distinction:
product entitlement vs employee authorization.

---

## 14. Exact implementation dependency

Admin entitlement UI implementation may begin only after:
- SH-0007 58.26 Full Acceptance;
- Menu Cleanup closure;
- Permissions V2 core completion;
- Location/Printer prerequisites where relevant;
- Runtime Snapshot Catalog Expansion Gate.

Kitchen Stations entitlement then precedes Kitchen Stations runtime.

Support/AI entitlement controls precede their respective Runtime products.

---

## 15. Current state

This document is Design only.

No:
- Runtime source change;
- Cloud SQL mutation;
- Feature insertion;
- commercial entitlement mutation;
- Production change;
- version change.

The current immediate runtime gate remains SH-0007 10.5.4-beta.58.26 Full Acceptance.
