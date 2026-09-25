# Offline Order Status Replay / Dependency Proof

Status: **STATIC SOURCE PROOF PASS / NO DEPLOYMENT**

The outbox links status events for local `offline-<sale_tx>` orders to the sale transaction, waits for the parent ACK, whitelists only the order-status owner on server transport, serializes replay by `client_tx_id`, and delegates delivery/fulfillment to their accepted owners. Renderer button rewiring remains the next source step.
