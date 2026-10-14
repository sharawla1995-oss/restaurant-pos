# Top Chicken Connected QA — Windows proof / NOT a primary update

**Result: isolated QA installer accepted in ephemeral GitHub Actions Windows 2022. Primary SH-0008 release: BLOCKED.**

## Verified binary

- Source: `53181d85f12c729c0105e8bf01ec84242ad476de`, based on the original reviewed Top Chicken source `6ca769c69e50505766565f80fa7dd1ce94fe26a2`.
- Run: https://github.com/sharawla1995-oss/restaurant-pos/actions/runs/38617224747 — SUCCESS.
- Artifact: https://github.com/sharawla1995-oss/restaurant-pos/actions/runs/38617224747/artifacts/11920437866
- Installer inside artifact ZIP: `Top-Chicken-Connected-QA-10.5.4-beta.18.exe` (Windows x64; 75,032,587 bytes).
- EXE SHA256: `1f5e0119c24c98d55ef5a8e8d684dcb6660446a8c87b0a113eb71d68d5217cfc`.
- AppId `com.sharawla.topchicken.qa.connected20261014`; product `Top Chicken Connected QA`; **fixed isolated userData** `TopChickenConnectedQA-20261014`, inside Electron's appData. Isolated QA backups: `qa-backups`.
- Installer does not replace the existing Sharawla POS program or write its userData. Shortcuts disabled and updater disabled.
- Network allowlist in QA: HTTPS to only `xihcxydjnzemflhedzor.supabase.co` (Beta) and `ikppryeavoabnugcijeq.supabase.co` (Central). In Windows acceptance CI, even those endpoints were explicitly disabled by process environment; **no hosted E2E was claimed**.
- Fixed QA-only SQLite write collision via unique temp file name; no change to normal POS's SQL writer.

## Proof / limits

| Assertion | Result |
|---|---|
| Pinned source version and packaged ASAR parity | PASS |
| NSIS x64 installer builds and installs on disposable Windows CI | PASS |
| Packaged Electron 22.3.27 starts | PASS |
| Same isolated QA userData and QA-backup paths on second process | PASS |
| Full exit/reopen; SQLite write survives new process | PASS |
| Packaged generic updater disabled | PASS |
| No physical SH-0008 installation / no real Beta connection during CI | NOT EXECUTED — intentionally |
| Real website-to-POS pickup/delivery, current grants, staff and financial integration | NOT EXECUTED — blocked |
| Full Beta PG17 backup and isolated restore | NOT EXECUTED — blocked |

## Do not install as the primary SH-0008 update

- Actual Cloud device version observed: `10.5.15`. This isolated QA build `10.5.4-beta.18` is NOT a semver/feature upgrade from the live version. It is based on a separate Top Chicken source line.
- Official generic `v10.5.18` production release exists, but its `app.js` lacks the reviewed Top Chicken staff/operations channel and is not a safe substitute for this business.
- Top Chicken Cloud `TOP_CHICKEN_RESTAURANT` V1 is still a **draft with 30 features**, zero base package assignments and zero addons at the latest read-only query.
- Six food/stock features are denied by inherited shared `restaurant` profile. An isolated source-reviewed PG17-tested Central candidate exists in admin branch `fix/top-chicken-commercial-admin-entry-20261014`; it was **not deployed**.
- Beta `top_chicken_execution_gate_v1` is not deployed; no Beta SQL/Edge changes were applied.
- User's hard release gates remain: secure full PG17 Beta backup+isolated restore, separate authenticated/admin owner approval for Cloud entitlements and per-business overrides, independent deployment approvals for Central and shared Beta, hosted E2E, production-targeted Windows acceptance, and device owner approval.
- No real website intake opening, trial-order cleanup, or Production/SH devices changes were authorized or executed.

## Safe next action

Obtain a protected, exact-host **read/export** PostgreSQL 17 connection to Beta `xihcxydjnzemflhedzor` through a private operator environment, never passwords in chats or GitHub artifacts. Execute/verify the full backup+isolated restore in `evidence/top-chicken/authority-review/ROLLOUT-ROLLBACK.md` before any new Central/Beta SQL or Edge function deployment. The public QA artifact is for approved off-device testing only.
