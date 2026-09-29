# Sharawla — Bon Numbering Policy V1

Status: DESIGN + SOURCE CONTRACT / DEPLOYMENT 0

## Product decision
Invoice numbering is unchanged and is NOT configurable by this feature.

Bon numbering is configurable per branch:
- SHIFT: each shift owns its own Bon sequence. This is the legacy/default behavior.
- BRANCH: all orders in the branch share one Bon sequence regardless of cashier, waiter tablet, website or integration source.

## Compatibility
SHIFT is the default. Existing online numbering, orders_shift_bon_unique and shift_bon_counters remain authoritative until an explicitly authorized migration is deployed.

BRANCH mode MUST NOT be enabled merely by changing a setting while the legacy shift-scoped uniqueness/counter contract is still active.

## Branch mode authority
When BRANCH mode is implemented/deployed:
- the server branch counter is the online allocation authority;
- all server-side sources (POS, waiter, website, integrations) consume the same branch namespace;
- offline-capable devices may consume only server-reserved disjoint capacity;
- source channel never creates a separate Bon namespace;
- shift_id remains attached to the order for employee/financial operations but does not own the Bon sequence.

## Shift mode authority
When SHIFT is selected:
- the server shift counter remains the allocation authority;
- reservations are scoped to the exact shift identity;
- closing the shift invalidates unused reserved capacity for that shift.

## Offline
Both modes use the same safety rule: no valid reserved capacity means OFF-* local reference, never guessed official Bon.
A consumed official Bon is durable and never recycled after crash, print failure, retry or restart.

## Policy changes
Changing policy is an administrative transition, not a casual runtime toggle.
A transition MUST be fail-closed while there are active shifts/reservations or pending Offline sales whose numbering scope could become ambiguous.
The transition requires server-side validation of existing numbers/counters before the new scope becomes authoritative.

## Required acceptance
Tests must cover SHIFT and BRANCH separately, multiple devices, waiter/POS sources, server-side sources, Offline exhaustion, restart, replay and policy-transition blocking.

This contract authorizes no Supabase deployment and no Production/SH-0007 change.
