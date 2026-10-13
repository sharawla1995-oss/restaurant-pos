# Top Chicken Beta prelaunch continuation — 2026-10-14

Scope: restaurant-pos / codex/top-chicken-sh0008-prelaunch-fixes. Starting HEAD 77d1c29a350419ef9a26401dc5429e557c6caa8b. Supabase Beta xihcxydjnzemflhedzor, business 5358328c-9724-49aa-affc-1bce8be90f92, branch 22. No production/device changes, no operational test data deletion.

## Current source candidate
- Driver assignment now uses a durable, authenticated RPC. Status and assignment wrappers verify current server membership, active employee and explicit branch assignment, action permission, exact tenant/branch order and driver, and compare expected state.
- Receipts bind actor/order/from/to/driver, retain original results, reject changed payload and serialize request keys. The existing fulfillment, assignment and financial delivery owners perform mutations. Delivery still records cash custody/payment through delivery_mark_delivered_v2.
- The three canonical owners need explicit ID allocation for audit rows and delivery payment rows in this restored Beta schema. The candidate repair pins exact deployed function hashes and allocates IDs only for Top Chicken. No live owner was replaced.
- Client retry identities include tenant and actor, survive an unknown response/app JS context restart, and clear only after ok=true. Assignment has no orders PATCH fallback. The UI reports errors instead of closing a modal on failure.
- A separate Windows ZIP build has its own appId/productName and prelaunch metadata. It blocks live HTTP/S and generic updater feeds, and places backups in its isolated userData. Existing builds without the metadata retain original behavior. It is a TEST build, not an installable release.

## Executed local tests
28 PostgreSQL16.3 WASM dependency-fixture tests PASS, including pickup/delivery state cycles, permissions, forbidden scopes, replay, audit/receipt rollback and one-time cash custody/payment. Eight actual-source client helper tests PASS. This is not a live Supabase Auth/PostgREST or site-to-cashier interface test. Native PostgreSQL cannot run under a non-root UID in this execution environment; WASM is single backend and does not prove multi-session races.

The existing smart-function v2 create payload was executed against the deployed employee dependency schema and rejected with 23502 (missing id). The retrieved Edge source also omits business_id, trusted membership creation and atomic permissions. Successful employee creation/Auth login is NOT proven and remains a release blocker. No live employee was created.

## Live safety correction
Read-only inspection found branch 22 orders_open=true, last modified 2026-10-11. In accordance with the user's mandatory closed-intake condition, only that Top Chicken setting was changed to false at 2026-10-13 22:43:29 UTC. No orders/customer/product/device rows were modified. Existing 13 orders with total 2955 were preserved. Previous counts must not be repeated as current without a fresh read.

## CI pending
The new workflow runs only on this exact branch. Native PostgreSQL16 uses an ephemeral local service with no external database credentials; concurrency uses two independent connections. It restores a synthetic dump to a second isolated database. Windows builds a ZIP with --publish never, checks packaged startup/updater/network blocking, and performs process A exit → process B SQLite persistence in a fresh userData directory. Artifacts are test evidence only; no release/deploy/installation step exists.

## Still blocked before live deployment or device installation
- Native CI results and isolated Windows runtime evidence are pending at this source commit.
- Full authenticated website pickup/delivery → cashier cycle is NOT RUN. Public intake remains closed; no live isolated session/test-only ingress is available.
- Employee create/login/provisioning must be repaired and tested atomically with tenant membership before release.
- Live operational profile identity currently belongs to another Beta business. The candidate preflight and runtime now fail closed until a Top Chicken binding is independently verified. Do not rebind it or interpret the local synthetic feature fixture as proof of Top Chicken Cloud entitlement behavior.
- No cleanup, counter reset, migration apply, device update or intake opening is authorized by this report.

## Native CI follow-up
Attempt 2 (65b9618edda96d65732b2e9cf95c41ce66fe564b) executed PostgreSQL16.15 successfully, including two-connection races and synthetic backup/restore. The packaged Windows application ran and exposed a renderer, but the first SQLite write failed with EPERM on the fixed .tmp path. The separately flagged prelaunch build now uses unique temporary SQLite filenames; existing builds retain their original behavior. Full Windows exit/restart is still pending revalidation.
