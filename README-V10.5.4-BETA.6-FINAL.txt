Sharawla POS 10.5.4-beta.6 — FINAL Part 3 Backup + UI Hotfix Candidate

Purpose
- Finalize the Windows 7 pre-update backup EPERM hotfix without weakening Gate A/B/C.
- Preserve the cashier UI hotfix that keeps updater/offline indicators away from checkout and prevents the delivery cart item list from collapsing.

Pre-update backup safety
- Independent from persistDb() and createBackup().
- Exports directly from current in-memory SQLite via db.export().
- Uses a unique temporary path (pid + timestamp + random) opened with fs.openSync(...,'wx').
- Writes through the opened fd, fsyncs it, and verifies exact non-zero size.
- Finalizes via same-directory rename, with COPYFILE_EXCL fallback.
- fsyncs and verifies the final target before declaring success.
- Tracks targetCreated/success and deletes the created final target if a later backup step fails.
- Any backup failure remains fail-closed: installer must not start.

Update safety remains
Gate A before download -> download -> Gate B -> pre-update backup -> Install Now -> Gate C immediately before spawn().

Release
Version: 10.5.4-beta.6
Channel: beta / Pre-release only.
Do not overwrite older beta releases.
