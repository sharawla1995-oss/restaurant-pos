Top Burger POS V10.4.6 — Final reviewed merge

This build was produced by comparing the V10.4.6 stability build with the user-provided audited-fix build, then merging only verified changes.

Critical fixes included:
- Restored receiptIdentityHTML/branchById so customer receipt generation cannot fail on a missing function.
- Kept one openOrderDetails and one openReturnForOrder implementation; duplicate declarations removed/avoided.
- Hardened Electron silent HTML printing and printer-name resolution.
- Customer/prep printer and Auto Print toggles are device-local on Windows; shared receipt layout remains branch/Supabase based.
- Kept copy marking for reprints.
- Added POS branch_products price_override and branch availability handling to match the website branch pricing model.
- Respected branch discount_mode (amount / percent / both).
- Delivery-zone fee is editable and flows into POS delivery total.
- Corrected tax-inclusive return total logic.
- Added optional previous-shift return policy; return is posted to the current open shift.
- Fixed create_pos_order_atomic client_tx_id persistence for duplicate prevention.
- Fixed local-first validation failure so a rejected online sale is removed from the pending sync queue instead of being retried later.
- GitHub Actions uses --publish never so electron-builder does not require GH_TOKEN during the build step.
- Version is consistent at 10.4.6 in package.json, version.json and index.html.

IMPORTANT DATABASE STEP:
Run supabase-v10-4-6-final-stability.sql ONCE in Supabase SQL Editor before relying on the new return/offline fixes. It is a targeted patch and intentionally does NOT overwrite the newer promo-aware website ordering RPC.

Static checks completed:
- node --check app.js
- node --check main.js
- node --check preload.js
- scripts/check-version.js
- duplicate top-level function declaration scan
- GitHub workflow command check
- website/POS branch_products pricing linkage review

Hardware/network behavior still requires a real branch smoke test (XP-80C, Windows 7, live Supabase and actual update flow). No source-only review can truthfully guarantee hardware behavior without that test.
