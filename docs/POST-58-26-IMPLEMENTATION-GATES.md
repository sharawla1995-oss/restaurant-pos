# Sharawla — Post-58.26 Implementation Gates

Status: DOCUMENTATION ONLY
Branch: beta56-offline-ownership-consolidation
Production impact: NONE
Runtime/SQL/version change: NONE

This file converts the accepted architecture into executable gates.
It does not authorize deployment.

---

## G0 — SH-0007 58.26 Full Acceptance

### Entry
- SH-0007 only.
- Candidate: 10.5.4-beta.58.26.
- Production SH-0005 / SH-0006 remain untouched.
- Canonical Stock OFF.
- Cutover OFF.

### Required checks
- beta55.restaurant-full-roundtrip = PASS.
- cleanup_zero = true.
- cleanup residue = 0.
- offline_unresolved_before == offline_unresolved_after.
- no regression in:
  - navigation;
  - Offline Native V2;
  - delivery settlement;
  - shift cash integration;
  - permissions;
  - backup/recovery;
  - printing contract.

### Failure rule
If Restaurant Full Roundtrip fails:
- use the exact [restaurant-full-roundtrip:<stage>] diagnostic;
- do not weaken Point4 UUID/identity validation;
- correct only the failing owner/cleanup/runtime contract;
- repeat G0.

### Exit
G0 = PASS only when all required checks are evidenced.

---

## G1 — Shared Routes Runtime Acceptance

### Routes
- Suppliers.
- Purchasing.
- Stock Count.
- Transfers.

### Required checks
For each route:
- route opens;
- Restaurant adapter is used;
- Restaurant terminology is shown;
- no Retail-specific controls leak into Restaurant;
- normal read state loads;
- denied/empty state is visible and controlled;
- touch targets remain usable.

### Exit
All four routes PASS.

---

## G2 — Representative Touch Runtime Pass

### Screens
- POS.
- Customers.
- Orders.
- Kitchen / Delivery.
- Inventory Overview.
- Settings.

### Required checks
- no critical hover-only action;
- large primary tap targets;
- coarse-pointer controls remain usable;
- tables/cards scroll correctly;
- dialogs are reachable on compact displays;
- inputs are usable without precision mouse behavior;
- navigation does not regress.

### Exit
Representative Touch PASS.

---

## G3 — Menu & Function Cleanup Closure

### Required evidence
- G0 PASS.
- G1 PASS.
- G2 PASS.
- Restaurant 11-section navigation has no known route collision.
- no duplicate functional owner for the cleaned Restaurant routes.
- accepted Cashier layout remains unchanged unless regression evidence exists.

### Exit
Menu & Function Cleanup = CLOSED.

Only after G3 may Permissions V2 runtime implementation begin.

---

## G4 — Permissions V2 Core Restaurant Completion

### Scope
Complete Page + Action + Location authorization for the Restaurant core.

### Required owner hardening
At minimum cover:
- sales.create;
- sales.discount.apply;
- returns.create;
- shifts.open;
- shifts.close;
- shifts.cash.view;
- expenses.create;
- online_orders.accept;
- online_orders.reject;
- online_orders.payment.review;
- kitchen.status.update;
- orders.driver.assign;
- pickup.complete;
- customers.edit;
- customers.address.manage;
- customers.import;
- catalog.* write actions;
- promotions.manage;
- delivery.drivers.manage;
- delivery.zones.manage;
- website.* write actions;
- settings.* write actions;
- branches.* administrative actions;
- users.* administrative actions.

### Security rule
A hidden button is not authorization.

Sensitive writes must be rejected by the backend owner when Action or Location authorization fails.

### Compatibility rule
- existing page permissions remain compatible during migration;
- Role templates remain defaults;
- explicit user override remains authoritative;
- existing Food/Tables/Delivery V2 guards are preserved.

### Acceptance matrix
For every protected action:
1. page denied -> route/action unavailable;
2. page allowed + action denied -> backend rejects;
3. action allowed + location denied -> backend rejects;
4. action allowed + location allowed -> succeeds;
5. manipulated client request cannot bypass authorization;
6. audit evidence records the actor/action/location where required.

### Exit
Permissions V2 Core Restaurant = CLOSED.

---

## G5 — Location Scope V2 + Canonical Location Identity

### Cross-system identity
Use:
business_branches.code <-> branches.location_code

Do not use:
- display name;
- Cloud UUID vs operational bigint equality;
- implicit branch ordering.

### Location Scope
The existing employee_branches remains the broad ceiling.

Action-specific scope:
employee_action_location_scope_v2

must never grant a location outside employee_branches.

### Required checks
- stable location_code uniqueness per Business;
- rename does not change location identity;
- user scoped to Branch A cannot execute Branch B action;
- multi-branch users can have different Action scopes by location;
- Warehouse/Branch location types remain explicit;
- SH-0007 Test mapping is verified;
- Beta branch #3 residue is investigated before cleanup, not auto-deleted.

### Exit
Location identity + Location Scope V2 = CLOSED.

---

## G6 — Device / Printer Roles V1

### Logical roles
Initial:
- customer_receipt;
- default_prep;
- report.

Future station roles:
- kitchen_station:<station_code>;
- expo.

### Ownership
Business backend owns logical routing intent.
Physical Windows printer binding is device-local.

Native owner:
topburger-pos.sqlite -> kv

Recommended key:
printer-role:v1:<business_id>:<device_id>:<location_code>:<role_code>

### Legacy migration
- Native V1 binding first.
- If missing, read legacy localStorage customer/prep key.
- Import once only when canonical Business/Device/Location identity is available.
- Never overwrite an existing Native V1 binding from legacy.
- Station roles have no legacy fallback.

### Required checks
- printer exists in print:list;
- test print succeeds;
- restart preserves binding;
- offline preserves binding;
- backup/restore preserves binding;
- wrong Business/Device identity cannot reuse a mapping;
- required unbound station printer is fail-visible;
- no physical Windows printer name is stored as Cloud entitlement state.

### Exit
Device / Printer Roles V1 = CLOSED.

---

## G7 — Runtime Snapshot Catalog Expansion Gate

### Current frozen facts
- Feature catalog = 107.
- sealed validated readiness baseline = 107/107.
- Runtime Snapshot V2 Edge Function currently contains a fixed 107 transition guard.

### Phase A — still at 107
Before adding any feature:
- remove fixed-count assumption in favor of catalog-driven completeness;
- verify canonical feature count > 0;
- verify sealed validated baseline exists;
- verify one readiness row per canonical feature;
- verify decision_count == feature_count == baseline_row_count;
- preserve Ed25519/signature/hash/expiry/anti-rollback behavior.

### Phase A acceptance
On SH-0007:
- online snapshot refresh PASS;
- decision_count = 107;
- baseline_row_count = 107;
- signature PASS;
- offline safe-cache PASS;
- Production devices remain outside V2 snapshot routing.

### Phase B — atomic generation expansion
Only after Phase A PASS:
- add new feature rows;
- add eligibility/dependencies;
- build complete new readiness baseline;
- validate complete count;
- seal baseline;
- commit the generation atomically.

Never expose a committed partial catalog/baseline mismatch.

### Exit
Catalog Expansion Gate = CLOSED.

---

## G8 — Sharawla Admin Entitlement Wiring

### Root features
- food.kitchen_stations
- support.center
- ai.operator

### Required separation
Admin UI must show distinctly:
- Eligible;
- Entitled;
- Runtime Allowed.

A Business feature override must not create a paid/commercial entitlement.

### Required checks
For each root feature:
1. denied by default;
2. profile eligibility alone does not activate it;
3. Sharawla Admin grant creates the commercial entitlement;
4. signed Snapshot refresh returns allowed=true only when all gates pass;
5. suspend/cancel entitlement returns the feature to denied;
6. local POS settings cannot self-enable it;
7. expired/unverifiable Snapshot fails closed.

### Exit
Admin entitlement wiring accepted.

---

## G9 — Kitchen Stations V1

### Prerequisites
- G4 Permissions V2 CLOSED.
- G5 Location Scope CLOSED.
- G6 Printer Roles CLOSED.
- G7 Catalog Expansion CLOSED.
- G8 entitlement wiring accepted for food.kitchen_stations.

### Functional contract
Order
-> Lines
-> Station Routing
-> Screen / Printer / Both
-> Station New
-> Preparing
-> Ready
-> optional Expo
-> whole Order Ready only when all required stations are Ready.

### Routing
- Category default station.
- Product override.
- Explicit line routing.
- modifiers/notes/removals preserved.
- unmapped line -> visible Unassigned.
- no silent drop.

### Required checks
- entitlement OFF -> current single-Kitchen behavior unchanged;
- entitlement ON -> station configuration available only to authorized users;
- branch/location scoped;
- screen-only;
- printer-only;
- screen+printer;
- station completion independent;
- whole-order Ready waits for all required stations;
- printer unbound remains visible/retryable;
- Touch-first interaction.

### Exit
Kitchen Stations V1 = CLOSED/PASS.

---

## G10 — Sharawla Support Center V1

### Cloud root feature
support.center

### Cloud-owned entities
Conceptually:
- support_tickets;
- support_ticket_messages;
- support_ticket_events;
- support_diagnostic_bundles.

### Security
Business scope is derived from verified device identity.
Never trust arbitrary client business_id.

### User actions
- support.ticket.create;
- support.ticket.view_own;
- support.diagnostics.share;
- support.history.view;
- support.escalation.request.

### Diagnostics
Opt-in, minimal and auditable.
Must exclude by default:
- passwords/PINs;
- access/refresh tokens;
- service role keys;
- activation secrets;
- raw Canonical Fingerprint where unnecessary;
- full Business DB dumps;
- arbitrary local files.

### Required checks
- feature denied -> Support Center hidden/blocked;
- entitled + action denied -> operation rejected;
- ticket binds to correct Business/device;
- diagnostics consent explicit;
- escalation remains in same ticket history;
- retention/expiry policy is explicit.

### Exit
Support Center V1 = CLOSED/PASS.

---

## G11 — Sharawla AI Operator V1

### Cloud root feature
ai.operator

### AI is not a privileged DB identity
Never:
- use service_role for Business mutation;
- bypass auth.uid/current_employee_id;
- execute arbitrary RPC/table names;
- bypass Action Permissions;
- bypass Location Scope.

### Effective authority
Snapshot ai.operator ALLOW
AND ai.use
AND AI action level
AND underlying domain Action Permission
AND target Location Scope
AND normal business invariants
= allowed.

### AI action levels
- ai.read;
- ai.create;
- ai.modify;
- ai.approve;
- ai.historical_correction.

### V1 execution owner
Use an explicit allowlisted owner.
Every AI action maps to a known guarded business operation.

No dynamic SQL based on model/user-provided function names.

### Two-stage writes
Preview:
- resolve target;
- calculate impact;
- return request/hash;
- no mutation.

Execute:
- explicit confirmation where required;
- re-check permissions and scope at execution time;
- enforce idempotency;
- mutate once;
- record authoritative audit in same transaction.

### Curated V1 only
Start with operations whose underlying owners are already hardened.

For any owner in a profile-specific family, the Cross-Profile Backend Authorization Audit must also be CLOSED for that owner before AI allowlisting.

Do not expose legacy direct REST writes merely because the human UI still uses them.

### Required checks
- AI cannot exceed signed-in user's domain permissions;
- AI cannot cross location scope;
- denied root entitlement blocks AI entirely;
- approve permission does not imply domain approve permission;
- high-risk operation requires confirmation;
- audit survives renderer failure because it is backend-owned;
- retry is idempotent;
- unsupported action code fails closed.

### Exit
Sharawla AI Operator V1 = CLOSED/PASS.

---

## G12 — Cross-Profile Backend Authorization / Release Continuation

Kitchen Stations remains Restaurant/Cafe V1 only.
Support Center and AI Operator are cross-profile capabilities only where eligibility/readiness explicitly allows them.

Before Cross-Profile Closure or V1 Production Ready, close:
`docs/CROSS-PROFILE-BACKEND-AUTHORIZATION-AUDIT.md`

Mandatory checks:
- sensitive profile-specific SECURITY DEFINER mutation owners do not rely on UI isolation;
- unintended PUBLIC/anon EXECUTE grants are removed where the endpoint is not intentionally public;
- trusted Profile/Capability ownership is enforced in the backend owner;
- Action V2 is enforced;
- Location Scope is enforced where applicable;
- direct RPC negative tests prove Restaurant credentials cannot execute Retail/Pharmacy/Logistics/Membership/Service-only mutations, and vice versa.

Sharawla AI may call only owners that already passed this hardening gate.

Do not globally migrate historical Runtime Config feature authority to Snapshot V2 as part of these gates.

A separate future parity migration is required for historical features.

---

## Exact continuation chain

G0 Full Acceptance
-> G1 Shared Routes
-> G2 Touch
-> G3 Menu Cleanup CLOSED
-> G4 Permissions V2
-> G5 Location Scope / Location Code
-> G6 Printer Roles
-> G7 Snapshot Catalog Expansion
-> G8 Admin Entitlement Wiring
-> G9 Kitchen Stations
-> G10 Support Center
-> G11 Sharawla AI Operator
-> G12 Cross-Profile / release continuation

At every gate:
- fail closed;
- do not skip evidence;
- do not touch Production unless a later explicit promotion gate authorizes it.
