# Sharawla POS v10.5.15 Desktop — Multi-Tenant Client Compatibility Candidate V2

Status: SOURCE / CI PREPARATION ONLY

Baseline:
- production lineage: `release/v10.5.15-production-prep`
- latest certified release SHA at branch creation: `d2d581c345acf3d3ce14ba0fc7293517ff762e07`
- includes the production rollback checkpoint/workflow updates that landed after the first compat candidate
- package/version remain exactly `10.5.15`

Compatibility rules:
- existing Sharawla Cloud License + Business Connection mismatch guard is preserved
- cached Business Connection retains canonical Cloud `device_id`
- every centralized REST/RPC request carries canonical `X-Sharawla-Business`
- desktop requests also carry `X-Sharawla-Device`
- business/website settings reads are tenant-selected by RLS, not global `id=1`
- Website Settings writes through `update_website_settings_v1`
- product images use `<business_id>/products/...`
- business logo uses `<business_id>/branding/...`
- no current Beta tenant UUID, test tenant UUID, or Top Chicken identity is embedded

Backend dependency:
- Beta Multi-Tenant V1 Phase B core cutover is already PASS on `xihcxydjnzemflhedzor`
- this branch does not create or cut over any new tenant
- Top Chicken must later use a canonical Sharawla Cloud-issued business UUID

Safety:
- no build/release/deploy from this candidate unless separately authorized
- no SH-0007 installation
- no Production DB changes
- no Top Chicken cutover
