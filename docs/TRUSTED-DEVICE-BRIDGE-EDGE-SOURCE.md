# Trusted Device Bridge V1 — Edge Function Source

Status: SOURCE TEMPLATE / NOT DEPLOYED

Path: `supabase/functions/trusted-device-bridge-v1/index.ts`

The function is intentionally server-only. It requires server environment values for Restaurant URL/anon key/service-role key, fixed Restaurant business id, Sharawla Cloud URL and Cloud service-role key. No real secret or endpoint is committed.

Request from POS contains the normal Restaurant bearer session plus only `assertion_token`. Caller-supplied `business_id`, `device_id` or `device_fingerprint` are rejected.

The function independently validates the Restaurant employee session, consumes the opaque Cloud assertion with server-only Cloud authority, compares Cloud-derived business_id with the server-configured Restaurant business, then mints a short-lived Restaurant trusted context using server-only Restaurant authority.

Failure is fail-closed for official Bon capacity. The POS transport must preserve its existing OFF-* fallback when the bridge is unavailable or rejects verification.

This source does not authorize deployment or runtime activation.
