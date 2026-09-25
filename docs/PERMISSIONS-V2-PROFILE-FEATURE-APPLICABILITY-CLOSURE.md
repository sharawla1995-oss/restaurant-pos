# Sharawla Permissions V2 — Profile / Feature Applicability Closure Contract

Status: OFFICIAL DESIGN / PRE-IMPLEMENTATION
Date: 2026-09-25
Runtime baseline: 10.5.4-beta.58.29
Production impact: NONE
DB write: NONE
Cloud mutation: NONE

## 1. Problem discovered in runtime

The Advanced Permissions UI currently reads every active row from:

- public.permission_actions_v2

without filtering by the current POS Profile or enabled Features.

Observed on Restaurant SH-0007:
- Restaurant user `mo` can see Restaurant/Food actions;
- but also Logistics, Membership, Service and other unrelated-domain actions.

This is not acceptable final UX.

## 2. Current Action V2 behavior

Current UI states:
- inherit
- allow
- deny

Current backend helper:
- admin => allow
- explicit employee_action_permissions_v2 override => use override
- otherwise resolve legacy_permission
- if legacy_permission is NULL => deny
- otherwise use legacy page permission

Therefore current "inherit" means:
legacy POS permission inheritance.

It does NOT mean inheritance from Sharawla Admin.

## 3. Runtime evidence already confirmed

A runtime negative test was performed using employee `mo`:

- action: delivery.mark_delivered
- explicit override: deny
- backend operation was denied

This proves that Action V2 can enforce explicit employee overrides on guarded backend owners.

However, action catalog visibility and action applicability are not yet Profile-aware.

## 4. Trusted Profile source

Sharawla Cloud is authoritative for business POS Profile.

For SH-0007 Beta Business:
- business id: 91826502-590e-4afa-8826-2c0f4b99c490
- Cloud pos_profile_id resolves to code: restaurant
- profile is active and implemented

Do NOT use legacy `business_type` as authorization authority.

## 5. Required final authority chain

The final effective authorization chain is:

Cloud entitlement
-> Trusted POS Profile
-> Feature applicability
-> Role default
-> User Action override
-> Location scope
-> Business invariant
-> mutation

Every layer is restrictive.

A lower layer cannot enable something the upper layer does not entitle.

## 6. Cloud entitlement

Sharawla Cloud decides whether a commercial/business capability exists for the Business.

Examples:
- Kitchen Stations
- AI Operator
- Advanced Purchasing
- optional future Add-ons

If Cloud entitlement is OFF:
- Business Admin cannot self-enable it;
- action is not shown as configurable;
- backend mutation path must fail closed.

## 7. Trusted POS Profile

Operational backend must have a trusted, server-owned binding for the connected Business/Profile.

Required properties:
- business identity
- pos_profile_code
- source = Sharawla Cloud / provisioning
- not client-writable
- not derived from localStorage
- not supplied as a mutation RPC parameter

Examples:
- restaurant
- retail
- pharmacy
- logistics
- membership
- warehouse
- service

## 8. Action applicability

Each Action must declare where it applies.

Required logical metadata:
- action_code
- profile applicability
- optional required_feature_code
- active

Recommended model:

permission_action_profiles_v2
- action_code
- profile_code
- required_feature_code nullable
- active

Do not add profile columns directly to employee overrides.

Employee override is about:
employee x action

Applicability is about:
action x profile/feature

## 9. UI filtering

Advanced Permissions UI must show only:

Actions
WHERE:
- Action active
- applicable to trusted current Profile
- required Feature is enabled/entitled when applicable

Examples:

Restaurant:
- core/shared
- food
- restaurant
- relevant inventory/purchasing/delivery
- NOT logistics-only
- NOT membership-only
- NOT service-only
- NOT pharmacy-only

Logistics:
- core/shared
- logistics
- relevant finance/reporting
- NOT food/restaurant-only

Pharmacy:
- core/shared
- pharmacy
- inventory/purchasing
- relevant delivery/finance
- NOT restaurant-only
- NOT logistics-only

## 10. Backend filtering

UI hiding is not authorization.

Backend must reject an Action before mutation if:
- action is unknown;
- action inactive;
- action not applicable to trusted current Profile;
- required Feature is unavailable;
- employee effective permission is deny;
- Location scope fails.

This is Fail-Closed.

## 11. Role inheritance

Final meaning of "inherit" should become:

Use the default permission for this employee's Role.

Recommended logical precedence:

1. action not applicable => DENY
2. Cloud/Feature unavailable => DENY
3. explicit user deny => DENY
4. explicit user allow => ALLOW only if upper gates pass
5. no user override => Role default
6. no Role default => DENY

Legacy permission inheritance is transitional compatibility only.

It should not remain the final Permissions V2 authority.

## 12. Role default model

Recommended:

permission_role_action_defaults_v2
- profile_code
- role_code
- action_code
- allowed
- active

Examples by Profile:

Restaurant:
- admin
- cashier
- callcenter
- delivery
- manager / stock roles as product scope expands

Retail:
- admin
- cashier
- stock clerk
- purchasing
- callcenter
- delivery

Pharmacy:
- admin
- pharmacist
- cashier
- stock clerk
- claims
- callcenter
- delivery

Role defaults must be editable through Sharawla product policy only where intended.

## 13. Location scope

Effective authority is not complete without Location.

Examples:
- CURRENT_LOCATION
- ALLOWED_LOCATIONS
- SOURCE_DESTINATION_LOCATION
- BUSINESS_WIDE where explicitly allowed

An Action ALLOW does not override Location denial.

## 14. Existing gap: catalog action != guarded owner

An Action existing in `permission_actions_v2` does not prove every related UI write is protected.

Example observed:
- customers.create exists in the Action catalog
- current Customers UI still uses direct table POST for create

Therefore Permissions V2 closure requires an owner-by-owner matrix:

Action
-> UI entry
-> backend owner/RPC/RLS owner
-> Profile guard
-> Action guard
-> Location guard
-> negative direct-call acceptance

Do not claim an Action is enforced until that chain passes.

## 15. Existing guarded examples

Verified guarded owners include Delivery V2 examples such as:
- delivery.mark_delivered
- delivery.payment.change_at_delivery
- delivery.settlement.view
- delivery.settlement.create

Runtime deny evidence on `mo` confirmed the explicit Action override path works.

## 16. Implementation batches

### PV2-A — Applicability schema/source contract
- add Action x Profile mapping contract
- optional required Feature
- seed mappings
- no employee behavior change yet

### PV2-B — Trusted operational Profile
- bind Business/Profile server-side
- private helper returns trusted Profile
- no client authority

### PV2-C — Effective permission evaluator
- applicability first
- feature gate
- user override
- Role default
- legacy fallback only during transition
- Location separate but mandatory at mutation owner

### PV2-D — UI filtering
- Advanced Permissions shows relevant Actions only
- grouped by domain
- no unrelated Profile leakage
- explain inherited role default

### PV2-E — Role defaults
- seed per Profile
- migrate legacy intent carefully
- explicit fail-closed for missing defaults

### PV2-F — Owner coverage
- close direct table mutation gaps
- customers
- shifts
- expenses
- settings
- website reviews
- delivery settings CRUD
- other Core owners

### PV2-G — Runtime acceptance
For a non-admin fixture:
- inherited allow
- inherited deny
- explicit allow
- explicit deny
- wrong Profile
- wrong Location
- direct RPC bypass
- direct REST bypass
- admin behavior
- cleanup/rollback

## 17. Current official state

UI:
PRESENT / RUNTIME CONFIRMED

Explicit Action override:
RUNTIME CONFIRMED

Profile-aware UI filtering:
OPEN

Trusted operational Profile:
OPEN

Feature-aware applicability:
OPEN

Role-default inheritance:
OPEN

Core owner coverage:
PARTIAL

Location-aware final closure:
OPEN

Permissions V2:
IN PROGRESS / NOT CLOSED

## 18. Safety

No Production change is authorized by this contract.

SH-0005 / SH-0006 remain immutable on 10.5.3 CLEAN.

Implementation and acceptance remain isolated to Beta environments until final promotion gates pass.
