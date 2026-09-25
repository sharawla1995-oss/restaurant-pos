# Offline V2 Order Status — Source Contract

Status: **SOURCE PREP / NOT DEPLOYED / NOT WIRED**

The missing Offline status authority is defined as
`order_status_apply_offline_v2(order_id,target_status,client_tx_id)`.

It is deliberately narrow:
- preparing / ready / completed delegate to the F5A fulfillment owner.
- delivered is delivery-only and delegates to the accepted
  `delivery_mark_delivered_v2`, preserving payment, custody, settlement and audit behavior.
- replay is idempotent by `client_tx_id`; a replay with a different order or target fails closed.
- branch access is checked before delegation.

Transport integration is a separate coordinated step. The current Beta45 transport whitelist is
left untouched in this commit, so no existing Offline runtime behavior changes merely by preparing
this owner. F5E Orders UPDATE closure remains blocked until transport + renderer routing are proven.
