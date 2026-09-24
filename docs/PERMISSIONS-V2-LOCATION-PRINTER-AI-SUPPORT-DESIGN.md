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

Branch #3 is not arbitrary residue. Read-only audit and the deployed Acceptance fixture confirm it is currently selected as the required `other_branch_id` for Restaurant Full Acceptance whenever branch #1 is the primary test branch.

The fixture explicitly requires an active second branch with employee access and fails with `ACCEPTANCE_SECOND_BRANCH_REQUIRED` if none exists. The roundtrip uses that second branch for opening ingredient stock and stock-transfer dispatch/receive evidence.

Historical acceptance audit rows on branch #3 include `B55R-ADJ-MAIN-B2` adjustments and transfer receives from branch #1.

Therefore:
- do not delete/deactivate branch #3 before G0;
- do not remove Beta Admin/test employee access to it before G0;
- treat it as current Acceptance infrastructure;
- after G0/G3, decide whether to replace it with a deliberately named/location-coded Beta fixture branch before Location Code finalization.

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

### Cloud entitlement

Use one root Cloud Feature:
- support.center

Do not model every Support button as a separate Sharawla Cloud Feature.

Recommended commercial behavior:
- feature_class = standard;
- eligible across supported POS Profiles;
- required=false;
- included only through the Business's commercial package / entitlement;
- Sharawla Admin remains the source of entitlement.

A future premium support product may introduce a separate commercial entitlement only when packaging genuinely requires it.

### Operational user actions

Use Permissions V2 for user-level authority:
- support.ticket.create
- support.ticket.view_own
- support.diagnostics.share
- support.history.view
- support.escalation.request

Support diagnostics sharing must be explicit and auditable.

Flow:
Support Chat
-> Ticket
-> Diagnostics
-> Resolution or Human Escalation
-> Support History

Runtime visibility requires signed Snapshot allowance for support.center.
Individual actions still require user Action Permission.

## 12. Sharawla AI Operator

Sharawla AI is separate from Customer Support.

### Cloud entitlement

Use one root Cloud Feature:
- ai.operator

Recommended commercial behavior:
- feature_class = add_on;
- eligible across supported POS Profiles;
- required=false;
- no automatic Business entitlement;
- enabled only by Sharawla Admin commercial entitlement.

Do not create Cloud Feature rows for ai.read / ai.create / ai.modify / ai.approve.
Those are user authorization levels, not commercial product entitlements.

### Operational user actions

Use Permissions V2:
- ai.use
- ai.read
- ai.create
- ai.modify
- ai.approve
- ai.historical_correction

Default:
- ai.operator Cloud entitlement is OFF until granted;
- per-user AI Actions are also denied until granted according to role policy.

Effective AI authority must never exceed the signed-in user's existing domain authority.

Final authorization:
Signed Cloud entitlement for ai.operator
AND User Page Permission
AND User AI Action Permission
AND Underlying domain Action Permission
AND User Location Scope.

Examples:
- a cashier denied Returns cannot ask AI to create a return even with ai.create;
- a manager scoped to one branch cannot ask AI to modify another branch;
- ai.approve does not grant purchasing approval unless food.purchasing.approve is also allowed;
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
13. support.center + Support Action Permissions.
14. ai.operator + AI Action Permissions.
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



## 17. Runtime Snapshot Catalog Expansion Transition Contract

### Confirmed current constraints

- Canonical Feature catalog currently has 107 rows.
- Latest sealed validated readiness baseline has 107 rows.
- Sealed readiness headers are immutable.
- Rows belonging to a sealed readiness baseline are immutable.
- `runtime-access-snapshot-v2` currently rejects any build where `feature_count !== 107`.
- The Cloud snapshot builder already loops over the canonical `features` table and builds one decision per Feature.
- The desktop snapshot consumer does not require a hard-coded 107 decision count; it verifies signature, hash, device/business/environment binding, expiry and anti-rollback state.

Therefore the fixed 107 belongs to the Cloud transition guard, not to the durable client contract.

### Phase A — make the snapshot guard catalog-driven while catalog is still 107

Do this before inserting any new Feature.

Cloud builder preflight must verify, before reserving a snapshot sequence:

1. canonical Feature count is positive;
2. latest sealed validated baseline exists;
3. baseline row count equals canonical Feature count;
4. every canonical Feature has exactly one row in that baseline;
5. decision builder will iterate exactly the canonical Feature set.

The builder should return explicit metadata:
- feature_count
- baseline_row_count
- baseline_version
- optional catalog_digest

The Edge Function must replace the literal `107` check with:

- `feature_count > 0`
- `feature_count === Object.keys(payload_base.decisions).length`
- `feature_count === baseline_row_count`

and fail closed on any mismatch.

Keep:
- snapshot_version = 1 unless a genuinely incompatible payload contract is introduced;
- composition_version = 2;
- Ed25519 signing;
- canonicalization_version = 1;
- monotonic device snapshot sequence.

Additional signed metadata is backward-compatible with the current consumer because the signature canonicalization already includes unknown payload fields.

### Phase A acceptance

While catalog is still 107:

- SH-0007 online snapshot refresh = PASS;
- decision_count = 107;
- baseline_row_count = 107;
- signature verification = PASS;
- cached offline snapshot load = PASS;
- high-water sequence increases only after a valid online snapshot is accepted;
- no Production device is enabled for V2 snapshot routing.

Only after this passes may catalog expansion begin.

### Phase B — atomic catalog + readiness expansion

Never insert a new Feature in a standalone committed transaction while the active sealed baseline still covers only the old catalog.

Use one controlled Cloud transaction for a catalog generation change:

1. create the new Feature row(s);
2. add profile eligibility mappings;
3. add feature dependencies;
4. create a new readiness baseline in `draft`;
5. copy/derive readiness rows for all existing Features;
6. add readiness rows for every new Feature;
7. validate that baseline row count equals the new canonical Feature count;
8. validate no duplicate/missing Feature rows;
9. mark validation_status = passed;
10. seal the new baseline;
11. commit once.

External snapshot requests must see either:
- old catalog + old complete baseline, or
- new catalog + new complete sealed baseline.

They must never observe a committed partial generation.

### New Feature initial state

A newly cataloged capability may be present while still unavailable:

- `implemented=false` and readiness `planned`, or
- `implemented=true` with readiness no stronger than actual evidence supports.

Do not mark a Feature production-ready because its schema row exists.

Profile eligibility is not entitlement.

For optional commercial capabilities:
- profile mapping establishes eligibility;
- Package/Paid Add-on establishes entitlement;
- Business override may further disable;
- Readiness gates environment use;
- Runtime Snapshot V2 is the device authority.

### Kitchen Stations eligibility rule

For `food.kitchen_stations`:
- Restaurant profile: eligible;
- required=false;
- no automatic Business entitlement;
- Sharawla Admin entitlement required;
- current `food.kitchen` behavior remains independent and unchanged when Stations is denied.

### Support and AI eligibility rule

For `support.*` and `ai.*`:
- treat them as cross-profile Sharawla capabilities, not Restaurant-only behavior;
- add profile eligibility deliberately for supported profiles;
- required=false;
- Business cannot self-entitle;
- Runtime UI remains hidden when snapshot decision is denied.

### Phase C — entitlement test after expanded snapshot is healthy

After SH-0007 accepts a signed snapshot for the expanded catalog:

1. test denied state first;
2. grant one isolated Beta entitlement from Sharawla Admin;
3. refresh signed snapshot;
4. verify only the intended Feature changes to allowed;
5. suspend/cancel entitlement;
6. refresh again;
7. verify the Feature returns to denied;
8. verify offline cache honors the last valid signed snapshot until expiry and never invents entitlement.

### Rollback rule

If expanded catalog snapshot validation fails:
- do not weaken signature/count/baseline checks;
- do not re-enable a fixed-count shortcut;
- do not alter Production routing;
- restore the last known complete Cloud catalog generation only through an explicit corrective migration.



## 18. Printer Role Local Persistence Contract

### Decision

Use the desktop Native SQLite `kv` store as the durable local owner for Printer Role -> physical printer bindings.

Do not make browser `localStorage` the final owner for new Kitchen Station printer mappings.

Reason:
- Native `kv` already exists in `topburger-pos.sqlite`;
- it is available through `topBurgerDesktop.db.get/set`;
- it participates in the existing SQLite backup/recovery path;
- it is device-local, which matches physical Windows printer ownership;
- it avoids coupling physical printer names to Cloud or Business database state.

### Legacy compatibility

Current mappings:
- `tb_printer_<branchId>_customer`
- `tb_printer_<branchId>_prep`

remain legacy-compatible during migration.

Migration rule:
1. read Printer Role V1 Native binding first;
2. if absent, read the matching legacy localStorage key;
3. if legacy value exists, import it into Native V1 storage only after canonical Business/Device/Location identity is available;
4. never overwrite an existing Native V1 binding from a legacy value;
5. keep legacy read fallback until runtime acceptance closes migration;
6. Kitchen Station-specific roles have no legacy fallback.

### Native key identity

Recommended logical key:

`printer-role:v1:<business_id>:<device_id>:<location_code>:<role_code>`

Recommended value:

```json
{
  "schema": 1,
  "role_code": "customer_receipt",
  "physical_printer_name": "<windows-printer-name>",
  "physical_printer_display_name": "<display-name>",
  "updated_at": "<iso-time>"
}
```

The exact physical printer name remains local and must not be copied into Sharawla Cloud entitlement data.

### Reserved baseline roles

- customer_receipt
- default_prep
- report

Kitchen Stations creates logical station roles such as:
- kitchen_station:shawarma
- kitchen_station:pizza
- kitchen_station:drinks
- expo

Station codes must be stable identifiers and must not depend on the Arabic display name.

### Business-side logical configuration

The Business operational backend owns logical routing intent, for example:
- location
- station
- output_mode = screen | printer | both
- printer_role_code
- active

The device resolves `printer_role_code` to the local physical Windows printer.

### Fail-visible routing

For Kitchen Station roles:
- an unbound required printer role must not silently fall back to an arbitrary default Windows printer;
- UI must show a visible unbound-role state;
- screen routing may continue if output_mode includes screen;
- printer-only routing with no binding must remain visibly unresolved and retryable.

For legacy customer/default prep printing, compatibility fallback may remain during migration until explicit acceptance closes it.

### Device replacement / rebind rule

Printer bindings are not part of Canonical Fingerprint identity and must not mutate device identity.

A replacement/rebound device starts with no physical Printer Role bindings unless explicitly migrated by an authorized local setup flow.

No automatic cross-device physical printer copy.

### Acceptance

For each logical Printer Role:
- selected physical printer exists in `print:list`;
- silent test print returns success;
- restart preserves the Native binding;
- offline mode preserves the binding;
- pre-update backup/restore preserves the binding;
- switching Business/Device identity cannot accidentally reuse another identity's mapping;
- missing station binding is fail-visible;
- no physical printer name is required in Sharawla Cloud.


## 19. Dual Runtime Authority Migration Contract

### Confirmed current state

On SH-0007, a read-only evaluation of all 107 canonical Cloud Features through
`evaluate_sharawla_feature_access_cloud_v2` currently returns:

- catalog: 107
- allowed: 9
- denied: 98

The allowed set is currently Core-only.
The isolated Beta Business currently has no active commercial package/add-on entitlement from the historical runtime entitlement tests.

At the same time, the POS continues to use the established Runtime Config / `enabled_features` path for existing application capabilities.

Therefore:

**Runtime Snapshot V2 must not replace the existing feature gate globally.**

A global switch would cause valid existing POS behavior to disappear because commercial/readiness entitlement for the historical catalog is not yet populated as a full replacement contract.

### Authority policy

#### Legacy catalog behavior

All existing pre-expansion POS Features keep their current accepted Runtime Config authority until a dedicated migration proves commercial/readiness parity.

Do not change Restaurant/Retail/Pharmacy/etc. visibility merely because Snapshot V2 currently denies a historical Feature.

#### New commercial root features

The following new capabilities are Snapshot-managed from their first implementation:

- food.kitchen_stations
- support.center
- ai.operator

For these Features:

`Runtime Snapshot V2 allowed=true`

is mandatory before their UI or behavior may activate.

No fallback to Runtime Config `enabled_features`.
No local setting may self-enable them.
No Business Feature override alone may self-entitle them.

### Renderer contract

Introduce one explicit helper for Snapshot-managed capability checks, conceptually:

`snapshotFeatureAllowed(featureCode)`

Rules:
1. Desktop must have a valid safe Runtime Snapshot.
2. The requested Feature must exist in snapshot decisions.
3. Decision must be `allowed=true`.
4. Any missing/expired/unverifiable snapshot decision = DENY.
5. UI visibility and backend-sensitive entry actions must both consume the same result.
6. Offline use is allowed only from the already verified, unexpired Last Known Safe snapshot.

The helper must not silently consult Runtime Config as a fallback for Snapshot-managed Features.

### Existing capability helper remains

The existing `SharawlaRuntimeCore.featureEnabled(config, code)` stays unchanged for legacy capabilities during this migration phase.

The code must make authority obvious at call sites:
- legacy feature -> Runtime Config helper
- new commercial root feature -> Snapshot helper

Do not hide the distinction inside an ambiguous fallback chain.

### Future full migration

A future project may move historical Features from Runtime Config authority to signed Snapshot authority only after:

1. commercial package model covers the intended historical baseline;
2. entitlement parity is measured per Profile/Business;
3. readiness statuses are accepted for the migrated set;
4. dependencies are complete;
5. Shadow comparison shows no unintended visibility regression;
6. offline signed snapshot behavior passes;
7. explicit migration version/gate is approved.

That migration is NOT part of Kitchen Stations / Support / AI V1.

### Acceptance

For each new Snapshot-managed Feature:

Denied state:
- Feature absent from navigation/UI;
- direct route is blocked;
- local setting cannot activate it;
- Business override without entitlement cannot activate it.

Entitled state:
- valid signed snapshot contains allowed=true;
- Feature becomes visible only after snapshot refresh/acceptance;
- user Action + Location permissions still apply.

Expired/cancelled state:
- refreshed signed snapshot denies Feature;
- Feature disappears/blocks cleanly;
- offline device may use only a still-valid previously signed snapshot until its signed expiry;
- no locally extended grace is invented.

### Current evidence note

The current SH-0007 snapshot is intentionally not a replacement authority for the historical 107 Feature catalog.
This is a migration fact, not an error to be “fixed” by weakening Commercial or Readiness gates.


## 20. Support Center and AI Execution Security Contract

### A. Sharawla Support Center ownership

Support tickets belong to Sharawla Cloud, not to an individual Business operational database.

Recommended Cloud-owned entities:
- support_tickets
- support_ticket_messages
- support_ticket_events
- support_diagnostic_bundles

Every ticket is bound to:
- business_id derived from the verified device identity;
- device_id when opened from a POS device;
- Support Code as display/reference metadata;
- timestamps/status/priority;
- optional operational employee attribution as metadata.

Do not accept a client-supplied Business ID as the authorization source.
The Cloud must derive Business scope from the verified device identity.

### Support flow

1. POS checks signed Snapshot decision for `support.center`.
2. POS checks `support.ticket.create` for the signed-in user.
3. Device identity is verified by Sharawla Cloud.
4. Cloud creates the ticket under the device's real Business.
5. Messages/events remain append-only/auditable.
6. Human escalation stays in the same ticket timeline.

### Diagnostic sharing

Diagnostics are opt-in and explicit.

Allowed diagnostic bundle should be minimal and structured, for example:
- Support Code;
- app version/channel/architecture;
- runtime environment;
- connection health;
- update health;
- offline queue counts/status, not arbitrary payload contents;
- printer role health, not print document contents;
- selected error codes/stage names;
- snapshot ID/sequence/expiry, not signing secrets.

Never include by default:
- passwords/PINs;
- access/refresh tokens;
- Supabase service role keys;
- license activation secrets;
- Canonical Fingerprint raw value when a derived device ID/support code is sufficient;
- full customer/order database dumps;
- arbitrary local files.

Diagnostic bundles should have explicit retention/expiry and a support audit event.

### B. Sharawla AI execution model

Sharawla AI is a proposal/orchestration layer.
It is NOT a privileged database identity.

Never let AI:
- use service_role to perform Business operations;
- bypass `auth.uid()`;
- dynamically execute arbitrary RPC/function/table names;
- bypass Action Permissions V2;
- bypass Location Scope;
- write through legacy direct-table paths that are not V2-protected.

### AI authority equation

For a write action:

`ai.operator snapshot ALLOW`
AND `ai.use`
AND requested AI level (`ai.create/modify/approve/...`)
AND underlying domain Action Permission
AND target Location Scope
AND normal business invariant/owner guards
= execution allowed.

A missing condition is DENY.

### V1 execution owner

Use a dedicated allowlisted AI action owner, conceptually:

`ai_execute_action_v1(request_id, action_code, location_id, payload, confirmation_token)`

Implementation rules:
- no dynamic SQL based on user-provided function/table names;
- explicit CASE/registry of supported action codes only;
- every supported action maps to a known guarded business owner;
- current user identity comes from `auth.uid()` / `current_employee_id()`;
- both AI permission and underlying domain permission are checked;
- branch/location scope is checked before mutation;
- the business mutation and AI audit record occur in the same database transaction;
- idempotency/request identity is mandatory.

Unsupported action code = fail closed.

### Preview / confirmation

Write actions use two stages:

1. Preview
   - normalize intent;
   - resolve target entities/location;
   - calculate expected effects;
   - return an immutable request summary/hash;
   - no durable business mutation.

2. Execute
   - explicit user confirmation for write/high-risk actions;
   - verify the confirmed request identity/hash still matches;
   - re-check all permissions/location/business invariants at execution time;
   - execute once idempotently;
   - write immutable AI audit evidence.

Never rely on permissions captured only at Preview time.

### Risk classes

Read:
- may run without confirmation if permitted;
- still location-filtered.

Create / Modify:
- show concise preview;
- explicit confirmation when business state changes.

Approve / financial / stock / refund / settlement:
- explicit confirmation mandatory;
- show amount/stock/status impact.

Historical correction:
- separate high-risk permission;
- impact analysis mandatory;
- immutable audit;
- no silent destructive rewrite;
- normal domain correction rules remain authoritative.

### AI audit evidence

Do not use the current best-effort renderer `audit()` helper as the authoritative AI audit.

The current renderer helper can silently fail under RLS.
AI audit must be written by the guarded backend owner in the same transaction as the mutation.

Recommended AI audit fields:
- request_id
- employee_id
- branch/location
- ai_action_code
- underlying_domain_action
- entity_type / entity_id
- before/after summary or effect summary
- confirmation state
- client_tx_id
- created_at

Do not store secrets or unnecessary full prompts in operational audit rows.

### Curated V1 actions

AI V1 should start with a small allowlist only after the underlying Permissions V2 owner is closed.

Examples suitable after owner hardening:
- create customer;
- create expense;
- create purchase order;
- approve purchase order;
- receive purchase;
- create stock transfer;
- receive transfer;
- create stock count;
- controlled order lookup/reporting.

Do not expose a legacy direct REST table mutation to AI just because the human UI can currently perform it.

### AI read path

AI reads must also respect the signed-in user's scope.

Preferred:
- curated read RPCs/views that apply employee/location filters;
- return only fields required for the answer/task.

Avoid sending an unrestricted Business database export to an AI service.

### Cross-backend responsibility

Sharawla Cloud owns:
- `ai.operator` commercial entitlement;
- AI service availability;
- service metering/plan controls;
- model/service orchestration where required.

Business operational backend owns:
- employee authentication;
- Page/Action/Location authorization;
- business data;
- mutations;
- domain audit evidence.

The POS is the trusted orchestration boundary between those two authorities for V1.

## 21. Current status

Design discovery: CLOSED for this checkpoint.
Runtime implementation: NOT STARTED.
DB deployment: NONE.
Production changes: NONE.
Version change: NONE.

Next implementation gate remains SH-0007 10.5.4-beta.58.26 Full Acceptance.
