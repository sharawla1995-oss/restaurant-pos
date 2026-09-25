# Sharawla Offline Engine V2 — Foundation Contract

Status: Beta45 internal development foundation. This phase is additive and shadow-only.

## Core rule
Operational actions are local-first. A future takeover phase will acknowledge an action to the cashier only after the local atomic transaction succeeds. Cloud sync is aggregation/reconciliation, not permission to sell.

## Event envelope
Every outbox event must carry:
- client_tx_id
- device_id
- device_sequence
- business_id
- branch_id
- employee_id
- operation_type
- entity_type
- local_entity_id (when applicable)
- local_shift_id (when applicable)
- depends_on_tx_id (when applicable)
- created_local_at
- protocol_version
- schema_version
- status
- attempts / last_attempt_at / next_retry_at
- last_error_code / last_error_message
- server_ack / synced_at

Protocol version = 2. Schema version = 2.

## Sync states
pending → syncing → synced

Non-success states are first-class:
- retryable
- blocked
- conflict
- dead_letter

`failed` is legacy-only and is never a final V2 state.

## Explicit ACK rule
An outbox event may not transition to `synced` without a structured `server_ack`. HTTP success alone is not a sync acknowledgement.

## Device sequence
Each device owns a monotonic local sequence. `client_tx_id` remains the idempotency identity; `device_sequence` detects gaps and per-device ordering problems. It is not a cross-device global clock.

## Entity mapping
Local IDs remain valid UI identities. Server IDs are mapped in a dedicated mapping store keyed by entity type + local ID, with client_tx_id and mapping time. The V2 design does not rely on rewriting historical payload IDs in-place.

## Inbox
Server events are deduplicated by `server_event_id`. Phase 1 defines the inbox contract; server-event application is implemented in a later gate.

## Legacy queue migration
Migration policy is strictly **copy → re-read → verify → mark complete**.

Rules:
1. The legacy `queue` is the source.
2. Every source job must have a `client_tx_id`.
3. Existing V2 events with the same client_tx_id are reused; migration is idempotent.
4. A full copy of the original job is retained in `legacy_payload`.
5. The destination is re-read from durable storage.
6. Every source payload must match its copied `legacy_payload` byte-for-byte through JSON serialization and pass the V2 envelope validator.
7. Only after verification succeeds is the migration marker written.
8. Phase 1 never clears or edits the legacy queue.
9. Migration is not auto-started in Phase 1. It will run later under a controlled pause of legacy sync so the source cannot drain between copy and verification.

## Phase 1 runtime mode
`shadow-foundation`

Phase 1 creates/validates V2 stores and exposes the V2 API, but Beta43 remains the active sync engine. This avoids changing sale/return/shift behavior before the atomic storage and takeover gates are ready.

## Next gate
Storage & Atomic Local Transactions:
- introduce an OfflineStore abstraction
- move the authoritative local transaction path to durable SQLite transactions
- ensure business data + outbox + mappings + sequence changes commit atomically
- keep compatibility with x64 and ia32 before any takeover
