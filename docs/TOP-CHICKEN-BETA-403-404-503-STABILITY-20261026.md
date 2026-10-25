# Top Chicken Beta stability investigation — 2026-10-26

## Confirmed from live read-only sources

Target Supabase `xihcxydjnzemflhedzor` is ACTIVE_HEALTHY; its six discovered Edge Functions are ACTIVE, including `top-chicken-pin-login`, `top-chicken-staff` and `top-chicken-commercial-sync`. The Vercel project `top-chicken-pos-beta-preview` has a READY previous deployment; this alone does not prove runtime availability or logged-in operation.

Supabase unified edge logs over the preceding 24-hour default window show:
- **9 HTTP 404** requests: `GET /rest/v1/app_notifications_v1`. Read-only schema check: `to_regclass('public.app_notifications_v1') IS NULL`.
- **2 HTTP 403** requests: `POST /rest/v1/customers`.
- **1 HTTP 403** request: `POST /rest/v1/audit_logs`.
- **No HTTP 503 observed** in that selected window. A reported 503 cannot be called fixed or definitively diagnosed from these logs.
- All observed error requests above have the Windows `sharawla-pos-windows/10.5.19-rc.10` user-agent. This is critical: live Windows error symptoms are not exclusively the mobile PWA.

## Source-only fixes on this branch
- The optional v14 notification module skips the known-unavailable Top Chicken Beta notification table *before the first Windows read*, rather than one known 404 per boot. It retains an explicit unavailable badge/scope and does **not** invent unread notifications.
- The isolated PWA fetch wrapper returns an empty optional notifications collection without a network request, while continuing to reject all operational writes. This should not be interpreted as a working inbox; actual notifications remain unavailable.
- PWA website-order and return-approval polls increased from 5 to 15 seconds while visible, and pause while hidden/offline; other Windows/Top Burger poll cadences are unchanged.
- Automated assertions added for optional read and no-write preview.

## Remaining causes — not solved
- 403 customer/audit INSERT: requires examination of authenticated tenant header/membership, row-level policies, branch/customer linkage and actual response body. Do not disable RLS or broaden policies to make this pass.
- 503: requires timestamp + request endpoint + response code. Could be transient Auth/Edge or deployed function issue; logs do not establish which.
- Intermittent blank dashboard/slow bootstrap: existing `bootstrap()` fires 15 simultaneous REST calls and rejects whole initialization on any unhandled failure; needs staged critical/optional reads, performance profiling, and real desktop test. No client-side cache should be substituted for authoritative financial data.
- Existing Beta financial controls, backups, devices and Windows installation remain unchanged.

## Strict scope
No SQL, no Supabase Edge deploy, no Vercel deploy, no Production, no Windows installer update, no device operation, no real financial mutation. Source is not installed on cashier computers and the mobile Vercel origin is unchanged. **This is a partial source fix, not a field-verified stability resolution.**
