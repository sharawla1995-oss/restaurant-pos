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
