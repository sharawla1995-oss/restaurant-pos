# SH-0008 Top Chicken Beta — real database backup and isolated restore gate

**NOT EXECUTED. THIS IS A REVIEW / OPERATOR RUNBOOK, NOT PERMISSION TO USE LIVE CREDENTIALS.**

Target: Supabase Beta project `xihcxydjnzemflhedzor` (not Top Burger Production), business `5358328c-9724-49aa-affc-1bce8be90f92`, branch `22`. As checked, the Beta server runs PostgreSQL 17.6. The PostgreSQL 16 GitHub Actions fixtures do **not** substitute for an actual restore of this PostgreSQL 17 source database.

## Safe prerequisites
1. Owner independently approves a **Beta-only, non-mutating logical backup** and identifies who may access the business/customer data. Do not use the Production DB URL or service_role API key as the PostgreSQL database password. Use approved short-lived PostgreSQL connection credentials, SSL and a private machine, not public CI.
2. Verify the exact source project/host and current database fingerprint in a read-only session, record UTC timestamp, employee/order/branch counts and schema version. Halt if the host is unknown or profile/business mismatches.
3. Reserve an encrypted storage location with restricted access, no cloud artifacts, no repository, no logs containing tokens/passwords or customer phone numbers. Ensure adequate free disk space before starting.
4. Use **PostgreSQL 17** client utilities compatible with live Beta: `pg_dump --format=custom --no-owner --no-acl` directed into a local encrypted file, using an approved direct/session PostgreSQL connection (do **not** point to a transaction-pooled endpoint if unsupported). No writes to Beta.
5. Save a SHA-256 digest, byte length, timestamp, source host fingerprint, `pg_restore --list` output (sanitize before sharing), tool version and operator. Never share a raw backup through ChatGPT or GitHub.
6. Restore the archive to a **brand-new PostgreSQL 17 isolated database** with disabled network egress and disposable credentials; do not use the Beta endpoint as destination. Validate `pg_restore` exit status and data/DDL counts against source; compare `orders`, `employees`, `customers`, `employee_permissions`, `business_auth_memberships`, `offline_*` receipts, functions, RLS policies and active tenant selector. Record a PASS/FAIL manifest. Do not replay orders or run receipt RPCs during this restoration test.
7. Run the **review-only** additive migration candidates against the restored isolated **copy** only and verify tenant A/B invariants and that the frozen POS/Food functions did not change. Compare before/after schema hashes. Test rollback in this isolated copy. Never publish a successful schema-only fixture test as successful real Beta restore.
8. Require a separately authorized exact SQL file hash, independent Edge deployment approval, audited Cloud Admin entitlements approval, and device/website cutover approval. Backups are necessary, not authorization to publish.
9. Preserve encrypted copy until an explicit retention decision. Never reset or delete customer data, outstanding orders, or the SH-0008 local pending operation as part of this gate.

## Evidence status at authoring

- Source-only PG16 isolated fixture tests passed: staff source + disposable PostgreSQL16 Run `38673234274` and earlier quantity/entitlement Run `38666400198`. They contain **synthetic**, not copied, user/order records.
- No real Beta logical backup or restore verified yet. No rollback rehearsal against a copy of actual Beta.
- No DDL or Edge Function deployed; no Top Chicken-specific entitlement rows granted; no change to physical SH-0008.
- No reliable connector command to extract a real backup and restore it locally is available here. An authorized operator environment or a supported backup integration is required; do not attempt `pg_read_file`, `COPY PROGRAM`, or any server OS commands via Supabase SQL.

**Approval for a read-only backup is separate from authorization to run any of the SQL, Edge, entitlement or SH-0008 actions.**
