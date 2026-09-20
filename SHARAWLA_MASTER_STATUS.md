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
- Latest Cloud verification on 2026-09-17 after Point 3 device-aware E2E: Top Burger has `0` Base Package rows, `0` active Base rows, `0` Paid Add-on rows, `0` active Add-ons, and `0` `commercial.%` Admin audit writes.
- Production Commercial Isolation: **PASS**.

## Beta Sandbox

- SH-0007 — FULL SANDBOX
- Device ID: `8c580a23-8711-4540-b6ca-f5c1725d5fcf`
- Business: `تجريبي`
- Business ID: `91826502-590e-4afa-8826-2c0f4b99c490`
- Authoritative current Runtime Snapshot / Commercial Cloud path for SH-0007: `ikppryeavoabnugcijeq.supabase.co`.
- Historical Beta backend references to `xihcxydjnzemflhedzor.supabase.co` must not be assumed to describe the current Runtime Snapshot path; verify subsystem scope before use.
- Profile may be changed for isolated acceptance only.
- Experimental writes are allowed only when explicitly scoped to SH-0007 / `تجريبي`.
- The user currently has one physical Windows 7 test device: SH-0007. A second physical device is not required for the current acceptance stage.
- Remote access may be from the user's phone; do not require physically disconnecting the laptop internet if that would drop remote access. Use controlled test-only network/offline simulation when necessary, and remove test hooks after acceptance.

## Canonical GitHub Checkpoint

POS repository: `sharawla1995-oss/restaurant-pos`  
Current integration branch: `beta56-offline-ownership-consolidation`  
Branch name is technical only; official Roadmap Point 6 Retail has NOT started.  
Accepted source baseline entering Point 4B-3B: `0a58333d79b89cb1d319be2481ac9c04809e7083` (`feat: add legacy stock reconciliation auditor`).
Current Point 4B-3B source checkpoint: local commit `feat: add controlled canonical stock cutover contract`, containing this Master update; use repository `HEAD` as its exact SHA.
Accepted Offline runtime/source ancestor: `e12ca8333ec71c99f3d1a32ba063717df8c2ea5f`.
Previous routing fix: `a4c8a9d7bc6e631d42af44a6b01c13193ded81a4`.

Important current source facts visible on this branch:
- Runtime Snapshot consumer/main files exist.
- Offline V2 / recovery / hardening layers from Beta43–Beta55 remain in source.
- `scripts/apply-offline-auth-55.3.js`, `scripts/remove-offline-auth-wrapper-55.3.js`, and `scripts/check-offline-auth-authoritative-order.js` are present remotely.
- Therefore the old statement that the 55.3 work is only local/unpushed is obsolete and must not be used as the continuation point.

## Official 17-Point Roadmap

1. ✅ Beta55 — Restaurant Closure: CLOSED
2. ✅ Sharawla Cloud + Admin V4: CLOSED
3. ✅ Commercial Capabilities / Add-ons / Packages: CLOSED
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

Do not reorder the official roadmap silently. In particular, Point 4 remains **Central Warehouse V2 + Financial Closure**. The focused Offline ownership/architecture audit immediately after Point 3 is a critical pre-Point-4 safety audit, not a renumbering of Roadmap Point 15.

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

**CLOSED.**

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

Current SH-0007 path additionally verified:
- Cloud endpoint `runtime-access-snapshot-v2` is active on `ikppryeavoabnugcijeq`.
- It builds through `reserve_and_build_sharawla_runtime_snapshot_cloud_v2` and requires `composition_version=2`.
- POS source routes SH-0007 / `تجريبي` to the V2 endpoint.

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

**CLOSED.**

Admin repo: `sharawla1995-oss/sharawla-admin`  
Working branch: `v3.7-commercial-management-ui`.

Final static/provenance close evidence:
- exact verified Admin HEAD: `ce6897dc1147e520784c2ee2c40ee6aaecbeb7e4`
- commit: `fix(admin): align commercial page with existing admin mobile shell`
- `commercial-management.html` blob: `778a9719b4756f07b9538457343aa46abd4f72bd`
- deployed Vercel Preview deployment: `dpl_9HpDRfQHqPyVr6NN3z17ZGQXAw1e`
- deployed Preview branch/SHA matched the exact Admin branch HEAD above.
- current source confirmed mobile-first shell integration, custom confirmation dialog, RPC-only Commercial mutation paths, and fixed Production business-ID read-only guard.

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

Do not recreate these lifecycle tests unless new evidence requires it.

### Point 3 Final Device-Aware E2E — CLOSED

Required path was proven on SH-0007:
`Admin commercial decision → Commercial resolver → Composition V2 → Signed Runtime Snapshot → POS consumer → Readiness Gate → effective feature access`

Runtime Snapshot state proof on installed `10.5.4-beta.55.5`:
- consumer active through `topBurgerDesktop.runtimeSnapshot`
- mode: `safe-cache`
- sequence: `101`
- high-water: `101`
- snapshot ID: `95f91d80-7e2b-46a6-b6e7-d8cce91b6825`
- baseline: `3A-2026-09-14-frozen-v1`
- runtime environment: `beta`
- composition version: `2`
- decision count: `107`
- sandbox binding: SH-0007 / `91826502-590e-4afa-8826-2c0f4b99c490`

Final device-aware feature decisions:
- `core.offline` → `allowed=true`, `reason_code=ALLOWED`, `readiness_status=beta_ready`
- `commerce.delivery` → `allowed=false`, `reason_code=NOT_ENTITLED`
- `commerce.variants` → `allowed=false`, `reason_code=PROFILE_INELIGIBLE`

This proves both ALLOW and DENY behavior through the signed device-aware Runtime Snapshot rather than only the business-level Inspector.

Final Production isolation recheck after E2E:
- Top Burger Base Package rows: 0
- Top Burger active Base rows: 0
- Top Burger Paid Add-on rows: 0
- Top Burger active Add-ons: 0
- Top Burger `commercial.%` audit rows: 0
- Result: **PASS — Production untouched.**

**Point 3 result: CLOSED.**

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

Source contains multiple historical Offline layers (Beta43/44/45/47/49/51 plus later recovery/hardening). The pre-Point-4 ownership assessment and minimum consolidation are now complete: while takeover is ACTIVE, Native V2 is the sole operational Offline owner and the historical layers are constrained to verified compatibility/read-only evidence boundaries.

Because SH-0007 may be remotely controlled, offline acceptance should use a safe controlled network simulation where possible rather than physically cutting the connection and losing remote control.

### Offline Ownership Consolidation — Runtime + Source Gates

**Core Crash/Recovery Runtime Gate: PASS.**

**Pre-Point-4 Offline Ownership Consolidation Source Gate: CLOSED.**

This is a focused pre-Point-4 safety gate. It does **not** close Roadmap Point 15 — Offline / Sync Final Closure, and it does **not** mean that all Offline Acceptance is complete.

Safety scope and environment:
- Test environment: SH-0007 / Business `تجريبي` only.
- SH-0007 authoritative `pos_profile` was changed to `retail` for isolated acceptance.
- Production SH-0005 / SH-0006 / Top Burger remained untouched and read-only.

Accepted source and routing evidence:
- Current accepted source HEAD: `e12ca8333ec71c99f3d1a32ba063717df8c2ea5f`.
- Documentation checkpoint before consolidation: `b7fb94b844f39098bb5ddc255da81c0c865790e2`.
- Main consolidation commit: `c1b5d131d3a449e9a737bed12ffb7de6b4c3b7c7` (`fix: consolidate offline ownership under native v2`).
- Follow-up bypass fix: `e12ca8333ec71c99f3d1a32ba063717df8c2ea5f` (`fix: close beta36 active ownership bypass`).
- Accepted runtime source for the earlier SH-0007 Native V2 crash/recovery gate: `443e5b2ec4013ba7d1589ec472a4d77012edf708`.
- Commit: `fix: expose authoritative runtime config to offline v2`.
- Previous routing fix: `a4c8a9d7bc6e631d42af44a6b01c13193ded81a4`.
- `app.js` now explicitly exposes the loaded Runtime Config through the read-only interface `window.SharawlaRuntimeConfig.current()`.
- Offline V2 uses the authoritative Runtime Config `pos_profile` only; there is no `isRetailProfile()` fallback, guessed profile, or default Restaurant route.
- Missing profile fails closed with `OFFLINE_V2_POS_PROFILE_REQUIRED`.
- Invalid profile fails closed with `OFFLINE_V2_INVALID_POS_PROFILE`.
- Static transport regression: **PASS**.
- Runtime syntax: **PASS**.
- `git diff --check`: **PASS**.

Closed ownership invariants:
- While takeover is ACTIVE, Native V2 is the sole operational Offline owner.
- `1 client_tx_id → 1 operational owner → 1 durable authoritative store → 1 sync owner → 1 authoritative ACK`.
- Beta36 SAFE RPCs cannot create an independent Offline owner during ACTIVE.
- All 14 Beta36 SAFE RPCs require an approved Native mapping during ACTIVE, whether `p_client_tx_id` exists or is missing.
- No approved mapping fails closed with `OFFLINE_V2_OPERATION_ADAPTER_REQUIRED`.
- `LEGACY_HISTORICAL` is verified, readable, and frozen; during ACTIVE it has no send/delete/remap/reconcile/classify authority.
- `UNKNOWN` fails closed.
- `local_operations` recovery cannot rehydrate non-verified Legacy POS work.
- When takeover is not ACTIVE, Legacy fallback compatibility is preserved.

Ownership consolidation acceptance evidence:
- Earlier SH-0007 Native V2 crash/recovery runtime gate at accepted runtime source `443e5b2ec4013ba7d1589ec472a4d77012edf708`: **PASS**.
- Final ownership consolidation static gate at `e12ca8333ec71c99f3d1a32ba063717df8c2ea5f`: **PASS**.
- Runtime syntax: **PASS**.
- `git diff --check b7fb94b844f39098bb5ddc255da81c0c865790e2..e12ca8333ec71c99f3d1a32ba063717df8c2ea5f`: **PASS**.
- No additional crash test was required after the source-only consolidation.
- Production SH-0005 / SH-0006 / Top Burger remained untouched and read-only.

Root cause and repair history:
- The first failure proved that Retail + Food could be persisted with the wrong RPC, `create_food_pos_order_atomic_v1`, because routing depended on optional `isRetailProfile()`.
- `a4c8a9d7bc6e631d42af44a6b01c13193ded81a4` made Runtime Config `pos_profile` the sole routing authority and changed missing/invalid profile handling to fail closed instead of guessing.
- The first runtime after that fix still returned `OFFLINE_V2_POS_PROFILE_REQUIRED` despite Runtime Config being loaded. The cause was that `app.js` kept it in top-level lexical `let sharawlaRuntimeConfig`, while Offline V2 attempted to read it as a `window` property.
- `443e5b2ec4013ba7d1589ec472a4d77012edf708` added the explicit read-only interface and moved Offline V2 to that interface.
- The crash/recovery runtime evidence below proves the repair end-to-end.

Runtime acceptance evidence:
- Restart + Login after Retail profile change: **PASS**.
- Takeover observed: **ACTIVE**, `migration=yes`, `transport=yes`.
- Preflight: **PASS**.
- Fresh crash acceptance run: `ACC-20260917-071449-3FUH`.
- Durable local commit existed before abrupt restart: **PASS**.
- Actual application relaunch occurred after local commit: **PASS**.
- Pending crash state survived restart/login: **PASS**.
- Resume/recovery: **PASS**.
- Exactly-once server effect: `exactly-once=1`.
- Stock proof: `23 → 22 → 23`.
- Final cleanup: `cleanup=zero`.
- Final UI result: `Last crash PASS`.

Remaining before Final Offline/Sync Closure:
- Complete structured verification of the remaining operational movements and Master scenarios, including expense, shift open/close, order/status, retry, partial failure, pending recovery, and the other required Offline/Sync cases recorded above.
- Complete final cross-profile Offline acceptance where required by the Master.
- Do not repeat already proven tests unless a regression or new source evidence requires them.
- The ownership architecture blocker before Point 4 is closed; this does **not** close Roadmap Point 15 — Offline / Sync Final Closure and does **not** mean all Offline Acceptance is complete.

## Point 4 — Central Warehouse V2 + Financial Closure

**IN PROGRESS. Point 15 Offline / Sync Final Closure remains OPEN.**

### Point 4B-1 — Canonical Location + Stock V2 Foundation

**CLOSED.**

- Source commit: `c7534b9311ad511d07aae97ed84da85ec1c3c482` (`feat: add canonical stock v2 foundation`).
- Canonical physical location remains `branches.id`; `branches.location_type` distinguishes `branch` and `central_warehouse`.
- Canonical V2 balance and immutable movement foundations were deployed only to isolated Beta and passed database-contract acceptance.
- No operational writer was cut over by 4B-1.

### Point 4B-2 — Canonical Stock Writer

**CLOSED / GENUINE COMMITTED CONCURRENCY PASS.**

- Source commit: `0c63b6a3ba99554f2c769681769cef419d8d3610` (`feat: add canonical stock v2 writer`).
- Source review, source commit, Beta deployment preflight, Beta migration apply, and non-concurrent database-contract acceptance: **PASS**.
- Non-concurrent contract acceptance: `33/33 PASS`; rollback/cleanup proof: **PASS**.
- Persistent isolated Beta remained at `inventory_stock_balances_v2=0` and `inventory_stock_movements_v2=0` after rollback.
- Acceptance marker: `P4B2-ACC-20260917-1640-ROLLBACK`.
- Genuine committed concurrency acceptance: **PASS** in a disposable PostgreSQL 16 GitHub Actions environment using independent concurrent sessions.
- Required concurrency scenarios passed:
  - different `client_tx_id` operations concurrently against the same stock identity;
  - concurrent same-idempotency-key replay;
  - concurrent reversal.
- GitHub Actions harness:
  - workflow: `.github/workflows/point4b2-genuine-concurrency.yml`;
  - setup: `scripts/point4b2-genuine-concurrency-setup.sql`;
  - passing commit: `716f192f1bd7a664fae884e15fb98ea0c9bc8fa1`.
- This closes only the Point 4B-2 concurrency acceptance gate. Canonical Stock activation, Backfill, Cutover, hooks, and runtime routing remain unchanged and are **NOT activated**.

### Point 4B-3A — Legacy Stock Reconciliation Auditor

**CLOSED / COMMITTED SOURCE.**

- Commit: `0a58333d79b89cb1d319be2481ac9c04809e7083` (`feat: add legacy stock reconciliation auditor`).
- Candidates: `3`; READY: `3`; QUARANTINED: `0`; current-state blockers: `0`.
- Physical/direct stock writers: `35`; proven transitive writers: `15`; total stock writers: `50`.
- Document/in-flight workflow barriers: `6`.
- Historical warnings remain evidence and were not rewritten or promoted into invented facts:
  - `MOVEMENT_CHAIN_DISCONTINUITY: 1`
  - `MOVEMENT_COST_EVIDENCE_MISSING: 2`
  - `UNMAPPED_LEGACY_MOVEMENT_TYPE: 1`
  - `UNRESOLVED_ADJUSTMENT_COSTING: 1`
- Deterministic digests:
  - source: `44d29b548400ca80870d1418968945a2ef3154cc5e8ae688dbabd3ee018567fc`
  - candidate plan: `d54c6e5cbd75a79e6b2fcb9ddc862b68dc1330fb8eee4f2263987f31a048196d`
  - writer inventory: `26e720760b6b4d2ddf6d45470b6092dab81c15a4fb1e98c5e76043551fb0d88d`
- Auditor result remains `candidate_state_ready=true`, `ready_for_cutover=false`, and `blocked_by_point4b2_concurrency=true`.

### Point 4B-3B — Controlled Canonical Opening & Cutover

**SOURCE COMMITTED / NOT DEPLOYED / NOT EXECUTED — EXECUTION BLOCKED BY POINT 4B-2 CONCURRENCY.**

- Adopted zero-quantity decision: a READY identity with authoritative quantity exactly zero receives deterministic Canonical Ownership/Lineage state `CUT_OVER_ZERO`; it receives no fake balance, no zero-delta movement, and no synthetic physical opening.
- Canonical ownership is independent of positive V2 balance existence. `NOT_CUT_OVER` and `CUT_OVER_ZERO` are distinct; future physical mutations for `CUT_OVER_ZERO` must route to Canonical V2 and may never fall back to Legacy.
- Positive READY quantities continue to require the approved 4B-2 immutable `opening` movement with deterministic cutover identity independent of Legacy `client_tx_id`.
- The committed source adds internal-only plan, candidate, exact boundary, ownership, and immutable ownership-event contracts. All tables use RLS and revoke client mutation access; all control functions revoke execution from `PUBLIC`, `anon`, and `authenticated`.
- The exact approved 4B-3A source/candidate/writer digests and counts `3 / 50 / 6` are pinned by the staging contract.
- Future cutover order is: revalidate watermark → acquire deterministic identity/document locks → freeze exact verified Legacy writer/document boundaries → revalidate under protection → establish canonical ownership → create positive openings only → verify → switch exact workflow ownership → commit.
- The 50 physical/transitive writers and 6 document barriers must all have verified enforcement hooks before execution. No real writer is frozen or switched by this source candidate.
- Before ownership-switch commit, PostgreSQL transaction rollback leaves Legacy authoritative. After canonical commit, rollback to Legacy and deletion of immutable V2 movements are forbidden; incidents enter `FORWARD_RECOVERY_REQUIRED` for explicit manual forward recovery.
- Current execution is intentionally fail-closed with `INVENTORY_STOCK_CUTOVER_POINT4B2_CONCURRENCY_REQUIRED` because the Point 4B-2 concurrency evidence function returns `false`.
- Static source results: 4B-3B gate **PASS**; 4B-3A gate **PASS**; 4B-2 writer gate **PASS**; 4B-1 foundation gate **PASS**; runtime syntax **PASS**; `git diff --check` **PASS**.
- No opening, backfill, cutover, Legacy freeze, workflow switch, Beta write, Production access, or Push was performed during this source gate. The source and this checkpoint were committed locally only.

No Backfill or Cutover is authorized while Point 4B-2 genuine committed concurrency remains unresolved.

### Point 4B-4 — Legacy Writer Cutover Hooks & Workflow Barriers

**SOURCE COMPLETE / LOCAL COMMIT — NOT DEPLOYED / NOT ACTIVATED.**

- Source baseline: `74d44a738b092f0483aa2a2ef725898a17a8cc29` (`feat: add controlled canonical stock cutover contract`).
- The hook contract is derived only from the approved 4B-3A `approved_auditor_evidence`; it does not accept or maintain an independent writer list.
- Required coverage remains exactly:
  - `35` direct physical stock writers;
  - `15` proven transitive stock callers;
  - `50` total stock-writer paths;
  - `6` document/in-flight workflow barriers.
- Direct writers are the physical mutation boundary. Transitive callers retain their proven direct-root lineage and cannot apply a second stock effect.
- The six Central Supply document lifecycle functions remain document/in-flight barriers, not stock writers. Dispatch and receive remain genuine stock-mutating workflows within the 50-writer inventory.
- Routing contract:
  - `NOT_CUT_OVER` → `LEGACY_ONLY` while no protected/committed candidate contradicts it;
  - `CUT_OVER_ZERO` → `CANONICAL_ONLY`, independent of V2 balance existence;
  - `CANONICAL_ACTIVE` → `CANONICAL_ONLY`;
  - `FORWARD_RECOVERY_REQUIRED`, protected, missing, unknown, or contradictory ownership → fail closed/manual recovery;
  - canonical ownership never tries V2 and then falls back to Legacy.
- 4B-4 introduces no Canonical adapter and calls no stock writer. The approved direct Legacy guard denies canonical ownership with `INVENTORY_STOCK_V2_LEGACY_OWNER_DENIED`; a separately approved workflow adapter will be required before Canonical execution can replace that fail-closed result.
- Hook verification compares all staged signatures, deployed definitions, definition digests, direct/transitive roots, and document guards. An unknown direct stock writer fails closed with `INVENTORY_STOCK_HOOKS_UNKNOWN_DIRECT_WRITER`.
- Runtime activation is impossible while `inventory_stock_point4b2_concurrency_closed_v2()=false`; the activation function checks this before any verification-state mutation.
- Existing Legacy runtime remains unchanged because no operational function is modified and every contract begins `DECLARED_NOT_INSTALLED`.
- Static source result: Point 4B-4 gate **PASS**. The source and this checkpoint are committed locally as `feat: add canonical stock cutover hooks`; no hook was installed or activated and no Backfill/Cutover, Beta write, Production access, or Push occurred.

Point 4B-4 source readiness does not close Point 4B-2 and does not authorize deployment, hook activation, Backfill, or Cutover.

### Point 4C-1 — Canonical Transfer Consolidation Contract

**SOURCE COMPLETE / LOCAL REVIEW — NOT DEPLOYED / NOT CONNECTED.**

- Central Supply (`inventory_supply_requests`) is the sole future canonical transfer document identity. Legacy Retail/ingredient transfers remain historical compatibility paths and are not a second authoritative lifecycle.
- The additive companion contract models requested/approved/reserved/preparing/in-transit/partial/final receipt states without changing the existing Central Supply runtime.
- Dispatch and receive remain the future physical mutation boundaries. This source contract calls neither Legacy stock writers nor `inventory_stock_apply_movement_v2`; no real transfer is routed or dual-written.
- Transfer lines preserve deterministic quantity and unit-cost snapshots. Generated dispatched/received/damaged/shortage/in-transit values enforce conservation of the dispatched value; accounting disposition of damage/shortage remains a later Financial Journal decision rather than an invented posting.
- Each workflow event uses deterministic `(operation_type, client_tx_id)` identity. Same identity/digest replays; a changed canonical payload fails closed with `INVENTORY_TRANSFER_V2_IDEMPOTENCY_CONFLICT`.
- The internal activation guard requires Point 4B-2 concurrency closure and canonical ownership at both source and destination for every line. Both activation evidence and the existing concurrency evidence remain `false`, so activation is currently impossible.
- Tables are RLS-enabled with all client privileges revoked. Internal functions are not executable by `PUBLIC`, `anon`, or `authenticated`; there is no generic client transfer mutation RPC and no Offline adapter/fake-success path.
- Source validation: Point 4C-1 static gate **PASS**; earlier Point 4B gates and runtime syntax remain required regressions before commit. No Beta write, deployment, workflow connection, Production access, or Push occurred.

Point 4C-1 source readiness does not close Point 4B-2 and does not authorize transfer routing, deployment, or stock cutover.

### Point 4D-1 — Purchasing / Accounts Payable Contract

**SOURCE COMPLETE / LOCAL REVIEW — NOT DEPLOYED / NOT CONNECTED.**

- Existing PR → PO → GRN → Supplier Invoice → 3-way Match remains unchanged. The missing authoritative AP layer is modeled additively as invoice-backed payable, supplier-return credit, supplier payment, payment allocation/settlement, landed-cost lineage, and immutable AP events.
- Every payable has exactly one approved-source supplier invoice identity; credits require a supplier-return identity; landed-cost links retain explicit evidence rather than silently changing stock valuation.
- Generated outstanding and unallocated amounts plus conservation constraints prevent over-crediting, over-settlement, and over-allocation at the contract boundary. A future internal transactional writer must maintain aggregate amounts atomically; none is connected in this point.
- Deterministic intent digests and unique client transaction identities define replay/conflict semantics without depending on mutable timestamps/provenance.
- AP activation remains hard-false with `SUPPLIER_AP_V1_ACTIVATION_BLOCKED`. No purchasing, GRN, invoice, treasury, stock, Financial Journal, or Offline workflow calls this contract.
- All tables are RLS-enabled and all client mutation privileges are revoked. Internal functions revoke execution from `PUBLIC`, `anon`, and `authenticated`; no generic client payable/payment RPC is introduced.
- Source validation: Point 4D-1 static gate **PASS**. No deployment, Beta write, operational connection, Production access, or Push occurred.

Point 4D-1 source readiness is a schema/ownership contract only; it does not establish Financial Closure or settle any real supplier balance.

### Point 4E-1 — Authoritative Financial Journal Contract

**SOURCE COMPLETE / LOCAL REVIEW — NOT DEPLOYED / NOT CONNECTED.**

- Architecture Decision: **Operational Backend = Tenant Boundary**. Each operational backend belongs to one Sharawla Business through Sharawla Cloud / Business Connection; the Journal does not invent or persist a `business_id bigint`. `branch_id bigint` remains the authoritative in-backend operational-location identity.
- The additive contract defines append-only `finance_journal_events_v1` and `finance_journal_lines_v1` with deterministic `(client_tx_id,line_key)` event identity and explicit source-document lineage.
- Each line is exclusively debit or credit. A deferred database constraint requires positive equal debit/credit totals for every affected event.
- Journal events and lines reject UPDATE/DELETE. Reversal is a new uniquely linked event whose ordered account/location/counterparty lines must exactly swap the original debit and credit values; destructive correction is not allowed.
- Optional evidence links connect journal lines to Canonical Stock movements, canonical transfers, and supplier payables. This preserves traceability without posting COGS, valuation, transfer variance, or AP effects prematurely.
- Event types reserve contracts for sales/payments/refunds, expenses/cash/shifts, receivables/collections, payables/supplier payments, inventory value/COGS/waste/damage, and transfer value/variance. No historical value is inferred and no operational source is connected.
- Same deterministic identity/digest replays; changed canonical intent fails closed with `FINANCE_JOURNAL_V1_IDEMPOTENCY_CONFLICT`.
- Financial Journal activation remains hard-false with `FINANCE_JOURNAL_V1_ACTIVATION_BLOCKED`. Tables are RLS-enabled, clients have no direct privileges, internal functions have no `PUBLIC`/`anon`/`authenticated` execute permission, and no generic posting RPC exists.
- Source validation: Point 4E-1 static gate **PASS**. No deployment, Beta write, journal posting, workflow connection, Production access, or Push occurred.

Point 4E-1 source readiness does not constitute Financial Closure. Posting mappings, deployment, reconciliation, and runtime acceptance remain separate gates.

### Point 4F-1 — Canonical Reconciliation Auditor

**SOURCE COMPLETE / LOCAL REVIEW — NOT DEPLOYED / NOT EXECUTED.**

- The deterministic read-only auditor covers Canonical Stock balance ↔ ledger quantity/reservation and final movement snapshots.
- Transfer checks cover dispatched value conservation, received-with-in-transit defects, and missing canonical out/in effects for canonically active transfers.
- Purchasing/AP checks cover invoice-backed payable arithmetic, payment allocation totals, payable settlement totals, and supplier credit totals.
- Financial checks cover debit=credit, orphan reversals, and orphan Canonical Stock/transfer/payable evidence links.
- Output includes a deterministic SHA-256 evidence digest and all four activation facts. It always reports `runtime_reconciliation_accepted=false`; source structure or empty tables cannot be represented as runtime acceptance.
- The function is SQL `STABLE`, uses SELECT-only evidence queries, has empty `search_path`, and is not executable by `PUBLIC`, `anon`, or `authenticated`. It calls no operational writer or Offline path.
- Source validation: Point 4F-1 static read-only gate **PASS**. No auditor execution, deployment, Beta write, Production access, or Push occurred.

Point 4F-1 source readiness does not close reconciliation/acceptance. Deployment, authoritative posting mappings, real workflow integration, and runtime evidence remain required.

### Point 4 — Final Source Integrity / Runtime Readiness Audit

**SOURCE INTEGRITY REVIEWED — RUNTIME CLOSURE REVIEW REQUIRED / BLOCKED.**

Audit baseline: `16c2159e2ad82e3d9360b893c1f8f3dc621fac66`.

Clear source defects corrected locally during this audit:

- `supplier_payments_v1.treasury_movement_id` now has a unique `ON DELETE RESTRICT` FK to `treasury_movements`, preventing an unverified or multiply claimed treasury effect.
- the Financial Journal now has a deferred event-completeness constraint: an event cannot commit with no lines, fewer than two lines, zero value, or unequal debit/credit totals; reversal-of-reversal and cross-branch/currency reversal are rejected;
- 4F-1 now detects missing **or duplicate** canonical transfer-out/transfer-in effects, invoice/payable identity and amount mismatches, payment-allocation supplier/branch/currency scope mismatches, and journal events without lines.

The end-to-end ownership direction remains compatible: audited Legacy watermark → protected atomic cutover → control-plane ownership independent of balance existence → guarded Canonical Stock → future transfer/AP/journal adapters → reconciliation. `CUT_OVER_ZERO` still has no fake balance/movement and must use the same future Canonical adapter as positive ownership. No canonical-to-Legacy fallback or dual-write path was introduced.

Runtime Closure is not source-complete because the following require explicit architecture/accounting decisions rather than guesses:

- deterministic source-document types, line keys, canonical line ordering, and posting identities for GRN, transfer, AP, sales/returns, expenses, payments, receivables, COGS, waste/damage, and reversals;
- transfer cancellation after dispatch, shortage/damage responsibility, transfer variance recognition, and in-transit account treatment;
- 3-way-match tolerances, invoice/credit tax treatment, overpayment/unallocated cash policy, supplier-return credit allocation, landed-cost capitalization/clearing timing, currency/FX and rounding policy;
- chart-of-accounts mappings and recognition timing for Inventory, COGS, Sales, Discounts/Tax, Cash/Bank/Wallet clearing, Receivables, Payables, GRNI, Expenses, Waste/Damage, Transfer In Transit/Variance, Supplier Credits, Landed Cost, and rounding/FX.

Required operational adapters remain: every approved direct Legacy stock boundary plus its transitive callers/barriers; sale/return/reservation/waste/damage/stocktake; GRN and supplier return; atomic transfer dispatch/receive; invoice approval → payable; treasury supplier payment → allocation/settlement; landed-cost and supplier-credit linkage; and deterministic journal posting/reversal adapters. Every Canonical stock adapter must call the canonical ownership assertion before the sole 4B-2 writer. There is currently no installed adapter or workflow switch.

4F-1 still cannot truthfully close these checks until the above mappings exist: GRN without its expected Canonical movement, source-specific duplicate economic posting, and complete valuation lineage. The auditor must not infer generic keys or treat empty/non-connected tables as PASS.

Security review: Point 4 internal functions use `SECURITY DEFINER` with empty `search_path`; client execution is revoked; new tables enable RLS and revoke direct client privileges; immutable ledgers reject UPDATE/DELETE. No generic stock/transfer/AP/journal mutation RPC is client-executable. Table owners/service roles can still bypass RLS by design, so future adapters require a reviewed privileged execution role and clients must never receive service-role credentials.

Point 4B-2 genuine committed concurrency acceptance is **CLOSED / PASS** by GitHub Actions evidence at `716f192f1bd7a664fae884e15fb98ea0c9bc8fa1`. This closes only the concurrency acceptance blocker; no Backfill, Cutover, hook activation, deployment, runtime connection, or Point 4 closure is authorized by that result alone.

### Point 4 — Deployment Provenance / Tenant Boundary Decision

**READ-ONLY VERIFIED AT SOURCE HEAD `819f49c069efbdb70638181425d936c34cad505d`.**

- Operational Beta `xihcxydjnzemflhedzor`: Point 4B-1 Foundation and Point 4B-2 Writer are **DEPLOYED** and their recorded migration payload hashes/byte sizes match the committed source exactly.
- Point 4B-3A, Point 4B-3B, Point 4B-4, Point 4C-1, Point 4D-1, Point 4E-1, and Point 4F-1 are **SOURCE COMPLETE — NOT DEPLOYED**. Neither Operational Beta nor Sharawla Cloud contains their migration-history entries or database objects.
- Because 4E/4F were never deployed, the Tenant Boundary correction is made in their original source contracts before first deployment; no Forward Migration, `DROP`, or deployed-schema rewrite is required.
- **Architecture Decision:** the Operational Backend itself is the tenant boundary. Sharawla Business UUID remains external identity in Sharawla Cloud / Business Connection. Financial Journal stores no synthetic `business_id bigint`; `branch_id bigint` identifies an operational location inside the tenant backend.
- Point 4F-1 has no `business_id` dependency and remains structurally unchanged by this decision. Its future reconciliation runs inside the same operational-backend tenant boundary.

### Point 4 — Source Identity Contract V1

**IDENTITY V1 — SOURCE COMPLETE / LOCALLY COMMITTED — NOT PUSHED / NOT DEPLOYED / NOT RUNTIME ACCEPTED.**

- Contract namespace: `sharawla.point4.identity.v1`.
- An Offline-originated business document receives an immutable lowercase UUIDv4 `document_uid` before its first durable write. Its canonical identity remains `uuid:<document_uid>` across Offline, Sync, Cloud persistence, retry, and replay. A generated database ID is mapping/lineage only and never replaces that identity.
- `db:<id>` is restricted to Legacy or guaranteed-online-existing documents. Controlled stock opening retains the approved deterministic `digest:sha256:<plan_digest>` exception.
- `document_uid` identifies the document lifetime; `client_tx_id` identifies exactly one logical mutation/command. One document may therefore have multiple independent commands without changing document identity.
- Every business/document line receives an immutable lowercase UUIDv4 `line_uid`. Deterministic effect keys use `v1:<domain>:<effect>:<line_uid>[:<subcomponent-kind>:<subcomponent-identity>]`; nested line keys, UI indexes, item IDs, and generated database line IDs are not canonical line identity.
- Transfer keeps one immutable transfer `document_uid`; dispatch and every partial/final receive use independent `client_tx_id` values. Each partial receipt line has its own immutable `receive_line_uid`, while the original transfer line remains lineage.
- Recipe effects require an immutable recipe-component identity. The source contract fails closed when that identity is unavailable; no Recipe migration or business rule is invented here.
- Journal evidence line identity, posting role, and final journal line identity are separate. Posting roles are not inferred from account codes; Accounting Mapping remains an explicit future decision.
- Canonical operation digests sort by deterministic line key, normalize quantities/costs/amounts to the approved fixed scales, reject duplicate keys, and exclude generated IDs, raw array order, recorded timestamps, transport metadata, and mutable/derived fields.
- Offline V2 `payload_digest` remains a transport-integrity digest. Point 4 `operation_digest` is the canonical economic-intent digest. Identity V1 creates no new Offline owner and does not modify Outbox, ACK, or takeover behavior.
- Append-only reversal is a new document and command with canonical references to the original document/TX/effect/digest. Internal movement/event IDs remain FK/mapping details and are not canonical reversal digest identity.
- Point 4C Transfer, Point 4D Purchasing/AP, Point 4E Financial Journal, and the affected Point 4F reconciliation linkage are corrected in source only. None is deployed or operationally connected.
- The deployed Point 4B-1/4B-2 signatures and behavior remain unchanged. Their text `source_document_id` and `line_key` inputs can receive canonical Identity V1 values through future reviewed workflow adapters.
- Point 4B-3 controlled positive opening now calls the unchanged 4B-2 writer with `source_document_type='stock_opening'` and `source_document_id='digest:sha256:<plan_digest>'`; zero opening remains control-plane-only with no fake balance or movement.
- `effective_date` is included only when a domain contract explicitly defines it. It is not a global timestamp and `occurred_at`/`recorded_at` remain outside canonical economic identity.

This source contract does not deploy schema, connect runtime adapters, execute Backfill/Cutover, activate hooks, or close Point 4 Runtime Acceptance. Point 4B-2 committed-concurrency acceptance is separately CLOSED / PASS.
- This provenance decision changes no deployed 4B-1/4B-2 file or object and authorizes no deployment, Backfill, Cutover, workflow connection, or Production action.

### Point 4 — Runtime Adapter Batch 1

**Runtime Adapter Batch 1 — SOURCE COMPLETE / INACTIVE / NOT DEPLOYED / NOT RUNTIME ACCEPTED.**

- The additive internal Canonical Stock adapter kernel validates one Identity V1 economic effect and maps only the approved operations to the unchanged Point 4B-2 movement vocabulary.
- Execution order is fixed as: canonical identity/economic validation → approved mapping → Point 4B-2 committed-concurrency gate → adapter activation gate → committed ownership resolution → canonical ownership assertion → the sole unchanged `inventory_stock_apply_movement_v2` writer.
- Both activation boundaries remain fail-closed. Genuine Point 4B-2 committed concurrency acceptance is now **CLOSED / PASS**, while the adapter-specific activation function still returns `false`; therefore no current path can reach the physical writer through this kernel.
- `NOT_CUT_OVER` is rejected by the Canonical adapter, `CUT_OVER_ZERO` and `CANONICAL_ACTIVE` remain Canonical-only ownership states, and `FORWARD_RECOVERY_REQUIRED`, missing, unknown, or contradictory ownership fail closed. The adapter performs no Legacy routing and contains no Canonical-to-Legacy fallback or dual-write path.
- Controlled stock opening retains its approved deterministic `digest:sha256:<plan_digest>` identity exception. Ordinary documents require an immutable UUIDv4 `document_uid` whose canonical source identity is exactly `uuid:<document_uid>`; generated database IDs are not document or line identity.
- Outbound valuation remains server-derived by the unchanged 4B-2 writer. Required inbound valuation cannot be coerced from missing evidence to zero; unresolved adjustment/stocktake costing remains fail-closed.
- The kernel is internal-only: `PUBLIC`, `anon`, and `authenticated` receive no execute permission. No generic client mutation RPC, Offline owner, Outbox, ACK, workflow switch, Legacy hook activation, Backfill, or Cutover is introduced.
- Static/source validation is not PostgreSQL runtime or concurrency acceptance. Deployment, adapter activation, workflow integration, genuine committed concurrency, and runtime evidence remain separate mandatory gates.

### Point 4 — Runtime Adapter Batch 2

**Canonical Identity Propagation — SOURCE COMPLETE / COMPATIBILITY-FIRST / CANONICAL STOCK INACTIVE / NOT DEPLOYED / NOT RUNTIME ACCEPTED.**

- Offline-capable POS sale commands now create one lowercase UUIDv4 `client_tx_id`, one immutable `document_uid`, and distinct immutable `line_uid` values before the first Native V2 durable write. `source_document_id` remains `uuid:<document_uid>` and effect keys use the non-nested Identity V1 namespace.
- Sale identity is preserved inside the existing Native V2 event/payload/records and therefore across retry, restart, replay, sync, and ACK state changes. No second store, outbox, sync owner, or ACK owner was added.
- Sale-return commands create a new mutation TX and return document identity, preserve immutable return-line identities, and carry explicit original-sale lineage when available. The same TX is reused by the online attempt and its existing offline fallback.
- Historical rows without Identity V1 remain explicitly Legacy; this Batch performs no backfill or silent Canonical reclassification. Other stock-producing workflows remain deferred until their deployed RPC/schema boundaries can preserve Identity V1 without changing operational semantics.
- `payload_digest` remains the existing Native V2 transport-integrity digest. No Point 4 `operation_digest` is substituted for it, and durable economic replay remains owned by the unchanged published contracts/future approved adapters.
- Batch 1 remains hard-false/inactive. This Batch does not call the Canonical adapter or `inventory_stock_apply_movement_v2`, modify Legacy stock routing, or activate hooks. Point 4B-2 committed-concurrency acceptance is separately CLOSED / PASS.

### Point 4 — Runtime Adapter Batch 3

**Direct Physical Writer Routing Foundation — SOURCE COMPLETE / INACTIVE / NOT DEPLOYED / NOT RUNTIME ACCEPTED.**

- The first reviewed routing group covers only the direct Retail parent-product boundaries `create_retail_pos_order_atomic` and `create_retail_order_return_idempotent`. Their Food/Retail wrappers remain transitive delegates and do not own another physical effect; Variant and ingredient effects remain deferred pending their exact item/component contracts.
- The additive internal preparation contract consumes the existing Identity V1 `client_tx_id`, `document_uid`, `source_document_id`, `line_uid`, and deterministic `effect_line_key`; it never generates replacement identity, aggregates duplicate product lines, or derives Canonical identity from a database row ID or array position.
- Fully identity-absent historical payloads remain explicitly `LEGACY_COMPAT / LEGACY_ONLY`. Partial or malformed Canonical identity fails closed. No backfill, Legacy reclassification, Legacy writer modification, or workflow switch is introduced.
- The future-only internal execution boundary checks Point 4B-2 committed concurrency and the Batch 1 hard-false activation gate before its sole delegation to the inactive Batch 1 adapter. It has no direct 4B-2 writer call, Legacy fallback, exception fallback, dual-write, or client execute grant.
- No real POS, Offline V2, transport, Outbox, sync, ACK, or deployed operational RPC calls this foundation. Canonical Stock therefore remains unreachable and inactive; static/source validation is not PostgreSQL runtime or concurrency acceptance.

### Point 4 — Batch 4C-1 Reservation Identity V1

**SOURCE IMPLEMENTATION COMPLETE / STATIC CHECKER PASS / COMMITTED / PUSHED / NOT DEPLOYED / NOT RUNTIME ACCEPTED.**

- Reservation Identity V1 source contract is implemented additively with immutable document, line, and mutation identity sidecars; deterministic SHA-256 operation digests; replay/conflict resolution; projection assertions; and fail-closed mutation guards.
- Create, accept, reject, cancel, and DB-owned expire source RPC contracts are implemented with deterministic advisory-lock/idempotency boundaries and durable mutation results.
- RLS, branch-scoped staff visibility, direct-DML revocation, and least-privilege RPC grants are defined in source.
- The dedicated 4C-1 static/source checker passes, including frozen-source integrity and Canonical Stock inactivity assertions.
- This is source/static evidence only. No Supabase deployment, PostgreSQL runtime acceptance, workflow connection, Backfill, Cutover, Canonical Stock activation, or Production action has occurred.
- Point 4B-2 genuine committed-concurrency acceptance is now CLOSED / PASS and remains separate from this source implementation.

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

**Point 3, Point 4B-1, Point 4B-2, and Point 4B-3A are CLOSED. Point 4B-3B and Point 4B-4 remain NOT DEPLOYED / NOT EXECUTED / NOT ACTIVATED. Point 4C-1 transfer, Point 4D-1 Purchasing/AP, Point 4E-1 Financial Journal, and Point 4F-1 reconciliation source are complete locally but NOT DEPLOYED / NOT CONNECTED / NOT RUNTIME ACCEPTED.**

Exact next step:

Identity V1 Source is locally closed and PUSHED through 23f9f570, but remains NOT DEPLOYED / NOT RUNTIME ACCEPTED. The AP contract still requires a future durable runtime resolver before adapter acceptance. Point 4B-2 genuine committed concurrency is now CLOSED / PASS by disposable PostgreSQL 16 GitHub Actions evidence at `716f192f1bd7a664fae884e15fb98ea0c9bc8fa1`. Do not deploy 4B-3B through 4F, switch workflows, or connect transfer/AP/Financial adapters without their explicit deployment/runtime gates. Preserve SH-0005, SH-0006, Top Burger, Production, Offline ownership, Licensing, Canonical Fingerprint, and Business Connection as untouched/read-only boundaries.

If any verification contradicts this file, stop, preserve evidence, update this checkpoint with the verified truth, and only then continue.
