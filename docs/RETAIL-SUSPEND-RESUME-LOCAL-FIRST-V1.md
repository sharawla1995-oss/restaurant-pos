# Retail Suspend / Resume Local-first V1

Source implementation status: IMPLEMENTED / CI PENDING. Deployment: 0.

Suspend is now a Native Offline V2 operation with a stable client_tx_id. The renderer clears the cart only after the Native commit succeeds. Resume reads a merged Cloud + Native outbox model, so pending holds survive renderer/app restart. Resume is a second durable operation; a locally-created hold declares a dependency on its suspend TX, while a server hold uses its numeric server id.

The Electron transport routes only these two operations to dedicated additive RC1 event RPCs. The historical generic Offline V2 apply function and the published beta17 SQL are not modified. The server source uses the existing Offline V2 receipt ledger plus advisory transaction locks for replay idempotency, branch authorization and explicit ACK.

No SQL was executed. No Production or SH-0007 runtime was changed.
