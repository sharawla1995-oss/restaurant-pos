Sharawla POS V10.4.18

1) Windows Business Connection Bootstrap
- Windows POS no longer depends on legacy sbUrl/sbKey setup.
- After license verification, POS calls Sharawla Cloud get_sharawla_business_connection using device_id + device_fingerprint.
- business_id is derived by Sharawla Cloud, not sent by the POS.
- Connection cache key: sharawlaBusinessConnectionV1, tied to business_id.
- Legacy sbUrl/sbKey are removed on Windows startup.
- Offline startup may use the matching cached business connection only while the existing license offline grace is valid.
- Browser/PWA manual setup behavior is retained for compatibility.

2) Weekly Website Hours
- POS > Website Management > Branch Settings now includes weekly opening hours per branch.
- Each day can be enabled/disabled and has open/close times.
- Overnight ranges are supported (example 12:00 -> 03:00 means 03:00 next day).
- Existing manual stop and temporary pause still override the weekly schedule.
- Schedule is disabled by default until explicitly enabled.
- Run supabase-v10-4-18-weekly-website-hours.sql on the BUSINESS Supabase project before using the hours UI.
- Customer website V6.6.0 reads the schedule and rechecks it before checkout/submit.
- Server-side trigger is authoritative and blocks orders outside hours even if a website client is stale.

Core stability
- main.js unchanged from V10.4.17.
- preload.js unchanged from V10.4.17.
- update-config.json unchanged from V10.4.17.
- manifest.json unchanged from V10.4.17.
- Auto Update architecture-aware logic therefore remains unchanged.
- No intentional changes to sales, printing, returns, reports, offline sync/backups, shifts, or licensing RPC behavior.

SAFE FINAL hardening:
- Change License is blocked while Offline Queue contains pending operations.
- Successful Change License clears business connection/session/login shared caches but keeps backup files and printing core intact.
- Sharawla Cloud RPC calls have a 15-second timeout only; business operational requests are unchanged.
- Weekly Hours UI includes an explicit 24-hour option per day. It is stored safely as open_time = close_time, which the existing server schedule function already treats as 24 hours.
