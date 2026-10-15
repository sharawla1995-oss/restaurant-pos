# Top Chicken SH-0008 — 10.5.19-rc.9 Windows Upgrade Acceptance (CI ONLY)

**STATUS: Windows candidate built and uploaded to a temporary GitHub Actions artifact. NOT an install or a production release.**

Source root: `sharawla1995-oss/restaurant-pos`; isolated branch `codex/top-chicken-sh0008-rc9-prelaunch-no-deploy`, derived from source-correction PR #45. No baseline branch merges or changes. Beta project `xihcxydjnzemflhedzor`, TC business `5358328c-9724-49aa-affc-1bce8be90f92`, branch 22, SH-0008 physical untouched.

## Windows acceptance evidence

- [Workflow run 38675218014](https://github.com/sharawla1995-oss/restaurant-pos/actions/runs/38675218014): **SUCCESS / all stages PASS**.
- Exact source/installer workflow SHA: `07b2adcfccb687b7d76006fa5c994535ce7c4c84`.
- Windows x64 EXE: `Top-Chicken-SH0008-Primary-10.5.19-rc.9.exe`.
- Installer bytes: **75,221,246**.
- **Installer EXE SHA-256**: `f82a63ea6509aadf36855330a974f8633d8dbcaa9de86b461c4bc0c4a9a4c927`.
- Distinct GitHub Actions ZIP **SHA-256**: `60ccd8ec0648339104e93ecdd8b215b7027b70e945130329a0d709af256bb9d4` (NOT the installer SHA).
- GitHub Actions temporary artifact ID `11946000881`; name `TC-SH0008-rc9-DO-NOT-INSTALL-cloud-approval-pending-07b2adcfccb687b7d76006fa5c994535ce7c4c84`; expected expiration **2026-11-14**. Not a GitHub release, not uploaded to SH-0008 update feed.
- Tested on **disposable Windows 2022 runner**: source parse, package/asar hashes, unchanged Windows app ID, official old installer digest, exact prior `rc.8` SHA256, **10.5.15 → 10.5.19-rc.8 → 10.5.19-rc.9** actual in-place upgrade, new Electron process with same `C:\Users\runneradmin\AppData\Roaming\sharawla-pos-windows` userData, synthetic SQLite persistence and read/write. Network blocked inside Electron tests.
- Earlier source-only and disposable PostgreSQL16 checks of TC staff and modifiers passed separately: [#38673234274](https://github.com/sharawla1995-oss/restaurant-pos/actions/runs/38673234274) and [#38673184079](https://github.com/sharawla1995-oss/restaurant-pos/actions/runs/38673184079).

## Hard release blockers remain

1. No **real** Beta PostgreSQL17 encrypted backup and air-gapped restoration has been executed. A synthetic PostgreSQL16 fixture is NOT a substitute. No connector capability here to perform and verify actual PostgreSQL dump/restore with encrypted operator-held connection credentials.
2. Cloud Beta is missing Top Chicken's own `operational_feature_entitlements_v1` grants. Its singleton operational identity still belongs to a distinct legacy Beta business. Tenant-specific grants require independent authenticated/audited Central Admin approval, NOT Direct SQL.
3. No reviewed SQL migrations have been applied to Beta: independent owner, `quantity`, staff receipts/management RPCs. No `top-chicken-staff` Edge deployment exists. The version-only installer cannot repair absent backend services.
4. Real SH-0008 pending offline queue is not remotely verified or reconciled. No replay/resume/deletion/reinstall. Real website→POS E2E and staff Auth login not tested. Branch-22 live order intake disabled.
5. Password reset deliberately FAIL-CLOSED pending secure Auth session revocation.
6. Existing dedicated manifest feed is still SH-0008 `10.5.19-rc.3` with no installer. It has **not** been changed to `rc.9` because the candidate is not approved. Generic Top Burger `/releases/latest` is unchanged.

## Release gate sequence — requires independent approvals

Read-only Beta backup → restore onto isolated PostgreSQL17 with matching functions/RLS/data receipts and rollback rehearsal → review specific SQL hashes and authorize only those on Beta → audit/approve Top Chicken Cloud entitlement grants and revocation checks → audit/approve dedicated Edge deploy → run isolated authenticated staff create/edit/toggle and website→POS tests → read-only SH-0008 queue reconciliation and device backup → **explicit device installation/publication approval** and verifiable feed hash. No step grants authority for later steps.

**Final recommendation as of 2026-10-15: DO NOT UPDATE SH-0008. Source and disposable Windows candidate PASS, Cloud/backup/device gates are NOT PASS.**

## PostgreSQL17 fixture parity and read-only live Beta fingerprint (2026-10-15)

- [PostgreSQL17 isolated CI run #38676392172 — SUCCESS](https://github.com/sharawla1995-oss/restaurant-pos/actions/runs/38676392172). Both `staff-pg17` and `quantity-feature-pg17` jobs passed on throwaway postgres:17 containers, no Supabase connections or mutations. These fixtures were based on known schema constraints; they are **not** a dump/restore of actual Beta.
- Added executable **read-only** `review-only/top-chicken-sh0008-beta-live-readonly-preflight.sql` and executed it once on the **Beta project only** via a SELECT. Its `baseline_unchanged_read_only=true`, with all individual flags true (including original singleton owner, two Top Chicken employees/two memberships, zero Top Chicken grant rows, no staff receipts, no modifier quantity, website real intake OFF).
- Schema public column signature MD5: `5a71a81c355c402584779bc2b94a20dc` (40 tracked columns).
- Existing 7 authoritative owner-function body MD5: `533f9fcba11cc581b4fa28f7cc30933d`.
- Existing public RLS policy signature MD5: `4b88fb8cc418e7568f003a8c50ec36a8` (15 tracked policies).
- PostgreSQL Beta server reports major version **17**, release **17.6**. These checks deliberately include the prior legacy-tenant singleton: they confirm the **unmodified baseline**, not that tenant authorization is fixed.
- **Never treat the unchanged-baseline preflight as authorization to deploy or as a PASS of repaired Cloud behavior.** Re-run under an approved operator change window before any independently authorized DDL. If any field becomes false, investigate drift, do not blindly re-apply candidates or reset tables.

**Still blocked**: no real encrypted Beta PostgreSQL17 backup and isolated restore; no authenticated/audited entitlement grants, no independent Edge/SQL approvals, no hosted end-to-end order+staff test, no SH-0008 local queue reconciliation/installation consent, no full session-safe staff password reset.

## Security corrective batch — SQL REVIEW ONLY (2026-10-15)

Additional source review identified two previously untested deny-by-default gaps in the `review-only` SQL:

1. The staff-create completion owner previously wrote `business_auth_memberships.active=true` even if the employee was created with `active=false`. Corrected to `coalesce(p_active,true)`; inactive staff now begin with inactive own-tenant membership as well. No existing employee or Auth account was modified.
2. `sharawla_internal.operational_feature_entitled_v1` formerly fell back to legacy Beta singleton feature grants when an authenticated request had **no verified current business** and a non-TC/absent header. Corrected to **deny** if `public.current_business_id()` is NULL, while verified legacy and other non-TC callers continue down the historical fallback. No shared Restaurant Profile, singleton binding, grants or other tenant data was changed. This is a change for **previously unverified** callers by design. Verified legacy parity still passes; broader non-TC verified singleton fallback remains a known historical compatibility boundary, not a new tenant-safety guarantee.

Negative regression cases added to the synthetic PostgreSQL17 fixture: initially inactive staff membership denied; missing/forged tenant selector denied; revoked Top Chicken membership denied; existing verified legacy caller remains allowed with existing legacy grant.

**[PostgreSQL17 isolated CI #38677377435 — SUCCESS, both jobs](https://github.com/sharawla1995-oss/restaurant-pos/actions/runs/38677377435)**. Review-only SQL and regression fixtures changed; `app.js`, `main.js`, Windows installer inputs and `rc.9` version did **not** change in this batch. The previously signed/tested Windows CI evidence still refers to exact `07b2adcf...` source; Windows installer bytes were not republished or changed.

**Important**: these are tests of fixtures, not a real Beta restore or live permission acceptance. Re-run live read-only hash gate, then restore actual Beta on isolated PG17, before independent authorization of any reviewed SQL.
