Top Burger POS Windows V10.4 - PC Test Package

- Same POS UI and Supabase backend.
- SQLite local runtime + local-first queue.
- Offline shifts/sales/expenses/returns sync foundation from V10.3.
- Native Electron HTML printing bridge for receipt/shift print jobs.
- SQLite backup at startup, every 10 minutes, and clean close.
- Backups: Documents\TopBurgerPOS\Backups
- Build installer on Windows: npm install then npm run dist.
- Output: dist\ (NSIS installer).

No new Supabase SQL beyond V10.3.
