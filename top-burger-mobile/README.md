# Top Burger POS Mobile — 10.5.3-mobile.1

This mobile PWA is based on the exact Sharawla POS 10.5.3 frontend snapshot:

- Source commit: `d5880f3b7dc48a056bec846a2a874d327e6df200`
- Mobile path: `/restaurant-pos/top-burger-mobile/`
- Business backend: existing Top Burger production connection stored in this browser origin.

Parity brought from 10.5.3:
- Product variants (Single / Double / Triple where configured).
- Offer-specific item flow.
- Returns.
- Promo codes.
- Website management.
- Website product availability.
- Website branch order/preparation settings.
- Website payment settings.
- Website appearance/contact settings.
- Current products/users/settings/reports behavior and permission checks.

Mobile-only adaptations:
- Browser/PWA skips Electron device licensing and never rebinds a production device.
- Runtime metadata uses the bundled Restaurant Engine without changing Sharawla Cloud.
- Sidebar backdrop and cashier cart drawer are phone presentation only.
- Service worker/cache are scoped to this subdirectory.

Safety:
- No Supabase SQL or migration in this update.
- No production device action.
- No reset/rebind.
- SH-0005 / SH-0006 remain untouched.
- Root Sharawla files remain untouched.
