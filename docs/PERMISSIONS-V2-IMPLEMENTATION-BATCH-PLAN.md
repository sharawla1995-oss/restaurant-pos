# Sharawla Permissions V2 — Implementation Batch Plan

Status: DOCUMENTATION / IMPLEMENTATION PREP ONLY
Execution gate: only after G0-G3 PASS
Runtime baseline before implementation: 10.5.4-beta.58.26 accepted on SH-0007

No code/SQL in this document is deployed.

---

## Safety boundary

Before any batch:
- SH-0007 only;
- Production SH-0005/SH-0006 untouched;
- 10.5.3 CLEAN immutable;
- Canonical Stock OFF;
- Cutover OFF;
- accepted printing/offline/delivery/cashier behavior preserved;
- exact starting HEAD pinned;
- working tree clean;
- previous batch acceptance closed.

Do not mix:
- Permissions owner changes;
- Snapshot catalog expansion;
- Kitchen Stations;
- Support;
- AI;
in one batch.

---

# Batch P0 — Permission Contract Freeze

## Goal

Freeze the final Action catalog and ownership map before changing behavior.

## Deliverables

Documentation/checker only:
- exact Action code list;
- each Action -> page;
- each Action -> backend owner;
- each Action -> target Location source;
- each Action -> current authorization state;
- each Action -> migration owner.

## Required mappings

### Sales / returns
- sales.create -> POS -> create_pos_order_atomic
- sales.discount.apply -> POS -> sale owner / discount validation boundary
- returns.create -> Returns -> create_order_return_idempotent

### Shifts / expenses
- shifts.open -> Shifts -> open_pos_shift_idempotent
- shifts.close -> Shifts -> close_pos_shift_v2 / accepted close owner
- shifts.cash.view -> Shifts -> shift cash metrics read owner
- expenses.create -> Expenses -> create_pos_expense_idempotent

### Online / lifecycle
- online_orders.accept -> Online Orders -> accept_website_order
- online_orders.reject -> Online Orders -> reject_website_order
- online_orders.payment.review -> Online Orders -> review_order_payment
- kitchen.status.update -> Kitchen -> guarded order lifecycle owner
- orders.driver.assign -> Delivery -> guarded assignment owner
- pickup.complete -> Pickup/Orders -> guarded completion owner

### Customers
- customers.create -> existing
- customers.edit
- customers.address.manage
- customers.import

### Catalog / promos
- catalog.categories.manage
- catalog.products.manage
- catalog.variants.manage
- catalog.modifiers.manage
- catalog.branch_availability.manage
- promotions.manage

### Delivery setup
- delivery.drivers.manage
- delivery.zones.manage

### Website
- website.settings.manage
- website.branch_schedule.manage
- website.product_availability.manage
- website.appearance.manage
- website.payment_methods.manage

### Settings / branches / users
- settings.business_identity.manage
- settings.printing.manage
- settings.financial.manage
- settings.operational.manage
- branches.create
- branches.edit
- branches.activate
- branches.delete
- branches.copy_configuration
- users.view
- users.create
- users.edit
- users.activate
- users.password.reset
- users.page_permissions.manage
- users.action_permissions.manage
- users.location_scope.manage

## P0 acceptance

- no duplicate semantic Action codes;
- no generic `manage.everything`;
- no Action code with unknown owner;
- every write path has exactly one planned owner;
- every branch/location-sensitive Action identifies target Location source.

Exit: P0 CLOSED.

---

# Batch P1 — Action Catalog Additive Expansion

## Goal

Add missing Action codes only.

## Database changes

Add rows to:
- permission_actions_v2

Do not yet change existing business write behavior.

## Rules

- additive only;
- active=true only for actions whose backend owner will be introduced in the same controlled migration sequence;
- legacy_permission may be set only when intentional compatibility fallback exists;
- new high-risk Actions may use legacy_permission=NULL to fail closed until explicit grants/role defaults are ready.

## P1 acceptance

- existing action rows unchanged;
- no duplicate codes;
- Permissions V2 UI renders new actions;
- admin can set/reset override;
- non-admin cannot mutate action grants;
- existing users have no unintended new authority.

Exit: P1 CLOSED.

---

# Batch P2 — Core Transaction Owner Guards

## Goal

Protect the most important atomic owners first.

## Owners

1. create_pos_order_atomic
   - Action: sales.create
   - Location: p_order.branch_id
   - preserve idempotency / Point4 identity / Offline retry.

2. create_order_return_idempotent
   - Action: returns.create
   - Location: original order branch
   - preserve return lineage / Point4 / stock semantics.

3. open_pos_shift_idempotent
   - Action: shifts.open
   - Location: p_branch_id
   - preserve Offline open replay.

4. close_pos_shift_v2 / accepted close path
   - Action: shifts.close
   - Location: shift.branch_id
   - preserve driver cash custody blockers.

5. create_pos_expense_idempotent
   - Action: expenses.create
   - Location: shift.branch_id
   - preserve Offline replay/idempotency.

## Hard rule

Authorization is checked at execution time on every retry.
Do not store a past authorization result inside the Offline operation as an approval token.

Offline replay uses:
- original actor identity/session semantics where supported;
- original target Location identity;
- current backend authorization rules at sync time.

If policy requires offline execution while disconnected, that must be explicitly designed; do not invent it in this batch.

## P2 acceptance

For each owner:
- allow + location allow = PASS;
- action deny = backend reject;
- location deny = backend reject;
- admin semantics explicit;
- duplicate client_tx_id remains idempotent;
- Point4 canonical identity unchanged;
- Offline queue behavior unchanged;
- no Production deploy.

Exit: P2 CLOSED.

---

# Batch P3 — Order Lifecycle Ownership

## Goal

Remove sensitive direct `orders PATCH` writes from renderer authorization ownership.

## Current direct lifecycle examples

- Kitchen:
  - new -> preparing
  - preparing -> ready
  - ready -> completed

- Delivery:
  - driver assignment
  - ready/preparing state transitions
  - pickup completed
  - some delivered paths

## New guarded owners

Define explicit RPC/business owners for:
- kitchen_status_update_v2
- order_assign_driver_v2
- pickup_complete_v2

Reuse existing delivery_mark_delivered_v2 for final delivery where contract matches.

## Rules

- validate current allowed source status;
- validate target status transition;
- validate branch/location;
- validate Action;
- write audit in same transaction;
- reject illegal transition;
- preserve website/pickup/delivery semantic differences;
- do not broaden payment state transitions.

## P3 acceptance

- no sensitive renderer direct PATCH remains for protected lifecycle transitions;
- manipulating UI cannot bypass Action/Location guard;
- accepted delivery settlement behavior unchanged;
- Kitchen screen behavior unchanged except authorization owner.

Exit: P3 CLOSED.

---

# Batch P4 — Customer Ownership

## Goal

Protect customer writes without breaking POS auto-customer flow.

## Actions

- customers.create
- customers.edit
- customers.address.manage
- customers.import

## Design decision

Customer entity is Business-wide, but the employee must still be operating from an allowed Business Location.

For create-from-sale:
- sales.create does not automatically imply customers.create unless intentionally documented;
- decide whether sale may create a lightweight customer record through a dedicated sale-owned path.

Preferred:
- POS sale owner may resolve/create the minimal customer identity it needs under the sale contract;
- manual Customer screen create/edit uses Customers actions.

This avoids requiring every cashier to hold broad CRM editing rights just to save a phone number during sale.

## P4 acceptance

- manual create requires customers.create;
- edit requires customers.edit;
- address mutation requires customers.address.manage;
- bulk import requires customers.import;
- duplicate phone invariant preserved;
- POS customer lookup/autofill preserved;
- sale flow still works according to explicit minimal-customer contract.

Exit: P4 CLOSED.

---

# Batch P5 — Catalog / Promotions / Delivery Setup

## Goal

Replace Page-only write authorization with Action owners.

## Scope

Catalog:
- categories
- products
- variants
- modifiers
- branch availability

Promotions:
- promo_codes
- scope link tables

Delivery setup:
- drivers
- zones

## Rule

Prefer guarded RPC owners over many direct REST writes for multi-table updates.

Use Action-aware RLS only where table-level CRUD is intentionally the canonical owner.

Do not create mixed ownership where renderer sometimes uses RPC and sometimes bypasses it via direct REST.

## P5 acceptance

- every write path has one owner;
- branch-scoped data checks Location;
- multi-table promo/catalog writes are transaction-safe where needed;
- public website SELECT policies remain unchanged;
- no public write broadening.

Exit: P5 CLOSED.

---

# Batch P6 — Website / Settings / Branch Admin

## Goal

Harden configuration writes.

## Website Actions

- website.settings.manage
- website.branch_schedule.manage
- website.product_availability.manage
- website.appearance.manage
- website.payment_methods.manage

## Settings Actions

- settings.business_identity.manage
- settings.printing.manage
- settings.financial.manage
- settings.operational.manage

## Branch Actions

- branches.create
- branches.edit
- branches.activate
- branches.delete
- branches.copy_configuration

## Rules

- global Business identity settings are Business-scoped, not branch-scoped;
- branch settings require target branch access;
- branch delete retains existing empty-branch safety;
- branch copy must authorize both source visibility and target mutation;
- physical Windows printer names remain device-local and are not introduced into backend settings.

## P6 acceptance

- page permission alone no longer authorizes sensitive writes;
- target branch scope enforced;
- existing website public read behavior unchanged;
- current printing behavior unchanged.

Exit: P6 CLOSED.

---

# Batch P7 — User / Permission Administration

## Goal

Move user-management authority from implicit Admin-only UI/RLS into explicit Action V2 semantics while preserving admin safety.

## Actions

- users.view
- users.create
- users.edit
- users.activate
- users.password.reset
- users.page_permissions.manage
- users.action_permissions.manage
- users.location_scope.manage

## Hard rules

- user cannot grant another user authority they themselves are not authorized to administer unless Sharawla super-admin policy explicitly allows it;
- user cannot deactivate their own only-admin account where it would orphan the Business;
- password reset remains privileged;
- Action permission grant changes are audited;
- Location scope changes are audited.

## P7 acceptance

- non-authorized user cannot edit permissions by direct request;
- Action grant UI uses guarded admin RPC;
- existing admin can still manage users;
- lockout/orphan protections preserved.

Exit: P7 CLOSED.

---

# Batch P8 — Location Scope V2 Schema + Evaluator

## Goal

Add per-Action Location scope without breaking employee_branches.

## Additive table

Concept:
employee_action_location_scope_v2

Columns:
- employee_id
- action_code
- location_id
- allowed
- updated_at

Primary identity:
(employee_id, action_code, location_id)

## Ceiling rule

employee_branches remains broad ceiling.

Effective location allow:

broad branch access
AND
(
  no Action-specific scope exists
  OR explicit Action-location allow exists
)

An Action scope cannot grant outside employee_branches.

## Evaluator

Introduce one backend evaluator for:
- action code
- target location

Concept:
has_action_permission_at_location_v2(action_code, location_id)

It composes:
- current employee;
- is_admin semantics;
- Action permission;
- broad branch access;
- action-specific location scope.

## P8 acceptance

- legacy user with no action-location rows behaves according to broad employee_branches;
- scoped user can be limited per Action;
- scope cannot expand broad branch list;
- invalid location = deny;
- direct DB manipulation by normal user blocked;
- admin management audited.

Exit: P8 CLOSED.

---

# Batch P9 — Location Code Cross-System Identity

## Goal

Introduce stable cross-system Business Location identity.

## Mapping

Sharawla Cloud:
business_branches.code

Operational:
branches.location_code

## Rules

- unique per Business;
- immutable after activation except explicit controlled migration;
- display name may change independently;
- do not infer mapping from name at runtime;
- do not equate UUID with bigint.

## Beta prerequisite

Investigate operational branch #3 `hgolj` before assigning final codes or deleting anything.

## P9 acceptance

- SH-0007 Cloud Test branch maps exactly to one operational location_code;
- rename test preserves mapping;
- device Location identity can resolve the operational branch deterministically;
- no ambiguous duplicate code.

Exit: P9 CLOSED.

---

# Batch P10 — Permissions UI Consolidation

## Goal

Present Page + Action + Location in one understandable user-management workflow.

## User editor structure

1. Role template
2. Allowed Locations
3. Page Permissions
4. Advanced Action Permissions
5. Action-specific Location Scope

## UX rules

- Role template applies defaults only.
- User overrides remain visible.
- `Inherit / Allow / Deny` remains for Actions.
- Location-specific scope appears only when useful.
- Admin warnings for dangerous permissions.
- Touch-friendly controls.

## P10 acceptance

- no hidden second permission system;
- user can see effective result;
- action + location conflicts explain why denied;
- changes save atomically or fail visibly;
- mobile/touch usable.

Exit: P10 CLOSED.

---

# Batch P11 — Authorization Acceptance Harness

## Goal

Prove security behavior, not just UI.

## Automated matrix

For representative actions:
- admin;
- cashier;
- call center;
- custom user.

Test:
- page deny;
- action deny;
- location deny;
- allow;
- direct RPC manipulation;
- direct REST manipulation where exposed;
- offline replay;
- duplicate retry;
- cross-branch attempt.

## Regression matrix

Must preserve:
- Restaurant POS;
- returns;
- shifts;
- delivery settlement;
- driver cash custody;
- purchases;
- transfers;
- stock count;
- website;
- printing;
- Backup/Recovery;
- Offline Native V2.

## Exit

Permissions V2 Restaurant = CLOSED/PASS.

Only after P11:
- start Printer Roles implementation if not already separately accepted;
- continue Snapshot Catalog Expansion;
- then Admin root entitlements;
- then Kitchen Stations / Support / AI.

---

# Recommended commit discipline

One logical batch per commit series.

Never combine:
- DB owner hardening;
- renderer route conversion;
- Location Scope schema;
- Cloud entitlement;
- Snapshot expansion

in one uncontrolled commit.

Each batch should have:
- starting HEAD;
- changed files;
- changed RPC/table contracts;
- static checker;
- rollback boundary;
- acceptance result;
- final commit SHA.

---

# Exact start condition

Do not execute P0/P1 runtime/DB work until:

G0 Full Acceptance PASS
AND G1 Shared Routes PASS
AND G2 Touch PASS
AND G3 Menu Cleanup CLOSED.

Until then this file remains implementation preparation only.
