# Sharawla POS v10.5.15 Desktop — Multi-Tenant Client Compatibility Evidence

Status: **SOURCE + CI + BETA SMOKE PASS / NOT DEPLOYED**

## Scope

- Repository: `sharawla1995-oss/restaurant-pos`
- Branch: `compat/v10.5.15-desktop-multitenant-client-prep`
- Immutable v10.5.15 baseline: `dffc9765b02dc6a6eea0ccefd12166cbc8c4fc69`
- Beta Backend only: `xihcxydjnzemflhedzor`
- Production: not touched
- SH-0005 / SH-0006: not touched
- SH-0007 physical device: not installed / reset / re-licensed
- Top Chicken tenant/cutover: not created

## Client compatibility implemented

The v10.5.15 Desktop client now:

- preserves the existing Sharawla Cloud Business Connection mismatch guard;
- stores canonical `business_id` and canonical `device_id` together in the Business Connection cache;
- sends `X-Sharawla-Business` and `X-Sharawla-Device` through the centralized REST/RPC headers;
- rejects a missing or malformed canonical business id before tenant-owned storage paths are built;
- runs `mt1_assert_device_business` after online sign-in and before data bootstrap;
- rejects License State ↔ Business Connection cache identity mismatch before bootstrap;
- reads `business_settings` and `website_settings` through tenant RLS rather than hard-coded `id=1`;
- writes Website Settings through `update_website_settings_v1`;
- stores product images under `<business_id>/products/...`;
- stores business branding under `<business_id>/branding/...`;
- carries tenant identity on product/business storage uploads;
- preserves v10.5.15 package/version identity exactly.

No current Beta business UUID, Top Chicken UUID, test tenant UUID, or Top Burger Production project id is embedded into the v10.5.15 client.

## CI

Workflow:
`.github/workflows/v10-5-15-desktop-mt1-client.yml`

The compatibility workflow runs:

1. immutable v10.5.15 version proof;
2. the existing v10.5.15 regression checks;
3. `scripts/check-v10-5-15-mt1-client.js`.

Latest executed compatibility run before this evidence commit:
- Run #4
- Run id: `37802184789`
- Result: **SUCCESS**

## Beta positive device/business smoke

Authenticated Beta context used the existing current Beta business and device.

Observed:
- `current_business_id()` resolved to the current canonical Cloud business;
- `mt1_assert_device_business(existing_device_id)` returned **true**;
- the tenant-visible employee/branch counts matched the current Beta context.

Result: **PASS**

## Beta negative device smoke

The same authenticated business context was tested with a non-bound synthetic device UUID.

Observed:
- `mt1_assert_device_business(wrong_device_id)` rejected with:
  `MULTITENANT_CONTEXT_DENIED`

Result: **PASS / fail closed**

No device row was created or modified.

## Website Settings first-save smoke

The current Beta tenant had no persisted `website_settings` row before the smoke test.

Inside a rollback-only transaction:

- the existing authenticated tenant context called `update_website_settings_v1` with valid default values;
- the RPC created exactly one tenant-owned row;
- the returned `business_id` matched the authenticated tenant;
- the transaction was rolled back.

Post-test verification:
- persisted `website_settings` rows for the current tenant = **0**

Result: **PASS / no residue**

This proves the same first-save path needed by a new clean tenant.

## Storage compatibility

Beta storage hardening is already applied as migration:
`20261008032527 beta_multitenant_v1_storage_hardening`.

The v10.5.15 Desktop client uses tenant-prefixed paths for:

- product images;
- business logo / branding.

The storage policy remains the server-side authority. Client headers are defense-in-depth and selector continuity, not a replacement for membership/device enforcement.

## Safety

This candidate has not been:

- built into a release installer;
- deployed to Production;
- installed on SH-0007;
- used to create Top Chicken;
- used to move Top Burger Production to Multi-Tenant.

## Conclusion

**v10.5.15 Desktop Multi-Tenant client compatibility = PASS for source, CI and current-Beta smoke.**

The remaining dependency before a Top Chicken smoke is external identity/provisioning, not a known client compatibility blocker:

1. obtain the canonical Sharawla Cloud-issued Top Chicken `business_id`;
2. create the Beta tenant using exactly that canonical UUID;
3. bind a test Auth user / employee / device to that tenant;
4. run clean-tenant v10.5.15 smoke;
5. only then request any Top Chicken cutover authorization.

Do not invent a tenant UUID and do not use the current `تجريبي` UUID for Top Chicken.
