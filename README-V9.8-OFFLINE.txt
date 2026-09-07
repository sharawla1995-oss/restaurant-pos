Top Burger POS V9.8.0 OFFLINE CORE

Implemented:
- App shell works after first successful online load via Service Worker.
- Catalog/settings/user/branch cache in IndexedDB.
- If internet drops during POS checkout, sale is saved locally and receipt can be printed immediately.
- Cash / mixed payments are stored with the offline sale.
- Delivery order details entered in POS are stored with the offline sale.
- Open shift is cached for continued selling if connection drops after shift was opened online.
- Auto Sync runs when internet returns.
- client_tx_id unique key prevents duplicate invoices during retry/sync.
- Promo code is intentionally blocked offline because server validation is required.

Important current boundary:
This V9.8.0 is the offline sales foundation. Offline creation of new shifts, offline returns, offline expenses, and offline shift closing are NOT enabled yet; those remain online-only until the next offline stage so accounting is not weakened.

Install:
1) Run supabase-v9-8-0-offline.sql in Supabase.
2) Deploy all POS files.
3) Open POS online once on each device to seed its local cache.
4) Test: open shift online, disconnect internet, create sale, reconnect, verify one invoice only.
