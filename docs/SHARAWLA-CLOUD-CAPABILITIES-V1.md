# Sharawla Cloud Capability Platform V1

Status: APPLIED to Sharawla Cloud project `ikppryeavoabnugcijeq` on 2026-09-11.

## Safety scope
- Additive Cloud foundation only.
- Existing `get_sharawla_business_runtime_config(uuid,text)` remains unchanged for legacy/Beta32 clients.
- New clients can use `get_sharawla_business_runtime_config_v2(uuid,text)`.
- No `business_features` overrides were written for any existing business.
- Production Top Burger remains `restaurant` on the legacy runtime contract.
- Beta business `تجريبي` remains `pharmacy`.

## Cloud tables
- `features`
- `feature_dependencies`
- `profile_features`
- `business_features`
- `activity_profile_defaults`

All capability tables have RLS enabled. Direct `anon` / `authenticated` table privileges are revoked; access is through SECURITY DEFINER RPCs.

## Runtime and Admin RPCs
- `get_sharawla_business_runtime_config_v2(uuid,text)`
- `admin_get_business_feature_matrix(uuid)`
- `admin_set_business_features(uuid,text[])`
- `admin_reset_business_features(uuid)`

The admin setter validates active/implemented features, required profile features, and dependency closure before writing overrides.

## Capability counts at apply time
- Features: 65
- Dependencies: 75
- Profile-feature rows: 185
- Business overrides: 0
- Activity-to-profile defaults: 24

## Profiles
Implemented now:
- `restaurant`
- `retail`
- `pharmacy`

Registered but not implemented yet:
- `logistics`
- `membership`
- `warehouse`
- `service`

## Activity defaults
Current activity categories are mapped to a default POS profile without automatically changing existing businesses. A new activity category `shipping_logistics` was added and mapped to `logistics`.

Examples:
- restaurants/cafes/bakery -> restaurant
- pharmacies -> pharmacy
- supermarkets/retail/clothes/electronics/wholesale -> retail
- warehouses -> warehouse
- gyms_clubs -> membership
- shipping_logistics -> logistics
- beauty_salons/maintenance_services/medical_centers -> service

## Runtime compatibility
`get_sharawla_business_runtime_config_v2` returns the legacy module contract plus:
- `features_configured`
- `enabled_features`
- `capability_version = 1`

The effective feature set is computed from profile defaults plus per-business overrides. A disabled business override removes a profile default; an enabled override can add a compatible feature from another domain.

## Applied migrations
- `20260911212313 capability_platform_cloud_foundation_v1`
- `capability_platform_cloud_hardening_v1`

## Next step
Build the next POS beta so it asks Cloud for Runtime Config V2 with safe fallback to the legacy RPC, then validate feature-driven composition on SH-0007 before any Admin V2 feature editor is exposed.
