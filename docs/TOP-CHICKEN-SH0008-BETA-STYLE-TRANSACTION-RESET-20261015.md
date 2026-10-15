# Top Chicken SH-0008 — existing Beta-style "تصفير بيانات الاختبار" port (source only)

**2026-10-15 — Source implementation complete; targeted CI PASS. No device execution or cloud cleanup.**

The operator explicitly requested the same Beta test-transaction reset already built for SH-0007 / TEST, without inventing a new global reset workflow. Original implementation source: `beta56-offline-ownership-consolidation`, `beta45-offline-v2-native-store.js::resetTestQueue` plus `beta45-offline-v2-diagnostics.js`. Its local test-only behavior was to clear unsynced outbox events and legacy pending test queue; it did not reset cloud sales or operational historical receipts.

SH-0008 primary Windows candidate has a *different* local SQLite storage implementation (sql.js `kv.queue` + `local_operations`), not the original SH-0007 Offline V2 tables. Therefore this is a scoped port of the old button's behavior, **not an attempt to run the SH-0007 handler on another device**:

- UI button `تصفير بيانات الاختبار` inside **تشخيص مزامنة Top Chicken — SH-0008**.
- `main.js` handles `tc:reset-test-queue`; `preload.js` exposes only that IPC. `top-chicken-test-queue-reset.js` owns the operation.
- Main process independently requires an exact local Central Cloud license business `5358328c-9724-49aa-affc-1bce8be90f92`, physical device `44162475-3ca2-4a2b-8bd5-aee1c7bb1c73`, matching canonical device fingerprint, optional verified `SH-0008` support code, requested branch 22.
- After confirmation, auto replay stays **paused**. A local SQLite backup must succeed before clearing any queue. One local transaction marks only `local_operations.status NOT IN ('synced','discarded')` as `discarded` and clears only the `kv.queue` legacy test queue. Previously `synced` operations, `sync_log`, license, customers, products, local cached orders/shifts, website intake settings, Cloud financial receipts and other Beta businesses are untouched.
- The action is idempotent; a second request has 0 eligible entries and performs no cleanup.
- Targeted isolated mock regression, syntax and guards: **PASS**, GitHub Actions [run #38780716796](https://github.com/sharawla1995-oss/restaurant-pos/actions/runs/38780716796). Test covers other business/device/branch/fingerprint rejection, backup failure, SQL rollback, preserved synced entries, repeat reset, no network calls. This **does not prove a real SH-0008 device run**.

**Operational status:** No command was sent to SH-0008, no queue was actually cleared and no new installer was approved or installed. Do not confuse successful GitHub source CI with physical Windows rollout. The feature will be usable only after a separately tested, approved SH-0008 Windows release incorporating these commits; the existing rc.8 binary cannot acquire new code from a GitHub commit alone.

Do not run a cloud reset, change Top Burger Production, enable website live intake, or silently resume old financial queues.
