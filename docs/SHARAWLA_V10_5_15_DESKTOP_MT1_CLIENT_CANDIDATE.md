# Sharawla POS v10.5.15 Desktop — Multi-Tenant Client Compatibility Candidate

Status: SOURCE / CI PREPARATION ONLY

Baseline:
- immutable Git tag: `v10.5.15`
- baseline SHA: `dffc9765b02dc6a6eea0ccefd12166cbc8c4fc69`
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
- no build/release/deploy from this candidate
- no SH-0007 installation
- no Production changes
- no Top Chicken cutover
