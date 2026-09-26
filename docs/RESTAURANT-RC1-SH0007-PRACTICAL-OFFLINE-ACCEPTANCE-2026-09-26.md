# Sharawla POS — Exact SH-0007 Practical Offline Acceptance

Candidate: `10.5.4-beta.58.30`
Target: **SH-0007 only**, business **تجريبي**
Production SH-0005 / SH-0006: **do not open, install, configure, print, migrate, or write**
Canonical Stock: **OFF** · Cutover: **OFF**

This is the device-evidence script. It must be executed only after the relevant GitHub workflow is green and the single consolidated x64 candidate is available. A source/CI PASS is not a substitute for a recorded device result.

## Evidence format

For every numbered step record: `PASS / FAIL / ONLINE_ONLY_OK / BLOCKED`, wall-clock time, screenshot/video filename, visible pending count before/after, generated local transaction ID where available, and resulting server/order/receipt ID after reconnect. Record exact Arabic text for any failure. Never convert a failure to PASS because a later sync happened to succeed.

## Absolute safety preflight

1. Confirm Windows device name is **SH-0007**, selected business is **تجريبي**, and the branch is the isolated test branch. If any value differs, stop. Do not even open the installer on SH-0005/SH-0006.
2. Open the read-only Offline diagnostics. Photograph and record Seq293, Seq304, and Seq316, including their current status and digest. **Never click Retry, Delete, Reset, cleanup, migration, or self-test controls against them.** Expected: the three historical records remain unchanged for the entire run. `[H006, A023, M016, B017, B018]`
3. Record that Canonical Stock and Cutover are both OFF. Do not toggle them. Expected: both remain OFF. `[I021]`
4. Record current app version, updater state, printer profile, selected branch, open shift state, and a read-only local backup/export if already supported. Do not restore anything. Expected: read-only inspection works; rollback/restore is not exercised. `[A017, A019, M013, M015]`
5. Install the one approved consolidated x64 candidate once. Do not install intermediate builds. Expected: version is `10.5.4-beta.58.30`; update check/install and first-time backend setup are not attempted Offline. `[A005, A018]`

## Connected baseline and cache seed

6. With stable internet, sign in to the existing SH-0007 test account and select the test branch. Visit Home, POS, Orders, Customers, Delivery, Kitchen, Shifts, Expenses, Reports, Inventory, Products, delivery settings, and Online Orders once. Expected: business/profile/features, branch, catalog, operational entity rows, customers/addresses, drivers/zones, and current read-only counters cache successfully. `[A004, A006, A010, A011, A012, B003]`
7. From Home record open-shift, today sales/orders, active delivery, pending count, and the current time. Exercise quick links and sidebar/modal close controls. Expected: navigation works; permission-hidden items stay hidden and a direct denied action remains denied. `[A015, A016, A021, A022, H001, H002, H003, H004, H005, H006]`
8. Open or identify a test shift. If no shift is open, open one once and immediately double-click only as the explicit idempotency test. Expected: exactly one shift; second submit does not duplicate. Record opening cash and shift ID. `[S001, S002, S003]`

## Offline entry, restart, and cached shell

9. Disconnect the machine from the internet completely. Do not simulate this on Production infrastructure. Expected: a visible Arabic Offline/stale indicator appears and no cached data is silently presented as live. `[H007, B005, B012]`
10. Navigate every cached operational page seeded in step 6. Expected: Home/POS/Orders/Customers/Delivery/Kitchen/Shifts/Expenses/Reports remain usable from local state; no critical screen disappears solely because the network is absent. `[A015, H001, P001, O001, C001, D001, K001, S001, S010, R001]`
11. Close the application normally and cold-start it while still Offline. Expected: cached valid session/bootstrap/branch restore without destructive auth cleanup; business/profile/features and operational projections remain present. Then log out Offline and verify a user without a cached valid session is clearly asked for internet, without corrupting the cached account. Sign back in using the valid cached test session. `[A006, A007, A008, A009, A010, A011, B004, B010]`

## POS/cart and payment durability

12. In POS, switch categories, search, and add cached simple products. Exercise variant, modifiers, removed ingredients, line note, offer choices/note, quantity +/−, decimal/weight input, line remove, clear-cart then rebuild. Switch order types and table/service context where enabled. Expected: all local cart behavior works without Cloud calls and calculations remain stable. `[P001, P002, P003, P004, P005, P006, P007, P008, P009, P010, P011, P012, P013, P014]`
13. Exercise delivery phone lookup, cached customer/address/zone selection, manual delivery details, cached driver choice, discount, tax, service, promo apply/cancel. Expected: cached/local operations work. If promo validation contract is Cloud-only, it must stop before cart mutation with an Arabic internet-required message; it must never half-apply. `[P015, P016, P017, P018, P019, P020, P021, P022, P023]`
14. Create separate low-value test sales for Cash, Wallet, InstaPay, and mixed payment. Validate the mixed-payment total once incorrectly, then correctly. Double-click one checkout button. Expected: each valid sale returns local success immediately, exactly one durable event per checkout, correct tender split, and no `Failed to fetch`. Current candidate verdict remains **FAIL** until this device proof passes. `[P024, P025, P026, P027, P028, P029, B011, B013, B014]`
15. For one sale, disconnect/retain Offline after clicking and close the app immediately after the local success indication. Restart Offline. Expected: sale remains in Orders, applicable Delivery, Home totals, and pending indicator with the same client transaction; no duplicate. `[P031, P033, B010, B013, B014]`
16. Simulate a local printer unavailable condition only on SH-0007, then make one durable sale. Expected: sale remains committed exactly once; Arabic print error/retry UX appears; the sale is not rolled back or resubmitted. Restore the existing SH-0007 printer profile without changing Production. Test customer receipt and kitchen/prep print, then reprint both from order detail. `[P035, P036, P037, O006, O007, M014]`
17. Record Online baseline bon/invoice N, make one Offline sale, then later reconnect and make one Online sale. Expected product requirement: usable official continuity N, N+1, N+2 with no `OFF-*`, collision, or renumber ambiguity. **Known current result: FAIL because the Offline sale still uses `OFF-*`. Do not mark RC1 ready.** `[P038, B016]`

## Orders, customers, delivery, and kitchen

18. In Orders while Offline, test Today/date filter, pagination, normal detail, pending native order detail, cancelled/void display, and bon/invoice search from Returns. Expected: cached/pending rows and details remain visible. Known current gap: bon/invoice lookup for the still-local official number flow is **FAIL**. `[O001, O002, O003, O004, O005, O009, O018]`
19. Search cached customers; create a uniquely named customer; immediately search/select it. Double-click Create once as the duplicate test. Update the customer. Attempt bulk import Offline with a disposable file but stop at the preflight boundary. Expected: immediate durable single-customer success, one customer, cached visibility, no `Failed to fetch`; bulk import refuses before importing any row with a clear Arabic internet-required message. `[C001, C002, C003, C004, C005, C012, C013]`
20. Open that customer's addresses; add, edit, set/use, and delete a disposable address. Create a second customer → address → delivery sale chain before reconnect. Expected: textual local IDs remain valid; phone lookup sees the customer/default address; dependency order is preserved. If the isolated backend has not yet received the reviewed dependency-rewrite SQL, mark the reconnect part BLOCKED—not PASS—and do not deploy it from this script. `[C006, C007, C008, C009, C010, C011]`
21. Open Delivery Offline; filter each status, search, open a cached order, and open the pending Offline delivery sale. Expected: queue/detail/items do not disappear and visibly state Offline/stale. `[D001, D002, D003, D004, D005]`
22. Advance disposable orders through New → Preparing → Ready; complete pickup; assign a cached driver; move delivery to out-for-delivery/delivered; select final permitted payment; double-click one transition and one assignment. Expected: one durable ordered transition each, immediate local projection, no Cloud-only override. Payment change after server completion must require fresh online eligibility and fail closed Offline. `[D006, D007, D008, D009, D010, D011, D012, D018, D019]`
23. Inspect driver custody before reconnect and try one-order/all settlement only if the UI legitimately exposes test data. Expected requirement: pending delivered cash is coherent locally and cannot allow unsafe close/settlement. **Known current verdict: FAIL for complete pending custody projection; D016/D017 are Online-only and must refuse Offline before mutation.** `[D015, D016, D017]`
24. Open cached driver/zone settings. Inspect lists, then attempt add/edit/deactivate driver and add/edit/toggle zone Offline. Expected: list remains readable; mutations stop before any partial Cloud write with a clear Arabic internet-required message. `[D020, D021, D022]`
25. In Kitchen, inspect items/notes for cached and pending orders; execute preparing, ready, and applicable complete; repeat one status click. Expected: merged local projection, one durable transition, no stale disappearance. `[K001, K002, K003, K004, K005, K006]`

## Returns, expenses, shifts, and reports

26. Return a previously synchronized cached sale: open from order detail, perform one full return and one partial-quantity return on separate disposable sales, select refund tender, double-submit one return, inspect stock expectation, local visibility, print, then reconnect later. Expected: exactly one local return event per submit, visible immediately, correct tender/quantity, and later ACK reconciliation. `[O008, O010, O011, O012, O013, O014, O015, O016, O017]`
27. Attempt return of a brand-new still-pending Offline sale. Expected product requirement: dependency-gated durable return. **Known current result: FAIL** because server order/item mapping is unavailable before parent ACK. Record without inventing or manually rewriting IDs. `[O010, O011]`
28. Open Expenses, inspect date filters, create one unique expense, and double-click submit. Attempt edit. Expected: create is one durable event and appears in expense list/current shift totals. Edit is Online-only unless an explicit registered local owner is shown; then it must fail closed before mutation. `[S010, S011, S012, S013, S014]`
29. Inspect current shift totals and detail after sales/return/expense. Print the shift report. Attempt close with recorded cash and then reopen/new shift Offline only after confirming the custody guard is safe. Expected: local totals include pending operations; close/open are exactly once; unresolved custody blocks close clearly. `[S004, S005, S006, S007, S008, S009]`
30. Open Treasury and attempt a manual posting Offline. Expected: both the live treasury read and posting are Online-only and refuse before mutation with clear Arabic internet-required UX; no stale treasury balance is presented as authoritative. `[S015, S016]`
31. Run current-shift, cached-period sales, product/category/payment, returns/expenses, and delivery/driver reports. Submit date filters; export and print only the currently rendered local result. Query an uncached historical/live range. Expected: provable local rows include pending operations and show stale scope; uncached live history refuses/labels unavailable rather than showing a false zero. `[R001, R002, R003, R004, R005, R006, R007, R008, R009, R010]`

## Inventory, purchasing, website, and administration boundaries

32. Inspect Inventory overview and compare the expected sale decrease and return restoration without enabling Canonical Stock. Attempt to open ingredient stock/cost. Expected: no invented live accuracy; ingredient stock/cost is Online-only and refuses clearly. **Known current verdict: FAIL for a coherent full inventory snapshot; automatic effects must not be claimed beyond the supported local projection.** `[I001, I002, I003, I016]`
33. Attempt each exposed inventory-critical read/write Offline: manual adjustment; supplier list/mutation; purchase create/edit/receive/approve/post/cancel/return/debit/landed cost; count; transfer; supply; waste; ingredient mutation; recipe/production; central warehouse. Expected: every unsupported action, including live supplier/history data, refuses before mutation with clear Arabic internet-required UX. `[I004, I005, I006, I007, I008, I009, I012, I013, I014, I015, I017, I018, I019, I020]`
34. Search/view the cached purchase attachment archive if available; attempt upload/delete Offline. Expected: no partial object or metadata mutation and a clear Arabic message. **Current verdict remains FAIL until raw storage preflight is proved.** `[I010, I011]`
35. Open Online Orders Offline; search/filter/paginate and open details; try accept/reject/payment-evidence review. Open website management and attempt availability, branch hours, payment config, and appearance/logo/image changes. Expected: live Cloud data and all mutations show explicit Arabic internet-required state, never an empty-success screen or partial upload. `[W001, W002, W003, W004, W005, W006, W007, W008, W009, W010, W011, D013, D014]`
36. Inspect the bootstrap-backed Products/categories/modifiers list, then attempt every exposed category/product/options/image/modifier/promo/user/password/business-settings read or mutation Offline. Expected: only the defined bootstrap product read remains cached; promo and security/user reads are live Online-only; every unsupported mutation fails closed before first write. Printer settings remain local-only and test print behaves per step 16. Current multi-step/raw-storage items remain FAIL until proved atomic. `[M001, M002, M003, M004, M005, M006, M007, M008, M009, M010, M011, M012, M013, M014]`
37. Attempt employee list/details/statement, employee/salary, advance lifecycle, adjustment, payroll, and tables administration Offline. Expected: these Cloud-authoritative HR/admin actions are Online-only and fail closed before read is misrepresented or any mutation begins. `[M017, M018, M019, M020, M021, M022]`
38. Verify activation/license grace. Attempt activation retry/key change only with a disposable invalid test value if safe; inspect branch add/manage and developer contact. Expected: grace remains usable from trusted cached state; all live activation/backend/branch mutations require internet clearly. Do not change the valid device binding. `[A001, A002, A003, A004, A013, A014, A020]`
39. Verify cross-profile controls are not falsely counted as Restaurant Offline support: retail barcode/weight/offers/hold-resume, pharmacy, warehouse, service, membership, and logistics actions. Expected: hidden or NOT_APPLICABLE for the Restaurant profile; no mutation. `[N001, N002, N003, N004, N005]`

## Network failures, reconnect, ACK, and final invariants

40. With a controlled SH-0007-only network setup, test DNS/fetch failure while the OS still reports online, then a safe HTTP 5xx response, then temporary flapping. Expected: durable registered operations remain local-success; read screens use labelled cache; unregistered mutations fail closed; retries preserve the same idempotency key. `[B006, B007, B008, B011, B013, B014]`
41. Trigger a registered test sale where the server commits but the client loses the ACK, using only the existing acceptance harness/safe network control. Expected: one server receipt/order, one client transaction, explicit ACK on retry, no duplicate sale/payment/stock event. `[P030, B009, B015]`
42. Restore stable internet. Do not press Retry/Delete/Reset on Seq293/304/316. Wait for automatic sync and inbox pull. Expected: browser online event triggers sync, periodic pull resumes, pending operations reconcile by `client_tx_id`, visible rows refresh without duplication, and terminal conflicts remain preserved. `[P032, C014, D018, B001, B002, B003, B008, B015, B016, B017]`
43. Revisit Orders, Customers, Delivery, Kitchen, Home, Shifts, Expenses, and Reports. Compare every local transaction recorded above to its single server entity and ACK. Expected: one-to-one reconciliation; no vanished durable success, no extra duplicate, and no raw `Failed to fetch` for anything already committed locally. `[P033, O017, C014, D018, B013, B014, B015, B016]`
44. Reopen diagnostics and compare Seq293/304/316 to step 2. Expected: byte-identifying fields/status/digest unchanged and no destructive cleanup occurred. Confirm Canonical Stock and Cutover remain OFF. `[A023, I021, M016, B017, B018]`
45. Final release decision: retain **NOT READY** if step 14, 17, 21–23, 27, 32, 34–36, 40–43 has any unexpected result; if any `OFFLINE_REQUIRED` action fails; if a durable success was shown as network failure; or if a critical cached screen became unusable. With the known official-number, pending-return, custody, inventory, and raw-storage gaps, this candidate must currently remain **NOT READY**.

## Complete action-ID coverage index

The exact expected classification and current verdict for each ID is in `RESTAURANT-RC1-OFFLINE-FINAL-VERDICTS-2026-09-26.md`; the steps above provide its practical action and expected observation.

| Step | Covered action IDs |
|---|---|
| 1–5 | A005, A017, A018, A019, A023, H006, I021, M013, M015, M016, B017, B018 |
| 6–11 | A004, A006–A012, A015, A016, A021, A022, H001–H007, P001, O001, C001, D001, K001, S001–S003, S010, R001, B003–B005, B010, B012 |
| 12–17 | P001–P038 except P030/P032/P034; O006, O007; M014; B011, B013, B014, B016 |
| 18–20 | O001–O005, O009, O018, C001–C011, C013 |
| 21–25 | D001–D012, D015–D022, K001–K006 |
| 26–31 | O008, O010–O017, S004–S016, R001–R010 |
| 32–34 | I001–I020 except I021 |
| 35 | W001–W011, D013, D014 |
| 36–37 | M001–M014, M017–M022 |
| 38 | A001–A004, A013, A014, A020 |
| 39 | N001–N005 |
| 40–44 | P030, P032–P034, C014, D018, A023, I021, M016, B001–B018 |

Explicitly covered elsewhere within the same steps: `A001–A023`, `H001–H007`, `P001–P038`, `O001–O018`, `C001–C014`, `D001–D022`, `K001–K006`, `S001–S016`, `R001–R010`, `I001–I021`, `W001–W011`, `M001–M022`, `B001–B018`, and `N001–N005` — all 231 inventory actions.
