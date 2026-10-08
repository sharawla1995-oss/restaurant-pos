# Sharawla POS v10.5.15 Desktop — Multi-Tenant Client Compatibility Candidate

Status: V2 SOURCE / CI PREPARATION ONLY

Baseline:
- release baseline: `release/v10.5.15-production-prep`
- baseline SHA: `d2d581c345acf3d3ce14ba0fc7293517ff762e07`
- package/version remain exactly `10.5.15`

Compatibility rules:
- existing Sharawla Cloud License + Business Connection mismatch guard is preserved
- cached Business Connection now also retains canonical Cloud device_id
- every centralized REST/RPC request carries canonical `X-Sharawla-Business`
- desktop requests also carry `X-Sharawla-Device`
- business/website settings reads are tenant-selected by RLS, not global `id=1`
- Website Settings writes through `update_website_settings_v1`
- product images use `<business_id>/products/...`
- business logo uses `<business_id>/branding/...`
- no Top Chicken UUID or test tenant UUID is embedded

Safety:
- based on latest release/v10.5.15-production-prep HEAD
- no build/release/deploy from this candidate
- no SH-0007 installation
- no Production changes
- no Top Chicken cutover


## Live Beta smoke

Target:
- Beta only: `xihcxydjnzemflhedzor`
- Current canonical business: `91826502-590e-4afa-8826-2c0f4b99c490`
- Current Beta device binding tested with SH-0007 canonical device ID

Rollback-only authenticated smoke result:
- canonical business header resolved to current tenant = PASS
- `mt1_assert_device_business` = PASS
- `update_website_settings_v1` returned the same tenant business_id = PASS
- transaction intentionally raised `V10_5_15_MT1_SMOKE_PASS` to force rollback
- no persistent settings/test data change

## Candidate lineage

- release baseline SHA: `d2d581c345acf3d3ce14ba0fc7293517ff762e07`
- candidate is exactly one commit ahead of the release baseline
- candidate is zero commits behind the release baseline
- application diff is limited to the Multi-Tenant compatibility patch; checker/workflow/evidence are additional files
