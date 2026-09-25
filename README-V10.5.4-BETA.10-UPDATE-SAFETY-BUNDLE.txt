Sharawla POS 10.5.4-beta.10 — Update Safety Bundle

Scope:
- Compact non-blocking update/offline/sync indicators only; no cashier/delivery/payment layout changes.
- Preserve Gate A / Gate B / Gate C and hardened pre-update SQLite backup.
- SHA-256 verification of downloaded installer against GitHub Release asset digest, fail-closed.
- Post-update startup health check: expected version, required runtime files, SQLite integrity_check, kv/local_operations readability.
- Last Known Good is written only after health passes.
- Safe Rollback preparation records prior good version, pre-update backup, cached prior installer if available, and never auto-rolls back blindly.
- Structured JSONL Update Log records CHECK, gates, download, integrity, backup, spawn, health, LKG and rollback recommendation.

Protected behavior intentionally unchanged:
app.js POS sales/payment logic; styles.css cashier/delivery baseline; restaurant-engine.js; licensing; Canonical Fingerprint; Business Connection; printing; offline sales flow.

Runtime target plan:
Install beta.10 on isolated SH-0007, then publish beta.11 as VERSION-ONLY and test beta.10 -> beta.11 end-to-end.
