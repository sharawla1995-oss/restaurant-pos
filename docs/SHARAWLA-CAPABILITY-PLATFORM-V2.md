# Sharawla Capability Platform V2

## Purpose

Sharawla POS keeps one canonical Feature Catalog. A capability is defined once, then assigned where needed without copying code or moving the capability out of another activity.

Current catalog baseline: 65 active capabilities.

## Resolution hierarchy

Runtime entitlement is resolved in this order:

1. **Core** — platform capability, locked ON when implemented/active.
2. **POS Profile Default** — baseline for Restaurant / Retail / Pharmacy / Logistics / Membership / Warehouse / Service.
3. **Activity Category Override** — specialization such as Supermarket, Mobiles, Cafe, Beauty Salon, etc. No row means inherit the Profile.
4. **Business Override / Add-on** — one Business may add or remove an optional implemented capability without changing its Profile or Category.
5. **POS Operational Settings** — daily operation belongs inside the Business POS, not Sharawla Admin. Example: Extras ON/OFF after `food.modifiers` entitlement exists.

Business has highest priority for optional capabilities. Core, Profile-required, and Category-required capabilities cannot be disabled downstream.

## Feature classes

Every catalog feature has one class:

- `core` — platform foundation; not sold or removed as a Business add-on.
- `standard` — implemented capability used as a required baseline in at least one Profile.
- `add_on` — implemented optional capability that can be assigned to Profiles/Categories/Businesses where dependencies permit.
- `planned` — catalog reservation only. It cannot be activated until `implemented=true`.

The classification is metadata about lifecycle/entitlement. It does not duplicate feature code.

## Tables

### `features`
Canonical catalog. V2 adds `feature_class`.

### `feature_dependencies`
Dependency graph. An enabled capability must include all required dependencies.

### `profile_features`
Default capability set for each POS Profile.

### `activity_profile_defaults`
Maps an Activity Category to its default POS Profile.

### `activity_category_features`
V2 specialization layer.

- No row: inherit Profile.
- `enabled=true`: Category adds/enables the capability.
- `enabled=false`: Category disables an optional Profile capability.
- `required=true`: Category locks it ON for downstream Businesses.

### `business_features`
Final optional Business-level delta. No row means inherit Category/Profile baseline.

## Runtime

`get_sharawla_business_runtime_config_v2(device_id, device_fingerprint)` keeps the same return contract and now reports `capability_version=2`.

Effective capability logic:

`Core lock -> Profile -> Activity Category -> Business`

Only active + implemented + non-planned capabilities are returned in `enabled_features`.

The legacy modules bridge remains untouched for older POS builds.

## Admin RPCs

Business compatibility RPCs remain available with their original signatures:

- `admin_get_business_feature_matrix`
- `admin_set_business_features`
- `admin_reset_business_features`

V2 adds:

- `admin_get_business_feature_matrix_v2`
- `admin_get_activity_category_feature_matrix`
- `admin_set_activity_category_features`
- `admin_reset_activity_category_features`

Admin write RPCs remain `SECURITY DEFINER`, require `is_sharawla_admin()`, and are not executable by `PUBLIC` or `anon`.

## Safety / inheritance policy

- No V2 migration seeds Activity Category overrides automatically.
- Existing Businesses therefore keep their Profile/Business result until an Admin explicitly adds a Category override.
- Production Businesses must not be used as experiment targets.
- Sharawla Admin V3.7 protects a Category containing Top Burger from Category edits so a category-level change cannot indirectly modify Production.
- Experimental feature tests remain isolated to SH-0007 / Business `تجريبي`.

## Important Food Service semantic note

In Beta35, `food.tables` gates the existing **Dine-in / صالة** order-type behavior only. It is **not** a full table-management system. True tables (table map, sessions, transfer/merge, split bill, reservations, guest count) remain future work and must not be claimed as implemented by the current capability.

A later catalog cleanup should separate Dine-in entitlement from the true Tables capability without breaking existing Beta35 behavior.
