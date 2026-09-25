# Sharawla POS — Production Migration Plan V1

## Rule zero
Top Burger Production is not migrated until Beta36 manual acceptance on SH-0007 is complete and explicitly approved.

## Production scope
- SH-0005 / Cash-PC / الدقي
- SH-0006 / SmartSystem-PC / العشرين
- Top Burger business remains Restaurant.

## Pre-cutover
1. Freeze the accepted RC SHA and record installer SHA-256 for x64/ia32.
2. Confirm SH-0005/SH-0006 still run 10.5.3 and canonical fingerprints are unchanged.
3. Confirm no pending offline operations on each device.
4. Create and verify local + operational database backups.
5. Export current Production schema/data required for rollback verification.
6. Re-run read-only business/device/license integrity checks in Sharawla Cloud.
7. Verify Restaurant effective capability set before any new assignment.

## Database migration strategy
- Additive schema only first.
- No destructive rename/drop/rewrite during V1 cutover.
- New feature tables can exist while disabled.
- No profile/category default change that silently grants new Restaurant behavior.
- New Restaurant capabilities are enabled explicitly only after the stable POS supports them.

## Device pilot
1. Select one Production device only after approval.
2. Update with Update Safety flow: Gate A -> download/integrity -> Gate B -> verified pre-update backup -> Install Now -> Gate C -> spawn.
3. After restart require Login.
4. Verify business connection, canonical fingerprint, branch, license, version and printer.
5. Run smoke test: sale, mixed payment if enabled, print, delivery/pickup/takeaway, return, shift, report, offline sale/sync.
6. Keep second device on known-good stable during pilot.

## Rollback
Rollback immediately if startup, licensing identity, business connection, offline queue, sale atomicity, printing, returns, or update safety fails.
- Use Last Known Good / rollback path where available.
- Restore verified pre-update local DB only when required.
- Do not rebind or replace canonical fingerprint as a rollback technique.
- Do not delete cloud/business rows to recover a device.

## Second device
Only after pilot PASS, repeat the same process on the other branch device and repeat smoke tests.

## Capability rollout after binary rollout
Restaurant add-ons are enabled in controlled batches, never all at once. Each batch must have a rollback switch at Business entitlement/settings level where possible.

## Completion
Migration is complete only when both Production devices pass the acceptance checklist and remain stable across restart, online/offline transition, printing, backup and one normal operating shift.
