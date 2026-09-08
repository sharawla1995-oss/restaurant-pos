Top Burger POS V10.4.9 — Offline + Backup Stability

- Windows local SQLite persists queue/bootstrap and now keeps last-good DB recovery copy.
- Automatic SQLite backups: startup, every 10 minutes, app close, and shift close (last 30).
- Automatic full Supabase JSON backup on Windows once daily and at online shift close (last 15).
- Manual full backup now paginates all rows (important for 5,000+ customers).
- Offline startup falls back to cached bootstrap instead of logging the cashier out.
- Session refresh before sync reduces failures after long internet outages.
- Pending queue can recover from desktop local_operations table.
- Existing customers/addresses are cached for offline phone lookup.
- Sync retries every 30 seconds while online and uses idempotent client_tx_id operations.
- Fixed the blank white pill: sync badge is readable and hides when nothing is pending.
