# Sharawla Platform — Master Status

> Official continuation checkpoint for the Sharawla project.  
> Last updated: 2026-09-17  
> Rule: in every new chat/session, read this file first, then verify the relevant GitHub/Sharawla Cloud facts before any write. Do not continue from chat memory alone.  
> Rule: execute only the **Exact Next Step** recorded here unless new verified evidence requires updating this checkpoint first.

## Production Safety Boundary — FROZEN

Production is READ-ONLY during Beta/development work.

- Top Burger business: `3e405b6f-feba-4d5c-a4bf-bebb77f2d5d7`
- SH-0005 — Cash-PC — الدقي — Primary — POS `10.5.3`
- SH-0006 — SmartSystem-PC / Top Burger — العشرين — Primary — POS `10.5.3`
- Forbidden without explicit post-RC Production approval: Beta install, migration, profile/feature changes, business overrides, commercial entitlements, reset, takeover, rebind, device/license mutation.
- Read-only regression checks are allowed.
- Latest Cloud verification on 2026-09-17: Top Burger has `0` Base Package rows, `0` active Base rows, `0` Paid Add-on rows, `0` active Add-ons, and `0` `commercial.%` Admin audit writes.
- Production Commercial Isolation: **PASS**.

## Beta Sandbox

- SH-0007 — FULL SANDBOX
- Device ID: `8c580a23-8711-4540-b6ca-f5c1725d5fcf`
- Business: `تجريبي`
- Business ID: `91826502-590e-4afa-8826-2c0f4b99c490`
- Beta backend: `xihcxydjnzemflhedzor.supabase.co`
- Profile may be changed for isolated acceptance only.
- Experimental writes are allowed only when explicitly scoped to SH-0007 / `تجريبي`.
- The user currently has one physical Windows 7 test device: SH-0007. A second physical device is not required for the current acceptance stage.
- Remote access may be from the user's phone; do not require physically disconnecting the laptop internet if that would drop remote access. Use controlled test-only network/offline simulation when necessary, and remove test hooks after acceptance.

## Canonical GitHub Checkpoint

POS repository: `sharawla1995-oss/restaurant-pos`  
Current integration branch: `beta56-runtime-snapshot-consumer`  
Branch name is technical only; official Roadmap Point 6 Retail has NOT started.  
HEAD immediately before this status refresh: `86f804f853a264a9427c6bb83f1956aff4442d17`.

Important current source facts visible on this branch:
- Runtime Snapshot consumer/main files exist.
- Offline V2 / recovery / hardening layers from Beta43–Beta55 remain in source.
- `scripts/apply-offline-auth-55.3.js`, `scripts/remove-offline-auth-wrapper-55.3.js`, and `scripts/check-offline-auth-authoritative-order.js` are present remotely.
- Therefore the old statement that the 55.3 work is only local/unpushed is obsolete and must not be used as the continuation point.

## Official 17-Point Roadmap

1. ✅ Beta55 — Restaurant Closure: CLOSED
2. ✅ Sharawla Cloud + Admin V4: CLOSED
3. 🟡 Commercial Capabilities / Add-ons / Packages: CURRENT
4. ⬜ Central Warehouse V2 + Financial Closure
5. ⬜ Commercial Warehouse Acceptance
6. ⬜ Beta56 — Retail / Supermarket / Clothing
7. ⬜ Beta57 — Pharmacy
8. ⬜ Beta58 — Logistics
9. ⬜ Beta59 — Membership / Gym
10. ⬜ Beta60 — Warehouse Profile
11. ⬜ Beta61 — Service / Maintenance
12. ⬜ Beta62 — Cross-Profile Closure
13. ⬜ Permissions Final Closure
14. ⬜ Reports & Accounting / Financial Closure
15. ⬜ Offline / Sync Final Closure
16. ⬜ RC1
17. ⬜ Pilot Production → Sharawla V1 Production Ready

Do not reorder the official roadmap silently. In particular, Point 4 remains **Central Warehouse V2 + Financial Closure**. Commercial Admin management belongs inside Point 3.

## Point 1 — Beta55 Restaurant Closure

**CLOSED.**

Final Full Acceptance:
- Run: `ACC-20260914-040227-QTTK4`
- Result: `READY_FOR_RC`
- Coverage: `100%`

Known deferred non-blocking issue:
- Beta Self-Test / Navigation Parity may expose a duplicate/mirrored test entry in Dashboard UI. Inspect code before changing; do not guess.

## Point 2 — Sharawla Cloud + Admin V4

**CLOSED.**

Admin repository: `sharawla1995-oss/sharawla-admin`.
Historical V4 branch: `v4-cloud-admin-work`.
Production remains protected/read-only.

Admin operating rule:
- Admin is primarily used from the phone and must be treated as **mobile-first**.
- Desktop remains supported.
- The user is currently the sole Admin operator; simplify UX where useful, but never weaken authorization, audit, DB guards, or Production protection.

## Point 3 — Commercial Capabilities / Add-ons / Packages

**CURRENT.**

Canonical commercial flow:
`Profile Defaults + Package Entitlements + Paid Add-ons + Business Overrides → Dependency Resolver → Readiness Gate → Final Enabled Features`

Core rules:
- `implemented=true` does not mean Accepted.
- Accepted does not mean Production Ready.
- Planned: DENY everywhere.
- Implemented-Unaccepted: not commercially activatable.
- Beta Ready: Beta/Test only.
- Production Ready: eligible for Production commercial activation.
- Core is included, not sold as a standalone add-on.
- Dependencies are not granted for free.
- Business overrides are DENY-only in the commercial model.
- Exactly one effective Base Package at an instant; historical/future rows are allowed but active intervals cannot overlap.
- Published package is immutable; changes require a new version.
- Readiness/environment remains the final safety wall.

### 3A — Commercial Readiness Audit

**CLOSED / FROZEN.**

Frozen baseline: `3A-2026-09-14-frozen-v1`  
Baseline ID: `96bd819f-05be-4e0c-a1a9-fb72d2c39ff4`

Canonical reconciliation:
- 107 rows
- 107 unique feature keys
- 0 duplicates
- 0 missing
- 0 unknown

Frozen readiness distribution:
- Beta Ready: 35
- Implemented-Unaccepted: 50
- Planned: 22
- Production Ready: 0

Do not silently reclassify the frozen baseline. New evidence is post-baseline evidence unless a controlled amendment is explicitly approved.

### 3B — Readiness Gate / Signed Runtime Snapshot

**FOUNDATION CLOSED / FROZEN.**

Cloud foundations accepted:
- readiness baseline schema + immutable sealed seed
- readiness resolver
- trusted environment resolver
- SH-0007 Beta environment policy
- composition contract
- dependency cycle/depth protection
- signed runtime snapshot endpoint
- Ed25519 signing with private key server-side only
- deterministic canonical payload
- device/fingerprint/business binding
- expiry checks
- per-device monotonic sequence/high-water
- offline Last Known Good/Safe snapshot
- anti-rollback
- atomic authoritative state journal/recovery
- automatic high-water reset forbidden

Historical endpoint checkpoint:
- Edge Function: `runtime-access-snapshot-v1`
- signing key ID: `sharawla-snapshot-2026-09-final`
- private signing key must never be copied to GitHub/POS/chat.

Important distinction:
- Runtime Snapshot security/readiness foundation is accepted.
- Offline Authentication and broad Offline/Sync operational correctness are separate acceptance concerns and must not be confused with Snapshot acceptance.
- Final Offline/Sync Closure remains Roadmap Point 15 and is a major pre-RC risk.

### Historical Offline Authentication Incident

55.1 and 55.2 had real SH-0007 Offline Login failures. The rejected monkey-patch direction must not be repeated blindly.

Authoritative design decision remains:
- `app.js` is sole Authentication owner.
- Runtime wrappers must not own Offline Authentication.
- Online: sign-in → bootstrap persisted → `authEnroll()` → `authState()` read-back → Offline READY.
- Enrollment/read-back failure must not invalidate a successful online login; expose Offline NOT READY with exact reason.
- Offline: canonical identity → Main `authVerify()` fail-closed → verified bootstrap → `loadOfflineBootstrap()`.
- Do not weaken `authVerify`, encrypted credential storage, canonical fingerprint, Runtime Snapshot security, or Production to solve offline issues.

The previous checkpoint claiming 55.3 was local-only/unpushed is obsolete: the current remote branch contains the 55.3 auth scripts/checks. Do not restart from the old Node-13/local-push checklist without fresh evidence.

### 3C — Commercial Package / Entitlement Engine

**IMPLEMENTED / ACCEPTED FOUNDATION.**

Commercial tables:
1. `commercial_packages`
2. `commercial_package_features`
3. `business_package_entitlements`
4. `business_paid_addons`

RLS/constraints/guards are in place. Old `subscriptions` remains frozen and must not be repurposed.

Commercial resolver/evaluator foundation accepted:
- `resolve_sharawla_commercial_entitlement_cloud_v1`
- `evaluate_sharawla_feature_access_cloud_v2`

Snapshot/Composition V2 integration was implemented for the isolated SH-0007 Beta path while preserving Production/legacy behavior. Test-only offline simulation used during this work was removed after acceptance.

### 3C-4A — Controlled Commercial Admin RPC Foundation

**CLOSED.**

Hard rule: Admin must NOT directly mutate the four Commercial tables.

Architecture:
`Admin UI → Controlled Admin RPC → Frozen Commercial Engine → Composition/Readiness`

Admin helper/read/mutation RPC foundation is implemented with:
- active Admin authorization
- SECURITY DEFINER + fixed search_path
- server-side audit in the same transaction
- rollback if audit fails
- package lifecycle/overlap/add-on validation guards

3C-4A acceptance: **16/16 PASS**.

### 3C-4B — Commercial Management Admin UI

**RUNTIME ACCEPTANCE SUBSTANTIALLY PASS; FINAL CLOSE PENDING PROVENANCE + FULL E2E.**

Admin repo: `sharawla1995-oss/sharawla-admin`  
Working branch: `v3.7-commercial-management-ui`.

UI/runtime rules:
- mobile-first
- visually integrated into existing Sharawla Admin shell
- no browser alert/confirm/prompt for commercial lifecycle
- no direct Commercial REST mutations
- fixed Top Burger Production ID defense-in-depth read-only guard
- business-level Inspector must be named/understood as **Commercial Entitlement Inspector**, not final device/readiness access.

Runtime acceptance completed on `تجريبي`:
- Create Draft Package: PASS
- Set Package Features: PASS
- Publish Package: PASS
- Base Package Assign: PASS
- Base Suspend: PASS
- Base Resume: PASS
- Base Cancel: PASS
- Paid Add-on Grant: PASS
- Paid Add-on Suspend: PASS
- Paid Add-on Cancel from suspended: PASS
- Commercial Entitlement Inspector: PASS
- cancelled add-on resolves `NOT_ENTITLED`: PASS
- historical lifecycle preserved: PASS
- server-side Admin Audit: PASS
- mobile human-readable Inspector + technical details: PASS
- Production UI read-only behavior observed: PASS

Runtime test fixture:
- Package code: `ACC_RUNTIME`
- Package V1 / Runtime Test Package
- Base entitlement entity ID: `312554d0-c3a5-4899-ad2c-04b1c6ec382c`
- Paid Add-on `commerce.delivery` entity ID: `097cb030-16db-4e38-8cdd-12554fce1b6a`

Latest Cloud audit evidence on sandbox:
- Base assign → active
- Base active → suspended
- Base suspended → active (resume)
- Base active → cancelled
- Add-on grant → active
- Add-on active → suspended
- Add-on suspended → cancelled
- same Base entity ID/start timestamp preserved through lifecycle.

Latest Production isolation verification:
- Top Burger Base Package rows: 0
- Top Burger active Base rows: 0
- Top Burger Paid Add-on rows: 0
- Top Burger active Add-ons: 0
- Top Burger `commercial.%` audit rows: 0
- Result: **PASS — Production untouched by Commercial runtime testing.**

Do not recreate these lifecycle tests unless new evidence requires it.

### 3C-4B Remaining Close Gates

Before declaring 3C-4B CLOSED:
1. Re-fetch `sharawla-admin` branch `v3.7-commercial-management-ui`; verify exact current HEAD and current `commercial-management.html` source/provenance. Do not trust abbreviated historical SHAs blindly.
2. Verify the latest Vercel Preview maps to that exact Admin commit and the mobile shell integration is the deployed source.
3. Perform only necessary minor mobile polish if still present (historically: Build R7/Back clipping or floating button overlap); no global Admin redesign.
4. Reconfirm no direct Commercial table mutation path and Production fixed-ID read-only guard in current source.
5. Then mark 3C-4B CLOSED.

### Point 3 Final E2E Gate

Point 3 is NOT closed merely because Admin lifecycle passed.

Required final commercial E2E on SH-0007:
`Admin commercial decision → Commercial resolver → Composition V2 → Signed Runtime Snapshot → POS consumer → Readiness Gate → effective feature access`

Must prove both allow and deny behavior with device context. The business-only Commercial Entitlement Inspector is not a substitute for final device-aware readiness/effective access.

After successful E2E, reverify Production read-only/untouched and then Point 3 may be closed if no remaining Point-3 blocker exists.

## Offline / Sync — Critical Pre-RC Priority

Official Roadmap Point 15 remains the final formal Offline/Sync closure, but Offline is a **critical operational risk now** and must be protected during all current work.

Do not declare Sharawla Production Ready until robust Offline Acceptance passes.

Target invariant:
`local transaction first → durable Outbox → stable unique client_tx_id → background retry → server idempotency → explicit ACK → mark Synced`

Required properties:
- selling must not wait for internet
- each sale/return/expense/shift/order-status movement is committed locally atomically first
- power loss/restart must not lose a locally accepted movement
- retrying the same `client_tx_id` must not duplicate server effects
- Outbox entry must not disappear before explicit server ACK
- Inbox/remote replay must be idempotent
- conflicts/recovery must preserve evidence
- no silent data loss and no duplicate financial/stock effects

Acceptance scope must include at minimum:
- sale
- return
- expense
- shift open/close
- order/status movement
- restart before sync
- application crash/restart
- repeated sync/retry
- partial server failure
- pending queue recovery
- return online and reconcile
- Commercial Signed Snapshot/LKG behavior while offline, including anti-rollback.

Source currently contains multiple historical Offline layers (Beta43/44/45/47/49/51 plus later recovery/hardening). Before adding another patch, review ownership and determine whether multiple overlapping layers are creating risk. Prefer one authoritative Offline owner/flow over another wrapper stacked on top.

Because SH-0007 may be remotely controlled, offline acceptance should use a safe controlled network simulation where possible rather than physically cutting the connection and losing remote control.

## Approved Architecture — Customer-Specific Features / Release Channels

**APPROVED DIRECTION / DEFERRED IMPLEMENTATION.**

Canonical rule:
`One Sharawla POS codebase → different Business Entitlements / Settings / Policies`

Do not create permanent customer-specific binaries for normal customization.

Separate:
- Release Version = installed code
- Release Channel = Stable/Beta/Pilot stream eligibility
- Business Entitlements = allowed capabilities

Customer-specific capability flow:
`Business → Package/Add-ons/Entitlements → Dependencies → Readiness → Runtime Snapshot → Effective Access`

A feature already present in the installed binary should not require a new POS update merely to grant an eligible business entitlement.

Beta/Pilot visibility must remain isolated from Stable customers. Code promotion and commercial entitlement are separate decisions.

This architecture does NOT create an 18th roadmap point.

## Immutable / Safety Rules

- Production 10.5.3 remains protected until separately approved promotion.
- No Beta tests on SH-0005/SH-0006.
- No automatic rebind.
- Canonical device fingerprint must not be silently replaced.
- No deletion/disable of the live restaurant POS/Sharawla Cloud path.
- Do not change Activation/Verification/Business Connection without a justified architecture reason.
- Do not break printing, offline operation, Windows 32/64 compatibility, website, users/permissions, reports, backups, or update behavior.
- On regression, preserve evidence first; do not immediately clean/restart/retry blindly.
- During runtime acceptance: one command/action at a time.

## EXACT NEXT STEP — AUTHORITATIVE

**Do not resume the obsolete 55.3 local-push checklist. Do not start Point 4. Do not rerun completed Commercial lifecycle tests.**

Exact next step:

1. Perform the **3C-4B Final Static/Provenance Close** on `sharawla1995-oss/sharawla-admin` branch `v3.7-commercial-management-ui`:
   - fetch exact current branch HEAD;
   - inspect current `commercial-management.html` and confirm RPC-only Commercial mutations + fixed Production read-only guard + mobile-first shell integration;
   - verify the currently deployed Vercel Preview provenance against that exact commit;
   - make no Cloud/POS/Production change during this verification.
2. If that gate PASSes, mark 3C-4B CLOSED in this file.
3. Then perform the **Point 3 Full Commercial Device-Aware E2E on SH-0007 only** through Composition V2 + Signed Snapshot + Readiness Gate.
4. After Point 3 E2E, move immediately to a focused **Offline ownership/architecture audit** before adding any new Offline patch, because Offline/Sync is a critical pre-RC risk.
5. Keep SH-0005/SH-0006 and Top Burger read-only throughout.

If any verification contradicts this file, stop, preserve evidence, update this checkpoint with the verified truth, and only then continue.