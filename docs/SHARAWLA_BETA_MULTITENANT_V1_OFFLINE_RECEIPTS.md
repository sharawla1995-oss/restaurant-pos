# Sharawla Beta Multi-Tenant V1 — Offline receipt hardening

Status: **SOURCE PREP / NOT DEPLOYED**

Live Beta directed audit found:

- Receipt-touching SECURITY DEFINER functions: **62**
- Runtime receipt functions: **53**
- Maintenance/reset/acceptance functions: **9**
- Runtime functions mentioning `business_id` before this preparation: **0 / 53**

The generated draft pins the 53 live runtime bodies and scopes every receipt read by:

`business_id = public.current_business_id()`

It deliberately does **not** rewrite the client transaction id. The same client TX and payload therefore keep the existing replay contract, while the receipt lookup is tenant-bound. Inserts rely on the restrictive Multi-Tenant write trigger to stamp/validate `business_id` before the receipt row is stored.

The 9 maintenance/reset/acceptance utilities are revoked from `public`, `anon`, and `authenticated`; they remain database-admin/migration utilities instead of application APIs.

This closes the receipt lookup layer only. It does **not** yet claim that every business entity lookup inside those 53 functions is tenant-scoped. Root entity reads such as customer-by-phone, supplier/product lookup, etc. remain a separate RPC owner hardening gate.
