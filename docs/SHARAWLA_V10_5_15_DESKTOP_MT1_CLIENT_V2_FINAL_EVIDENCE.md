# Sharawla POS v10.5.15 Desktop — Multi-Tenant Client Compatibility V2 Final Evidence

Status: **SOURCE / CI / BETA BACKEND COMPATIBILITY = PASS**
Build / install / release: **NOT STARTED**
Top Chicken cutover: **NOT STARTED**

Date: 2026-10-08

## Baseline

- Production lineage: `release/v10.5.15-production-prep`
- Baseline SHA: `d2d581c345acf3d3ce14ba0fc7293517ff762e07`
- Candidate branch: `compat/v10.5.15-desktop-multitenant-client-prep-v2`
- Package/version remain exactly `10.5.15`

The first desktop compatibility branch had been created two commits before the final v10.5.15 production-prep head.
V2 was therefore recreated from the latest release head instead of force-moving or reusing a stale branch.

The two release commits missing from the first candidate changed only:
- the Windows release workflow
- the production rollback checkpoint

They did not modify `app.js`, so the narrow Multi-Tenant client patch was ported exactly onto the latest release lineage.

## Candidate delta

Compared with `release/v10.5.15-production-prep`, the compatibility candidate changes only:

1. `app.js`
   - canonical Cloud business/device headers
   - tenant-local settings reads
   - Website Settings RPC save
   - tenant-prefixed product-image path
   - tenant-prefixed business-branding path

2. `scripts/check-v10-5-15-mt1-client.js`
   - protects v10.5.15 version identity
   - rejects current Beta/Test/Top Chicken hard-coded identities
   - asserts canonical tenant headers and tenant-local settings/storage behavior

3. dedicated CI workflow

4. compatibility documentation/evidence

No Production DB SQL, build payload, installer, release artifact, or device update is part of this candidate.

## CI

Workflow run:
- Run ID: `37802108886`

Result:
- checkout = PASS
- Node 16 setup = PASS
- v10.5.15 package/version preservation = PASS
- existing `npm run check` = PASS
- Multi-Tenant client compatibility checker = PASS

Result: **CI PASS**

## Canonical tenant identity

The v10.5.15 client preserves the existing Sharawla Cloud identity chain:

`License State -> Business Connection -> Runtime Config -> Beta Data Plane`

It does not embed a tenant UUID.

Centralized REST/RPC requests carry:
- `X-Sharawla-Business`
- `X-Sharawla-Device`

The canonical values are read from the already trusted Business Connection cache, which is checked against the licensed Cloud business identity.

## Beta backend smoke with candidate headers

Target used:
- Beta only: `xihcxydjnzemflhedzor`

Read-only smoke simulated the exact headers the v10.5.15 candidate will send for the current Beta business/device.

Observed:
- `current_business_id = 91826502-590e-4afa-8826-2c0f4b99c490`
- `mt1_assert_device_business(...) = true`
- visible `business_settings = 1`
- visible `branches = 2`
- visible `products = 9`
- visible `employees = 3`

Result: **PASS**

The physical SH-0007 device was not touched.

## Website Settings compatibility

Before the test, current Beta had:
- `website_settings = 0` rows

The candidate client no longer performs the legacy `id=1` direct upsert.
It calls:

`update_website_settings_v1`

Rollback-only authenticated proof with canonical business/device context established:

1. first save inserted exactly one Website Settings row for the current business;
2. second save updated that same tenant-local row rather than creating a duplicate;
3. row count remained exactly 1;
4. returned theme reflected the update.

Proof result:
`MT1_WEBSITE_SETTINGS_PASS insert=1 update_same_tenant=1 rows=1`

The transaction was intentionally rolled back.

Post-proof residue:
- `website_settings = 0`

Result: **PASS / NO TEST RESIDUE**

## Storage compatibility

The candidate client uses tenant-prefixed object paths:

- product images:
  `<business_id>/products/...`

- business branding:
  `<business_id>/branding/...`

The Beta backend storage hardening is already tenant-aware and validates the first object-path segment against server-owned business membership.

No current Beta tenant UUID or future Top Chicken UUID is embedded in the v10.5.15 candidate.

## Safety

Confirmed:
- no Top Burger Production DB change
- no SH-0005 / SH-0006 touch
- no SH-0007 installation/reset/re-license
- no Top Chicken tenant creation
- no Top Chicken UUID/name embedded
- no installer build
- no release/deploy
- no test residue from Website Settings proof

## Final conclusion

**Sharawla POS v10.5.15 Desktop Multi-Tenant client compatibility V2 = PASS at source / CI / Beta-backend smoke level.**

The client is now based on the latest certified v10.5.15 production-prep lineage and is no longer blocked by:
- global settings row `id=1`
- missing tenant REST/RPC headers
- missing device selector
- shared product/logo storage paths

## Exact next step

STOP before build/install.

Next separate authorization should permit:
1. build a Windows v10.5.15 Multi-Tenant candidate from this V2 branch;
2. do not publish/release it;
3. test it in an isolated environment against Beta;
4. do not install on SH-0005 / SH-0006 / SH-0007;
5. only after candidate PASS, use a canonical Sharawla Cloud-issued Top Chicken business UUID for a dedicated Beta tenant smoke.

Top Burger Production remains out of scope.
