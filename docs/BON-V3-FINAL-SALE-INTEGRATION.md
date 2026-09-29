# Bon V3 Final Sale Integration

Status: SOURCE CONTRACT / DEPLOYMENT 0

Final review found that storing `bon_trusted_device_context` in the durable Offline payload is not sufficient by itself. Current sale owners still route through their existing RPCs, and the historical V1 sale integration consumes reservation evidence through Bon V1.

The required final rule is now explicit: any sale carrying `bon_reservation` must consume it through `pos_consume_sale_bon_v3` in the same database transaction and before the first durable order write. The helper derives the opaque `verified_device_context_id` from durable sale evidence and delegates ownership validation to Bon V3.

A reserved Bon may not silently fall back to V1 fingerprint-only proof. Sales without reservation evidence retain existing online numbering behavior.

This commit is source-only. Existing live sale RPC definitions are intentionally not replaced until the final owner-by-owner integration/deployability review is complete.
