# Offline Bon Local Record Consistency

Status: SOURCE FIX / DEPLOYMENT 0

Native Bon allocation happens after the renderer builds local records. The Outbox payload could therefore contain an official reserved Bon while the durable local order record still contained the pre-allocation order.

The Native transaction now mirrors the exact reservation evidence, Bon number, numbering mode and official-number state into the order record before digest, consumption and persistence. If a Bon is assigned but no durable order record exists, the transaction fails closed and rolls back.

This is compatible with the V2.4 branch-scope SQLite migration. Capacity exhaustion remains OFF-* fallback. No Beta or Production database/device was changed.
