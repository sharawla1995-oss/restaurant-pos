# Sharawla — Permissions V2, Locations, Printer Roles, Support & AI Design Checkpoint

Status: DESIGN / READ-ONLY AUDIT
Runtime target: after SH-0007 10.5.4-beta.58.26 Full Acceptance PASS
Production impact: NONE
Canonical Stock: OFF
Cutover: OFF

## 1. Hard boundary

This document records architecture and audit findings only.

Do not:
- change Top Burger Production SH-0005 / SH-0006;
- change 10.5.3 CLEAN;
- deploy SQL from this document;
- change Runtime version;
- activate Canonical Stock or Cutover;
- bypass the current 58.26 Full Acceptance gate.

Implementation starts only after the current SH-0007 runtime gate is accepted.

## 2. Current permissions reality

Restaurant permissions currently have three partially independent layers:

1. Page permissions
   - source: Restaurant Engine `PERMISSION_DEFS` / `employee_permissions`
   - effect: page/navigation access.

2. Action Permissions V2
   - catalog: `permission_actions_v2`
   - overrides: `employee_action_permissions_v2`
   - evaluator: `has_action_permission_v2(text)`
   - admin UI: `permissions-v2-ui.js`
   - UI supports: Inherit / Allow / Deny.

3. Location access
   - table: `employee_branches`
   - evaluator: `has_branch_access(bigint)`
   - today this is a coarse employee-to-branch allow list, not per-action scope.

The final model is:

Page permission
+ Action permission
+ Location scope
= Effective user authorization.

Role templates remain defaults only. Explicit user overrides are authoritative.

## 3. Confirmed Action V2 coverage already present

The Beta backend already enforces Action V2 on major Restaurant/Food operations including:

- food.ingredients.manage
- food.ingredients.conversion.manage
- food.ingredients.stock.adjust
- food.recipes.manage
- food.recipes.activate
- food.prep.manage
- food.production.start
- food.production.complete
- food.waste.post
- food.suppliers.manage
- food.purchasing.create
- food.purchasing.approve
- food.purchasing.receive
- food.purchasing.return
- food.purchasing.cancel
- food.stock_count.post
- food.transfer.create
- food.transfer.receive
- food.transfer.cancel
- restaurant.tables.manage
- restaurant.tables.use
- delivery.mark_delivered
- delivery.payment.change_at_delivery
- delivery.settlement.view
- delivery.settlement.create
- customers.create
- reports.export

The audited Food purchase / count / transfer RPCs also enforce branch access where applicable.

## 4. Confirmed Core Restaurant authorization gaps

The following core write paths do not currently have explicit Action V2 guards at their top-level owner:

### Sales / returns
- create_pos_order_atomic
- create_order_return_idempotent

Current state:
- sale is branch-scoped;
- return has no explicit Action V2 guard at the owner boundary.

Required action contract:
- sales.create
- sales.discount.apply
- returns.create

### Shifts / expenses
- open_pos_shift_idempotent
- close_pos_shift_idempotent / close_pos_shift_v2
- create_pos_expense_idempotent

Required action contract:
- shifts.open
- shifts.close
- shifts.cash.view
- expenses.create
- expenses.edit only if editing is intentionally supported.

### Online / website orders
- accept_website_order
- reject_website_order
- review_order_payment

Current state:
- branch access exists;
- no explicit Action V2 boundary.

Required action contract:
- online_orders.accept
- online_orders.reject
- online_orders.payment.review

### Kitchen / order lifecycle direct writes
Current UI writes order statuses directly for:
- new -> preparing
- preparing -> ready
- pickup ready -> completed
- driver assignment -> out_for_delivery
- some delivered/completed paths.

Required action contract:
- kitchen.status.update
- orders.driver.assign
- pickup.complete
- delivery.mark_delivered remains the preferred delivery owner where available.

Direct table writes should not remain the final authorization boundary for sensitive lifecycle changes.

### Customers
Current RLS allows any authenticated mapped employee to create/update customers and manage addresses.

Required action contract:
- customers.create (already exists)
- customers.edit
- customers.address.manage
- customers.import

### Catalog / products
Current writes use legacy page permission `products`.

Required action contract:
- catalog.categories.manage
- catalog.products.manage
- catalog.variants.manage
- catalog.modifiers.manage
- catalog.branch_availability.manage

### Promotions
Current writes use legacy `promoCodes`.

Required action contract:
- promotions.manage

### Delivery setup
Current driver/zone writes use legacy `deliverySettings` + branch access.

Required action contract:
- delivery.drivers.manage
- delivery.zones.manage

### Website management
Current write boundaries use legacy page permissions.

Required action contract:
- website.settings.manage
- website.branch_schedule.manage
- website.product_availability.manage
- website.appearance.manage
- website.payment_methods.manage

### Business / branch / printing / finance settings
Current owners mostly use Admin or legacy page permissions.

Required action contract:
- branches.create
- branches.edit
- branches.activate
- branches.delete
- branches.copy_configuration
- settings.business_identity.manage
- settings.printing.manage
- settings.financial.manage
- settings.operational.manage

### Users and permissions
Current user management is Admin/RLS based and Page-centric.

Required action contract:
- users.view
- users.create
- users.edit
- users.activate
- users.password.reset
- users.page_permissions.manage
- users.action_permissions.manage
- users.location_scope.manage

## 5. Location Scope V2

### Existing data

Operational backend:
- `branches.id` = bigint local operational ID
- `branches.location_type` = branch | central_warehouse
- `branches.location_code` exists
- `employee_branches` maps employee -> branch.

Sharawla Cloud:
- `business_branches.id` = UUID
- `business_branches.code` exists
- `devices.branch_id` links devices to Cloud business branches.

Do not join Cloud and Operational locations by numeric/UUID ID or by display name.

### Canonical cross-system identity

Use:

`business_branches.code <-> branches.location_code`

as the stable cross-system Location identity.

Properties:
- immutable after activation except explicit admin migration;
- unique within a Business;
- independent from display name;
- independent from local database ID type.

### Effective Location permission

A user action is allowed only when all are true:

1. Page permission allows the page.
2. Action permission allows the action.
3. Employee has access to the target location.
4. If an Action-specific location override exists, the target location is included.
5. Backend ownership guard validates the same target location.

The existing `employee_branches` remains the broad location ceiling for compatibility.

Proposed additive table:
- employee_action_location_scope_v2
  - employee_id
  - action_code
  - location_id
  - allowed
  - updated_at
  - PK(employee_id, action_code, location_id)

An Action-specific Allow must never expand beyond the employee's broad `employee_branches` ceiling.

## 6. Beta location audit note

Current isolated Beta operational database contains:
- branch id=1, name TEST
- branch id=3, name hgolj

The second branch has no observed orders, shifts, expenses, ingredient stock, delivery zones/drivers, or print settings, but has employee-branch links.

Do not delete or alter it during this design phase.
Treat as Beta residue/investigation item until provenance is understood.

Cloud SH-0007 is linked to Cloud branch `Test`.

Neither Cloud branch `code` nor Operational `location_code` is populated yet.

## 7. Device + Printer Roles V1

### Existing printing behavior

The desktop already exposes:
- printer list;
- silent HTML printing;
- explicit Windows `deviceName`.

Current logical roles are implicit:
- customer
- prep

Physical Windows printer names are stored locally per branch/device in localStorage.

Shared branch print formatting is stored in `branch_print_settings`.

This split should be preserved.

### Contract

Cloud/Business data owns logical intent.
Each physical device owns the Windows printer mapping.

Never store a Windows printer name as a cross-device Cloud identity.

Initial logical printer roles:
- customer_receipt
- default_prep
- report

Kitchen Stations later adds:
- kitchen_station:<station_code>
- optional expo

Proposed local mapping identity:

`location_code + device_id + printer_role -> physical Windows printer name`

The physical mapping remains local/offline-safe.

## 8. Kitchen Stations entitlement

Feature code:
- `food.kitchen_stations`

Rules:
- Restaurant/Cafe eligible only in V1.
- Optional.
- Not required for all Restaurant profiles.
- Business cannot self-entitle.
- Sharawla Admin controls entitlement.
- When not entitled, current single Kitchen / prep-receipt behavior remains unchanged.

Kitchen Stations must consume Runtime Snapshot V2 feature decisions, not trust a local settings toggle.

## 9. Runtime Snapshot V2 finding

SH-0007 already has a signed Runtime Snapshot V2 path.

The current consumer verifies:
- device binding;
- business binding;
- environment binding;
- fingerprint hash;
- expiry;
- monotonic sequence / anti-rollback;
- SHA-256 payload hash;
- Ed25519 signature.

The Cloud V2 snapshot builder evaluates each feature with:
`evaluate_sharawla_feature_access_cloud_v2`

This already composes:
- trusted device/environment;
- commercial entitlement;
- Business override;
- feature dependencies;
- readiness.

This should be the future entitlement authority for optional commercial features.

## 10. Catalog expansion gate

Current Feature catalog count = 107.
Current sealed validated readiness baseline = 107 / 107.

The current Runtime Snapshot V2 Edge Function also contains a fixed expectation:
`feature_count === 107`.

Therefore adding any new Feature before fixing catalog expansion would fail closed.

Required sequence for any new feature such as Kitchen Stations, Support or AI:

1. Replace hard-coded 107 with a safe canonical catalog contract.
2. Preserve fail-closed behavior for incomplete snapshots.
3. Create a new complete readiness baseline matching the expanded catalog.
4. Seal and validate the new baseline.
5. Add the new feature catalog row(s).
6. Verify snapshot decision count equals the canonical catalog count.
7. Verify SH-0007 accepts the new signed snapshot.
8. Only then expose the feature to Runtime UI.

No partial 107/108 state is acceptable.

## 11. Customer Support capability

This is Sharawla customer support for the Business owner/operator.
It is not the Business's own customer CRM.

Proposed feature family:
- support.center
- support.chat
- support.tickets
- support.diagnostics
- support.history
- support.human_escalation

Flow:
Support Chat
-> Ticket
-> Diagnostics
-> Resolution or Human Escalation
-> Support History

Sharawla Cloud owns entitlement and service plan.

Runtime visibility must be feature-gated.
Support diagnostics must not bypass device, permission, privacy or audit boundaries.

## 12. Sharawla AI Operator

Sharawla AI is separate from Customer Support.

Proposed feature family:
- ai.operator
- ai.read
- ai.create
- ai.modify
- ai.approve
- ai.historical_correction

Default:
- OFF until entitled by Sharawla Admin.

Effective AI authority must never exceed the signed-in user's authority.

Final authorization:
Cloud entitlement
AND User Page Permission
AND User Action Permission
AND User Location Scope
AND AI-specific action level.

Examples:
- a cashier denied Returns cannot ask AI to create a return;
- a manager scoped to one branch cannot ask AI to modify another branch;
- historical correction requires explicit high-risk approval and immutable audit evidence.

High-risk AI actions require:
- preview;
- explicit confirmation;
- impact summary;
- immutable audit event.

## 13. Sharawla Cloud control model

The correct hierarchy is:

Sharawla Cloud entitlement
-> Business-level effective feature
-> User Page/Action/Location authorization
-> Runtime visibility and action enforcement.

Business users may configure an already-entitled feature, but may not grant themselves an entitlement that Sharawla Cloud did not issue.

## 14. Exact implementation order after 58.26 gate

1. SH-0007 58.26 Full Acceptance PASS.
2. Shared Routes runtime clicks.
3. Touch runtime pass.
4. Close Menu & Function Cleanup.
5. Permissions V2 Core Restaurant completion.
6. Location Scope V2.
7. Location Code cross-system identity.
8. Device / Printer Roles V1.
9. Runtime Snapshot catalog expansion gate.
10. Sharawla Admin entitlement wiring.
11. food.kitchen_stations.
12. Kitchen Stations V1.
13. support.* capability family.
14. ai.* capability family.
15. Cross-profile acceptance.

## 15. Acceptance requirements for Permissions V2

For each sensitive action:
- allowed user + allowed location -> PASS;
- denied action -> backend rejects even if UI is manipulated;
- allowed action + denied location -> backend rejects;
- denied page -> page hidden/blocked;
- Admin semantics remain explicit and auditable;
- Offline action replay preserves the original authorization-relevant location identity;
- legacy Page permissions remain compatible until migration is complete.

No action is considered protected merely because a button is hidden.


## 16. Restaurant Page -> Action -> Location Matrix

Legend:
- EXISTING = already present in `permission_actions_v2` and confirmed in the current Beta backend.
- NEW = required for the final Permissions V2 contract.
- PAGE = page permission remains the read/navigation boundary.
- LOCATION = action must be evaluated against the target operational location.

| Restaurant surface | Action code | State | Location rule |
|---|---|---:|---|
| POS / cashier | sales.create | NEW | LOCATION: selling branch |
| POS / cashier | sales.discount.apply | NEW | LOCATION: selling branch |
| Returns | returns.create | NEW | LOCATION: original/selling branch |
| Customers | customers.create | EXISTING | Business-wide data, caller still constrained to an allowed operating location |
| Customers | customers.edit | NEW | Business-wide data; action permission required |
| Customers | customers.address.manage | NEW | Business-wide data; action permission required |
| Customers | customers.import | NEW | Business-wide bulk action; explicit permission required |
| Delivery | delivery.mark_delivered | EXISTING | LOCATION: order branch |
| Delivery | delivery.payment.change_at_delivery | EXISTING | LOCATION: order branch |
| Delivery | orders.driver.assign | NEW | LOCATION: order branch |
| Pickup | pickup.complete | NEW | LOCATION: order branch |
| Delivery settings | delivery.settlement.view | EXISTING | LOCATION: branch |
| Delivery settings | delivery.settlement.create | EXISTING | LOCATION: branch |
| Delivery settings | delivery.drivers.manage | NEW | LOCATION: branch |
| Delivery settings | delivery.zones.manage | NEW | LOCATION: branch |
| Kitchen | kitchen.status.update | NEW | LOCATION: order branch |
| Tables | restaurant.tables.use | EXISTING | LOCATION: branch |
| Tables configuration | restaurant.tables.manage | EXISTING | LOCATION: branch |
| Shifts | shifts.open | NEW | LOCATION: branch |
| Shifts | shifts.close | NEW | LOCATION: branch |
| Shifts | shifts.cash.view | NEW | LOCATION: branch |
| Expenses | expenses.create | NEW | LOCATION: branch |
| Expenses | expenses.edit | NEW | LOCATION: branch |
| Ingredients | food.ingredients.manage | EXISTING | Business catalog action |
| Ingredient conversions | food.ingredients.conversion.manage | EXISTING | Business catalog action |
| Ingredient stock adjustment | food.ingredients.stock.adjust | EXISTING | LOCATION: branch/warehouse stock owner |
| Recipes | food.recipes.manage | EXISTING | Business catalog action |
| Recipes | food.recipes.activate | EXISTING | Business catalog action |
| Prep | food.prep.manage | EXISTING | Business catalog action |
| Production | food.production.start | EXISTING | LOCATION: branch |
| Production | food.production.complete | EXISTING | LOCATION: branch |
| Waste | food.waste.post | EXISTING | LOCATION: branch |
| Suppliers | food.suppliers.manage | EXISTING | Business supplier catalog |
| Purchasing | food.purchasing.create | EXISTING | LOCATION: purchasing branch |
| Purchasing | food.purchasing.approve | EXISTING | LOCATION: purchase branch |
| Purchasing | food.purchasing.receive | EXISTING | LOCATION: receiving branch |
| Purchasing | food.purchasing.return | EXISTING | LOCATION: purchase/return branch |
| Purchasing | food.purchasing.cancel | EXISTING | LOCATION: purchase branch |
| Stock count | food.stock_count.post | EXISTING | LOCATION: counted location |
| Transfers | food.transfer.create | EXISTING | LOCATION: source + destination access |
| Transfers | food.transfer.receive | EXISTING | LOCATION: destination |
| Transfers | food.transfer.cancel | EXISTING | LOCATION: transfer source / ownership rule |
| Products | catalog.categories.manage | NEW | Business catalog action |
| Products | catalog.products.manage | NEW | Business catalog action |
| Products | catalog.variants.manage | NEW | Business catalog action |
| Products | catalog.modifiers.manage | NEW | Business catalog action |
| Branch product availability | catalog.branch_availability.manage | NEW | LOCATION: branch |
| Promo codes | promotions.manage | NEW | Business-wide, but any branch restrictions inside the promo must also be authorized |
| Online order intake | online_orders.accept | NEW | LOCATION: order branch |
| Online order intake | online_orders.reject | NEW | LOCATION: order branch |
| Online payment review | online_orders.payment.review | NEW | LOCATION: order branch |
| Website | website.settings.manage | NEW | Business-wide |
| Website | website.branch_schedule.manage | NEW | LOCATION: branch |
| Website | website.product_availability.manage | NEW | LOCATION: branch |
| Website | website.appearance.manage | NEW | Business-wide |
| Website | website.payment_methods.manage | NEW | LOCATION when branch-specific |
| Reports | reports.export | EXISTING | Must not export data outside the user's permitted locations |
| Branch management | branches.create | NEW | Business admin scope |
| Branch management | branches.edit | NEW | LOCATION: target branch |
| Branch management | branches.activate | NEW | LOCATION: target branch |
| Branch management | branches.delete | NEW | LOCATION: target branch; existing no-movement safety still applies |
| Branch management | branches.copy_configuration | NEW | LOCATION: source + target |
| Settings | settings.business_identity.manage | NEW | Business-wide |
| Settings | settings.printing.manage | NEW | LOCATION: branch; physical printer mapping remains device-local |
| Settings | settings.financial.manage | NEW | LOCATION: branch |
| Settings | settings.operational.manage | NEW | Business/branch according to setting owner |
| Capabilities | settings.capabilities | EXISTING | Business-level; must never self-grant Sharawla Cloud entitlement |
| Users | users.view | NEW | Business admin scope |
| Users | users.create | NEW | Business admin scope |
| Users | users.edit | NEW | Business admin scope |
| Users | users.activate | NEW | Business admin scope |
| Users | users.password.reset | NEW | Business admin scope |
| Users | users.page_permissions.manage | NEW | Business admin scope |
| Users | users.action_permissions.manage | NEW | Business admin scope |
| Users | users.location_scope.manage | NEW | Business admin scope |

### Matrix rules

1. A Page permission never implies all Actions on that page.
2. An Action Allow never expands location access.
3. A Location Allow never grants a missing Page or Action permission.
4. Admin bypass behavior, where intentionally retained, must remain explicit in the backend owner and be audit-visible.
5. Any direct REST write that remains in UI after Permissions V2 must be protected by RLS using the same Action + Location semantics, or be replaced by a guarded RPC owner.
6. High-risk write owners should prefer guarded RPCs over generic direct table UPDATE/INSERT.
7. Offline replay must preserve the original branch/location identity and must not recalculate authority against a different location.
8. Report/export actions must filter to the employee's effective location scope, not merely hide UI navigation.

### Direct-write migration priority

Priority A — move behind guarded owners first:
- order lifecycle status changes;
- driver assignment;
- customer create/edit/address writes;
- expense edits;
- user/permission/location-scope administration.

Priority B — harden with Action-aware RLS or guarded owners:
- products/categories/variants/modifiers;
- promo codes;
- website settings;
- delivery drivers/zones;
- branch print/financial/payment settings.

Priority C — keep read paths compatible while write ownership is tightened.


## 17. Current status

Design discovery: CLOSED for this checkpoint.
Runtime implementation: NOT STARTED.
DB deployment: NONE.
Production changes: NONE.
Version change: NONE.

Next implementation gate remains SH-0007 10.5.4-beta.58.26 Full Acceptance.
