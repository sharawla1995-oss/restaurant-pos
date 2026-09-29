# Retail Suspend / Resume — RC1 Ownership Audit

Status: **OPEN / SOURCE AUDIT COMPLETE / DEPLOYMENT 0**

Current RC1 behavior is not Local-first:

- Suspend calls `retail_suspend_sale` directly, then clears the cart.
- Resume reads `retail_suspended_sales` from Cloud, restores the cart, then calls `retail_delete_suspended_sale`.
- Native Offline V2 has no explicit `retail_suspend_sale` / `retail_resume_sale` operational owner.
- The legacy server resume contract is destructive deletion, so it does not provide an idempotent replay identity by itself.

Therefore this feature must not be advertised as Offline-safe yet.

Required source design before implementation:
1. Stable `client_tx_id` identity for suspend and resume.
2. Durable Native SQLite record before UI success.
3. Immediate local projection for suspended sales.
4. Restart recovery from Native records/outbox.
5. Resume as an idempotent state transition/tombstone, not blind destructive delete.
6. Server replay owner with duplicate/replay protection.
7. Branch and employee authorization preserved.
8. Local -> ACK -> Cloud reconciliation without duplicate suspended rows.
9. No new Offline queue; reuse Offline V2 Native store/outbox.
10. Regression tests for offline suspend, restart, resume once, reconnect replay, duplicate replay, two-branch isolation and crash boundaries.

This audit changes no runtime behavior and authorizes no database deployment.
