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


## Build evidence

Build workflow:
- run: `37802366041`
- result: **SUCCESS**
- artifact: `sharawla-pos-10.5.15-mt1-candidate-x64`
- installer: `Sharawla-POS-Setup-10.5.15-MT1-CANDIDATE-x64.exe`
- installer bytes: `75162243`
- installer SHA256: `a214cf0eea76cfde5a2c510222f1b5b8128454eda515f6eafbe5c17cc4645472`
- source SHA embedded in artifact: `a5a2adee9aca9bcad43373afc609af1109dfcfe1`
- GitHub artifact ZIP digest: `7c135be0f09b897a4ad83dd6ca2d7bb728122af78d9afe03b1c3e6ce06eaad9a`

The executable SHA256 recomputed from the downloaded artifact matches the SHA256 evidence file inside the artifact.

## Top Chicken canonical identity readiness

Read-only Sharawla Cloud lookup was performed after the candidate build.

Result:
- no existing Sharawla Cloud business record currently matched `Top Chicken`, `توب تشيكن`, or a Chicken-name search.
- no Top Chicken UUID has been invented, generated, or embedded.
- no Sharawla Cloud write was performed.

Therefore the candidate is ready for an isolated Multi-Tenant client smoke, but a real Top Chicken smoke is **BLOCKED only on obtaining a canonical Sharawla Cloud-issued business UUID under separate authorization**.

No Top Burger Production deployment or branch mutation was performed by this compatibility work.
