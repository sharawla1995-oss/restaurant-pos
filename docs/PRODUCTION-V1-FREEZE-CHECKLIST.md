# Sharawla POS — Production V1 Freeze Checklist

This checklist is prepared in Beta36. Actual Production freeze happens only after manual SH-0007 acceptance and approved Production migration.

## Source
- [ ] Final accepted SHA recorded.
- [ ] package.json + version.json synchronized.
- [ ] Service Worker cache synchronized and contains no missing asset.
- [ ] x64 + ia32 installers built from the same SHA.
- [ ] Installer SHA-256 recorded.
- [ ] No nested ZIPs packaged.
- [ ] Stable source tag/branch created only after acceptance.

## Cloud / capabilities
- [ ] Core locks intact.
- [ ] Profile -> Category -> Business inheritance verified.
- [ ] Planned/unimplemented features cannot activate.
- [ ] Production business overrides explicitly reviewed.
- [ ] No silent Restaurant category changes.
- [ ] Admin setter permissions/hardening verified.

## Operational regression
- [ ] Login/permissions.
- [ ] Sale/payment/return.
- [ ] Shift open/close/report.
- [ ] Inventory/purchasing.
- [ ] Direct printing.
- [ ] Offline -> Sync idempotency.
- [ ] Backup/reset/restore on test environment.
- [ ] Website/PWA applicable profile flows.
- [ ] Update Safety A/B/Backup/C + health/rollback.

## Multi-industry
- [ ] Restaurant PASS.
- [ ] Retail PASS.
- [ ] Pharmacy PASS.
- [ ] Warehouse PASS for implemented scope.
- [ ] Service PASS for implemented scope.
- [ ] Membership PASS for implemented scope.
- [ ] Logistics PASS for implemented scope.
- [ ] Specialization capabilities remain Planned unless separately accepted.

## Production pilot
- [ ] First device pilot PASS.
- [ ] Restart PASS.
- [ ] Online/offline transition PASS.
- [ ] One normal operating shift PASS.
- [ ] Second device rollout PASS.

## Freeze rule
After V1 is frozen, new capabilities and behavior changes go to a later minor version/branch. The frozen stable branch receives only explicitly reviewed fixes; no feature work is developed directly on Production Stable.
