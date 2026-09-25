# Offline V2 — Customer + Delivery Durable Owner Design

Status: DESIGN GATE — SOURCE ONLY. No Supabase deployment. Production SH-0005 / SH-0006 untouched.

## Evidence baseline
- Customer renderer owners are customer_create_v2, customer_update_v2, customer_address_save_v2, customer_address_delete_v2.
- Current Offline V2 transport has no customer operation.
- Driver assignment owner is order_assign_driver_v2(order_id,driver_id); current renderer routing is explicitly online-only.
- Delivery completion economic owner is delivery_mark_delivered_v2(order_id,payment_method,client_tx_id).
- order_status_apply_offline_v2(delivered) already delegates to delivery_mark_delivered_v2 using the order's current payment_method.

## Rule
Offline must preserve the accepted online business owner. It must not reproduce table DML independently.

## Customer durable operations
Use distinct operation types:
- customer_create
- customer_update
- customer_address_save
- customer_address_delete

Every operation carries client_tx_id and an immutable payload digest. Server wrappers own an idempotency receipt keyed by client_tx_id and operation_type, advisory-lock the key, reject replay payload mismatch, then delegate exactly once to the corresponding accepted Permissions V2 owner.

### Identity
Customer create cannot depend on a server bigint before sync. The local entity gets a stable local reference derived from client_tx_id. The server ACK maps local reference -> server customer id. Address operations that depend on a newly-created offline customer MUST carry depends_on_tx_id and resolve the server customer id from the parent ACK before execution.

Customer update/delete for an already-synced customer use the server bigint id directly.

### Local projection
Create/update/address changes update only the local customer cache after the durable event commits. A failed durable commit must not change the visible local projection.

## Driver assignment durable operation
Operation type: delivery_assign_driver.
Payload: p_order_id, p_driver_id, p_client_tx_id.
Server wrapper: advisory lock + receipt + replay mismatch check, then delegate to order_assign_driver_v2. The wrapper must not update orders directly.

## Delivery completion
Do NOT create a second economic implementation.
Offline delivered continues through order_status_apply_offline_v2, which delegates to delivery_mark_delivered_v2. Acceptance must prove:
- order becomes delivered;
- final payment method is preserved;
- order_payments cardinality/value matches online semantics;
- delivery_payment_events has exactly one client_tx_id event;
- delivery_cash_custody_amount equals order total for cash and zero for non-cash;
- repeated sync does not change custody or duplicate payment events/receipts.

Changing payment method while offline is a separate future durable operation. Until implemented, Offline delivery completion uses the payment method already stored on the order.

## Acceptance gates
Customer: create, create+dependent-address, update existing, address edit/delete, restart before sync, lost ACK/replay, receipt cardinality, cache/cloud reconciliation.
Delivery assignment: ready delivery -> durable -> sync -> out_for_delivery, driver preserved, receipt cardinality=1, replay stable.
Delivery completion: out_for_delivery -> durable delivered -> sync -> economic checks above, replay stable.
No capability may be promoted to executable coverage until its runtime test exists and passes on SH-0007.
