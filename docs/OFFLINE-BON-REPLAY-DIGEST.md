# Offline Bon Replay Digest Consistency

Status: SOURCE FIX / DEPLOYMENT 0

Native allocation mutates both the sale RPC payload and its durable local order record before the final payload digest is stored. A retry of the original renderer request does not yet contain that Native-assigned Bon.

Replay comparison now reconstructs both sides of the Native mutation from the already persisted event: reservation evidence in the RPC payload plus numbering mode, Bon number, reservation evidence and official-number state in the order record. The reconstructed request is then hashed against the stored digest.

This only normalizes fields that Native itself assigned. Any caller-originated payload difference remains a digest mismatch. Missing persisted/replay order records fail closed. No database or device was changed.
