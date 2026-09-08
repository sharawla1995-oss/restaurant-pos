Top Burger POS Windows V10.3
- Adds local-first opening and closing of shifts in Windows mode.
- Offline shift opens use a temporary local shift ID; sync opens the server shift first then remaps queued sales/expenses/returns/close to the real shift ID.
- Shift open/close sync is idempotent using client transaction IDs.
- Existing local-first sales, expenses and returns remain queued in SQLite/IndexedDB and sync automatically.
- Run supabase-v10-3-windows-offline-shifts.sql before using V10.3.
Important: website/live remote data still requires internet. Local shift reports while fully offline remain limited to locally cached activity.
