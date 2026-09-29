# SHARAWLA MASTER CHECKPOINT — 2026-09-29 — HANDOFF

## AUTHORITATIVE CURRENT STATE

Repository: sharawla1995-oss/restaurant-pos
Current RC1 branch: rc1-beta58-32-performance-hotfix
Current remote HEAD at handoff: 9df9f29bfa4c19f906c488f63cb8bb332c3a7286
Latest CI: Run #306 = SUCCESS
Mode: SOURCE + CI ONLY. No deployment is authorized.

## HARD SAFETY BOUNDARY

- Production SH-0005 (Dokki) and SH-0006 (El-Eshreen) stay immutable/read-only on 10.5.3 CLEAN.
- SH-0007 is isolated Beta/TEST, but this handoff does NOT authorize deployment, Reset, destructive data operations, or Supabase writes.
- Canonical Stock OFF. Cutover OFF.
- Never Retry/Delete/Reset protected historical Offline sequences 293/304/316.
- Do not modify Activation, Licensing, Business Connection, Canonical Fingerprint/device identity, updater, or printing unless separately authorized.
- Canonical device identity remains local st.device_fingerprint. Never assume device_id === device_fingerprint.
- No force-push.
- Closed evidence must not be reopened unless new contradictory evidence appears.

## CLOSED / PRESERVE AS CLOSED

### Point 4 — Offline / Stock Ownership
- Ownership mapping: 61/61 CLOSED.
- 46/46 pre-cutover guard contracts SOURCE ACCEPTED.
- Historical authoritative owner/provenance work closed.
- Final-definition simulation/freshness evidence previously passed.
- Deployment remains unauthorized; Canonical Stock and Cutover remain OFF.
- Do not reopen Point 4 historical evidence absent contradiction.

### Offline core / practical RC1 foundations
- Local DB = Device Operational Authority.
- Cloud = Global/Central Authority.
- Local-first contract: local durable commit -> immediate local success -> durable Outbox -> idempotent replay -> ACK -> reconciliation/no duplicate.
- Legacy queue is drain-only.
- Promo Offline is fail-closed.
- Returns preserve historical consumption/snapshots and must not recalculate from current recipe.
- Delivery mark-delivered Native Offline is supported; payment-method change after delivered remains Online-only.

### BON source closure
- BON numbering product decisions are fixed:
  - SHIFT: resets per shift.
  - BRANCH: resets daily to 1,2,3... on next business day.
  - Online: server authoritative.
  - Offline official BON requires pre-reserved trusted capacity; otherwise ordinary sale continues as OFF-*.
  - Stable internal identity is independent from human BON/invoice number.
  - Scope switch must fail closed with active shifts/reservations/pending Offline.
- BON source closure commit: 22d707eef8f3dbb6dc9a47686463fb4ed8392520.
- CI #301 on exact closure commit passed. Treat BON as CLOSED unless a real regression appears.

### Trusted Device
- Downstream Trusted Device source work exists, but official Offline BON capacity acquisition/renewal remains BLOCKED by the root-of-trust/possession-proof problem.
- device_id + fingerprint + app version identifies a device but is not by itself possession proof.
- Activation/root-of-trust is protected and was intentionally NOT modified.
- Until explicitly authorized/resolved, ordinary Offline sales continue using OFF-* when official capacity is unavailable.

## RETAIL SUSPEND / RESUME — SOURCE + CI CLOSED

Goal: replace direct Cloud-first hold/resume with durable local-first behavior.

Implementation commit:
- 6f1a0bc1667e64bd153487644bcc61e07069ec56 — feat(retail): make suspend resume local-first

Gate registration:
- 9b0d2220dcc487a55615cfc93589f02a866f1bb0 — test(retail): include suspend resume closure gate

Syntax corrections discovered by CI:
- db6d9512dd5920e0e45ea7c2627ce592d40202ef — remove duplicated async on retailSuspendedSalesReadModel.
- 9df9f29bfa4c19f906c488f63cb8bb332c3a7286 — make renderRetailPOS async because it awaits loadRetailMarketData.

Current result:
- GitHub Actions Run #306 on 9df9f29... = SUCCESS.
- Therefore Retail Suspend/Resume local-first source block is CLOSED at handoff.

Key implementation:
- beta45-offline-v2-transport-runtime.js maps retail_suspend_sale / retail_resume_sale to dedicated Offline V2 RPC ownership.
- dependency from resume to original suspend TX when p_suspend_create_tx is used.
- app.js uses a branch-scoped merged suspended-sales read model and commitRpcLocal for both actions.
- resume restores cart/customer/discount only after local resume commit.
- dedicated source-only SQL artifact: supabase-rc1-retail-suspend-resume-offline-v1-source.sql.
- idempotency uses offline_v2_server_receipts + advisory lock and branch validation.
- no SQL was deployed.

## UNIVERSAL DASHBOARD V1 — READY FOR CURRENT-RC1 SEMANTIC INTEGRATION, NOT YET MERGED

Work implementation:
- original isolated branch: feature/universal-dashboard-v1
- original dashboard commit: de203e0d7531475341653be18fb9fd91d0642695
- current-RC1 Work integration branch: feature/universal-dashboard-v1-current-rc1
- Work RC1 base: 22d707eef8f3dbb6dc9a47686463fb4ed8392520
- final Work commit: 7cc5584a8adad02fe206bdc7c9014acb00ae85b8
- commit message: feat(dashboard): port universal dashboard to current RC1
- Work tree was clean; no push/merge/deploy.

Dashboard ZIP received in the main chat:
- Sharawla-Universal-Dashboard-V1-current-RC1-7cc5584.zip
- includes Dashboard-only new/modified files plus DASHBOARD-INTEGRATION-MANIFEST.txt.
- It must NOT be copied blindly over current RC1 because current RC1 advanced after Work's base with Retail Suspend/Resume.

Dashboard new files include:
- universal-dashboard-engine-v1.js
- universal-dashboard-v1.js
- scripts/check-universal-dashboard-v1.js
- docs/UNIVERSAL-DASHBOARD-V1-ACCEPTANCE.md
- docs/UNIVERSAL-DASHBOARD-V1-ARCHITECTURE.md
- docs/UNIVERSAL-DASHBOARD-V1-CURRENT-RC1-PORT.md
- docs/UNIVERSAL-DASHBOARD-V1-DATA-MAP.md
- docs/UNIVERSAL-DASHBOARD-V1-OFFLINE-BEHAVIOR.md
- docs/UNIVERSAL-DASHBOARD-V1-PERMISSIONS.md
- docs/UNIVERSAL-DASHBOARD-V1-WIDGET-REGISTRY.md

Shared files requiring SEMANTIC MERGE, not replacement:
- app.js
- index.html
- package.json
- scripts/check-runtime-syntax.js
- scripts/check-version.js
- scripts/sync-version.js
- styles.css
- sw.js

Dashboard behavior:
- capability/profile/permission/action-permission/branch/online-state driven.
- seven profiles covered: Restaurant, Retail, Pharmacy, Service, Warehouse, Membership, Logistics.
- unauthorized financial datasets excluded before requests.
- Central Warehouse gated by inventory.supply.view.
- Dashboard is read-only; Offline behavior uses available trusted/local data and does not invent unsupported metrics.
- intentionally unsupported because no trustworthy source contract: Profit/COGS, inventory valuation, lowest sellers, previous-period comparison, Kitchen SLA, Delivery SLA.

Work-reported tests:
- npm run check:universal-dashboard PASS: 25 test groups / 19 widgets.
- focused runtime syntax/version/cache/permissions/navigation/offline RAW/performance/Bon closure checks passed.
- inherited full-check Bon failures seen in Work's old isolated baseline were reproduced on its clean old RC1 base and were not caused by Dashboard. Current main RC1 later closed Bon and currently has CI #306 green.

## RESET V7 — SEPARATE OPEN/FUTURE TRACK

Historical issue: after Reset on SH-0007, old OFF-* delivery orders could reappear.
Safe design/source track must remain non-destructive until separately authorized.
Required semantics include:
- distinguish branch-scoped vs business-global reset groups and fail closed when scope is unsafe;
- complete backup manifest;
- SQLite + IndexedDB + Native V2 outbox/records/mappings/inbox + compatibility/localStorage cleanup by business/branch/group;
- preserve protected sequences 293/304/316;
- tombstones/no resurrection after restart/inbox replay;
- verify through the same operational read path;
- partial-failure semantics;
- two-branch isolation and selected/unselected group tests.
Do not execute a real Reset or DB deployment from this checkpoint.

## EXACT NEXT STEP

1. Start from current RC1 HEAD 9df9f29bfa4c19f906c488f63cb8bb332c3a7286 and verify it has not moved.
2. Integrate Universal Dashboard V1 from Work commit/ZIP 7cc5584... onto CURRENT RC1.
3. Add Dashboard-only new files.
4. For app.js, index.html, package.json, scripts/check-runtime-syntax.js, scripts/check-version.js, scripts/sync-version.js, styles.css, sw.js perform semantic three-way integration. Preserve all Retail Suspend/Resume changes and every current RC1/Bon/Offline safety contract. Never wholesale replace these shared files from the ZIP.
5. Run Dashboard-specific gate first, then runtime/version/permission/navigation/offline focused gates, then the full current RC1 gate suite.
6. If a gate fails, diagnose the first exact failing gate from CI logs; do not reopen already-closed Bon/Point4 evidence unless the integrated delta caused a genuine regression.
7. Only after all source/CI gates pass may Universal Dashboard V1 be marked SOURCE CLOSED.
8. Still do NOT deploy to SH-0007, Supabase, SH-0005, or SH-0006 without explicit authorization.

## HANDOFF RULE

When user says “بلح”, use this checkpoint as the authoritative continuation:
- state current branch/HEAD,
- separate CLOSED from OPEN,
- preserve safety boundaries,
- do not reopen closed evidence without contradiction,
- finish with the exact next executable step.
