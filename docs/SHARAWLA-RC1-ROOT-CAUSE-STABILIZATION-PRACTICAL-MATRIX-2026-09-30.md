# SH-0007 Practical Acceptance Matrix — Root-Cause Stabilization

Date: 2026-09-30
Source baseline: `40511daacf42b8aed6201bd610f99f6d015d1a23`
Target device for later execution: `SH-0007` only
Status: procedure prepared; **not executed by this source task**

## Safety and evidence rules

- Never use SH-0005 or SH-0006.
- Do not reset, delete, retry, or mutate protected historical sequences 293, 304, or 316.
- Do not enable Canonical Stock or Point-4 cutover.
- Record the installed build SHA, device time, employee, branch, network transition times, local `client_tx_id`, Outbox state, server ACK, and final canonical row for every mutation case.
- A source/CI PASS is not a Practical Acceptance PASS. Mark a row PASS only after its complete visible and persistence lifecycle is observed on SH-0007.

## Preconditions

1. Review and authorize a Beta-only build and the required Beta-only SQL deployment separately. This matrix must not be run against a backend whose dispatcher/owner manifest is older than the reviewed source contract.
2. Confirm the build SHA and backend dispatcher contract in the evidence bundle.
3. Log in Online once with a test employee, select one Beta branch, and resolve the required Permissions V2 actions.
4. Warm the operational caches by opening Customers, Suppliers, Delivery Settings, Treasury, and Sharawla HR Online.
5. Confirm the Offline V2 queue has no unrelated new test rows. Preserve all historical evidence.
6. Prepare unique visible names containing the run timestamp for supplier, customer, driver, and zone cases.

## Acceptance cases

| ID | Scenario | Exact procedure | Required result/evidence |
|---|---|---|---|
| PA-01 | Sale Offline + Sync control | Go Offline; create one ordinary Restaurant sale; record receipt/reference and `client_tx_id`; navigate away/back; restart app Offline; reconnect; wait for ACK; reopen Orders. | Local success is immediate; sale survives restart; one Outbox event becomes synced; ACK maps one local order to one canonical order; exactly one visible order remains; totals and payment stay unchanged. |
| PA-02 | Supplier Offline + Sync | Go Offline; create a uniquely named supplier; verify list immediately; navigate away/back; restart Offline; reconnect; observe replay and ACK; query/reopen supplier list; trigger a safe repeated replay only through the approved acceptance harness. | Durable local row and Outbox event exist before reconnect; row survives restart; no DLQ for dispatcher contract skew; one canonical supplier is created; local identity reconciles; repeated replay does not duplicate. |
| PA-03 | Customer Create Offline + Sync | Go Offline; create a uniquely named/numbered customer; verify immediate search/list visibility; refresh and restart Offline; reconnect normally once; wait for ACK; reopen customer and address lookup. Do **not** inject ACK loss or force replay in PA-03. | Customer never disappears; one canonical customer exists; mapping is recorded; no duplicate customer or lost fields; subsequent lookup uses the canonical identity. |
| PA-04 | Delivery Management Offline access | With delivery permission resolved Online, go Offline and open Delivery Management/Settings from Sidebar and Home. | Page opens without “غير مسموح أوفلاين”; cached drivers/zones and pending local rows are shown; an explicit partial-Offline notice is visible; financial settlement remains unavailable. |
| PA-05 | Delivery Driver Offline lifecycle | Offline, add a uniquely named driver; verify immediate visibility; navigate away/back; restart; reconnect; wait for ACK; reopen list; repeat replay. | One durable local driver survives restart, becomes one canonical Cloud driver after ACK, and remains one visible row with no duplicate. |
| PA-06 | Delivery Zone Offline lifecycle | Repeat PA-05 for a uniquely named zone and distinctive fee. | Name and fee survive restart and ACK; one canonical zone and one final visible row; duplicate replay is idempotent. |
| PA-07 | Treasury Offline access | Resolve `treasury.view` Online and open Treasury once; go Offline; open Treasury from Sidebar and Home. | Both entries open the same Treasury owner; cached rows are readable and labelled local/stale. If no snapshot exists, the page still opens with an explicit no-cache state. Manual post is not offered Offline. |
| PA-08 | Treasury Sidebar parity | Online and then Offline, open Treasury once from Home and once from right Sidebar; capture route/page title and permission outcome. | Both paths resolve to the same `beta54-shared-core-ui` Treasury renderer and show identical permission behavior; no competing page is opened. |
| PA-09 | Sharawla HR Sidebar | Click the right-sidebar “Sharawla HR” parent. | The HR landing module opens, not the Employees list. The parent remains the only top-level HR entry. |
| PA-10 | HR ten-section navigation | On the HR landing page, enumerate and open Employees, Attendance, Schedules, Leaves, Advances, Adjustments, Rules, Payroll, Reports, Settings. | Exactly these ten canonical section identities exist subject to permission visibility; each permitted section opens its intended renderer; no independent top-level Employees/Advances/Adjustments/Payroll entry competes with HR. |
| PA-11 | Full HR File | Open Employees inside HR; choose two distinguishable employees in turn; click “ملف HR الكامل” on each. Repeat while one optional extension endpoint is unavailable in the Beta contract, if safely reproducible. | The selected employee identity/name is correct each time. Core employee data opens even if an optional HR extension section is unavailable; unavailable tabs say so instead of making the button inert. |
| PA-12 | Permission transition | Resolve permissions Online; without logging out, go Offline; open Delivery Management, Treasury read, and HR pages allowed by the cached resolution. Also test one known-denied permission. | Previously resolved allowed pages remain available within their declared Offline mode; denied actions remain denied; no global permission bypass occurs. |
| PA-13 | Restart persistence | With supplier, customer, driver, and zone rows pending, close the app completely, start it Offline, and reopen each operational list. | Every pending entity is reconstructed from durable state, not merely in-memory UI state; names, branch, and identifiers match pre-restart evidence. |
| PA-14 | Reconnect and replay | Reconnect once with the four pending entity types; monitor Outbox transitions and backend receipts. | Each registered operation is claimed, sent to the supported canonical owner, explicitly ACKed, and reconciled. No supported row becomes permanently orphaned or silently disappears. |
| PA-15 | ACK reconciliation | For each entity, compare pre-ACK local ID, ACK `server_entity_id`, mapping row, final cache/projection, and canonical Cloud row. | One local identity maps to one server identity; the pending local row is replaced/merged rather than appended as a duplicate. |
| PA-16 | Duplicate prevention / ACK loss — OPTIONAL / SEPARATE AUTHORIZATION | Run **only after separate explicit authorization** for fault injection. Use an approved network acceptance mode to lose one ACK after server commit, then reconnect/replay the same `client_tx_id`. If no separate authorization is given, keep PA-16 `NOT RUN` and do not block the normal PA-03 reconnect/replay path. | When authorized: server returns duplicate/idempotent ACK; exactly one canonical row exists; Outbox reaches synced; projection shows one record. |
| PA-17 | Local ID Cloud boundary | Before ACK, invoke only supported child/edit actions against a local `offline-*` entity where the UI exposes them. | The action is deferred/fails closed until mapping exists; no numeric/bigint Cloud query receives the local string ID. After ACK, the mapped numeric identity is used. |
| PA-18 | Treasury financial boundary | Offline, attempt driver settlement and verify manual Treasury post is absent; reconnect and re-open. | Offline financial writes are blocked without partial mutation. Read availability is not confused with write authority. |

## Closure rule

The candidate is Practically Accepted only when PA-01 through PA-18 have captured evidence and no new duplicate, disappearance, DLQ, permission bypass, navigation split, or Sale regression is observed. Any row not executed remains `NOT RUN`, never implied PASS from CI.