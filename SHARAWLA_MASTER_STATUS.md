# Sharawla Platform — Master Status

> Official continuation checkpoint for the Sharawla project.  
> Last updated: 2026-09-16  
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
- Historical test build version at this checkpoint: `10.5.4-beta.55.1`

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

### 3B — Offline Authentication Runtime Incident / 55.3 Corrective Checkpoint

STATUS: OPEN / BLOCKED pending actual SH-0007 Acceptance.

Actual runtime evidence after the original 55.1 snapshot integration:
- `10.5.4-beta.55.1` installed on SH-0007.
- Online login for the sandbox user succeeded.
- Offline login with the same credentials failed, including online login → logout → disconnect internet → login.
- The 55.1 monkey-patch direction was rejected and must not be retried.

55.2 corrective attempt:
- `10.5.4-beta.55.2` was built and installed on SH-0007.
- Actual runtime result: same Offline Login failure.
- Do not repeat the same 55.2 runtime test blindly.

Authoritative 55.3 design decision:
- `app.js` is the sole Authentication owner.
- Runtime wrappers must not own Offline Authentication.
- Official online flow: `signIn PASS → bootstrap complete/persisted → authEnroll() → authState() read-back → Offline READY`.
- Enrollment/read-back failure must not invalidate a successful online login; instead expose `Offline NOT READY` with the exact reason.
- Official offline flow: canonical identity → Main `authVerify()` fail-closed → verified bootstrap → `loadOfflineBootstrap()`.
- `valid_until` comes from Main/Auth State.
- Do not change Main `authVerify`, encrypted credential storage, canonical fingerprint, runtime snapshot security, or Production to solve this issue.

Local 55.3 source checkpoint (IMPORTANT: not yet pushed to GitHub):
- Local branch: `beta56-runtime-snapshot-consumer`.
- Local commit: `f7a0018` — `fix(beta55.3): make app.js authoritative offline auth owner`.
- Exactly 6 files changed: `.github/workflows/beta55-1-runtime-snapshot-build.yml`, `app.js`, `beta45-offline-v2-safety-runtime.js`, `package.json`, `scripts/check-beta28-fixes.js`, `version.json`.
- `git diff --check`: PASS.
- Offline Auth 55.3 Official app.js Gate: PASS.
- Online Login + Bootstrap ownership: PASS.
- `app.js → authEnroll → persisted credential → authState READY`: PASS.
- Enrollment failure → Online remains valid + Offline NOT READY: PASS.
- No competing enrollment wrapper/monkey patch: PASS.
- Beta28 Owner/User/Home regression gate on `10.5.4-beta.55.3`: PASS.

Local full-check environment blocker:
- `npm run check` started and version sync passed for `10.5.4-beta.55.3`.
- It then stopped in `scripts/check-runtime-syntax.js` while parsing pre-existing optional chaining such as `engine?.code` in `sharawla-runtime-core.js`.
- Local machine has Node `v13.14.0` at `C:\Program Files\nodejs\node.exe`; no NVM and no second Node installation were found.
- Treat this as an unresolved local toolchain/environment gate, not proof of a 55.3 source regression.
- Do NOT modify `sharawla-runtime-core.js` merely to satisfy Node 13.

Current truth at this checkpoint:
- 55.3 source fix: COMMITTED LOCALLY.
- Local commit `f7a0018`: NOT PUSHED / therefore not expected to exist on GitHub yet.
- Full check: BLOCKED by local Node 13 parser/toolchain issue.
- CI after `f7a0018`: NOT RUN.
- 55.3 Build: NOT DONE.
- SH-0007 55.3 Runtime Acceptance: NOT DONE.
- Production SH-0005/SH-0006: UNTOUCHED / READ-ONLY.
- Point 3B remains OPEN. Do not declare Offline Auth fixed until actual runtime Acceptance passes.

### 3B Exact Next Step

When the Windows 7 test laptop is available again:
1. Establish a compatible/safe check runtime for the repository; do not blindly replace Node without verifying Windows 7 compatibility.
2. Re-run the full source check and inspect `git status` afterward because `sync-version` ran before the prior check failed.
3. Preserve/review the exact six-file 55.3 diff and local commit `f7a0018`.
4. Push only after review, then verify the remote diff/CI.
5. Only after gates pass, build `10.5.4-beta.55.3`.
6. Install/test it on SH-0007 only: online login → Offline READY evidence → logout/restart → disconnect internet → same-user offline login.
7. Then cover ordering cases (login-first/bootstrap-later and bootstrap-ready/login) and later multi-user A/B.
8. If runtime fails, identify the exact failure point before another build; do not repeat blind tests.
9. Keep SH-0005/SH-0006 read-only on 10.5.3.

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

## Approved Architecture Direction — Customer-Specific Features & Release Channels

STATUS: APPROVED ARCHITECTURE DIRECTION / DEFERRED IMPLEMENTATION.

Purpose: allow Sharawla to deliver a capability requested by one customer without creating a permanent customer-specific POS fork and without forcing every customer to receive/test every customer-specific build immediately.

### One Codebase / No Customer Forks

Canonical rule:
`One Sharawla POS codebase → different Business Entitlements / Settings / Policies`

Do not create permanent binaries/codebases such as `Sharawla-CustomerA.exe` or `Sharawla-CustomerB.exe` for normal customization.

A customer-specific requirement should normally become one of:
- a canonical Feature/Capability,
- a configurable Setting,
- a controlled Policy,
- or an Entitlement to an existing capability.

Do not scatter hard-coded checks such as `if business_id == X` through business logic. If a truly exceptional requirement cannot be modeled safely by capability/settings/policy, it requires an explicit architecture decision before any fork is allowed.

### Separate Code Version from Feature Access

Sharawla must treat these as separate axes:

`Release Version` = what code is installed on the device.

`Release Channel` = which release stream the device/business is allowed to receive.

`Business Entitlements` = which commercially/operationally allowed capabilities the Business may use.

A binary may contain code for a feature while the feature remains unavailable to businesses that are not entitled to it. Installing the same Stable version must not automatically grant every included feature.

### Business Entitlements

Customer-specific paid/exclusive capabilities should be granted through the Package/Entitlement architecture, not through a separate customer binary.

Target flow:
`Business → Package / Add-ons / Explicit Entitlements → Feature Readiness / Dependencies → Runtime Snapshot → Effective Access`

If a feature already exists in the installed binary and only entitlement/configuration changes, enabling it for another eligible customer should not require a new POS update.

The formal entitlement implementation belongs to Point 3C and must extend the existing capability engine rather than create a second feature system.

### Release Channels

Design the updater/control plane to support controlled channels, conceptually:
- `Stable` — normal production customers.
- `Beta` — isolated testing such as SH-0007.
- `Pilot` — specifically selected customer/business/device rollout before broad Stable promotion.
- `Internal` may be added later if operationally useful; it is not required yet.

Exact channel names/schema are to be finalized during implementation. Do not alter current production update behavior merely because this design is recorded.

### Device / Business Update Assignment

Future update policy should allow the Cloud/Admin to determine which approved release channel/version a device or Business may receive, without exposing Beta/Pilot releases to unrelated Stable customers.

A customer requesting a new feature may receive a Pilot build first while other customers remain on the existing Stable version. After Acceptance, the code can be promoted to Stable while the feature itself remains entitlement-gated.

### Controlled Promotion

Target lifecycle for customer-requested code changes:
`Development → Beta → Pilot (when useful) → Acceptance → Stable`

Promotion of the code and commercial entitlement to the feature are separate decisions.

A feature may become part of the Stable codebase while remaining enabled only for the customer(s) that purchased/received the entitlement.

### Feature Flags / Settings

Changes that are purely entitlement/configuration/settings and are already supported by the installed code should be deliverable through trusted Cloud configuration/runtime mechanisms without creating a new binary release.

Security-sensitive settings must remain backend-enforced where appropriate. Feature hiding in UI alone is never sufficient authorization.

### Update Safety Rules

- A customer-specific request must not force unrelated customers onto an unaccepted build.
- Beta/Pilot release visibility must be isolated from Stable update discovery.
- No feature entitlement may bypass Readiness Gate, dependency checks, permissions, or backend enforcement.
- Customer-specific capability code must pass its own Acceptance before production use.
- Stable promotion requires the appropriate regression/Acceptance evidence.
- SH-0005 and SH-0006 remain on the existing protected production path until a separately approved production promotion.
- Existing 10.5.3 update/runtime compatibility must not be broken while the new channel model is developed.

### Roadmap placement

This direction does NOT create an 18th roadmap point.
- Business Entitlements belong under Point 3C — Package / Entitlement Engine.
- Admin commercial controls belong with the Point 3 Admin V4 commercial work.
- Pilot/controlled update-channel implementation is a required pre-RC capability and must be closed before RC/production promotion, without changing the official 17-point roadmap unless explicitly approved.

## Approved Design Direction — Multi-Tenant Website Engine

STATUS: APPROVED DESIGN DIRECTION / DEFERRED IMPLEMENTATION.

This is a recorded product/architecture decision only. Do not interrupt Point 3B to implement it, and do not create a new numbered roadmap point unless explicitly approved later.

### Core model

Sharawla should have ONE multi-tenant Website Engine serving many businesses. Do not create or maintain a separate copied website codebase/project for every customer.

Canonical resolution direction:
`Incoming Domain / Host → Business ID → Business Profile → Enabled Website Capabilities → Business Data / Configuration → Theme → Rendered Website`

Each website must remain business-scoped and must never leak data/configuration between tenants.

### Customer without an existing website

When Website is commercially entitled and enabled for a Business, Sharawla should be able to provision a Sharawla-hosted address such as:
`business-name.<Sharawla-owned-domain>`

The business can configure its logo, branding, branches, products/services, prices, hours, ordering options and other profile-relevant settings without creating a separate application deployment per customer.

### Custom Domain

A customer may connect its own domain, for example `www.customer.com`, to the same Sharawla Website Engine.

Preferred ownership rule:
- The customer owns its custom domain.
- Sharawla may assist with setup/management as a service.
- Sharawla should not require itself to own every customer's domain.
- Domain verification and DNS connection must be explicit before activation.

### Customer already has a website

Do not force replacement.

Support an Integration mode where the existing customer website can connect to Sharawla through a controlled API/Webhook integration, or use a Sharawla-powered commerce/ordering subdomain such as `order.customer.com` while retaining the main website.

External integrations must use scoped authentication/authorization and must not expose business backend secrets or service-role credentials to browser/client code.

### Profile-driven website behavior

The Website Engine should adapt to the Business Profile and enabled capabilities rather than hard-code one Top Burger/restaurant experience.

Examples of intended direction:
- Restaurant: menu, cart, delivery, pickup, order tracking.
- Retail / Clothing: catalog, variants, cart, stock-aware commerce.
- Pharmacy: permitted pharmacy catalog/workflows according to applicable capabilities and rules.
- Service: services and appointments.
- Membership: plans/subscriptions/bookings where enabled.

Top Burger's existing website is implementation/evidence to learn from, not the final architecture to clone for every business.

### Shared operational data

Website and POS should consume the same authoritative business configuration/data contracts where appropriate. Price, availability, branches, products, orders, customer data, delivery/pickup and status flows should not require manual duplicate maintenance between POS and Website.

Any website-specific pricing or availability must be an explicit configured rule, not accidental data divergence.

### Themes / Templates

Support reusable profile-aware themes/templates so customers can choose presentation without creating a separate codebase. Branding configuration can include logo, colors, banners and supported layout options.

### Commercial separation

Do not overload a single `commerce.website` switch with every website capability forever. Before implementation, formally design how Website Engine, Online Ordering/Commerce, Custom Domain, and External Website/API Integration map into the existing capability + package/add-on architecture.

Do not silently add new canonical Cloud feature keys during Point 3B. Any future feature/catalog additions require the normal controlled capability/readiness process and must preserve the frozen 3A baseline as historical evidence.

Potential commercial direction (not yet implemented/priced):
- Sharawla-hosted website/subdomain tier.
- Advanced website/custom-domain tier.
- Existing-site API/integration option.

Exact package names, pricing and entitlement mapping remain deferred to the commercial/package design stage.

### Security / operational rules

- Domain must resolve to one verified Business before business data is served.
- Business isolation is mandatory.
- Website capability/entitlement decisions must follow the same Sharawla capability/readiness/commercial model rather than a parallel permission system.
- Existing customer sites must integrate through controlled public integration contracts, never direct privileged database access.
- Production deployment/update strategy should allow one Website Engine to be upgraded safely without manually redeploying a separate copy for every customer.

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
