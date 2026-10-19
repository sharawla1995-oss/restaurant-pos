# Top Chicken Branch 22 — Operational PWA Gate / 2026-10-19

## Scope / hard boundaries
- Repo: `sharawla1995-oss/restaurant-pos`.
- New source-only branch: `codex/top-chicken-pwa-operational-gates-20261019`.
- Baseline: `codex/top-chicken-branch22-full-pos-pwa-preview-20261018`.
- Live Top Chicken PWA: `top-chicken-pos-beta-preview.vercel.app`, **not redeployed or modified**.
- Supabase read-only inspection **only**: Beta `xihcxydjnzemflhedzor`.
- **No** production Top Burger changes, SQL or Edge Function deployments, Beta database writes, device installs or edits (SH-0005/SH-0006/SH-0007/SH-0008), cutover, new costs, live orders, or financial enablement.

## What is implemented in this branch
1. Preview network guard rejects non-GET/HEAD `fetch` operations to **all** destinations unless they are exactly allowlisted Top Chicken Beta authentication or `has_permission` calls. Previous guard only covered Beta/Central Supabase domains. `sendBeacon` disabled in preview.
2. Preview no longer permits offline login, offline bootstrap, online-to-offline password verifier, customer cache, order-bundle cache, or open-shift/operational bootstrap persistence. Legacy Windows/Top Burger routes remain unchanged.
3. Offline banner no longer promises an auto-sync behavior that is not available in preview.
4. Runnable offline tests: `scripts/check-top-chicken-pwa-operational-gates.js`; isolated GitHub Actions workflow builds preview only and never deploys.
5. All changes are **development source only**, not yet on the publicly deployed PWA.

## Beta SQL metadata reviewed — READ ONLY
Queried `pg_proc`, `pg_policies` and selected `pg_get_functiondef` via the Supabase connector. Results verified that relevant `orders`, `order_items`, `order_payments`, `shifts`, `customers`, `employees`, `branches`, `expenses` tables have RLS enabled, but policy *presence* is **not** proof of attacker-negative enforcement.
- `current_business_id()` derives the selected business from authenticated active membership and an active employee; with a device header, it verifies the business/device binding. It does not simply trust a request header.
- `current_employee_id()` uses `auth.uid()` plus `current_business_id()`.
- `has_branch_access(branch)` checks branch ownership against `current_business_id()`. Thus lack of a literal `business_id` comparison inside a financial RPC is not by itself a demonstrated authorization bypass.
- `create_pos_order_atomic` checks the authenticated employee, branch access, matching open shift, totals and payments, and uses `client_tx_id`. However, the reviewed current body returns an existing order for a reused `client_tx_id` **without verifying the new payload digest**; also it does not visibly serialize concurrent identical requests with a transaction advisory lock. Must test/close changed-payload and concurrency semantics before mobile payments.
- `close_pos_shift_idempotent` checks actor/shift and driver custody but writes totals taken from `p_metrics` supplied by client. Reconciliation against authoritative server-side sales/expenses needs review before mobile shift close.
- `open_pos_shift_idempotent`, `create_pos_expense_idempotent`, `create_order_return_idempotent`, `offline_delivery_assign_driver_v1`, and `order_status_apply_offline_v2` exist; signature presence is not E2E proof.
- Legacy permissive OR-composed RLS policies for admin/branch access need adversarial real-JWT tests; policy summaries do not establish complete isolation.

## Candidate online sale gateway — SOURCE ONLY / isolated PostgreSQL 16 PASS
- Source-only draft: `sql/top-chicken-pwa-create-order-gateway-v1-DRAFT-NOT-DEPLOYED.sql`.
- Proposed RPC `top_chicken_pwa_create_order_v1` hard-binds the server-authenticated tenant, Branch 22 and acting employee, keeps `create_pos_order_atomic` as the canonical sale/payment writer, and uses a server-side SHA-256 payload digest plus transaction-scoped advisory lock.
- Dedicated immutable receipt rows reject changed-payload replay, replay under a different actor, and unknown legacy transactions without a receipt.
- PostgreSQL 16 **disposable CI** tests: exact replay, changed amount/payments, forged branch/tenant/actor, unauthorized grants, legacy key, plus simultaneous same/different-payload requests from two independent database sessions.
- Automated run **39192535053**: both jobs `offline-safety-and-preview` and `pg16-order-gateway-contract` **SUCCESS** ([GitHub Actions](https://github.com/sharawla1995-oss/restaurant-pos/actions/runs/39192535053)).
- These PG16 tests use stubbed actors/tenant functions and a mocked canonical writer. This **does not validate real Beta RLS, real pricing, stock, rewards, orders, shifts or real printout**. It is not permission to deploy or run financial writes.

## New draft shift-close gateway — separate, unapproved
- `sql/top-chicken-pwa-close-shift-server-metrics-v1-DRAFT-NOT-DEPLOYED.sql` offers `top_chicken_pwa_close_shift_v1(shift_id,closing_cash,client_tx_id)`. It does **not** accept client-supplied sales totals, cash expectations, expenses or custody figures.
- Authenticated Cloud membership, employee, Branch 22 and current open shift are checked under the server session. Server `shift_cash_metrics_v2` is the authoritative cash/driver-custody metric source. The accepted canonical `close_pos_shift_idempotent` remains the only financial writer.
- Distinct payload digest receipts block replay with a different cash amount or actor. Duplicate and changed-payload **concurrent** close requests were tested on a **disposable PostgreSQL 16 mock**, not live Beta.
- Browser receipt printing on the isolated PWA was corrected in source only: no browser background auto-print, no false "success" or audited print count if the OS printer outcome is unknown. Real paper printing must still be tested.
- CI run [39193480816](https://github.com/sharawla1995-oss/restaurant-pos/actions/runs/39193480816): two jobs SUCCESS, including PG16 sale and shift close concurrency.
- Validated the specific referenced table/column names exist in **Top Chicken Beta metadata read-only**, but did **not** test this draft using real Supabase functions, JWTs or payment/driver records. SQL was **not applied**.

## Operational go/no-go gates (all must PASS before opening writes)
| Gate | Status | Evidence still needed |
| --- | --- | --- |
| User can open/login and view Top Chicken PWA | PASS (user observation) | Existing deployed Beta preview |
| Isolated Beta Branch 22 selected | STATIC + user visual | Confirm real JWT and DB result on each protected action |
| Global network no-write guard | PASS in isolated mock CI | Existing live PWA unchanged; hardened source guarded |
| Auth & tenant enforcement for each operation | PENDING | Real role matrix and negative tests using isolated Beta test identities |
| Sale create/duplicate/replay/changed payload | DRAFT GATE PG16 PASS / BETA E2E PENDING | New source-only receipt gateway tested in disposable PG16; real Beta integration/auth/migrations not approved |
| Server-authoritative shift closure | DRAFT GATE PG16 PASS / BETA E2E PENDING | Server cash source, digest/replay/custody mock tests PASS; real role/settlement E2E not tested |
| Delivery status/driver assignment | PENDING | Valid/invalid transitions and actor/branch checks |
| Returns/expenses and manager approvals | PENDING | Auth/digest/duplicate/uncertain outcome |
| Browser receipt printing | HONEST-STATUS GUARD CODED / PHYSICAL PENDING | Browser print dialog not counted as confirmed printed receipt; physical device and Cairo receipt tests still pending |
| Offline sale/replay | DISABLED | Device-independent encrypted durable queue, power-loss and changed-payload tests; could defer to later |
| Payment/website and live orders | DISABLED | No external traffic/real payments until explicit approved release |

## Next technical sequence
1. Add dedicated **Top Chicken Branch 22** server-authoritative online operation contracts, routed only to Beta, with hard tenant/branch/actor binding and strong idempotency.
2. Test against disposable data in an explicitly isolated Beta fixture/transaction; no reset/deletion of existing orders, no live requests.
3. Exercise cash, delivery, refunds, shift lifecycle, printing, 401 recovery, and two-client concurrency with reproducible PASS/FAIL receipts.
4. Build a **new** candidate PWA on a separate non-live URL. Keep the present public preview read-only.
5. Only after objective PASS and owner's explicit approval: enable carefully scoped writes and controlled rollout. Offline stays disabled in initial operational candidate unless separately proven.

**Current operational readiness: NO-GO.** Source-only guard hardening is not an operational sign-off.
