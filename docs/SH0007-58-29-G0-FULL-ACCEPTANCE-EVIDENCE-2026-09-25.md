# SH-0007 — 10.5.4-beta.58.29 — G0 Full Acceptance Evidence

Date: 2026-09-25
Device: SH-0007
Business: 91826502-590e-4afa-8826-2c0f4b99c490
Profile: restaurant
Mode: sandbox
Run: ACC-20260925-051819-6GXYG

## Final result

Readiness: READY_FOR_RC
Coverage Score: 100%

## Critical acceptance results

- beta55.restaurant-navigation-parity — PASS
- core.sandbox-lock — PASS
- profiles.engine-contracts — PASS
- current.navigation-smoke — PASS
- offline.native-health — PASS
- restaurant.cleanup-verify — PASS (residue=0)
- beta55.restaurant-runtime-contract — PASS
- beta55.restaurant-full-roundtrip — PASS (cleanup=zero)
- beta55.delivery-settlement-shift-cash — PASS (cleanup=zero)
- beta55.restaurant-print-order-type — PASS
- offline.migration-compatibility-snapshot — PASS (integrity=ok/ok; counts_preserved=true; max_seq=272)
- permissions.all-profile-role-contracts — PASS
- permissions.current-session-boundary — PASS
- recovery.guard-health — PASS
- auth.offline-cache-boundary — PASS
- recovery.backup-lastgood-restore-copy — PASS
- recovery.temp-restore-cycle — PASS
- recovery.corruption-copy-detection — PASS
- recovery.clock-drift-device-sequence — PASS

## Manual/non-blocking rows in this run

- capabilities.enabled-feature-test-coverage — MANUAL
- permissions.backend-role-impersonation — MANUAL

The harness still returned READY_FOR_RC with 100% coverage.

## Gate decision

G0 — Full Acceptance:
PASS / CLOSED

## Next gate

G1 — Shared Restaurant Routes manual runtime verification:
1. Suppliers
2. Purchasing
3. Stock Count
4. Transfers

Acceptance intent:
- page opens successfully;
- Restaurant/Food adapter is used;
- no Retail leakage;
- primary actions are reachable;
- no runtime error.

No Production system was touched.
