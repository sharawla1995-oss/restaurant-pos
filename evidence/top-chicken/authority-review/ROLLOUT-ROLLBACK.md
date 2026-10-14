# Staged publication and rollback — NOT EXECUTED

All steps below are proposals requiring the relevant independent approval. Repository commits and synthetic CI do not authorize database or Edge publication. No SH-0005/06/07/08 device is part of any stage. Top Burger Production is excluded throughout.

## Stage 0: approval gates

- Pin the reviewed source commit and compare the current Beta project ref exactly with `xihcxydjnzemflhedzor`, TC business `5358328c-9724-49aa-affc-1bce8be90f92`, branch 22. Stop on drift in candidate MD5 guards, object ownership, ACLs, schema or resolver decisions.
- Review native affected CI and new package hashes; preserve old accepted results. Do not reinstall on any user device.
- Obtain an approved, securely provisioned PostgreSQL read/export connection to Beta only. Do not paste credentials into chat or put them in repository/CI artifacts. Creating a temporary backup role would itself need separate SQL approval; it has not been done.
- Complete the actual full backup and isolated restoration below. Missing export access is a hard blocker, not a passed test.
- Have the Cloud owner review the actual 16 denied commercial decisions and approved package/add-on/profile policy through the normal audited commercial control plane. Do not manufacture grants or change another business. Re-read effective decisions after an approved change. Do not enable operations while required features remain denied.

## Full backup and restore procedure

Run only from a private operator environment with PostgreSQL 17 client tools and the approved Beta connection in a protected libpq service/passfile. Verify direct host `db.xihcxydjnzemflhedzor.supabase.co`, or the exact approved pooler and user bound to that project. Inspect resolved service configuration privately; never infer the project from a generic secret name. Verify `server_version_num` is 17xxxx and expected TC and legacy singleton identifiers by read-only SQL before export. No production connection may be opened for comparison.

1. Set a private destination (directory 0700/files 0600). Use a read-only repeatable-read source transaction; export its PostgreSQL snapshot. Keep it open for dump and inventory capture. Record snapshot timestamp, source version/project, client versions and source commit. A backup-capable approved role must read all included schemas; partial permissions fail the completeness gate.
2. With the same exported snapshot, run `pg_dump --format=custom --snapshot=<snapshot> --file=<private>/beta.dump` using the approved libpq service, with no schema/table exclusions. Use a read-only session. Capture roles/globals without password hashes only if separately authorized and supported. List all schemas/tables/sequences/extensions/functions, exact row counts, sequence values, function definition digests, ACLs and constraints from that same snapshot. Hash dump and manifests with SHA256. Confirm `pg_restore --list` includes every expected object and data section. Any unreadable schema or omitted managed object is explicitly a backup limitation and blocks a full recovery claim.
3. Inventory Supabase configuration and Edge source/versions privately. Database dumps do not include Storage object bytes, external secrets, schedules outside DB or platform configuration. Check whether Storage has any objects using authorized read access; if nonempty, back up the actual object bytes and hash manifests via an approved private route. Do not claim full Beta recovery from a DB dump alone.
4. Create a fresh PostgreSQL 17 instance on an isolated private network with no route to Cloud, Beta, Production, customer services or real webhooks. Reproduce required extensions/platform roles from approved infrastructure definitions. Use a new empty restore database. Restore with `pg_restore --exit-on-error`; apply ownership/ACLs using isolated mapped roles and record any mapping. Never run the restore against Beta. Retain the failed database and logs if restoration fails; do not delete existing data to retry.
5. Compare exact schemas/table inventory/row counts, normalized per-table content checksums in deterministic primary-key order (or deterministic full-row multiset for tables without keys), sequence values, constraint validation states, function definition digests and effective ACLs against the same-snapshot manifest. Check Auth user/membership relationships offline, foreign-key integrity and financial totals without contacting services. Demonstrate representative restored read paths and permission denial in isolation. Mark every mismatch FAIL; produce a signed manifest and private evidence artifact.
6. Retain original encrypted backup, hash manifests and restore logs; record retention/location/access owner. No cleanup/deletion is authorized. Only then can a full backup/restore gate be PASS.

## Stage 1: read-only Cloud endpoint

After specific approval, deploy only `top-chicken-authority` to Central `ikppryeavoabnugcijeq`. Review its fixed TC selector and resolver-only reads. Provision a dedicated random 32-byte TC HMAC channel secret through the approved secret manager in Central and Beta. Beta gets `TC_CLOUD_PUBLIC_KEY` (anon/publishable only), never a Central service credential. Rotate the dedicated channel independently. Verify bad signatures, stale requests and foreign selectors are denied without a resolver read. Do not change the existing Cloud resolver or any other business grants.

## Stage 2: Beta database, paused

After separate SQL approval, run a reviewed single atomic transaction for the candidate set in dependency order: cloud execution, operational binding, canonical owner IDs, order status wrapper, staff provisioning. Strip only the top-level BEGIN/COMMIT wrappers under review; do not execute each file with separate commits. Pre-create `sharawla_internal` if required only inside the approved migration. Confirm pinned MD5 guards and exact source/schema expectations before any replacement. The private gate remains false; do not change the old singleton or legacy rows. On any error roll the entire transaction back; investigate before retry.

## Stage 3: Beta Edge and candidate app

After separate Edge approval, publish Beta-only `top-chicken-operations`, `top-chicken-staff` and reviewed TC smart-function changes if any. Keep gateway gate false. Verify unauthenticated/service-only denials and paused execution. Configure fixed Beta public/secret values through protected deployment settings, not packaged frontend files. Check other-activity behavior through synthetic fixtures; do not create real other-business data. Keep the reviewed prior Edge versions/source and the new Windows TEST installer hashes.

## Stage 4: isolated cohort only

Obtain explicit approval identifying the audited release commit before enabling the private TC gate; write a reason and 40-character source reference so the gate change is audited. Select only a separately approved isolated TC test identity/branch with synthetic orders; no real intake or named SH device. Exercise fresh positive grants, revocation, expiry and a pickup/delivery financial path, then pause again. Commercial grants must actually permit these operations; a denied grant is not an application failure to bypass. Opening live intake, physical installation and wider release each require new authorization.

## Safe rollback

1. Stop the isolated TC cohort and atomically set only `top_chicken_execution_gate_v1`'s TC row to `enabled=false`, with reason and reviewed commit reference. The exclusive update waits for in-flight shared-lock operations. After commit, new gateway transactions fail closed. Capture the audit row/time and check no new TC gateway writes; preserve every receipt, staff request ledger, cloud context, payment and event.
2. Keep the shared TC security guards in place. Do not blindly restore the old unguarded SQL or old frontend routes while TC is enabled. Paused TC may remain unavailable while repaired source is tested and independently approved. Other businesses retain their original branches/INSERT statements; a TC gate update does not change their entitlements.
3. If a Beta-only Edge regression requires restoration, restore the pinned previous Edge source only after approval and while TC remains paused; confirm old/direct TC paths are still denied by SQL. Do not touch other Edge functions or overwrite global configuration.
4. The scoped original-function backup supports forensic comparison/controlled recovery only. Restoring it could remove TC guards, so it is not the routine live rollback. Any full DB recovery requires a new incident plan, write freeze, current backup, isolated rehearsal and independent approval. Never restore the full Beta database over live records as a normal code rollback.
5. Re-enable only after the fix's affected tests and grant review pass and a new explicit approval is recorded. Do not DROP the new tables, delete Auth users, reset sequences, clear trial orders, remove backups or reopen intake.
