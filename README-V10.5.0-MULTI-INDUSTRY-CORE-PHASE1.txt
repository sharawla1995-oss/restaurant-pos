Sharawla POS V10.5.0 — Multi-Industry Core / Restaurant Isolation Phase 1

BASELINE
- Built from the tested V10.4.21 Restaurant baseline.

PHASE 1 SCOPE
1. Read Business POS Profile + Enabled Modules from Sharawla Cloud using a new additive read-only RPC.
2. Restaurant is the only implemented runtime profile in this release.
3. Existing Restaurant behavior is preserved.
4. If a legacy Restaurant Business has zero module mappings, V10.4.21 Restaurant features remain available through a compatibility set until Admin modules are configured.
5. Enabled Modules gate relevant navigation/pages in addition to existing employee permissions and business settings.
6. Top Burger is no longer the application fallback identity. Business branding comes from Business Backend data; generic fallback is Sharawla POS.

INTENTIONALLY RETAINED LEGACY IDENTIFIERS
The following names are NOT business coupling and are intentionally unchanged in Phase 1 to avoid breaking upgrades, local SQLite/offline data, backups, updater identity or installed app continuity:
- Electron appId: com.topburger.pos
- topBurgerDesktop bridge name
- topburger-pos.sqlite / lastgood / backup names
- topburger-pos-offline-v98 IndexedDB name
- legacy backup format marker topburger-pos-backup
- website theme key topburger

DO NOT rename those until a dedicated migration with rollback/recovery has been designed and tested.

NOT CHANGED
- Canonical Fingerprint logic
- Device ID / Activation identity / Automatic Rebind policy
- verify_sharawla_device contract
- activate_sharawla_device contract
- get_sharawla_business_connection contract
- get_sharawla_device_support_code contract
- license_hash verification
- Direct Printing
- Auto Update mechanism
- Offline queue behavior
- 32/64-bit build targets
- Windows 7 compatibility target

DEPLOY ORDER
1. Run SHARAWLA-CLOUD-V10.5.0-RUNTIME-CONFIG-SAFE.sql on Sharawla Cloud.
2. Verify every final boolean is TRUE.
3. Test Runtime Config for Top Burger from the device after launch.
4. Only then deploy the V10.5.0 application files / build.

TOP BURGER EXPECTED CONFIG
Profile: restaurant
Enabled modules (10): customers, delivery, expenses, kitchen, pickup, pos, promocodes, reports, returns, website
Disabled mappings such as inventory/tables may remain in business_modules with enabled=false; that is correct.
