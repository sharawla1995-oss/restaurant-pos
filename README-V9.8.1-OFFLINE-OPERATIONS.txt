Top Burger POS V9.8.1 Offline Operations

Adds:
- Offline expenses queued and auto-synced with idempotency.
- Offline returns for invoices already cached on the same device; auto-sync with duplicate protection.
- Recent order cache for offline details/reprint/return search.
- Existing V9.8.0 offline sales remain unchanged.

Important:
- A brand-new offline sale must sync before it can be returned.
- Opening/closing a shift while offline is NOT enabled yet. Keep the current shift open during an outage.
- Promo validation still requires internet.

Install: run supabase-v9-8-1-offline-operations.sql then deploy these files.
