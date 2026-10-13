# Top Chicken delivery status repair — proposed Beta-only migration (NOT DEPLOYED)

## Root cause
Authenticated role lacks UPDATE privilege on public.orders; direct REST PATCH of status fails 403. Do not grant broad UPDATE or weaken existing RLS.

## Server contract
RPC: `top_chicken_transition_order_status(p_order_id bigint, p_expected_status text, p_new_status text, p_request_id text)`.
- Authenticate with `auth.uid()`, find active employee by `auth_user_id`, bind exact business UUID `5358328c-9724-49aa-affc-1bce8be90f92`, exact branch ID 22, verify active branch assignment in `employee_branches`, role/permission policy. Never trust business/branch from client.
- `SECURITY DEFINER` must use `SET search_path = ''`, schema-qualified objects, explicit execute GRANT to authenticated only; no PUBLIC/anon EXECUTE.
- Lock order row `FOR UPDATE` scoped to both business and branch; check `p_expected_status` matches current; allow only `new -> preparing -> ready -> out_for_delivery -> delivered` for delivery, and `new -> preparing -> ready -> completed` for pickup; distinguish customer cancellation and returns.
- Idempotency: durable unique `(business_id, branch_id, p_request_id)` with digest binding order ID/expected/new/actor. Exact replay returns original result; changed payload rejects.
- Persist audit event transactionally with update; `delivered_at` only on final status. Recheck website order sync and offline receipts before implementation to avoid dual status owners.
- Client: replace direct PATCH calls in delivery modal and other delivery/kitchen paths with RPC; don't swallow errors; use generated stable request ID for retries.
- Verify positive transitions, forbidden transitions, cross-tenant, cross-branch, disabled staff, unauthenticated, duplicate and changed-payload replay, concurrent races, and offline restart. Do not deploy before tests.

## Release blockers
No complete authoritative transition owner/replay mapping has yet been verified. SQL deployment and app change are therefore **BLOCKED**, not PASS.
