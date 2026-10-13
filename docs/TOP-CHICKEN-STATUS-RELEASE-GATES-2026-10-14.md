# Top Chicken Beta — status RPC verification gate (2026-10-14)

**NOT EXECUTED.** No migration, seed, or data deletion is authorized by this checklist. Never use existing orders 886 or other live rows as test fixtures.

## Read-only facts verified against Beta
- Business: `5358328c-9724-49aa-affc-1bce8be90f92`; branch: `22`.
- Current order count 13: delivery/new 3; pickup/new 1; takeaway/completed 9.
- Active admin exists with branch 22 assignment.
- Client has moved status buttons to `top_chicken_transition_order_status`, but server function is not yet deployed.
- The delivery driver picker still uses a direct `orders` PATCH to set `driver_id` and `out_for_delivery`; this is a **release blocker** even if the status RPC passes.

## Pre-apply gates
1. Isolated PostgreSQL 16 runner must restore schema and run candidate SQL without touching Supabase Beta.
2. Inspect triggers on `orders` and `audit_logs`; inspect RLS/owner and role permissions for SECURITY DEFINER. Confirm no conflicting existing status authority, offline receipts, or website sync.
3. Confirm `employee_branches` and `employees` authorization and intended non-admin role permissions. Candidate currently admin-only; cashier workflow is blocked.
4. Verify `audit_logs.id` insert default/trigger. Candidate audit INSERT omits `id`; if no default/trigger exists it will fail.
5. Confirm all `orders` update entry points, including driver assignment, kitchen, delivery list, and cancellation; avoid mixed writers.
6. Design stable retry request IDs across network failure and app restart; current UI generates a fresh UUID per invocation.

## Isolated test matrix
| Gate | Test | Expected |
|---|---|---|
| A1 | No auth token | 42501 |
| A2 | Wrong tenant admin | 42501 |
| A3 | Wrong branch admin | 42501 |
| A4 | Inactive employee | 42501 |
| A5 | Admin assigned to branch 22 | Authorized |
| S1 | new -> preparing -> ready, pickup -> completed | PASS |
| S2 | delivery ready -> completed | Reject |
| S3 | out_for_delivery -> delivered without driver | Reject |
| S4 | cancelled -> preparing | Reject |
| S5 | stale expected status | Reject |
| I1 | Exact request replay | Same receipt, no second audit |
| I2 | Same request ID with different payload | Reject |
| I3 | Concurrent same request ID | One commit, one replay |
| I4 | Concurrent different IDs same order | One transition, stale reject |
| T1 | Audit insertion fails | Status rolls back |
| T2 | No authenticated broad UPDATE grant | Confirm |
| R1 | Website pickup full cycle and receipt | PASS |
| R2 | Website delivery with driver assignment and payment | PASS |
| R3 | Offline restart/replay on isolated Windows VM | PASS |

## Release criteria
All gates PASS with logs, SHA, PostgreSQL version and restore proof. Then Beta-only migration approval, Beta deployment and end-to-end checks. Never merge to production or touch SH-0005/SH-0006/SH-0007. No real orders without explicit user approval. No cleanup before separately confirmed backup/restore and final deletion approval.
