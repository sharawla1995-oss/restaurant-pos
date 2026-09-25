# Permissions V2 — F5E Orders Privilege Closure Readiness

Status: **BLOCKED / DO NOT REVOKE ORDERS UPDATE YET**

This is a source-only readiness audit. It authorizes no database deployment.

## Proven closed mutation families
- Fulfillment `new -> preparing -> ready -> completed`: candidate owner `order_fulfillment_transition_v2`.
- Driver assignment: candidate owner `order_assign_driver_v2`.
- Delivery completion Online: accepted owner `delivery_mark_delivered_v2`.
- Website payment review: hardened candidate `review_order_payment`.
- Website customer cancellation: accepted customer/phone-authorized owner remains separate.

## Current direct authenticated UPDATE authority
Historical RLS in `supabase-v7.sql` still contains `orders_branch_update`, allowing authenticated
branch-scoped UPDATE on `public.orders`. F5E must eventually retire this policy only after every
required Runtime path is routed through an owner.

## Blocking Offline finding
The Offline V2 takeover registry declares `order_status`, but the active transport resolver
`beta45-offline-v2-transport-runtime.js::resolveOperation` has no `order_status` target and throws
for unregistered transport types. Current delivery wrapper intentionally falls through to legacy
direct Orders PATCH while Offline. Therefore removing direct authenticated Orders UPDATE now can
break Offline delivery/status replay.

## Decision
**NO-GO for final Orders UPDATE privilege closure.**
First build and prove an idempotent Offline order-status owner/transport path that preserves delivery
custody semantics and does not replace the specialized Online delivery completion owner. Then re-run
this audit and only then prepare the F5E revoke/policy retirement artifact.
