# Sharawla Platform — Master Status

> Official continuation checkpoint for the Sharawla project.  
> Last updated: 2026-09-15  
> Rule: before continuing development in a new chat/session, verify this file against GitHub and Sharawla Cloud. Do not rely on chat memory alone.

## Production Safety Boundary

Production is READ-ONLY during Beta/development work.

- Top Burger business: `3e405b6f-feba-4d5c-a4bf-bebb77f2d5d7`
- SH-0005 — Cash-PC — الدقي — Primary — POS 10.5.3
- SH-0006 — SmartSystem-PC / Top burger — العشرين — Primary — POS 10.5.3
- Top Burger business overrides: 0 at latest verified checkpoint.
- Forbidden without explicit production approval after RC: Beta install, migration, profile/feature changes, business overrides, reset, takeover, rebind, device/license mutation.
- Read-only regression checks are allowed.

## Beta Sandbox

- SH-0007 — FULL SANDBOX
- Device ID: `8c580a23-8711-4540-b6ca-f5c1725d5fcf`
- Business: تجريبي
- Business ID: `91826502-590e-4afa-8826-2c0f4b99c490`
- Beta backend: `xihcxydjnzemflhedzor.supabase.co`
- Last Cloud-verified installed POS before current runtime integration: `10.5.4-beta.55`
- Profile: restaurant
- Experimental writes are allowed only when explicitly scoped to this sandbox.

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

## Point 1 — Beta55 Restaurant Closure

CLOSED.

Final Full Acceptance:
- Run: `ACC-20260914-040227-QTTK4`
- Result: `READY_FOR_RC`
- Coverage: `100%`

Known deferred non-blocking issue:
- Beta Self-Test / Navigation Parity may expose a duplicate/mirrored test entry in Dashboard UI. Inspect code before changing; do not guess.

## Point 2 — Sharawla Cloud + Admin V4

CLOSED.

Admin repository: `sharawla1995-oss/sharawla-admin`
- V4 branch: `v4-cloud-admin-work`
- Last verified HEAD: `32b765d58b1ff83eabb28ebc4c37dba5b4f88891`
- PR #1 `Sharawla Admin V4 Preview` remains DRAFT / UNMERGED intentionally.
- Production SH-0005 / SH-0006 remain protected and read-only.

Manual V4 Acceptance passed: Dashboard, Customers, Businesses, Activity detail, Capabilities read + sandbox write/restore, Search, Alerts, Audit functional, Archive, Cloud Security, Branches, Devices, Licenses.

Deferred UI enhancement:
- Audit Log should later show Actor + Before + After more clearly.

## Point 3 — Commercial Capabilities / Add-ons / Packages

CURRENT.

### 3A — Commercial Readiness Audit

CLOSED.

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

Do not silently reclassify the frozen 3A baseline. New evidence is post-baseline evidence unless a controlled baseline amendment is explicitly approved.

### 3B — Readiness Gate / Runtime Consumer

CURRENT.

Cloud foundations CLOSED/PASS:
- Readiness baseline schema + immutable sealed 107-row seed
- Cloud readiness resolver
- Trusted environment resolver
- SH-0007 beta environment policy
- Composition contract + RPC
- Dependency cycle/depth protection
- Runtime snapshot endpoint contract
- Ed25519 signing architecture
- Public/private key separation
- Canonical payload/versioning
- Per-device sequence state
- Anti-rollback high-water design
- Automatic sequence reset forbidden

Runtime snapshot endpoint:
- Edge Function: `runtime-access-snapshot-v1`
- Last verified version: 9 ACTIVE
- Last verified SHA256: `75db7dabf0c95bd571a9b39e881b293ec259f204aff179e09d80e5b8890558e5`
- Signing key ID: `sharawla-snapshot-2026-09-final`
- Private signing key must remain server-side only and must never be copied into GitHub/POS/chat.

Fresh final-key cryptographic verification: PASS.
- Verified snapshot sequence: 6
- Payload hash: `0a7cb095fdc5f8d65be8e2d58e740c8d907ec3b239601d638d8c624345092688`
- Ed25519 signature independently verified against trusted public key.

POS isolated integration branch:
- Repository: `sharawla1995-oss/restaurant-pos`
- Branch: `beta56-runtime-snapshot-consumer`
- IMPORTANT: branch name is technical only. Official Roadmap Point 6 Beta56 Retail has NOT started.
- Test build version: `10.5.4-beta.55.1`
- Current verified branch HEAD at this checkpoint: `1bdfce8cc888013b1d708693bea96ecf697a20dd`
- Commit: `test(runtime-snapshot): cover atomic state journal and final signing key`

Static Runtime Snapshot Acceptance:
- GitHub Actions run: `34911093125`
- Result: SUCCESS

Final Beta55.1 sandbox build:
- Workflow run: `34911093130`
- Result: SUCCESS
- Artifact: `sharawla-pos-10.5.4-beta.55.1-sh0007-x64`
- Artifact ID: `10374532576`
- Digest: `sha256:edb94c835a2039370c56ce3dfaec792af605a9f066b5adf9a919c35e31c3d8af`
- This build is an Actions artifact, NOT a GitHub Release asset.
- It must be installed on SH-0007 only.
- Historical/obsolete runtime-snapshot build must NOT be installed.

Runtime consumer protections implemented in isolated branch include:
- deterministic canonicalization
- payload hash verification
- Ed25519 signature verification
- trusted signing key ID check
- device/fingerprint/business binding
- expiry checks
- online monotonic sequence acceptance
- offline equal-high-water Last Known Safe Snapshot use
- rollback rejection
- atomic authoritative state journal with recovery
- automatic high-water reset forbidden
- network-only fallback policy

### 3B Exact Next Step

Install `10.5.4-beta.55.1` on SH-0007 ONLY and perform actual Runtime Acceptance:
1. Online signed snapshot fetch/acceptance.
2. Verify Cloud device snapshot sequence state.
3. Offline cached Last Known Safe Snapshot.
4. Restart behavior.
5. Tamper rejection.
6. Unknown signing key rejection.
7. Rollback rejection.
8. Expiry behavior.
9. Identity/business/fingerprint mismatch rejection.
10. Actual atomic persistence/high-water recovery behavior.
11. Read-only regression verification that SH-0005/SH-0006 remain unchanged on 10.5.3.

Do NOT declare 3B closed until actual SH-0007 Runtime Acceptance passes.

After 3B closes, proceed to:
### 3C — Package / Entitlement Engine

Commercial model direction:
`Profile Defaults + Package Entitlements + Paid Add-ons + Business Overrides → Dependency Resolver → Readiness Gate → Final Enabled Features`

Rules:
- Planned cannot be enabled.
- Implemented-Unaccepted cannot enter production packages.
- Beta Ready is Beta/Test only.
- Production Ready is commercially eligible.
- Core is included and not separately billable.
- Packages/add-ons must extend the existing capability engine, not create a parallel runtime feature engine.
- Business overrides are operational/admin exceptions, not the primary commercial entitlement system.

3C/3D/3E/3F remain pending.

## Runtime Security Model — Plain Summary

Device Identity → License → Business → Profile → Feature Readiness → Commercial Entitlement → Dependencies → User Permissions → Signed Runtime Snapshot → Anti-Rollback → Offline Safety → Audit → Acceptance before Production.

Fail-closed rule: if a new security/runtime decision cannot be trusted or verified, deny it rather than infer permission.

Legacy POS 10.5.3 compatibility is mandatory. Do not modify or force the new readiness consumer through legacy runtime RPCs:
- `get_sharawla_business_runtime_config`
- `get_sharawla_business_runtime_config_v2`
- `get_sharawla_business_connection`

## Offline V2 Core Principle

Local device is the operational source during sale; server is aggregation/sharing.
- Each transaction has a stable unique `client_tx_id`.
- Save locally first in a transaction; only then report success to cashier.
- Outbox retains pending operations until explicit server ACK.
- Retry must be idempotent: same `client_tx_id` applies once server-side.
- Power loss/restart must not lose acknowledged-local operations.
- Exactly 2 legacy unresolved conflicts are intentionally retained; do not rerun migration/takeover/resolve/reset on them.

## Canonical Fingerprint Rule

If local `st.device_fingerprint` exists, it is the sole canonical identity. No MachineGuid fallback/replacement. Migration is only for absence of canonical fingerprint. Any later identity change requires explicit administrative Reset/Rebind; no automatic rebind.

## Deferred Bugs / Improvements

1. Multiple Instance / Startup: Production 10.5.3 once accumulated many `Sharawla POS.exe` processes and UI did not open. Killing all processes then launching once restored normal operation. Root cause not proven. Future Beta fix should inspect single-instance locking/startup/relaunch while preserving Windows 7, ia32/x64, Offline and Printing. Do not patch Production 10.5.3 directly.
2. Admin V4 Audit UI: expose Actor + Before + After clearly.
3. Beta test/navigation duplicate/mirrored UI entry: inspect before fixing.

## Continuation Protocol

At the start of a future session/chat:
1. Read this file.
2. Check current GitHub branch/HEAD/build status.
3. Check Sharawla Cloud read-only state where relevant.
4. Compare reality with this checkpoint.
5. Continue from the first uncompleted exact next step.

Never mark something CLOSED because it was planned, coded, or statically checked. Close only after its required Acceptance passes.

## Final Project Hand-off Requirement

Before Sharawla V1 Production Ready hand-off, create an extremely simple colloquial Arabic operating/integration guide for the owner. It must explain, beginner-proof, how Sharawla Admin, Sharawla Cloud, business backends, POS, devices, licenses, profiles, packages/add-ons, permissions, updates, Offline/Sync, backups/recovery and support connect together; how to add a customer/business/branch/device/license; how to diagnose common problems; and what must never be changed directly in Production.

## Shortcut

When Mohamed says `(بلح)`, use this file plus live GitHub/Cloud verification to report: official roadmap, current point/subpoint, current version, Production/Beta status, latest Acceptance, latest actual result, closed gates, blockers, deferred bugs, and exact next step.
