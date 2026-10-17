# Top Chicken SH-0008 — local SQLite durability (source only, 2026-10-17)

**Scope:** isolated GitHub branch only; do not install, release, merge, publish update feed, run SQL/Edge, reset queues, or touch Top Burger.

## Incident evidence (operator-supplied)
- Local data path retains historical product filename under %APPDATA%/sharawla-pos-windows/data, but affected PC operates Top Chicken.
- Main and lastgood both failed SQLite integrity (error 26).
- 671 abandoned 3.8MB SQLite temporary files consumed about 2.22GB, leaving only 0.61GB free on C; D had 43GB free.
- Operator preserved and SHA-verified data and backups at D:/TopChicken-Rescue-20261017-041937.
- The latest specifically checked healthy recovery candidate was topburger-pos.sqlite.tmp-6612-1792195243919-6d90fd5a; the operator restored it and got RESTORE_READY - MAIN AND LASTGOOD SQLITE OK. This is a local filesystem result, NOT a deployed-build validation.

## Source fix
- New top-chicken-sqlite-durability.js: full PRAGMA integrity_check of exported and previous on-disk SQLite bytes, unique same-directory staging, mandatory fsync, SHA256 check, atomic rename over existing files (not direct copy/truncate), and temp cleanup upon failure.
- Never copy a corrupt main into lastgood; never silently create an empty database when existing recovery evidence indicates prior data.
- Failed write blocks further writes until process restart; displays an error instead of continuing with unsaved in-memory operations.
- Electron single-instance guard prevents two independently running POS main processes from sharing the data directory.
- Existing SQLite namespace, table definitions, license bindings, updater feeds and cloud endpoints are unchanged.
- Existing temporary rescue evidence on user machines is NOT automatically deleted; only temp files created by this writer are cleaned.

## Acceptance and limits
- Disposable regression with actual SQL.js: creation, restart, local_operations preservation, full integrity verification, lastgood repair, simulated Windows locked rename, ENOSPC, fsync failure, corrupt/missing main, and no leaked new temp files.
- CI on Linux and Windows must PASS before any disposable Windows packaging. CI is not equivalent to testing a real device or real power interruption.
- Local Windows rename may fail if the destination is locked; this must fail closed, never fall back to overwriting the live destination.
- No physical SH-0008 installation, automatic cloud order replay, real website intake, Beta SQL/Edge changes, update feed promotion, or any Top Burger operation is permitted under this source-only task.
- Before an independently approved physical update, preserve a fresh verified D-drive backup, run isolated Windows in-place/rollback and offline-queue checks, and obtain explicit operator authorization.
