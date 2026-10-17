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

## Windows NSIS and in-place upgrade acceptance (disposable only)

- **Windows CI: PASS** — [run 38992637161](https://github.com/sharawla1995-oss/restaurant-pos/actions/runs/38992637161), source commit `08f68de9ff631e87933a5d0ab0fbcf0a735204f4`.
- x64 experimental NSIS file: `Top-Chicken-SH0008-Primary-10.5.19-rc.9.exe`, size **75,284,324 bytes**, SHA-256 **`cf32701c7605f5b4f04bf7d9df6d2fbc31ecc87e508d65a55510c4c32e046122`**.
- Existing verified RC9 installer from isolated earlier run SHA-256 `f82a63ea6509aadf36855330a974f8633d8dbcaa9de86b461c4bc0c4a9a4c927`.
- Installed existing RC9 on disposable Windows, booted it network-blocked, seeded a unique synthetic `local_operations` pending item and `kv` value, installed repaired candidate **in place** to the same path, then launched repaired executable. Verified persisted value, original pending queue count unchanged, a new durable value and intact `lastgood`.
- Full exit and fresh-process launch retained both values and queue. An intentionally corrupt disposable main DB was refused by startup with CI-only exit code 40; corrupted main bytes and lastgood snapshot remained unchanged. After the test, restored only disposable fixture.
- Separate Linux and Windows SQL.js local fault-injection tests previously passed in [run 38992399552](https://github.com/sharawla1995-oss/restaurant-pos/actions/runs/38992399552).
- Actions artifact ID `12084889435`, name `TC-SH0008-SQLITE-DURABILITY-DO-NOT-INSTALL-08f68de9ff631e87933a5d0ab0fbcf0a735204f4`; experimental ZIP archive checksum is **not** the EXE checksum; artifact expires around **2026-10-31**.
- This is a **same-version RC9 source patch** for acceptance only, not an authorized release promotion. A separately approved, distinctly versioned final installer needs final verification before rollout.
- **NOT TESTED:** physical SH-0008 in-place restore/upgrade, hardware power failure, live pending queue reconciliation, real cloud sync, real Windows antivirus locks, customer orders and Beta hosted end-to-end. No physical change, Supabase SQL/Edge change, Top Burger production change, update-feed change or public release was performed.

**Owner action before a physical installation:** confirm current actual installed version and a fresh byte-verified local backup, reconcile pending operations in read-only mode, prepare rollback, and give separate explicit approval. Do not treat this isolated Windows PASS as permission to install.
