# Sharawla POS — Offline / Sync Final Closure Evidence Matrix

Date: 2026-09-26
Branch: `beta56-offline-ownership-consolidation`
Scope: evidence reconciliation for Roadmap Point 15 only.
Safety: SH-0005 / SH-0006 Production remain excluded. Canonical Stock OFF. Cutover OFF.

## Classification

- **PROVEN**: existing source + recorded runtime evidence is sufficient for the stated invariant.
- **PARTIAL**: important pieces are proven, but the exact final Point-15 scenario is not yet evidenced.
- **MISSING**: no adequate evidence located for the exact scenario.
- Already-proven scenarios must not be repeated merely to generate a newer timestamp.

## Matrix

| Point-15 requirement | State | Current evidence | Remaining exact gap |
|---|---|---|---|
| Local-first durable Sale | PROVEN | Beta51 accepted Full/Chaos record proves offline sale local-first → durable → retryable → synced; crash gate later proved durable local commit survives real app relaunch and exactly-once reconciliation. | None for Restaurant sale semantics. |
| Return + reconciliation | PROVEN | Beta51 sale→return→stock restore; PZPJX Return Seq345 PASS with receipt + stable replay. | None for current Restaurant path. |
| Expense | PROVEN | Beta51 expense idempotency; PZPJX Expense Seq344 PASS with receipt + stable replay. | None for current Restaurant path. |
| Order/status movement | PROVEN | Seq290 Pending→Send→ACK→Synced; PZPJX Seq343 PASS with explicit ACK + stable replay. | None for current Restaurant path. |
| Customer durable mutations/dependency | PROVEN | PZPJX customer create Seq346 PASS; dependent address ACK-mapped/replay stable; isolated create/update/address-save/delete synced. | Not a minimum original Point-15 movement, but now covered. |
| Delivery driver/economic completion | PROVEN | PZPJX driver Seq353 PASS; delivery economic Seq354 PASS; cash custody=1; replay stable. | None for current Restaurant path. |
| Repeated retry / same TX exactly-once | PROVEN | Beta51 Full record: 20× concurrent same-TX exactly-once; Deep Chaos accepted lost-ACK exactly-once; PZPJX replay stable across targeted paths. | None for Restaurant acceptance. |
| Lost ACK | PROVEN | Beta51 Deep Chaos acceptance explicitly records lost-ACK exactly-once behavior. Network Lab supports a one-shot `lost_ack` mode. | None. |
| Crash/restart before sync | PROVEN | Master records `ACC-20260917-071449-3FUH`: durable local commit before abrupt restart, actual relaunch, pending state survived login, resume PASS, exactly-once=1, stock 23→22→23, cleanup=zero. | None. |
| Pending queue recovery | PROVEN | Same crash/recovery gate plus recovery.guard-health; PZPJX migration compatibility PASS and recovery guard PASS. | None for durable pending recovery. |
| Backup / last-good / restore-copy | PROVEN | X5BSV/PZPJX recovery backup, temp restore, corruption-copy detection PASS. Acceptance implementation never overwrites live DB during automated restore probes. | Destructive live restore remains intentionally MANUAL and is not required as an automated destructive test. |
| Device sequence under clock drift | PROVEN | PZPJX clock/device-sequence recovery PASS; sequence unique. | None. |
| SQLite/WAL/FK integrity | PROVEN | X5BSV/PZPJX Native Offline health PASS; migration compatibility integrity=ok/ok and counts preserved. | None. |
| Explicit ACK before Synced | PROVEN | Seq290 and PZPJX targeted paths prove explicit ACK/receipt + stable replay; transport contract persists server ACK. | None for tested owners. |
| Conflict/DLQ evidence preservation | PROVEN | Recovery guard remains healthy with exactly 3 preserved historical unresolved records; PZPJX created no additional unresolved operation. Seq293/304/316 remain intentionally preserved. | Evidence cleanup/archive policy is separate from correctness; do not retry/delete them merely to make the counter zero. |
| Shift open | PARTIAL | Native takeover exposes Shift Open durable owner and earlier acceptance records include open-shift preconditions. | Need one final evidence citation/run proving local-first Shift Open → ACK → replay/restore semantics on current accepted runtime, unless an existing exact runtime record is located. |
| Shift close | PARTIAL | Native takeover exposes Shift Close durable owner; Shift Close + Driver Custody is recorded CLOSED/PASS; dedicated pending-custody guard exists. | Need exact current Offline Shift Close local-first → ACK → replay evidence, distinct from custody/online settlement. |
| Synthetic HTTP 5xx / partial server failure | PARTIAL | Acceptance Network Lab supports `http500`, timeout, flap, offline and lost_ack. Retry/lost-ACK exactly-once is proven. | No final evidence located that explicitly records a current owner surviving synthetic HTTP 503, remaining durable/retryable, then syncing exactly once after recovery. |
| Runtime Snapshot LKG while offline | PROVEN | Runtime Snapshot foundation records safe-cache/LKG operation and device-aware E2E; consumer persists accepted signed snapshot atomically and loads the cached snapshot offline. | None for basic LKG use. |
| Runtime Snapshot anti-rollback | PARTIAL | Consumer source fails closed with `SNAPSHOT_ROLLBACK` below/equal high-water rules and binds device/business/fingerprint/environment; foundation is accepted. | Need explicit final runtime/acceptance evidence for rollback rejection + continued safe LKG behavior if Point 15 requires runtime rather than accepted source-contract evidence. |
| Cross-profile Offline acceptance | PARTIAL | Ownership consolidation crash gate was proven while SH-0007 was Retail; current Restaurant Full + Chaos are READY_FOR_RC/100%. Retail/Pharmacy support-matrix docs exist. | Final required profile matrix must be defined from implemented profiles; do not infer that Restaurant success proves every industry. |
| Manual live DB destructive restore | MANUAL | Harness intentionally uses isolated copies so acceptance cannot hide real corruption. | Guided sandbox-only drill only if release policy explicitly requires destructive restore. |

## Current conclusion

Restaurant Offline/Sync runtime is now strongly accepted:
- Full: `ACC-20260926-033522-X5BSV` — READY_FOR_RC / 100%.
- Chaos: `ACC-20260926-033735-PZPJX` — READY_FOR_RC / 100%.
- PZPJX targeted Offline operations are explicit PASS through Seq354.
- unresolved remains 3, matching preserved Seq293 / Seq304 / Seq316.

Roadmap Point 15 must remain **OPEN** until the remaining exact gaps above are resolved or explicitly waived by the release contract.

## Minimal next implementation/acceptance order

1. Locate or add focused current-runtime Shift Open and Shift Close E2E evidence; do not rerun Restaurant sale/return/customer/delivery tests.
2. Add one focused synthetic HTTP-503 durability/recovery test using the existing Acceptance Network Lab and an isolated acceptance movement.
3. Decide whether accepted Runtime Snapshot source-contract anti-rollback evidence is sufficient; if runtime proof is required, add one non-destructive isolated rollback-rejection probe.
4. Reconcile cross-profile scope against only implemented/eligible profiles and their existing support matrices.
5. Re-run the Point-15 matrix checker only; do not require another broad Restaurant Full/Chaos run unless source changes affect those paths.
