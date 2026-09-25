# Online → Offline Order Continuation Proof

Status: SOURCE PROOF PASS / runtime acceptance still required
Date: 2026-09-25

Required behavior: an order created or advanced Online with a real server ID may continue through supported fulfillment states after connectivity drops. Offline V2 records the next state event against that same server order ID and replays it later.

Verified source paths:
- fulfillment router: Online -> order_fulfillment_transition_v2; Offline -> SharawlaOfflineV2Takeover.saveOrderStatus(raw,target)
- Offline V2: numeric server order IDs are accepted directly for order_status events
- only nonnumeric local order IDs are dependency-gated until their parent sale obtains a server ID
- delivery completion Offline uses saveOrderStatus(raw,'delivered') and later delegates server-side to delivery_mark_delivered_v2

Therefore the intended model is one continuous lifecycle, not separate Online and Offline orders.

Still required before final closure: controlled runtime acceptance covering Online-created order -> connectivity loss -> Offline next transition -> reconnect/sync -> further Online transition, including UI projection and duplicate/replay checks.
