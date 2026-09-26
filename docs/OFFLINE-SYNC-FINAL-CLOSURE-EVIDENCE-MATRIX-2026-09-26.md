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
| Shift open | PARTIAL | Focused owner/test/gate chain is source-complete: owners `91d9d906...`, test `35e8ba3...`, loader `02718fd...`, static gate `c59aeed...`, CI wiring `c060684...`; Run `36206574941` explicitly printed `Offline shift lifecycle acceptance static gate PASS`. | Execute `offline.shift-lifecycle-runtime-e2e` once on current SH-0007 candidate through Point 15 Focused and record the runtime Run ID. |
| Shift close | PARTIAL | Same focused lifecycle test proves the intended Close Offline → Durable → ACK → Replay → Open Offline → Durable → ACK → Replay sequence at source level; CI Run `36206574941` validates the gate. Existing custody/settlement guard remains separate and accepted. | Execute the same `offline.shift-lifecycle-runtime-e2e` once on SH-0007 and capture runtime evidence. |
| Synthetic HTTP 5xx / partial server failure | PARTIAL | Focused test `offline.http503-recovery-runtime-e2e` was added in `764c4dae...`; it uses the existing `http500` lab mode which actually returns HTTP 503, requires durable `retryable`, verifies no premature server mutation, recovers to Synced, then proves duplicate/idempotent server-receipt replay with the same event identity. CI Run `36206821349` printed the static gate PASS. | Execute this focused test once on SH-0007 and record the runtime Run ID. |
| Runtime Snapshot LKG while offline | PROVEN | Runtime Snapshot foundation records safe-cache/LKG operation and device-aware E2E; consumer persists accepted signed snapshot atomically and loads the cached snapshot offline. | None for basic LKG use. |
| Runtime Snapshot anti-rollback | PARTIAL | Isolated runtime probe added in `ac34ce83...` uses the real consumer with an SH-0007 sandbox lock and a temporary store, accepts sequence 2, rejects sequence 1 with `SNAPSHOT_ROLLBACK`, then verifies sequence/high-water/LKG remain 2; the live Runtime Snapshot store is never opened by the probe. CI Run `36207063111` printed the static gate PASS. | Execute `runtime-snapshot.anti-rollback-runtime-e2e` once on SH-0007 and record the runtime Run ID. |
| Cross-profile Offline acceptance | PROVEN | Current support contract is now explicit in `docs/OFFLINE-CROSS-PROFILE-SCOPE-2026-09-26.md`: Restaurant + Retail are the only generic Offline commerce sale/return profiles; Pharmacy commerce remains Online-only/fail-closed; Service/Warehouse/Membership/Logistics are not eligible for generic POS commerce. `2c0fa8db...` closes transport + legacy renderer fallthrough and blocks generic Pharmacy return; CI Run `36207282637` printed the cross-profile gate PASS. Restaurant has current READY_FOR_RC/100% runtime evidence and the prior SH-0007 Retail crash/recovery gate proves Retail durable restart/exactly-once routing. | None for the current advertised Offline commerce support contract. Any future Pharmacy or other profile-specific Offline expansion requires its own owner + acceptance and does not inherit Restaurant/Retail proof. |
| Manual live DB destructive restore | MANUAL | Harness intentionally uses isolated copies so acceptance cannot hide real corruption. | Guided sandbox-only drill only if release policy explicitly requires destructive restore. |

## Current conclusion

Restaurant Offline/Sync runtime is now strongly accepted:
- Full: `ACC-20260926-033522-X5BSV` — READY_FOR_RC / 100%.
- Chaos: `ACC-20260926-033735-PZPJX` — READY_FOR_RC / 100%.
- PZPJX targeted Offline operations are explicit PASS through Seq354.
- unresolved remains 3, matching preserved Seq293 / Seq304 / Seq316.

Roadmap Point 15 must remain **OPEN**. Current source/gate state is **READY_FOR_FOCUSED_RUNTIME**, not runtime-closed.

Exactly three focused runtime proofs remain on SH-0007:
- `offline.shift-lifecycle-runtime-e2e`
- `offline.http503-recovery-runtime-e2e`
- `runtime-snapshot.anti-rollback-runtime-e2e`

Cross-profile scope for the current advertised Offline commerce contract is source/CI closed. Seq293 / Seq304 / Seq316 remain historical evidence and must not be retried, deleted or reset.

## Minimal next implementation/acceptance order

1. Use one consolidated SH-0007 candidate containing the accepted source/gates; do not install intermediate commits.
2. In Full Acceptance Center run **🎯 Point 15 Focused** only. The Registry must select exactly the three IDs listed above.
3. Do not run Restaurant Full or Deep Chaos again unless the focused run exposes a regression that affects those previously accepted paths.
4. If all three focused tests PASS, record that Run ID here and change only the corresponding PARTIAL rows to PROVEN.
5. Re-run `scripts/check-point15-offline-final-closure-matrix.js`; Point 15 may close only after the checker state is updated from `READY_FOR_FOCUSED_RUNTIME` with real SH-0007 evidence.

## 2026-09-26 source/gate readiness checkpoint

- Shift CI closure: `c06068479582b308673eb665b605a040a580556a` → Run `36206574941` SUCCESS.
- HTTP-503 focused acceptance: `764c4dae9bfe11351a0d0e98e0bafadf59ef0414` → Run `36206821349` SUCCESS.
- Runtime Snapshot isolated anti-rollback probe: `ac34ce83d506aee9b780f4cad3a35ff106a8c94d` → Run `36207063111` SUCCESS.
- Cross-profile commerce fail-closed boundary: `2c0fa8db85de1640266cc23696a080b8902aa2c3` → Run `36207282637` SUCCESS.
- Focused runner source: `20a57358dd7e5b4f667f1169ca911e7ef11e1f02`.
- Production SH-0005 / SH-0006 remain untouched on 10.5.3 CLEAN.
- Canonical Stock OFF. Cutover OFF.
