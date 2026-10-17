# Top Chicken SH-0008 — rc.10 local SQLite repair: physical-device preflight & rollback gate

STATUS: SOURCE + DISPOSABLE WINDOWS ONLY. Do not install automatically. This document is a plan, NOT an executed device procedure.

## Grounded machine checkpoint
- Operator preserved and SHA256-verified 769 historical local files/backups at `D:\TopChicken-Rescue-20261017-041937`.
- On the affected Top Chicken Windows device, the recovered main and lastgood both returned `PRAGMA integrity_check=ok` after restoration from verified `topburger-pos.sqlite.tmp-6612-1792195243919-6d90fd5a`.
- C: free grew from ~0.61 GB to ~2.83 GB after the operator removed exactly 671 checked and preserved temporary files. A free-space margin and a fresh backup MUST be rechecked at update time.
- Default active legacy sqlite name `topburger-pos.sqlite` describes a historical filename; it does NOT authorize changes to the separate Top Burger tenant.

## Hard prerequisites — physical install NOT authorized by a synthetic CI PASS
1. Operator must keep POS closed. Require a fresh copy of the ACTUAL current data folder and currently installed full application tree to a unique directory on D, verifying SHA256 of every copied file; retain the older `TopChicken-Rescue-20261017-041937` unchanged.
2. Run `scripts/top-chicken-sqlite-preinstall-readonly.ps1` manually on the Top Chicken machine; it must print `PREINSTALL_READ_ONLY_COMPLETE`, two current SQLite integrity results of `ok`, a recoverable source `ok`, and counts of local operations/pending. Review results against backup; the script is read-only and makes no cloud request.
3. Confirm expected business/device/license identity, installed version, main app data directory, active pending queue, and that user-initiated replay/production intake remains OFF. No physical live queue or real customer order E2E proof is claimed by CI.
4. Verify exact, distinctly versioned x64 candidate installer SHA256 against the GitHub CI evidence. Never use generic `/releases/latest`, the unpinned updater or stale rc.9 artifact.
5. Separately approve the specific candidate SHA256, in-place install directory, backup and rollback procedure after reviewing preflight. No blanket permission to clear sync, reset staff, delete backups, or deploy SQL/Edge.

## Physical cutover plan — NOT EXECUTED
- With POS stopped, preserve a fresh immutable D-drive snapshot of `%APPDATA%\sharawla-pos-windows\data`, `%USERPROFILE%\Documents\TopBurgerPOS\Backups` (historical local name), and the full installed Windows application directory. Hash-verify before touching current files.
- Confirm enough free space on C for at least two full SQLite copies plus temp write and system reserve; current ~2.83 GB is a prior point-in-time reading, not a live guarantee.
- In a controlled window, install the approved rc.10 x64 installer in place to the verified existing Top Chicken application directory only. Never touch Top Burger, cloud databases, or unrelated devices.
- Start once with queue replay and real order intake disabled. Validate app opens, existing local data and operations count, lastgood integrity, absence of new temp buildup, version and updater channel. Do not manually generate actual sales as a test.
- If ANY integrity, device identity, pending queue, startup or save check fails: stop. Restore BOTH the old full application tree and the paired exact D-drive pre-update SQLite snapshot; do not improvise by restoring only lastgood, nor send/replay operations.

## What isolated CI can/cannot prove
- Windows 2022 runner can install pinned rc.9, seed synthetic KV + one pending local operation, upgrade rc.10, check same `%APPDATA%` state across a fresh process, fail closed on intentionally damaged test SQLite, rollback rc.9 and reupgrade rc.10.
- No source/CI step has filesystem access to the owner's PC or its real offline queue. It cannot certify Cloud reconciliation or hardware power-loss survival. No physical install, release promotion or automatic feed change should occur without a separately reviewed owner-approved device operation.

## Verified RC10 Windows evidence (2026-10-17)
- [Windows x64 end-to-end CI run 38993139522 — **SUCCESS**](https://github.com/sharawla1995-oss/restaurant-pos/actions/runs/38993139522). Tested source SHA **`b37874d9efbd508f78bdc0e1e06807ebe11d247d`**.
- Distinct x64 candidate **`Top-Chicken-SH0008-Primary-10.5.19-rc.10.exe`**, **75,285,503 bytes**, **SHA-256 `ce39381f70ac66898338308771653cf4b64eff2f8cdfff9b2d6b8f0b033739e1`**.
- Existing old RC9 artifact hash **`f82a63ea6509aadf36855330a974f8633d8dbcaa9de86b461c4bc0c4a9a4c927`** verified before installing on disposable runner.
- Windows CI stage sequence: original RC9 boot and seed exactly one synthetic pending `local_operations` record + KV; in-place install RC10; new process with identical userData and pending record still exactly one; `PRAGMA integrity_check=ok` on main and lastgood; second complete exit/restart; intentionally corrupt disposable SQLite denied at startup preserving bytes and lastgood; old RC9 rollback and verification of both old and new KV and the single pending operation; RC10 reupgrade with the same checks. **All PASS**.
- GitHub Actions temporary artifact **ID `12086310646`**, name **`TC-SH0008-SQLITE-DURABILITY-DO-NOT-INSTALL-b37874d9efbd508f78bdc0e1e06807ebe11d247d`**, expires **2026-10-31**, ZIP SHA256 `38106b0b6d3bb9135ea2e98f0992dfc2f666cd34c24486f7af4b3dea980fd503` (different from EXE SHA).
- The source-only Linux/Windows fault-injection checks were previously PASS, but hardware power loss / owner's actual data and pending queue remain **NOT RUN**.
- Operator-assisted read-only Windows pre-install diagnostic is added at [scripts/top-chicken-sqlite-preinstall-readonly.ps1](../scripts/top-chicken-sqlite-preinstall-readonly.ps1); not executed on real owner PC.
- **No user-device installation, public GitHub release, update feed publication, Beta/production SQL/Edge change, or Top Burger change occurred.** The experimental installer must not be installed before current local queue backup/verification and explicit physical cutover approval.
