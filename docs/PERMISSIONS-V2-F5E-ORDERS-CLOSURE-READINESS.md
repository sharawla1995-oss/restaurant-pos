# Permissions V2 — F5E Orders Privilege Closure Readiness

Status: **SOURCE READINESS PASS / CLOSURE ARTIFACT MAY BE PREPARED**

No database deployment is authorized by this document.

The previous Offline blocker is resolved in source: order_status has a registered transport owner, local offline order IDs are dependency-deferred until a server ID exists, and Offline delivered is captured into the durable order-status path. The renderer has zero direct Orders PATCH mutation paths.

Specialized owners remain separate: fulfillment uses order_fulfillment_transition_v2; driver assignment uses order_assign_driver_v2; Online delivery completion uses delivery_mark_delivered_v2; Offline delivered replays through the order-status owner into the same delivery owner; website payment review uses the Action-gated review_order_payment; customer website cancellation remains its customer/phone-authorized security-definer owner.

Historical orders_branch_update still exists and is not changed here. The next step is a SOURCE-ONLY F5E closure artifact that retires direct authenticated Orders UPDATE authority while preserving execution through the accepted security-definer owners. Deployment remains a separate gated phase.
