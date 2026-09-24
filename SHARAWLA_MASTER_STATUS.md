# Sharawla Platform — Master Status

> Official continuation checkpoint for the Sharawla project.  
> Last updated: 2026-09-23  
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

**POINT 4 — PRE-CUTOVER 46 GUARD INSTALLATION — OFFICIAL CHECKPOINT**

- Pre-Implementation Evidence Gate = **CLOSED / PASS** for all 46 contracts.
- Contract set = **46/46 Evidence-Complete**: 40 Direct Legacy writer boundaries + 6 Document Workflow barriers.
- Current accepted Source Implementation = **0/46**.
- Batch 1 covers 9 insertion-only functions: 6 Legacy guards + 3 Document Workflow guards.
- Original Batch 1 commit `7a17ac92c651f216113903569c039b20dcbbda25` was **FAIL / STOP for Source Validity** because duplicated DML fragments produced malformed SQL. Its coverage/guard placement evidence does not make it an accepted implementation.
- Batch 1 corrective commit `a08fc8aaadf1760444e31b6c87ee9cb950b286b6` removed only the discovered duplicated DML fragments.
- Corrective Diff Gate = **PASS**: the corrective diff is duplication/syntax cleanup only; no guard movement, business-logic redesign, signature change, Cutover/Canonical activation, or Transitive change was introduced.
- Obvious malformed-DML static scan after the corrective = **PASS**: the known `INSERT ... INSERT`, `UPDATE ... UPDATE`, and malformed `INSERT ... IF ... INSERT` patterns are absent.
- Static coverage after the corrective remains: exact functions **9/9**, Legacy guard references **6/6**, Document Workflow guard references **3/3**, with no Cutover/Canonical activation.
- These static checks are **NOT** a Full PostgreSQL Source-Validity proof.
- PostgreSQL Parse/Compile Proof = **NOT ESTABLISHED / OPEN**. Batch 1 therefore remains **UNACCEPTED** and must not be counted as 9/46 yet.
- Preliminary Batch 2 commit `80596e05f0b8afbee11c1c45a9cabdb0fc293442` is **BLOCKED / UNACCEPTED BY BATCH 1**. Do not infer that Batch 2 is correct or incorrect; do not count or review it for acceptance until Batch 1 closes.
- Beta/Supabase writes for this 46-guard remediation stage = **0**.
- Final Runtime61 = **STOP**.
- Canonical Stock = **OFF**. Cutover = **OFF**.
- SH-0005, SH-0006, Top Burger Production = **UNTOUCHED / READ-ONLY**.

### Exact next execution step

Run a **Disposable PostgreSQL Compile Gate** isolated completely from Beta and Production:

1. Provision a local/ephemeral/disposable PostgreSQL environment.
2. Load only the minimum real schema/dependencies or precise stubs needed by the nine definitions.
3. Load the nine `CREATE OR REPLACE FUNCTION` definitions **verbatim from corrective commit `a08fc8aa...`**.
4. Require **9/9 CREATE/compile success**. Distinguish a missing/inaccurate test dependency or stub from an actual source/syntax defect; do not modify production source merely because the disposable environment lacks an object.
5. Inspect `pg_get_functiondef` for all nine compiled functions and verify the expected definitions were created.
6. Re-run the final semantic/boundary checker: exact signatures 9/9, Legacy guards 6/6, Document guards 3/3, guards at the frozen approved boundaries, and no Cutover/Canonical/Transitive or unrelated changes.
7. PostgreSQL CREATE/compile success proves the definitions can be accepted by PostgreSQL in that environment; it **does not prove runtime/business behavior** because PL/pgSQL can defer resolution of some references until execution.
8. Only if all of the above PASS may the checkpoint change to **Batch 1 = ACCEPTED / PASS; Accepted Source Implementation = 9/46**.
9. Only after that may Batch 2 `80596e05...` be opened and reviewed independently from zero.

Until this gate closes: **Accepted Source Implementation = 0/46; Batch 1 UNACCEPTED; Batch 2 BLOCKED; Beta Write = 0; Production untouched.**

If any verification contradicts this file, stop, preserve evidence, update this checkpoint with the verified truth, and only then continue.


---

## 2026-09-23 CURRENT OVERRIDE — Beta57/Beta58 + Product Map

> This section supersedes older **EXACT NEXT STEP** text above where it conflicts with this newer verified checkpoint. Preserve the older sections as historical evidence; do not resume from their stale counters or next-step instructions without fresh verification.

### Safety boundary

- Top Burger Production remains **READ-ONLY / UNTOUCHED**: SH-0005 + SH-0006 on 10.5.3 CLEAN.
- Current development/acceptance target remains SH-0007 only.
- Canonical Stock = OFF.
- Cutover = OFF.
- No automatic rebind or Canonical Fingerprint mutation.

### Point 4 current consolidated status

- Ownership Mapping = **61/61 CLOSED**: Direct 40/40, Transitive 15/15, Document/In-flight Barriers 6/6.
- Pre-Cutover Guard Contracts = **46/46 Evidence-Complete**.
- Current accepted Source Implementation checkpoint = **38/46**.
- Formal Deferred = **#11, #12, #35, #36, #37**.
- Runtime Verified historical counter remains **5/46** unless a contract-specific runtime mapping/report explicitly proves an increment. Do not infer Runtime Verified from broad sandbox success alone.
- Corrective Batch 4 V2 was deployed to isolated Beta and structurally verified; Production remained untouched.

### Beta56 / Beta57 acceptance

- Beta56 corrective Full Sandbox evidence commit: `5b24059d02e0cc04ccef70b1662925fc27f7ee38`.
- Full Sandbox run: `ACC-20260923-070827-PFCEK` → **READY_FOR_RC / 100%**.
- Beta57 RC source commit: `0af3047f5910f709040aa97b431049fc5775591f`.
- Beta57 installed Full Acceptance run: `ACC-20260923-074331-VU2OV` → **READY_FOR_RC / 100% / FAIL=0**.
- Stable promotion is intentionally paused pending the Orders/runtime/UI performance discrepancy described below.

### Beta58 Orders Performance candidate

Verified source commits:
- `7453fefed1eb6c0c2637d67feec6abbed7ea2ddd` — bound Orders by server-side date window + pagination and replace sequential cache writes with batch cache.
- `1b0bf6b17aa3cf16db9ec20fd0de29e26470bcfc` — static Orders performance/date-window guard.
- `46b71c9f2829a7a63ba278a808eeab88544e690c` — bump candidate to 10.5.4-beta.58.
- `94837e7e993f9d731fcf5b9575fb36cd1432a58b` — synchronize beta58 version metadata.
- `ed0bbfe8cb543f8ac1efbbba394793d0e81e2c42` — Beta58 Orders Performance sandbox build workflow.

Intended Orders behavior:
- default = today only;
- server-side From/To date bounds;
- page size = 100;
- pagination;
- one batch cache merge/write per page;
- preserve lazy order details, printing, returns, and Offline fallback.

On-device SH-0007 evidence:
- installed application reports Beta58;
- Orders screen still appears as the old UI and remains slow;
- new date-range controls are not visible;
- therefore installed runtime behavior does **not yet match** the intended Beta58 source contract.
- Runtime investigation also found `beta55-4-runtime-recovery.js` still prefetches up to 300 recent Orders during warm-cache startup. This is a confirmed legacy performance path, but by itself does not explain the missing new Orders UI.

### UI / Navigation audit — confirmed design debt

- Current navigation is layered across core app routing, Restaurant Engine, Beta54 shared UI, Restaurant Closure UI, and Beta55 Navigation Parity.
- Core `showPage()` has no dedicated `websiteOrders` route or `renderWebsiteOrders()`.
- Website pending orders are currently embedded in Delivery Orders.
- Unknown core routes silently fall back to POS; future unified routing must fail closed instead of silently opening Cashier.
- Website configuration and operational Website Orders are currently split across Delivery Orders, Reports, and Website Management.
- Heavy-data screens needing a bounded-query performance pass include Orders, Delivery Orders, Returns, Customers, Treasury, HR and large-period Reports.
- Current permission model is page-centric and has known composite boundaries that need explicit redesign; do not silently change business policy before Permissions V2.

### Approved target product map

The target architecture is **Sharawla Core + Activity Profiles**, not a Restaurant-only fork.

Sharawla Core owns shared capabilities such as:
- Businesses and Locations;
- Users and Permissions;
- Customers and Products;
- Payments / Split Payment;
- Inventory and Purchasing;
- Finance and Reports;
- Integrations;
- Offline/Sync;
- Audit;
- Support;
- AI action infrastructure.

Restaurant Profile adds:
- Kitchen;
- Delivery;
- Pickup;
- Tables;
- Ingredients;
- Recipes / Food Cost;
- Production / Waste;
- restaurant-specific online-order workflow.

Target Restaurant navigation:
- Home.
- Sales: POS, Orders, Returns, Customers, Promotions.
- Operations: Online Orders, Delivery, Kitchen, Tables when enabled.
- Inventory & Purchasing: Inventory, Ingredients, Suppliers, Purchasing/Receiving, Supplier Returns, Branch Supply Requests, Stock Count, Transfers, Recipes/Food Cost, Production/Waste.
- HR: Employees, Advances, Adjustments/Bonuses/Overtime, Payroll.
- Finance: Treasury, Expenses, Shifts/Settlements.
- Reports.
- Website configuration.
- Integrations.
- Sharawla Customer Support.
- Sharawla AI.
- Administration / Settings.

### Online Orders target

- Rename operational concept from Website Orders to **Online Orders**.
- Current source: Sharawla Website.
- Future connector-ready sources: Talabat, Hurry Up, and approved custom providers.
- One unified operational inbox with explicit Source + Delivery/Pickup.
- Target lifecycle: New → Accepted/Preparing → Ready → Delivery dispatch or Pickup handoff → Completed, with rejected/cancelled history.
- Notification Details should open an order-detail modal without forcing the cashier away from the active screen.
- After acceptance, the order must enter the normal Sharawla Order Engine rather than a second invoice system.
- External platform integration requires official API/webhook/partner credentials; do not invent provider APIs.

### Locations / Central Warehouse target

Location types must support at least:
- Restaurant Branch;
- Warehouse;
- Central Warehouse;
- Central Kitchen.

Target branch-supply workflow:
Branch Request → Warehouse Review → Full/Partial Approval → Picking → Dispatch → In Transit → Branch Receipt → Receipt Variance.

Creating a request alone must not mutate physical stock.
Future Central Kitchen flow may transform ingredients into semi-finished/finished production and transfer output to branches with cost lineage.

### Permissions V2 target

Canonical model:
`Page + Action + Location Scope`

- Admin controls who receives AI access and all other privileged capabilities.
- Ready-made roles may seed permissions, but per-user additions/removals remain possible.
- Examples of action-level permissions: View, Create, Edit Draft, Approve, Receive, Cancel, Return, View Cost, Correct Historical Transaction.
- Location scope can restrict the same action to selected branches/warehouses.
- AI permissions never exceed the effective permissions granted to the human user plus explicit AI capability grants.

### Integrations foundation target

Create a generic Integrations framework rather than hard-coding providers.

Online Order Connectors:
- Sharawla Website;
- Talabat / Hurry Up / Custom only when official integration material is available.

Loyalty & Rewards Connectors:
- future Sharawla Loyalty;
- external providers such as telecom/bank/reward programs when the merchant has official API/credentials.

Generic external rewards lifecycle:
Identify Customer → Request OTP/Redemption → Verify → Redeem → Provider Reference → Settlement → Reversal/Refund.

External-provider OTP must be issued/verified by the provider, not fabricated by Sharawla.

### Sharawla Customer Support target

Create a platform-level Customer Support experience, separate from the operational AI assistant:
- Support Chat;
- real Support Ticket/session ID;
- Device Diagnostics / safe Support Snapshot;
- Knowledge Base;
- Human Escalation;
- Support History;
- Support Plans / Entitlements / Usage;
- Support Admin Dashboard.

The customer-facing experience may be branded as Sharawla Customer Support / Sharawla Support Assistant, but must not falsely claim a human agent is present when only AI is responding.
The architecture must allow future Basic/Premium/Paid Support plans without rebuilding the support workflow.

### Sharawla AI Operator target

Platform-level feature, **disabled by default** and grantable by Admin to selected users.

Target capability levels:
Read → Create → Modify → Approve → Historical Correction.

Rules:
- AI authority = effective user permissions + explicit AI grants + location scope.
- No unrestricted/free-form SQL or direct arbitrary database mutation.
- Use a controlled **Sharawla Actions Layer** with validated business actions, permission checks, impact analysis where needed, confirmation policy, idempotency, and audit.
- Historical correction may update the operational current state and dependent inventory/reporting consistently, while preserving a protected internal audit trail.
- Ordinary operational screens may show the corrected state; audit history must not be destructively erased.
- Critical security/device identity operations remain outside autonomous AI authority unless a separately reviewed contract explicitly allows them.

### Mobile / Tablet — deferred post-Core stabilization

- Do not convert the Electron Windows app directly into an APK.
- Future Sharawla Mobile/Tablet is a separate client sharing Cloud, Business/Location, Users/Permissions, APIs/RPCs and Actions.
- Mobile can start Online-first for dashboards, reports, approvals, inventory, purchasing, orders and delivery.
- Full offline Tablet POS requires a dedicated Mobile Offline Store + Outbox/Inbox compatible with Point 4 identity/idempotency.

## CURRENT EXACT NEXT STEP — 2026-09-23

1. **Do not promote Stable yet.**
2. Resolve the Beta58 discrepancy first: prove what packaged/runtime code actually owns the Orders screen on SH-0007 and why the new date-range UI is absent.
3. Include the legacy 300-Order Runtime Recovery prefetch in the performance investigation.
4. After Beta58 Orders is proven/fixed, implement a single Unified Navigation Registry and close missing/broken routes.
5. Build the dedicated Online Orders operational route/inbox.
6. Reorganize menus according to the approved product map without deleting existing working functionality.
7. Implement Permissions V2: Page + Action + Location.
8. Formalize Location/Central Warehouse operational workflow.
9. Apply bounded-query/date-window/pagination performance rules to the other heavy screens.
10. Add Integrations Foundation.
11. Add Sharawla Customer Support foundation.
12. Add Sharawla Actions Layer, then Sharawla AI Operator.
13. Run Full UI Navigation Acceptance + Full Sandbox/Regression on SH-0007.
14. Only after accepted Beta evidence discuss Stable promotion.

No item in this target map authorizes a Production write.


---

## 2026-09-24 CURRENT OVERRIDE — Navigation Registry 1F Runtime Gate

> This section supersedes the 2026-09-23 Beta58 / Unified Navigation next-step text where it conflicts. Preserve older sections as historical evidence.

### Safety boundary

- Top Burger Production remains **READ-ONLY / UNTOUCHED**: SH-0005 + SH-0006 on **10.5.3 CLEAN**.
- Current runtime acceptance target is **SH-0007 only**.
- Canonical Stock = **OFF**. Cutover = **OFF**.
- No automatic rebind and no Canonical Fingerprint mutation.

### Orders V58.3 — CLOSED / ACCEPTED

- The Beta58 Orders discrepancy is resolved and must not be reopened without contradictory regression evidence.
- Packaged source was present in app.asar, but runtime ownership investigation proved the old Beta43 layer could execute renderOrders43(). Renderer ownership was corrected and protected by regression/packaged-ownership guards.
- SH-0007 runtime acceptance passed for the V58.3 marker, date controls, Search, Today, Pagination and Details.
- Orders V58.3 is **LOCKED_ACCEPTED_OWNER** during Navigation Registry work.

### Unified Navigation Registry V1 — current status

- **1A Static Shadow Inventory: CLOSED / PASS.** 39 routes; shadow-only.
- **1B Dynamic Navigation Adapters: CLOSED / PASS.** Adapters cover current data-page, Beta54, Central Warehouse supply, HR group and Website Hub entry types; Actions remain non-routes.
- **1C Ownership & Conflict Detection: CLOSED / PASS.** Runtime Source Graph / ownership evidence is enforced; undeclared ownership conflicts fail the contract.
- **1D Shadow Runtime Audit / Pre-Bind work: CLOSED through its accepted gates.** Observation/non-interference boundaries preserved.
- **1E Coverage Gate: CLOSED / PASS.**
- **1F Fail-Closed Source + Packaging: PASS; final SH-0007 Runtime Acceptance remains OPEN.**

Preserved classifications:
- Orders = **LOCKED_ACCEPTED_OWNER / V58.3**.
- suppliers / purchasing / stockCount / transfers = **CONFLICT_BLOCKED**; no canonical owner is selected implicitly.
- websitePayments = **DEFERRED_FIX / KNOWN_PERMISSION_MISMATCH**.
- Unknown route policy in the 1F candidate = **BLOCK**, never fallback to POS/Home/business renderer.

### 1F accepted candidate for SH-0007-only runtime gate

- Candidate commit: `54c5daa0cb475d708424c9ff959e9df184a98e5e`.
- GitHub Actions Artifact ID: `10782640143`.
- Artifact label: Navigation 1F Fail-Closed V2.
- SHA256: `270b7ce4234c29f08e1deb9430ff4a4c3f083ad8f27282c42e`.
- Source/packaging checks: **PASS** from 1A through 1F.
- Packaged-installer inspection confirmed the old POS unknown-route fallback is absent.
- This candidate is approved only for installation/runtime acceptance on **SH-0007**. It is not approved for SH-0005/SH-0006 or Stable promotion.

## CURRENT EXACT NEXT STEP — 2026-09-24

1. Install the approved Navigation 1F Fail-Closed V2 artifact on **SH-0007 only**.
2. Confirm Sharawla opens normally; do not broaden testing before that startup check.
3. Run exactly one final unknown-route runtime acceptance: request a fake/unknown route while observing the current screen.
4. PASS requires all of the following together: current screen remains unchanged; POS does not open; Home does not open; no business renderer fallback occurs; runtime records `UNKNOWN_ROUTE_BLOCKED`.
5. If PASS, close **1F = CLOSED / PASS** and therefore **Navigation Registry 1A → 1F = CLOSED / PASS**.
6. If FAIL, preserve evidence and remain in 1F; do not proceed to later Product Map implementation.
7. After 1F closure, refresh this Master checkpoint before starting the next Product Map phase.
8. **Do not promote Stable yet.** Production remains untouched/read-only.

No statement in this override authorizes a Production write.


---

## 2026-09-24 CURRENT OVERRIDE — Navigation Registry 1F CLOSED / PASS

> This section supersedes the earlier 2026-09-24 1F Runtime Gate next-step text where it conflicts. Preserve older sections as historical evidence.

### Runtime acceptance evidence — SH-0007 only

- Navigation 1F branch-selection regression root cause was proven at runtime: `navActive('home')` raised `TypeError: $(...).forEach is not a function` from `app.js`.
- Corrective integration commit: `f6ed9f7ce96c4d0959f3763fdb6e4fd2d5eb692d` on `beta56-offline-ownership-consolidation`.
- Corrective source restores `$$('#nav button').forEach(...)` and adds a targeted 1F regression guard against the single-element `$().forEach` failure.
- SH-0007 branch selection was re-tested after the correction and reported working normally.
- Final unknown-route runtime test used `showPage('__sharawla_unknown_route_test__')` and recorded `UNKNOWN_ROUTE_BLOCKED` for profile `restaurant` at `2026-09-24T00:37:01.325Z`.
- No POS/Home/business-renderer fallback was accepted as part of this gate.

### Official closure

- **Navigation Registry 1F Runtime Acceptance: CLOSED / PASS.**
- **Unified Navigation Registry 1A → 1F: CLOSED / PASS.**
- Orders V58.3 remains **CLOSED / LOCKED_ACCEPTED_OWNER**.
- suppliers / purchasing / stockCount / transfers remain **CONFLICT_BLOCKED**; this closure does not choose owners for them.
- websitePayments remains **DEFERRED_FIX / KNOWN_PERMISSION_MISMATCH**.
- Point 4 / Offline ownership rules are unchanged. The preserved unresolved legacy offline evidence is not deleted or reset by this closure.
- Production remains **READ-ONLY / UNTOUCHED**: SH-0005 + SH-0006 on 10.5.3 CLEAN.
- Canonical Stock = **OFF**. Cutover = **OFF**.

## CURRENT EXACT NEXT STEP — AFTER NAVIGATION 1F CLOSURE

1. Do **not** promote Stable yet.
2. Start the next Product Map phase from the accepted Unified Navigation Registry baseline.
3. First implementation target: create the dedicated **Online Orders operational route/inbox**, extracting website-order operations from Delivery while preserving the Unified Order Engine and existing business behavior.
4. Keep Delivery as the physical delivery workflow; Online Orders owns source/channel intake and pre-acceptance lifecycle.
5. Preserve Orders V58.3, Offline/Point 4, printing, licensing, device identity, updater, and all Production behavior.
6. Do not resolve Purchasing ownership or websitePayments permission mismatch implicitly during the Online Orders phase; keep those explicit blockers/deferred items until their dedicated evidence/fix phases.
7. After source implementation, run registry/permission/profile-leakage regression gates before any SH-0007 build.

No statement in this override authorizes a Production write or Stable promotion.


---

## 2026-09-24 CURRENT OVERRIDE — Online Orders + Delivery Runtime Closure

> This section supersedes the earlier post-Navigation-1F next-step text where it conflicts. Preserve earlier sections as historical evidence.

### Safety boundary

- Top Burger Production remains **READ-ONLY / UNTOUCHED**: SH-0005 + SH-0006 on **10.5.3 CLEAN**.
- Current acceptance target remains **SH-0007 / isolated Beta only**.
- Canonical Stock = **OFF**. Cutover = **OFF**.
- No automatic rebind and no Canonical Fingerprint mutation.

### Online Orders / Delivery closure

- Dedicated **Online Orders** route/inbox is implemented and no longer owned by Delivery intake.
- Online Orders owns source/channel intake and pre-acceptance lifecycle; accepted orders enter the normal Sharawla Order Engine.
- Delivery remains the physical fulfillment workflow after acceptance.
- Server-side date/window/pagination and bounded Orders behavior remain preserved.
- Delivery final payment is resolved at delivery completion; Cash creates driver custody and Wallet/Instapay create zero Cash custody.
- Driver Custody / Settlement V2 is the accepted settlement owner.
- Settlement state rebuilds after navigation and one settlement does not settle unrelated orders.
- Shift close now fails closed while source-shift driver Cash custody remains unsettled.
- Both `close_pos_shift_v2` and the preserved Legacy `close_pos_shift_idempotent` are protected against pending custody bypass.
- After settlement, shift close succeeds normally.
- Cashier layout regression introduced during Beta58.9 was corrected and the Top Burger-style cart ownership/proportions are accepted again.
- Accepted SH-0007 runtime candidate: **10.5.4-beta.58.14**.
- Source HEAD at closure: `2ff0cb005407500430d2b9c1d262c88ef71f2c2e`.
- Beta58.14 build: **SUCCESS**.
- Operational Beta evidence:
  - POS Delivery Cash settlement and post-settlement shift close: **PASS**.
  - Website-source synthetic acceptance order `website_orders.id=2` was accepted into normal `orders.id=124`, `source=website`, Delivery, delivered, final payment Wallet, Cash custody `0.00`: **PASS**.
- No real public Website frontend is required for this runtime gate; the synthetic order was created through the existing Beta Website-order RPC to exercise the same operational intake path.
- **Online Orders + Delivery + Driver Settlement + Shift Cash Integration = CLOSED / PASS.**

Do not reopen this area without contradictory runtime evidence.

## CURRENT EXACT NEXT STEP — AFTER ONLINE ORDERS / DELIVERY CLOSURE

1. Do **not** promote Stable yet.
2. Continue the approved Product Map phase from the accepted Unified Navigation Registry baseline.
3. First implementation target: reorganize the existing sidebar into the approved Product Map groups without deleting or changing working routes.
4. Preserve every current route owner, permission check, profile rule, and click/dispatch mechanism.
5. Product Map grouping is presentation/navigation organization only; it must not resolve `suppliers / purchasing / stockCount / transfers` ownership conflicts implicitly.
6. Keep `websitePayments` as the existing deferred permission mismatch; do not silently repair it in this phase.
7. Orders V58.3, Online Orders closure, Delivery/Settlement V2, Offline/Point 4, printing, licensing, updater, device identity and Production behavior remain locked.
8. Add a static regression gate before any SH-0007 build.
9. Only after source/static PASS may a SH-0007-only candidate be built for visual/navigation acceptance.

No statement in this override authorizes a Production write or Stable promotion.


---

## 2026-09-24 CURRENT OVERRIDE — Product Map Navigation Phase 1

> This section supersedes the previous post-Online-Orders next step where it conflicts.

### Safety boundary

- Top Burger Production remains **READ-ONLY / UNTOUCHED**: SH-0005 + SH-0006 on **10.5.3 CLEAN**.
- Runtime acceptance target remains **SH-0007 only**.
- Canonical Stock = **OFF**. Cutover = **OFF**.
- No automatic rebind and no Canonical Fingerprint mutation.

### Phase 1 implementation status

- Product Map Navigation Phase 1 is **SOURCE + PACKAGING PASS / RUNTIME VISUAL ACCEPTANCE OPEN**.
- Candidate version: **10.5.4-beta.58.15**.
- Runtime implementation commit: `fedd5fecf2021d5ad4af84df8ba36ae75d375100`.
- Packaged verification correction commits:
  - `9be32cb32788cbd40f655a9038f776c7ee02e2b3` — first packaged verification attempt; rejected because source checker scripts are intentionally not shipped inside app.asar.
  - `84600ab70f3e3bd6583ff143f5be9bf7812153d8` — corrected packaged verification against runtime files directly.
- Final accepted source HEAD for runtime gate: `84600ab70f3e3bd6583ff143f5be9bf7812153d8`.
- GitHub Actions run: `35974574403` → **SUCCESS**.
- Artifact ID: `10797222851`.
- Artifact name: `sharawla-pos-84600ab70f3e3bd6583ff143f5be9bf7812153d8-sh0007-x64`.
- Artifact digest: `sha256:68f76d9420440997349ff799027991afc1b22babd4d4b01d04461dffd9c2d9a3`.

### Preserved invariants

- The Product Map layer is presentation-only and owns no route click/dispatch behavior.
- It calls no `showPage`, RPC, REST or business renderer.
- Existing buttons/route units remain the same runtime nodes; the layer only reorders top-level navigation units and inserts non-interactive group labels.
- The accepted Unified Navigation Registry is loaded at runtime as read-only metadata before Product Map grouping.
- Existing route owners, permissions, profile rules and dispatch mechanisms are unchanged.
- Orders V58.3 remains locked.
- Online Orders + Delivery + Driver Settlement + Shift Cash closure remains locked.
- `suppliers / purchasing / stockCount / transfers` remain explicit ownership-conflict items; Phase 1 does not choose owners for them.
- `websitePayments` remains the known deferred permission mismatch.
- HR grouped navigation units are preserved.
- Product Map grouping is idempotent and fails closed if the Navigation Registry metadata is unavailable.
- Packaged `app.asar` verification proves the Product Map runtime, Navigation Registry metadata, versioned `index.html` references and load order are present in the actual installer payload.

## CURRENT EXACT NEXT STEP — PRODUCT MAP PHASE 1 RUNTIME GATE

1. Install **10.5.4-beta.58.15** on **SH-0007 only**.
2. Confirm Sharawla starts and login/branch selection still work normally.
3. Open the sidebar after all dynamic navigation layers finish loading.
4. PASS requires visible Product Map grouping with the existing routes preserved under:
   - Sales;
   - Operations;
   - Inventory & Purchasing;
   - HR;
   - Finance;
   - Reports;
   - Website / Digital Channels;
   - Administration / Settings.
5. Click representative existing routes from the groups and confirm each still opens its existing screen through its existing owner. At minimum: POS, Orders, Online Orders, Delivery, Inventory, Employees if visible, Treasury if visible, Reports, Website Management if visible, Settings.
6. Confirm sidebar scrolling still works and no route/button disappears merely because of grouping.
7. Confirm Orders keeps the accepted V58.3 UI and Online Orders/Delivery keep the accepted Beta58.14 behavior.
8. If PASS, close Product Map Navigation Phase 1 and continue to the next Product Map implementation phase.
9. If FAIL, preserve the exact visual/runtime evidence and remain in Phase 1; do not promote Stable.
10. Production remains untouched/read-only.

No statement in this override authorizes a Production write or Stable promotion.


---

## 2026-09-24 CURRENT OVERRIDE — Approved 11-Section Product Map Runtime Gate

> This section supersedes the earlier Product Map Phase 1 runtime-gate text where it conflicts. Preserve older sections as historical evidence.

### Safety boundary

- Top Burger Production remains **READ-ONLY / UNTOUCHED**: SH-0005 + SH-0006 on **10.5.3 CLEAN**.
- Runtime acceptance target remains **SH-0007 only**.
- Canonical Stock = **OFF**. Cutover = **OFF**.
- No automatic rebind and no Canonical Fingerprint mutation.
- Orders V58.3, Online Orders + Delivery + Driver Settlement + Shift Cash closure, Offline/Point 4, printing, licensing, updater and device identity remain locked.

### Authoritative Product Map reference

The approved Restaurant Product Map reference is now the following 11-section structure:

1. الرئيسية
2. المبيعات
3. الطلبات الأونلاين
4. تشغيل المطعم
5. المخزون والمشتريات
6. الموظفون
7. المالية
8. التقارير
9. إدارة الموقع
10. التكاملات
11. الإدارة والإعدادات

Architecture remains **Sharawla Core + Activity Profiles**. The Product Map layer is presentation/navigation organization only and must not own route dispatch, business renderers, RPC/REST behavior, permissions, or operational logic.

Important Product Map behavior:
- Online Orders is a dedicated source/channel intake and pre-acceptance section.
- Delivery stays under Restaurant Operations as the physical fulfillment workflow.
- Food Production/Waste belongs under Inventory & Purchasing in the Restaurant Product Map.
- Integrations is a reserved section until an approved Integrations route exists; Product Map must not invent a fake route/button merely to display an empty section.
- Product-operation labels are profile-aware through authoritative Runtime Config. Restaurant shows **تشغيل المطعم**; Retail/Pharmacy and other profiles must not inherit Restaurant wording.
- Existing route owners, page permissions, location modes, profile rules and click/dispatch mechanisms remain unchanged.
- `suppliers / purchasing / stockCount / transfers` remain explicit ownership-conflict items and are not resolved by this grouping phase.
- `websitePayments` remains the known deferred permission mismatch.

### Source + Packaging status

- Candidate version: **10.5.4-beta.58.17**.
- Initial 11-section mapping commit: `b43a320def40ddf789c4896956320b812cf814b8`.
- Profile-aware correction commit: `f9aa1948c1ddd267d0600f61a11d73978e87fdb6`.
- Packaged-verification correction commit / accepted candidate HEAD: `ec6ce3793e0bebc9183e78da5860c388d3af2686`.
- Candidate validation: **PASS**.
- Windows x64 build: **PASS**.
- Packaged app.asar verification: **PASS**.
- GitHub Actions run: `36028923277` → **SUCCESS**.
- Artifact ID: `10821037575`.
- Artifact name: `sharawla-pos-ec6ce3793e0bebc9183e78da5860c388d3af2686-sh0007-x64`.
- Artifact digest: `sha256:b9406db28ab65f575fcdfbb62e85024f82478f1bd319d62bf25a10575cdff390`.
- 58.15 is superseded and must not be used for Product Map runtime acceptance.
- 58.16 was an intermediate source candidate and is superseded by the profile-aware 58.17 candidate.

### CURRENT EXACT NEXT STEP — 58.17 Product Map Runtime Acceptance

1. Install **10.5.4-beta.58.17** on **SH-0007 only**.
2. Confirm Sharawla starts normally; login and branch selection must remain normal.
3. Open the sidebar after dynamic navigation layers finish loading.
4. For the Restaurant profile, confirm the visible Product Map organization follows the approved reference where implemented/available:
   - الرئيسية;
   - المبيعات;
   - الطلبات الأونلاين;
   - تشغيل المطعم;
   - المخزون والمشتريات;
   - الموظفون;
   - المالية;
   - التقارير;
   - إدارة الموقع;
   - الإدارة والإعدادات.
   The Integrations section may remain absent until an approved Integrations route exists; absence alone is not a failure.
5. Click representative existing routes and confirm each still opens through its existing owner. At minimum: POS, Orders, Online Orders, Delivery, Inventory, Employees if visible, Treasury if visible, Reports, Website Management if visible, Settings.
6. Confirm sidebar scrolling works and no existing route/button disappears merely because of grouping.
7. Confirm Orders retains V58.3 and Online Orders/Delivery retain the accepted Beta58.14 behavior.
8. PASS closes this Product Map runtime gate and allows the roadmap to advance to **Permissions V2: Page + Action + Location**, followed by the dedicated permission-mismatch fix.
9. FAIL preserves exact evidence and remains in this gate. Do not promote Stable.
10. Production remains untouched/read-only.

No statement in this override authorizes a Production write or Stable promotion.


---

## 2026-09-24 HARD ARCHITECTURE RULE — Multi-Industry by Design

This rule applies to all future Sharawla source, UI, navigation, permissions, reporting, integrations, support and AI work.

### Core principle

Sharawla is one **Multi-Industry Platform**, not a Restaurant application with later patches for other activities.

Every new feature must be classified before implementation as either:

- **Sharawla Core** — shared platform capability; or
- **Profile-specific capability** — owned by one or more Activity Profiles through explicit profile contracts.

Do not build a Restaurant-only implementation first and attempt to generalize it later when the capability is fundamentally shared.

### Required supported profile direction

The architecture must remain compatible with at least:

- Restaurant / Cafe
- Retail / Market
- Logistics / Shipping Company
- Membership / Gym
- Warehouse / Central Warehouse

Additional profiles such as Pharmacy and Service/Maintenance continue to use the same Core + Profile model.

### Shared Core direction

Shared Core includes, where applicable:

- Customers
- Employees / Users separation
- Users / Roles / Permissions
- Page + Action + Location authorization
- Locations
- Inventory foundation
- Purchasing foundation
- Finance / Treasury / Expenses / Shifts
- Reports
- Offline / Sync
- Integrations foundation
- Customer Support platform
- Sharawla Actions API
- Sharawla AI Operator
- Device / update / printing / licensing foundations

### Profile-specific examples

- Restaurant / Cafe: Kitchen, Delivery, Pickup, Tables, Recipes, Food Cost, Production/Waste.
- Retail / Market: Variants, Barcode, Weighted Items, Retail Offers, Retail stock workflows.
- Logistics / Shipping: Shipments, Waybills, Tracking, Zones, Drivers, Client Settlements, Returns.
- Membership / Gym: Members, Plans, Renewals, Freezes, Check-ins, Classes, Bookings.
- Warehouse: Location stock, receiving, transfers, supply requests, central warehouse operations.
- Pharmacy: medication catalog/batches/expiry/prescriptions/insurance profile features.

### Mandatory implementation checks

Before accepting any new feature, route, screen or action:

1. Identify whether it is Core or Profile-specific.
2. Use authoritative Runtime Config / profile metadata; do not guess the profile.
3. Avoid hard-coded Restaurant labels or behavior in shared Core.
4. Shared navigation labels must be profile-aware where wording differs by activity.
5. One route must have one known owner, one renderer/dispatch path, and an explicit permission boundary.
6. Permissions must be designed for future **Page + Action + Location** scope.
7. Reports and Actions must preserve profile boundaries and location scope.
8. Integrations, Support and AI must act through controlled contracts/APIs rather than activity-specific shortcuts.
9. Offline identity/idempotency and Point 4 ownership rules remain shared architectural invariants.
10. A profile-specific implementation must not leak into unrelated profiles; profile-leakage regression checks are required before acceptance.

### Product Map consequence

The approved Product Map is a profile-aware framework, not a Restaurant-only fixed menu.

For example, the same profile-operations section may display:
- Restaurant: تشغيل المطعم
- Retail: تشغيل المتجر
- Pharmacy: تشغيل الصيدلية
- Logistics: تشغيل اللوجستيات
- Membership/Gym: تشغيل العضويات
- Warehouse: تشغيل المخزن
- Service: تشغيل الخدمات

Profile-specific sections/routes appear only when the authoritative profile/capability/permission model allows them.

This rule does not authorize any Production write, Canonical Stock activation, Cutover, or Stable promotion.


---

## 2026-09-24 CURRENT OVERRIDE — Core Inventory Overview V1

> This section supersedes the legacy Restaurant-only `renderInventory()` ownership where it conflicts. Older text remains historical evidence.

### Reason for change

The legacy Core `inventory` route was not actually a Core overview:
- Retail was special-cased into `renderRetailInventory()`.
- Every non-Retail profile fell through to Restaurant `ingredient_stock` and displayed **مخزون الخامات**.
- This duplicated the Restaurant **الخامات** page and leaked Restaurant behavior into Pharmacy/Warehouse/other profiles.

### Accepted architecture

`inventory` is now a **Core, profile-aware, read-only Inventory Overview**.

Detailed stock-management owners remain separate:
- Restaurant/Cafe detailed raw-material management remains **الخامات**.
- Retail detailed balance/policy/movement management remains the existing Retail inventory detail renderer.
- Pharmacy detailed stock remains Batch/Expiry workflows.
- Warehouse operational center remains its existing owner.
- Unsupported profiles do **not** fall back to Restaurant. They fail closed unless Inventory is explicitly supported.

### Current adapters

- Restaurant / Cafe → ingredient summary, low/zero stock, approximate value, alerts; no duplicate raw-material management table.
- Retail / Market → product/variant stock summary plus preserved access to the existing detailed Retail balance/policy screen.
- Warehouse → stock summary using current warehouse-compatible Retail stock foundations.
- Pharmacy → batch/expiry/reorder summary.
- Logistics / Membership / Service and any other profile → fail closed if no approved Inventory adapter exists.

### Safety

- Overview module performs **no mutation RPCs**.
- No DB migration.
- No Canonical Stock activation.
- No Cutover.
- No Point 4 ownership change.
- Existing detail owners and permission boundaries are preserved.
- Production SH-0005 / SH-0006 remain untouched on 10.5.3 CLEAN.

### Source / Packaging status

- Candidate version: **10.5.4-beta.58.18**.
- Source commit: `027942db6695c9e37fbf0115c76cac7e3bef93a0`.
- GitHub Actions run: `36034071355` → **SUCCESS**.
- Candidate validation: **PASS**.
- Windows x64 build: **PASS**.
- Packaged app.asar Inventory Overview verification: **PASS**.
- Artifact ID: `10823853612`.
- Artifact name: `sharawla-pos-027942db6695c9e37fbf0115c76cac7e3bef93a0-sh0007-x64`.
- Artifact digest: `sha256:f25a93b6664f316c5a255da3dccbbef97cfeee5fff461e8482fa24770dbca144`.

### CURRENT EXACT NEXT STEP — SH-0007 Inventory Runtime Acceptance

Install **10.5.4-beta.58.18** on **SH-0007 only**, then open **المخزون**.

For Restaurant profile verify:
1. The page title/contents are **نظرة عامة على المخزون**, not the old duplicate **مخزون الخامات** table.
2. KPI cards load without error.
3. Low/zero-stock alerts load.
4. **إدارة الخامات** opens the existing **الخامات** owner.
5. **الجرد** and **التحويلات** still open their existing owners when visible.
6. No stock quantity changes merely from opening the Overview.
7. Navigation back to other accepted routes still works.

PASS closes the first Menu/Function Cleanup item and moves the audit to:
**Customers manual create + POS order-type capability gating + Settings/Delivery Settings split planning + ownership unification for Suppliers/Purchasing/StockCount/Transfers.**

No Stable promotion is authorized by this checkpoint.


---

## 2026-09-24 CURRENT OVERRIDE — Cleanup Progress + Kitchen Stations Planned Capability

> This section supersedes earlier exact-next-step text where it conflicts. Older sections remain historical evidence.

### Safety boundary

- Top Burger Production remains **READ-ONLY / UNTOUCHED**: SH-0005 + SH-0006 on **10.5.3 CLEAN**.
- All current runtime work remains **SH-0007 Beta only**.
- Canonical Stock = **OFF**. Cutover = **OFF**.
- No automatic Rebind and no Canonical Fingerprint mutation.
- Printing, updater, licensing, Offline/Point 4 and accepted Orders/Delivery runtime owners remain protected.

### Cleanup progress

- **58.18** — Core Profile-Aware Inventory Overview V1.
- **58.19** — Manual Customer creation + Touch UX V1 + Acceptance fixture aligned with Point 4 Identity V1.
- **58.20** — Explicit POS Profile Routing + Pickup capability/lifecycle gating.
- **58.21** — Touch-Friendly Settings Hub V1.

### Kitchen terminology cleanup

Kitchen intentionally has separate gates:
- Page permission: **الوصول إلى شاشة المطبخ**.
- Operational setting: **تفعيل تشغيل المطبخ**.

Do not collapse these gates; they answer different questions.

### Planned optional commercial capability — Kitchen Stations

Feature code: `food.kitchen_stations`

Commercial / entitlement rule:
- **Sharawla Admin entitlement** is authoritative.
- **Restaurant / Cafe only** in the first implementation.
- A Business or Branch cannot self-enable this feature if Sharawla Admin has not entitled it.
- Entitlement OFF preserves current single-Kitchen + single-preparation-receipt behavior.
- Entitlement ON allows an authorized Business admin to configure branch-level Stations.

Target architecture:

`Order → Lines → Station Routing → Kitchen Screen / Prep Printer → Station Completion → Order Ready`

Station examples:
- شاورما
- بيتزا
- مكرونة
- مشروبات
- حلويات
- Master / Expo

Required V1 contracts:
1. Station definitions are scoped by Location/Branch.
2. Category may provide the default Station.
3. Product may override the Category Station.
4. One item line may route to one or more approved Stations only through an explicit routing contract.
5. Every Station receives the same Order/Bon identity while seeing only its assigned preparation lines.
6. Item notes, modifiers and removals stay attached to the routed line.
7. Station states are independent: New → Preparing → Ready.
8. The Order cannot become Ready until all required Stations are Ready.
9. Unmapped lines fail visibly into an **Unassigned** queue and are never silently dropped.
10. Optional **Master / Expo** may receive the complete order for final assembly.
11. Station output mode may be Screen only / Printer only / Screen + Printer.
12. Printer selection uses a logical **Printer Role** per Station, with the Windows device name bound locally on the device.
13. Touch UI is mandatory for Station screens: large cards and large action targets.
14. Permissions and Location Scope apply to Station management and Station operation.
15. Existing single-Kitchen behavior is compatibility behavior only when entitlement is OFF.

### Implementation order for Kitchen Stations

Kitchen Stations does **not** begin as runtime implementation yet.

Required prerequisites:
1. Menu/Function cleanup closure.
2. Permissions V2 — Page + Action + Location.
3. Locations + Device/Printer Role foundation.
4. Sharawla Admin entitlement wiring for `food.kitchen_stations`.
5. Kitchen Stations V1 source → static gates → SH-0007 acceptance.

### 58.22 scope

58.22 is a small cleanup candidate only:
- clarify Kitchen permission vs operational-enable labels;
- record the Kitchen Stations commercial-capability contract;
- no DB migration;
- no Kitchen Stations runtime implementation;
- no printing behavior change.

### CURRENT EXACT NEXT STEP AFTER 58.22

Continue Menu/Function cleanup with the four still-conflicted shared inventory/purchasing routes:
- `suppliers`
- `purchasing`
- `stockCount`
- `transfers`

Goal: define one Core owner per shared workflow with profile adapters, without changing business rules and without activating Canonical Stock/Cutover.

After those ownership conflicts are resolved and runtime-accepted, advance to **Permissions V2: Page + Action + Location**.

No statement in this override authorizes a Production write or Stable promotion.


---

## 2026-09-24 CURRENT OVERRIDE — Shared Inventory/Purchasing Route Ownership V1

> Supersedes the prior ownership-conflict status for suppliers / purchasing / stockCount / transfers.

Candidate **10.5.4-beta.58.23** consolidates route ownership only.

### One Core route owner

The shared route keys:
- suppliers
- purchasing
- stockCount
- transfers

are now dispatched by:

`app.js → renderSharedInventoryPurchasingRoute(route)`

### Profile adapters

- Restaurant → existing Beta55 Restaurant Closure business renderers.
- Retail → existing Retail business renderers in app.js.
- Other profiles → **Fail-Closed** until a dedicated approved adapter exists.

No profile may silently fall back to Restaurant or Retail.

### Preserved behavior

This change does not alter:
- Restaurant Food supplier/purchase/count/transfer RPCs.
- Retail supplier/purchase/count/transfer RPCs.
- Advanced Purchasing business logic.
- Point 4, Canonical Stock or Cutover.
- Offline ownership.
- Printing, licensing, updater or Production devices.

`advanced-purchasing-v1.js` remains a Retail-only augmentation, not a route owner.
`beta55-ui-workflow-fixes.js` remains an action/workspace augmentation, not a route owner.

### Registry closure

For all four routes:
- profile = core
- renderer owner = app.js
- navigation owner = app.js
- dispatch = Core showPage → profile adapter
- conflictStatus = NONE
- migrationStatus = REGISTERED_SHADOW

### Runtime acceptance gate

On SH-0007 Restaurant, verify:
1. Suppliers opens the existing Restaurant suppliers screen.
2. Purchasing opens the existing Restaurant raw-material purchasing screen.
3. Stock Count opens the existing Restaurant raw-material count screen.
4. Transfers opens the existing Restaurant raw-material transfer screen.
5. No Retail tables/wording leak into Restaurant.
6. Product Map, Touch UX, Inventory Overview and Settings Hub remain normal.

A later Retail acceptance must confirm the same route keys reach the existing Retail adapters.

### NEXT PHASE AFTER RUNTIME PASS

After this route-ownership gate passes, Menu/Function Cleanup is structurally closed enough to begin:

**Permissions V2 — Page + Action + Location**

Kitchen Stations remains planned behind its prerequisite sequence.

Production SH-0005 / SH-0006 remain untouched/read-only.


---

## 2026-09-24 CURRENT OVERRIDE — Beta58.25 Point4 Secure UUID Runtime Fix

### Trigger evidence

SH-0007 Full Acceptance on **10.5.4-beta.58.22** had one automated failure:
`beta55.restaurant-full-roundtrip — POINT4_IDENTITY_UUID_V4_REQUIRED`.

Read-only inspection of Beta DB function bodies showed Restaurant sale/return SQL does not emit that code. Source inspection located the code in the renderer Point 4 UUID helper: native `crypto.randomUUID()` was preferred, but the old fallback used generic timestamp/Math.random text, which Point 4 correctly rejected as non-UUID-v4.

### 58.25 correction

- Adds one shared Point 4 UUID provider: `point4-uuid-v4.js`.
- Native path: `crypto.randomUUID()`.
- Secure compatibility path: `crypto.getRandomValues()` with RFC4122 UUID-v4 version/variant bits.
- No Math.random fallback.
- No timestamp fallback.
- If secure Web Crypto is absent, identity remains fail-closed with `POINT4_IDENTITY_UUID_V4_REQUIRED`.
- POS sale/return identity and Restaurant Full Acceptance fixture share the same provider.
- Keeps 58.23 Shared Inventory/Purchasing Core Route Ownership and 58.24 Restaurant acceptance stage diagnostics intact.

### Safety

- No Supabase migration.
- No Point 4 guard weakening.
- No Canonical Stock/Cutover activation.
- No Production write.
- SH-0005 / SH-0006 remain untouched on 10.5.3 CLEAN.

### Runtime gate

Install 58.25 on SH-0007 only and rerun Full Acceptance.
If Restaurant Full Roundtrip still fails, 58.24 stage diagnostics must identify the exact stage in the error text.


---

## 2026-09-24 Beta58.26 — Restaurant Point4 Canonical TX Acceptance Corrective

- Preserves 58.23 Shared Inventory/Purchasing Core Route Ownership.
- Preserves 58.24 Restaurant Full Acceptance stage diagnostics.
- Preserves 58.25 secure Point4 UUID v4 provider.
- Root cause confirmed in Offline V2 Transport `assertPoint4Payload`:
  once canonical Point4 Identity V1 is present, `client_tx_id` must also be canonical UUIDv4.
- Historical Restaurant acceptance still used `ACC-...-B55R-SALE/RETURN` TX strings.
- 58.26 changes only Restaurant acceptance sale/return TX generation to the shared secure UUID v4 provider.
- Retry calls reuse the exact same UUID-bearing payloads.
- Beta-only acceptance cleanup is corrected to find UUID-TX Orders/Returns through the existing acceptance notes marker and order lineage.
- No business sale/return RPC replacement.
- No Point4 guard weakening.
- Canonical Stock OFF. Cutover OFF.
- Production SH-0005/SH-0006 untouched.
- Runtime target: Full Acceptance Restaurant roundtrip PASS and cleanup residue 0 on SH-0007.


---

## 2026-09-24 OFFICIAL CONTINUATION CHECKPOINT — Beta58.26 + Cleanup / Touch / Kitchen Stations

> This is the current authoritative continuation checkpoint. It supersedes earlier "CURRENT EXACT NEXT STEP" text where there is a conflict. Earlier sections remain historical evidence.

### 1. Hard safety boundary

- Top Burger Production remains **READ-ONLY / UNTOUCHED**:
  - SH-0005 — الدقي — 10.5.3 CLEAN.
  - SH-0006 — العشرين — 10.5.3 CLEAN.
- SH-0007 remains the isolated Beta device / Business "تجريبي" / Branch TEST.
- Beta operational backend remains the isolated SH-0007 backend.
- Canonical Stock = **OFF**.
- Cutover = **OFF**.
- No automatic Rebind.
- Canonical Fingerprint remains immutable.
- No Production Beta deployment is authorized.
- Printing / updater / licensing / Business Connection / Offline ownership / accepted Orders + Delivery owners remain protected unless a dedicated regression proves otherwise.

### 2. Hard architecture rule — Multi-Industry + Touch

Sharawla remains one **Multi-Industry Platform** using **Sharawla Core + Activity Profiles**.

Required profile direction remains:
- Restaurant / Cafe
- Retail / Market
- Pharmacy
- Logistics / Shipping
- Membership / Gym
- Warehouse
- Service / Maintenance

Shared Core must not silently fall back to Restaurant behavior.

**Touch is now a permanent UI requirement, not an optional polish pass.**

Every new operational screen must support:
- mouse and touch from the same UI;
- coarse-pointer friendly controls;
- large tap targets;
- inputs that do not require precision tapping;
- scrollable tables/cards;
- no hover-only critical action;
- large primary workflow actions;
- responsive behavior on compact displays.

Current Touch UX baseline introduced in 58.19 uses a minimum coarse-pointer target of approximately 46px and keeps ordinary desktop behavior unchanged when no coarse pointer is present.

### 3. Platform / Point 4 status that remains closed

- Production 10.5.3 CLEAN remains frozen.
- Point 4 ownership mapping = **61/61 CLOSED**.
- Direct = **40/40 CLOSED**.
- Transitive = **15/15 CLOSED**.
- Document / in-flight barriers = **6/6 CLOSED**.
- Historical ownership provenance remains closed unless contradictory evidence appears.
- 46 pre-cutover contracts remain Evidence Complete.
- Canonical Stock and Cutover remain OFF.
- Offline Native V2 remains the sole owner during takeover.
- Point 4 identity/idempotency invariants remain mandatory:
  - one client transaction identity;
  - one owner;
  - one durable store;
  - one sync owner;
  - one authoritative ACK.

### 4. Accepted operational closures preserved

Orders:
- V58.3 accepted owner remains locked.
- Today default / date range / search / pagination / server filtering remain preserved.

Online Orders:
- Dedicated operational intake route remains separate from Delivery and Website Settings.
- Accepted Website order enters Unified Order Engine only after acceptance.

Delivery / Settlement / Shift:
- Delivery settlement V2 accepted owner preserved.
- Final payment at completion preserved.
- Cash driver custody / Wallet + Instapay zero custody preserved.
- Shift close fails closed while cash custody is unsettled.
- 58.14 delivery + driver settlement + shift cash integration remains CLOSED / PASS.

Cashier layout:
- Restored and accepted; do not touch without regression evidence.

### 5. Product Map / Navigation status

Unified Navigation Registry 1A → 1F remains CLOSED / PASS.

Product Map remains profile-aware:
- Restaurant → تشغيل المطعم
- Retail → تشغيل المتجر
- Pharmacy → تشغيل الصيدلية
- Logistics → تشغيل اللوجستيات
- Membership → تشغيل العضويات
- Warehouse → تشغيل المخزن
- Service → تشغيل الخدمات

Unknown routes remain fail-closed / BLOCK rather than fallback.

Restaurant 11-section Product Map reference remains:
1. الرئيسية
2. المبيعات
3. الطلبات الأونلاين
4. تشغيل المطعم
5. المخزون والمشتريات
6. الموظفون
7. المالية
8. التقارير
9. إدارة الموقع
10. التكاملات
11. الإدارة والإعدادات

58.17 presentation was installed/observed on SH-0007. Full representative click-by-click Product Map runtime closure was not separately documented as a formal final gate, so do not rewrite history and claim a complete Product Map runtime closure beyond the evidence already recorded.

### 6. Menu / Function Cleanup progress — 58.18 → 58.23

#### 58.18 — Core Profile-Aware Inventory Overview V1

Status:
- Source gate: PASS.
- CI/package gate: PASS.
- SH-0007 runtime screenshot acceptance: **PASS**.

Result:
- Core `inventory` is now an Overview, not a Restaurant raw-material editor.
- Restaurant / Cafe show raw-material summary.
- Retail / Market use Retail adapters.
- Pharmacy uses batch/expiry summary.
- Warehouse uses current warehouse-compatible stock foundations.
- Unsupported profiles fail closed instead of falling back to Restaurant.
- Existing Restaurant `foodIngredients` remains detailed raw-material owner.
- No stock mutation occurs by opening Overview.

#### 58.19 — Customer + Touch UX V1

Status:
- Source / static / packaging gates: PASS.

Result:
- Manual **+ عميل جديد** added to Customers.
- Duplicate-phone guard preserved.
- Existing import / edit / addresses workflows preserved.
- Touch UX layer introduced for coarse pointers.
- Point 4 Restaurant acceptance fixture started Identity V1 alignment.

No Production impact.

#### 58.20 — Explicit POS Profile Routing + Pickup lifecycle

Status:
- Source / static / packaging gates: PASS.

Result:
- Restaurant → Restaurant POS.
- Retail → Retail POS.
- Pharmacy → Pharmacy POS.
- Non-POS profiles fail closed instead of opening Restaurant cashier.
- Pickup is capability-aware.
- Dine-in is availability / Tables aware.
- Pickup is no longer treated as an automatic completed-at-checkout shortcut where lifecycle requires active fulfillment.

#### 58.21 — Touch-Friendly Settings Hub V1

Status:
- Source / static / packaging gates: PASS.

Result:
- Long Settings page reorganized into focused, touch-friendly sections/tabs.
- Existing setting owners are preserved.
- Business / Printing / Financial / Features / Backup / Returns remain permission-aware.
- This is organization/presentation, not business-rule replacement.

#### 58.22 — Kitchen terminology + Kitchen Stations planning

Status:
- Source / static / packaging gates: PASS.

Kitchen labels are intentionally distinct:
- Permission: **الوصول إلى شاشة المطبخ**.
- Operational setting: **تفعيل تشغيل المطبخ**.

Do not collapse these; one is access, one is operational enablement.

#### 58.23 — Shared Inventory / Purchasing Core Route Ownership V1

Status:
- Source / static / packaging gates: PASS.
- Runtime route-click acceptance still needs explicit confirmation on SH-0007 after the current candidate is installed.

The four shared route keys now have one Core dispatcher:
- `suppliers`
- `purchasing`
- `stockCount`
- `transfers`

Profile adapters:
- Restaurant → existing Restaurant business renderers.
- Retail → existing Retail business renderers.
- Other profiles → fail closed until an approved adapter exists.

This closes the previous structural route-owner conflict in source. It does **not** change purchasing / stock business rules and does not activate Canonical Stock or Cutover.

### 7. Kitchen Stations — planned optional Commercial Capability

Kitchen Stations is officially planned as an **optional Sharawla Admin entitlement**, not a feature available to every Restaurant automatically.

Feature code:
`food.kitchen_stations`

Authority:
- Sharawla Admin entitlement is authoritative.
- Restaurant / Cafe only in V1.
- Business / Branch cannot self-enable the entitlement.
- When entitlement is OFF, existing single-Kitchen + single-preparation-receipt behavior remains compatible.
- When entitlement is ON, authorized Business admins may configure branch-level Stations.

Target flow:
`Order → Lines → Station Routing → Kitchen Screen / Prep Printer → Station Completion → Order Ready`

Examples:
- شاورما
- بيتزا
- مكرونة
- مشروبات
- حلويات
- Master / Expo

V1 requirements remain:
- Station scoped by Location / Branch.
- Category default Station.
- Product override.
- explicit line routing;
- notes / modifiers / removals stay with the routed line;
- New → Preparing → Ready per Station;
- whole order Ready only when all required Stations are Ready;
- unmapped line goes visibly to Unassigned, never silently dropped;
- optional Master / Expo;
- output = Screen / Printer / Screen + Printer;
- logical Printer Role mapped locally to the Windows printer;
- touch-first Station cards and actions;
- Action + Location permissions.

Kitchen Stations implementation prerequisites remain:
1. Menu / Function cleanup closure.
2. Permissions V2 — Page + Action + Location.
3. Locations + Device / Printer Role foundation.
4. Sharawla Admin entitlement wiring.
5. Kitchen Stations V1 source + static gates + SH-0007 runtime acceptance.

### 8. Full Acceptance issue discovered on 58.22

Observed SH-0007 Full Acceptance:

- Version: **10.5.4-beta.58.22**
- Profile: restaurant
- Level: full
- Mode: sandbox
- Coverage Score: **94.74%**
- Readiness: BLOCKED

Almost all automated gates passed.

The critical automated failure was:
`beta55.restaurant-full-roundtrip — POINT4_IDENTITY_UUID_V4_REQUIRED`

Other notable Full Acceptance states:
- Restaurant navigation parity: PASS.
- Sandbox lock: PASS.
- 7-profile engine contracts: PASS.
- Navigation smoke: PASS.
- Offline native health: PASS.
- Restaurant cleanup verify: PASS.
- Restaurant runtime contract: PASS.
- Delivery settlement / shift cash: PASS.
- Restaurant print order type: PASS.
- Offline migration compatibility: PASS.
- Permissions profile-role contracts: PASS.
- Current-session boundary: PASS.
- Recovery / backup / corruption / clock-sequence tests: PASS.
- `restaurant.sale-return` is SKIPPED because superseded by the isolated Restaurant full-roundtrip fixture.
- Enabled feature coverage remains MANUAL for uncovered features.
- True backend role impersonation remains MANUAL pending dedicated sandbox users.

Do not treat the MANUAL entries as automated PASS.

### 9. 58.24 → 58.26 Point 4 Acceptance corrective sequence

#### 58.24 — Restaurant Full Acceptance Stage Diagnostics

Added explicit stage labels to the full Restaurant roundtrip so the next failure reports the exact stage:
- fixture
- ingredients
- UOM
- opening-stock adjustment
- supplier
- purchase order
- purchase receive
- supplier return
- stock count
- transfer
- waste
- sale recipe
- prep recipe
- production
- tables open
- sale
- return
- tables close

Business runtime was not changed.

#### 58.25 — Secure Point 4 UUID V4 provider

Added shared `point4-uuid-v4.js`:
- primary path: `crypto.randomUUID()`;
- secure fallback: `crypto.getRandomValues()`;
- correct RFC4122 version-4 + variant bits;
- no `Math.random`;
- no timestamp pseudo-UUID fallback;
- fail closed if secure Web Crypto is unavailable.

POS sale/return identity and Restaurant Acceptance use the same provider.

No Point 4 guard was weakened.

#### 58.26 — Restaurant Point 4 Canonical TX Acceptance corrective

Root cause was narrowed further to the acceptance sale/return transaction IDs.

Once canonical Point 4 Identity V1 is present, the Offline V2 transport `assertPoint4Payload` requires the acceptance sale/return `client_tx_id` to also be canonical UUIDv4.

Historical acceptance used:
`ACC-...-B55R-SALE`
and
`ACC-...-B55R-RETURN`

58.26 changes **acceptance-only** sale / return TX generation to UUIDv4 from the shared secure provider.

The retry reuses the exact same payload / UUID so idempotency is still tested.

Business sale / return runtime is not replaced.

Acceptance cleanup was corrected so UUID-TX Orders / Returns are found using:
- acceptance notes marker;
- order lineage;
- existing run-pattern IDs for the other fixture entities.

The Point 4 cleanup stock guard remains present.

### 10. Beta DB status for 58.26 acceptance cleanup

Read-only inspection on 2026-09-24 confirmed the isolated SH-0007 Beta operational backend currently contains the corrected `sharawla_beta55_restaurant_acceptance_cleanup_v1` body.

The deployed helper includes:
- Order lookup by legacy run-TX **or acceptance notes marker**.
- Return lookup by legacy run-TX **or marker / order lineage**.
- Point 4 physical-stock guard before destructive acceptance cleanup.
- cleanup of Food return / order consumption snapshots and related acceptance residue.

This is Beta acceptance infrastructure only.

No Production database change is authorized by this checkpoint.

### 11. Current source / build checkpoint

Branch:
`beta56-offline-ownership-consolidation`

Current source HEAD before this documentation checkpoint:
`047a468a56855a33412deb4f20fdad0189f02dd9`

Package version:
`10.5.4-beta.58.26`

Latest source-only corrective at that HEAD:
`test: make beta58 feature gates patch-version agnostic`

Purpose:
- prevent 58.22 / 58.24 / 58.25 historical feature checkers from failing merely because the package advanced to a later Beta58 patch;
- preserve feature semantics while accepting the active Beta58 line.

Latest CI:
- Run: `36043725363`
- Result: **SUCCESS**
- Candidate validation: PASS.
- Windows x64 build: PASS.
- Packaged verification: PASS.

Latest artifact:
- ID: `10827228132`
- Name: `sharawla-pos-047a468a56855a33412deb4f20fdad0189f02dd9-sh0007-x64`
- Digest: `sha256:fa7f93f6061a43b33b54a5609318d5b3e467c5a036545f3ddb712fb50ff53fc8`
- Size: 76,729,282 bytes.

This build is **SH-0007 only**.

### 12. What is formally runtime-confirmed vs source/build-only

Runtime-confirmed:
- 58.18 Inventory Overview Restaurant presentation on SH-0007.
- Existing Orders / Online Orders / Delivery / Driver Settlement / Shift Cash accepted closures from their prior gates.
- 58.22 Full Acceptance confirms broad navigation/offline/permissions/recovery health except the Restaurant full-roundtrip failure.

Source / CI / package accepted but still needing targeted runtime confirmation:
- Manual Customer create.
- complete Touch interaction pass across representative workflows.
- 58.20 POS Profile Routing + Pickup/Dine-in behavior.
- 58.21 Settings Hub interaction.
- 58.23 Suppliers / Purchasing / Stock Count / Transfers Core-owner routing.
- 58.26 corrected Restaurant Full Acceptance.

Do not mark these runtime gates CLOSED until SH-0007 evidence exists.

### 13. Current exact blocker

The immediate blocker is no longer discovery of the 58.22 error.

Source + build corrective work through **58.26** is ready.

The exact missing evidence is:

**Install the current 10.5.4-beta.58.26 artifact on SH-0007 and rerun Restaurant Full Acceptance.**

Acceptance target:
- `beta55.restaurant-full-roundtrip = PASS`
- acceptance cleanup residue = 0
- no new Offline unresolved delta
- existing navigation / delivery / print / permissions / recovery gates remain PASS.

If it still fails, the 58.24 stage diagnostics must be used as the authoritative failure location. Do not weaken Point 4 validation.

### 14. Exact next work after Full Acceptance PASS

After 58.26 Full Acceptance PASS:

1. Perform targeted SH-0007 runtime clicks for:
   - Suppliers
   - Purchasing
   - Stock Count
   - Transfers
   and confirm Restaurant adapters open with no Retail leakage.

2. Confirm touch behavior on representative high-frequency workflows:
   - POS
   - Customers
   - Orders
   - Kitchen / Delivery
   - Inventory Overview
   - Settings
   using large tap targets and no hover-only critical actions.

3. Close the Menu / Function Cleanup gate.

4. Begin **Permissions V2 — Page + Action + Location**:
   - page permission;
   - action permission;
   - location scope;
   - role templates as defaults, then editable overrides.

5. Build the **Locations + Device / Printer Role** foundation.

6. Wire Sharawla Admin entitlement for `food.kitchen_stations`.

7. Implement Kitchen Stations V1 only after those prerequisites are closed.

### 15. Broader Master Roadmap remains

1. Restaurant Closure — CLOSED.
2. Sharawla Cloud + Admin V4 — CLOSED.
3. Commercial Capabilities — CLOSED.
4. Central Warehouse V2 + Financial Closure — IN PROGRESS.
5. Commercial Warehouse Acceptance — pending.
6. Retail — pending full product closure.
7. Pharmacy — pending full product closure.
8. Logistics — pending.
9. Membership / Gym — pending.
10. Warehouse Profile — pending.
11. Service / Maintenance — pending.
12. Cross-Profile Closure — pending.
13. Permissions Final Closure — pending; Permissions V2 is the next major platform authorization phase after current cleanup.
14. Reports & Accounting / Financial Closure — pending.
15. Offline / Sync Final Closure — pending broad acceptance; architecture/ownership foundation is already closed.
16. RC1 — pending.
17. Pilot Production → V1 Production Ready — pending.

### 16. Final current state

Current work is still **Beta / SH-0007 only**.

There is no Stable promotion yet.

There is no Production write authorization.

There is no Canonical Stock activation.

There is no Cutover activation.

The immediate continuation point is:

**58.26 SH-0007 Full Acceptance → shared-route runtime acceptance → touch runtime pass → close Menu Cleanup → Permissions V2 → Locations/Printer Roles → Sharawla Admin Kitchen Stations entitlement → Kitchen Stations V1.**


---

## NO-LAPTOP DESIGN CHECKPOINT — 2026-09-24

Status: DOCUMENTATION / READ-ONLY DISCOVERY ONLY.

No Runtime source, SQL deployment, version, Production device, Canonical Stock or Cutover change was performed in this design checkpoint.

### Runtime baseline remains unchanged

- SH-0007 candidate remains `10.5.4-beta.58.26`.
- Runtime code baseline remains equivalent to `047a468a56855a33412deb4f20fdad0189f02dd9`.
- All commits after that baseline in the current branch are documentation-only.
- SH-0005 / SH-0006 remain immutable on `10.5.3 CLEAN`.

### Permissions V2 discovery

Confirmed existing layers:
- Page permission: `employee_permissions`.
- Action Permissions V2: `permission_actions_v2`, `employee_action_permissions_v2`, `has_action_permission_v2`.
- Branch access: `employee_branches`, `has_branch_access`.
- Runtime advanced-permissions UI is already loaded and supports Inherit / Allow / Deny.

Confirmed that modern Food / Purchasing / Transfers / Tables / Delivery Settlement owners already enforce Action V2 + Location guards in major paths.

Confirmed Core Restaurant gaps still requiring V2 owner completion:
- sale;
- return;
- shift open/close/cash;
- expense;
- online-order accept/reject/payment review;
- kitchen/order lifecycle direct writes;
- customer edit/address/import;
- catalog/promotions;
- delivery setup;
- website/settings;
- branch/user administration.

Final authorization target:
`Page + Action + Location`.

### Location identity decision

Do not join Sharawla Cloud and operational Business locations by different DB IDs or display names.

Canonical cross-system key:
`business_branches.code <-> branches.location_code`.

Existing `employee_branches` remains the broad location ceiling.
Action-specific Location Scope V2 is additive and may never expand beyond that ceiling.

Beta note:
- operational branch #1 = TEST;
- operational branch #3 = hgolj;
- #3 has no observed orders/shifts/expenses/stock/delivery/print state but has employee-branch links;
- treat #3 as Beta residue/investigation; do not delete automatically.

### Printer Roles V1 decision

Keep physical Windows printer mapping device-local.

New logical role mappings should be stored in Native SQLite `kv`, not Cloud and not final-owner browser localStorage.

Initial roles:
- customer_receipt;
- default_prep;
- report.

Kitchen Stations adds:
- `kitchen_station:<station_code>`;
- optional `expo`.

Unbound required station printer = fail-visible. No arbitrary silent Windows-default fallback.

### Runtime Snapshot / entitlement discovery

SH-0007 already has signed Runtime Snapshot V2:
- device/business/environment/fingerprint binding;
- expiry;
- SHA-256 hash;
- Ed25519 verification;
- monotonic sequence / anti-rollback;
- offline Last Known Safe cache.

Cloud snapshot decision authority already composes:
- trusted environment;
- commercial entitlement;
- Business override;
- dependencies;
- readiness.

Critical catalog expansion gate:
- current Feature catalog = 107;
- latest sealed validated readiness baseline = 107/107;
- current V2 Edge Function still contains a fixed `feature_count === 107` transition guard.

Before any new Feature is added, replace the fixed-count transition assumption with a catalog-driven complete-baseline check while still at 107, prove SH-0007 snapshot health, then expand catalog + full readiness baseline atomically as one generation.

### Dual runtime authority decision

Do NOT globally replace historical Runtime Config `enabled_features` with Snapshot V2 yet.

Read-only SH-0007 evaluation currently shows:
- canonical catalog = 107;
- Snapshot allowed = 9;
- Snapshot denied = 98.

The current historical POS feature surface therefore remains on the accepted Runtime Config authority until a separate parity migration exists.

New commercial root Features are Snapshot-managed from day one:
- `food.kitchen_stations`;
- `support.center`;
- `ai.operator`.

For those new Features:
- signed Snapshot ALLOW is mandatory;
- no Runtime Config fallback;
- no local self-enable;
- no Business override self-entitlement.

### Sharawla Admin consolidation discovery

Existing Admin work already provides the needed building blocks:

1. Capability Matrix / V4 Capabilities:
   - Profile / Activity Category / Business override.

2. Commercial Management:
   - Base packages;
   - paid add-ons;
   - entitlement lifecycle;
   - commercial entitlement inspector.

3. Runtime Snapshot V2:
   - final device decision.

Final Admin model must keep these statuses visibly separate:
- Eligible;
- Entitled;
- Runtime Allowed.

A Business Feature override must not create a paid/commercial entitlement.

### Root entitlement model

Cloud root product Features:
- `food.kitchen_stations` — Add-on, Restaurant eligible V1, depends on `food.kitchen`.
- `support.center` — Standard/package capability, cross-profile where supported, depends on `core.licensing + core.audit`.
- `ai.operator` — Add-on, cross-profile where supported, depends on `core.permissions + core.audit`.

User operations are Action Permissions V2, not extra Cloud Feature rows.

Support Actions:
- support.ticket.create;
- support.ticket.view_own;
- support.diagnostics.share;
- support.history.view;
- support.escalation.request.

AI Actions:
- ai.use;
- ai.read;
- ai.create;
- ai.modify;
- ai.approve;
- ai.historical_correction.

### Support / AI security decision

Sharawla Support tickets are Cloud-owned and Business/device-scoped.
Business scope must be derived from verified device identity, not trusted from arbitrary client input.

Diagnostics are opt-in, minimal and must exclude secrets/tokens/full DB dumps by default.

Sharawla AI is NOT a privileged database identity.

AI writes must:
- use the signed-in Business user identity;
- require `ai.operator` Snapshot ALLOW;
- require AI Action Permission;
- require underlying domain Action Permission;
- require Location Scope;
- pass normal business invariants;
- execute only through an explicit allowlisted owner;
- never use arbitrary dynamic RPC/table execution;
- write authoritative AI audit evidence in the same DB transaction as the mutation.

The current best-effort renderer `audit()` helper is NOT sufficient for AI audit because it can silently fail under RLS.

### Documentation artifacts

POS design:
`docs/PERMISSIONS-V2-LOCATION-PRINTER-AI-SUPPORT-DESIGN.md`

Sharawla Admin V4 design:
`docs/V4-CAPABILITY-COMMERCIAL-RUNTIME-CONSOLIDATION.md`
on branch `v4-cloud-admin-work`.

### Gate remains unchanged

Do not start Runtime/DB implementation from this design work until:

1. SH-0007 `10.5.4-beta.58.26` Full Acceptance PASS.
2. `beta55.restaurant-full-roundtrip = PASS`.
3. `cleanup_zero = true`.
4. Offline unresolved count unchanged.
5. Shared Routes runtime clicks PASS.
6. Representative Touch runtime PASS.
7. Menu & Function Cleanup can be formally closed.

Then implementation order:
Permissions V2 Core completion
-> Location Scope V2
-> Location Code identity
-> Device / Printer Roles V1
-> Snapshot catalog expansion gate
-> Sharawla Admin entitlement wiring
-> Kitchen Stations V1
-> Support Center
-> Sharawla AI Operator.
