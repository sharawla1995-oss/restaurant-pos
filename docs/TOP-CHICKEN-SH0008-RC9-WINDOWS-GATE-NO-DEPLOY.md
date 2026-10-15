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
