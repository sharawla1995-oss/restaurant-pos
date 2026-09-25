# Sharawla POS — Offline V2 Acceptance Record

Accepted candidate: `10.5.4-beta.51`
Accepted source SHA: `5aca3a591c7210d8dd292148b77c639998f54c83`
Target device: `SH-0007` only
Target business: isolated sandbox business `91826502-590e-4afa-8826-2c0f4b99c490`
Target backend host: `xihcxydjnzemflhedzor.supabase.co`
Production status: `SH-0005` and `SH-0006` remain on `10.5.3` and were not modified.

## Full Sandbox
Run: `ACC-20260913-145235-CNG7B`
Result: `READY_FOR_RC`
Coverage score: `100%`

Key PASS evidence:
- native SQLite health / WAL / foreign keys
- customer CRUD and cleanup
- sale → return → stock restore
- expense idempotency
- offline sale local-first → durable → retryable → synced
- 20× concurrent same-TX exactly-once
- inventory reconciliation: duplicate TX = 0, stock drift = 0
- backup / last-good / restore-copy
- temporary restore-copy cycle
- corruption copy detection without touching live DB
- device-sequence authority under clock-drift simulation
- final acceptance cleanup residue = 0

## Deep Chaos
Run: `ACC-20260913-145415-86MCP`
Automated chaos checks passed, including lost-ACK exactly-once behavior and zero-residue cleanup.

Guided crash acceptance was then completed through the Advanced Reliability Lab. The successful crash flow produced synced `CRASH` and `CRASHRET` events, and Beta51 cleared its crash marker/state only after sync, exactly-once verification, stock restoration, reconciliation and cleanup completed.

## Historical conflicts
Two legacy conflicts intentionally remain preserved as historical evidence. They are not replayed or auto-resolved by the accepted takeover flow.

## Freeze decision
Offline V2 runtime semantics from Beta51 are accepted for the SH-0007 sandbox gate. Beta52 may improve acceptance evidence/reporting and broaden feature coverage, but must not silently change accepted Offline V2 sale, sync, canonical identity, migration, or conflict-preservation behavior.

## Beta52 handoff
The Beta52 source-sync gate completed before the Windows build trigger. Beta52 is intentionally limited to acceptance evidence/reporting hardening at this checkpoint; broader enabled-feature coverage remains the next acceptance stage and is not treated as complete by this record.
