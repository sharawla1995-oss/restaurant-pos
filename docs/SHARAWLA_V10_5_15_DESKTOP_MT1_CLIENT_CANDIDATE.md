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
