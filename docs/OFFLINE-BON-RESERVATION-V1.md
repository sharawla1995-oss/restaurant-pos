# Sharawla POS — Bon Reservation V1 Contract

Status: DESIGN / SOURCE GATE ONLY
Scope: Restaurant RC1 Offline numbering continuity
Safety: no deployment, no Canonical Stock change, no Production change.

## Problem
Current Offline V2 sale projection intentionally uses `OFF-*` with `bon_number=null`. The deployed sale RPC allocates the official bon on the server, so a device-generated `last + 1` cannot be treated as collision-safe official numbering.

## Authority
- Official bon uniqueness remains per server shift: `(shift_id, bon_number)`.
- Server is the allocation authority.
- Local DB is the durable consumption authority for a range already reserved to this canonical device.
- Canonical device owner is `device_fingerprint`; no alternate mutable identity may allocate or consume a reservation.
- A reservation belongs to exactly one business, branch, shift identity and device.

## Server-authenticated device binding — deployment blocker
The Restaurant backend MUST NOT treat a request-supplied `device_fingerprint` as proof of caller device identity. Sharawla Cloud has the canonical `device_id + device_fingerprint -> business` registry, but the Restaurant RPC currently has no independently authenticated device binding to that registry.

Before Bon Reservation runtime activation, allocation, consumption and close MUST derive or verify the canonical device identity from server-trusted context (for example a Restaurant-side verified device binding or a signed/verified claim issued from Sharawla Cloud). Comparing two client-supplied fingerprint strings is insufficient.

Until that contract exists and has executable negative tests, Bon Reservation remains SOURCE/DORMANT only. Runtime acquisition/renewal MUST NOT be enabled.

## Shift identity
A shift may be known locally before it has a server bigint ID.
- `server_shift_id`: authoritative after shift-open ACK.
- `shift_open_tx_id`: stable local identity before/after ACK.
The reservation contract MUST bind these identities without renumbering already consumed bons.

## Reservation
A server reservation is an immutable interval `[start_bon,end_bon]` with:
`reservation_uid, business_id, branch_id, server_shift_id, shift_open_tx_id, device_fingerprint, start_bon, end_bon, issued_at, status`.

Allocation MUST be atomic against the shift counter. Two devices MUST receive disjoint intervals. Replaying the same reservation request MUST return the same reservation and MUST NOT advance the counter twice.

## Local durable consumption
Before a sale is reported successful or printed with an official bon, consumption MUST be committed durably with the sale `client_tx_id`.
Required local identity:
`reservation_uid + bon_number + sale_client_tx_id + shift_open_tx_id + device_fingerprint`.

Rules:
1. One sale TX consumes at most one bon.
2. Replay of the same sale TX returns the same bon.
3. A consumed bon is never returned to the pool after printer failure, crash, retry, rejection or restart.
4. Restart reconstructs the next unused bon from durable reservation/consumption state, never from UI memory.
5. Range exhaustion MUST NOT guess `last + 1`.

## Sale sync / ACK
The server sale owner MUST accept reservation evidence explicitly. It MUST verify business, branch, canonical device, shift binding, interval membership and sale-TX binding before preserving the requested bon.
- Valid evidence: persist the exact preallocated bon; ACK returns the same bon.
- Same sale TX replay: return the existing order/bon without consuming another number.
- Invalid, foreign, expired/closed-shift or mismatched evidence: fail closed; never silently replace a bon already presented as official.
- Existing non-reserved online allocation remains server-authoritative.

## Offline-opened shift
If no valid server-issued reservation exists, an Offline-opened shift MUST NOT invent an official bon. It may use the existing `OFF-*` local reference until shift ACK plus a valid reservation exists. A later ACK MUST NOT retroactively claim that an unreserved printed local reference was an official bon.

## Close and invalidation
Closing a shift invalidates all unused reservation capacity for new sales. Unused numbers are not reassigned inside that closed shift. A reservation from another branch, shift or device is unusable.

## UI / receipt semantics
- Reserved bon: display/print as official bon.
- No valid reservation: display/print local `OFF-*` reference and mark official number pending.
- ACK reconciliation MUST merge Local→Server identity without duplicate order rows and without changing a reserved official bon.

## Required executable evidence before runtime implementation is accepted
1. Single device Online→Offline→Online preserves exact bon.
2. Two devices on one shift receive disjoint ranges.
3. Restart never reuses a consumed bon.
4. Lost ACK / same TX replay preserves one order and one bon.
5. Printer failure after durable sale does not recycle bon or duplicate sale.
6. Range exhaustion fails to local-reference mode; no guessed official bon.
7. Closed-shift range cannot be consumed.
8. Foreign device/branch/shift reservation fails closed.
9. Offline-opened shift without reservation uses `OFF-*`, not an official bon.
10. Shift `shift_open_tx_id`→`server_shift_id` binding preserves already consumed reserved bons.
11. Server ACK returns the exact reserved bon.
12. Local operational projection and receipt keep the same reserved bon through ACK.

Static string assertions are design evidence only; runtime acceptance requires executable state-machine/concurrency/restart tests.
