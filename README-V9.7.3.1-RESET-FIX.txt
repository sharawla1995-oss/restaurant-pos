Top Burger POS V9.7.3.1 - Reset Fix

Fix:
- Reset selected no longer deletes order_items before return_items.
- Sales reset deletes returns and return details first.
- Clean sales reset also clears promo redemption usage and website test/intake orders.
- Invoice and return counters reset to 1 after a full sales reset.
- Shift bon counters are cleared safely.

Deployment:
1) Run supabase-v9-7-3-1-reset-fix.sql in Supabase SQL Editor.
2) No front-end upload is required for the fix; the existing V9.7.3 button uses reset_pos_data automatically.
3) Return to POS > Settings > Backup/Restore and use Reset Selected again.

Recommended Clean Start selections:
- Orders / sales / returns
- Shifts
- Expenses
- Delivery (only if its drivers/zones are test data; otherwise leave unchecked)
- Customers (optional)
- Audit Log (optional)

Do NOT select Catalog, Promos, Permissions, or Settings if you want to preserve the configured system.
