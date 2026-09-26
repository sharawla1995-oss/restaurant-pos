# Sharawla POS — Restaurant RC1 Offline Final Action Verdicts

Candidate: `10.5.4-beta.58.30`
Source base: `9be6b390fffa931efc501eff8bf2dc3badf04841`
Source fix commit: `1aea3d8`
Generated from the pre-change exhaustive inventory; no SH-0007 device result is promoted from `MANUAL` without device evidence.

Summary: PASS 71 · ONLINE_ONLY_OK 53 · MANUAL 81 · FAIL 26 · Total 231.

Restaurant RC1 verdict: **NOT READY**. Any `FAIL` below remains release-blocking when its classification is `OFFLINE_REQUIRED` or it can expose a durable local success as failure / remove a critical cached screen.

| ID | Action | Classification | Final verdict | Evidence interpretation |
|---|---|---|---|---|
| A001 | Activation form: submit license key | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| A002 | Activation: retry verification | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| A003 | Activation: change license key | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| A004 | License grace while internet is absent | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| A005 | First-time backend setup form | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| A006 | Login with an already cached valid session | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| A007 | Login without any cached valid session | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| A008 | Logout while Offline | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| A009 | Full application restart while Offline | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| A010 | Cached bootstrap of business/profile/features | OFFLINE_READ_CACHE | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| A011 | Cached branch list and selected branch | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| A012 | Branch picker: change selected branch | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| A013 | Add branch | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| A014 | Manage branches: edit/toggle settings | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| A015 | Sidebar open/close and page navigation | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| A016 | Browser/Electron back-like modal close/cancel actions | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| A017 | Update center: inspect installed/candidate status | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| A018 | Update center: check/download/install update | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| A019 | Roll back to last-good build | NOT_APPLICABLE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| A020 | Developer contact / WhatsApp | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| A021 | Permission-hidden navigation item | OFFLINE_READ_CACHE | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| A022 | Permission-denied action click | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| A023 | Beta self-test / destructive acceptance controls | NOT_APPLICABLE | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| H001 | Open Home dashboard | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| H002 | Current open-shift card/counter | OFFLINE_READ_CACHE | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| H003 | Today sales/order counters | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| H004 | Active delivery counter | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| H005 | Home quick links/cards | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| H006 | Pending Offline operations indicator | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| H007 | Stale-data/offline banner | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| P001 | Open POS from cached catalog | OFFLINE_READ_CACHE | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| P002 | Switch category / search product | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| P003 | Add simple product to cart | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| P004 | Select variant | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| P005 | Add modifiers/extras | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| P006 | Select removed ingredients | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| P007 | Add item note | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| P008 | Offer bundle choices/quantity/note | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| P009 | Increase/decrease cart quantity | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| P010 | Weighted/decimal quantity entry | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| P011 | Remove cart line | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| P012 | Clear cart | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| P013 | Change order type dine-in/takeaway/delivery/pickup | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| P014 | Select table/service context where enabled | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| P015 | Delivery phone lookup | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| P016 | Choose cached customer/address/zone | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| P017 | Enter manual customer/delivery details | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| P018 | Assign cached driver during POS checkout | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| P019 | Apply order-level discount | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| P020 | Tax calculation | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| P021 | Service fee calculation | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| P022 | Apply promo code | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| P023 | Cancel promo | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| P024 | Cash checkout | OFFLINE_REQUIRED | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| P025 | Wallet checkout | OFFLINE_REQUIRED | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| P026 | InstaPay checkout | OFFLINE_REQUIRED | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| P027 | Mixed-payment modal validation | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| P028 | Mixed-payment checkout | OFFLINE_REQUIRED | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| P029 | Double-click checkout | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| P030 | Lost ACK after sale | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| P031 | App closes after local sale before sync | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| P032 | Reconnect and sale reconciliation | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| P033 | Pending sale appears immediately in Orders/Delivery/Home | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| P034 | Canonical stock effect for sale | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| P035 | Receipt print immediately after Offline sale | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| P036 | Kitchen/prep print immediately after Offline sale | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| P037 | Local printer failure | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| P038 | Bon/invoice continuity Online → Offline → Online | OFFLINE_REQUIRED | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| O001 | Open Orders list | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| O002 | Date range search / Today | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| O003 | Orders pagination | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| O004 | Open order details | OFFLINE_READ_CACHE | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| O005 | Open pending native V2 order details | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| O006 | Reprint customer receipt | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| O007 | Reprint prep receipt | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| O008 | Open return from order detail | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| O009 | Find sale by bon/invoice on Returns page | OFFLINE_READ_CACHE | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| O010 | Full return | OFFLINE_REQUIRED | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| O011 | Partial return quantities | OFFLINE_REQUIRED | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| O012 | Refund payment method selection | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| O013 | Double-submit return | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| O014 | Return stock restoration | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| O015 | Pending return visible immediately | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| O016 | Return receipt print | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| O017 | Return reconnect/ACK reconciliation | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| O018 | Cancelled/void order status display | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| C001 | Open Customers list | OFFLINE_READ_CACHE | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| C002 | Search cached customers | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| C003 | Create customer manually | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| C004 | Newly created Offline customer appears immediately | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| C005 | Update customer | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| C006 | Open customer addresses | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| C007 | Add address | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| C008 | Edit address | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| C009 | Delete address | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| C010 | Default/cached address visible in POS phone lookup | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| C011 | Customer dependency chain create → address → sale | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| C012 | Import customers from file | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| C013 | Customer duplicate-click create/update | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| C014 | Customer reconnect/ACK mapping | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| D001 | Open delivery/pickup queue | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| D002 | Queue status filters | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| D003 | Queue text search | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| D004 | Open cached delivery order detail/items | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| D005 | Pending Offline delivery sale appears in queue/detail | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| D006 | New → preparing | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| D007 | Preparing → ready | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| D008 | Ready pickup → completed | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| D009 | Ready delivery → assign driver | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| D010 | Out-for-delivery → delivered | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| D011 | Select final payment on delivery | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| D012 | Delivery payment change after completion | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| D013 | Confirm/reject website payment evidence | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| D014 | View uploaded payment receipt | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| D015 | Driver cash custody view | OFFLINE_READ_CACHE | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| D016 | Settle one driver order | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| D017 | Settle all driver custody | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| D018 | Reconnect order-status/driver assignment replay | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| D019 | Duplicate delivery transition/driver assignment click | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| D020 | Delivery settings: cached drivers/zones list | OFFLINE_READ_CACHE | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| D021 | Add/edit/deactivate driver | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| D022 | Add/edit/toggle delivery zone | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| K001 | Open kitchen queue | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| K002 | Kitchen order items/notes | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| K003 | Start preparing | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| K004 | Mark ready | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| K005 | Complete applicable local/pickup order | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| K006 | Repeated status click/replay | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| S001 | Open Shifts page/history | OFFLINE_READ_CACHE | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| S002 | Open shift | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| S003 | Double-submit open shift | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| S004 | Close shift | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| S005 | Close shift cash input/reconciliation | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| S006 | Close then reopen/new shift while Offline | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| S007 | Current shift sales/order/payment totals | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| S008 | Shift report detail | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| S009 | Print shift report | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| S010 | Open Expenses page/list | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| S011 | Create expense | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| S012 | Duplicate expense submit/replay | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| S013 | Edit expense | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| S014 | Expense date filters | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| S015 | Treasury page/read | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| S016 | Treasury post | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| R001 | Open Reports shell and choose report | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| R002 | Current-shift operational summary | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| R003 | Sales report for cached period | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| R004 | Product/category/payment reports for cached period | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| R005 | Returns/expenses cached reports | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| R006 | Delivery/driver report | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| R007 | Historical/live Cloud report outside cached data | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| R008 | Export current rendered report to CSV | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| R009 | Print current rendered report | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| R010 | Report date/filter form submit | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| I001 | Inventory overview from last loaded data | OFFLINE_READ_CACHE | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| I002 | Automatic stock effect of Offline sale | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| I003 | Automatic stock restore of Offline return | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| I004 | Manual product/ingredient stock adjustment | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| I005 | Supplier list/history | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| I006 | Create/edit/deactivate supplier | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| I007 | Purchase draft/order create/edit | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| I008 | Purchase receive/approve/post/cancel | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| I009 | Purchase return/debit/landed-cost actions | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| I010 | Purchase attachment archive search/view | ONLINE_ONLY_FAIL_CLOSED | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| I011 | Upload/delete purchase attachment | ONLINE_ONLY_FAIL_CLOSED | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| I012 | Stock count create/count/post/close | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| I013 | Transfer create/send/receive/cancel | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| I014 | Internal supply request/issue/receive | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| I015 | Waste/spoilage create/approve | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| I016 | Ingredients list/stock/cost from last load | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| I017 | Ingredient create/edit/conversion | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| I018 | Recipe draft/create/edit/activate | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| I019 | Recipe/waste/production advanced operations | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| I020 | Central warehouse pages/actions | NOT_APPLICABLE | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| I021 | Canonical Stock toggle/cutover actions | NOT_APPLICABLE | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| W001 | Open Online Orders page while Offline | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| W002 | Search/filter/paginate live website orders | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| W003 | Open website order detail/address | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| W004 | Accept website order | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| W005 | Reject website order | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| W006 | Confirm/reject/unpaid payment evidence | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| W007 | Website management hub read | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| W008 | Website availability/product toggle | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| W009 | Website branch settings/hours | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| W010 | Website payment configuration | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| W011 | Website appearance/logo/image upload/remove | ONLINE_ONLY_FAIL_CLOSED | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| M001 | Products/categories/modifiers list from bootstrap | OFFLINE_READ_CACHE | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| M002 | Create/edit/toggle/sort category | ONLINE_ONLY_FAIL_CLOSED | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| M003 | Create/edit/toggle/sort product | ONLINE_ONLY_FAIL_CLOSED | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| M004 | Product options/modifier mapping/removals | ONLINE_ONLY_FAIL_CLOSED | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| M005 | Product image upload/remove | ONLINE_ONLY_FAIL_CLOSED | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| M006 | Create/edit/toggle modifier | ONLINE_ONLY_FAIL_CLOSED | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| M007 | Promo list/read | ONLINE_ONLY_FAIL_CLOSED | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| M008 | Promo create/edit/toggle/delete | ONLINE_ONLY_FAIL_CLOSED | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| M009 | Users list/permissions | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| M010 | Create/edit/activate/deactivate user | ONLINE_ONLY_FAIL_CLOSED | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| M011 | Change another user's password | ONLINE_ONLY_FAIL_CLOSED | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| M012 | Business identity/financial/settings save | ONLINE_ONLY_FAIL_CLOSED | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| M013 | Printer profile/settings saved locally | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| M014 | Test print | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| M015 | Backup/export local Offline DB | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| M016 | Restore/reset/delete Offline evidence | NOT_APPLICABLE | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| M017 | Employee list/details/statement | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| M018 | Employee create/edit/salary | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| M019 | Advance create/approve/reject/disburse | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| M020 | Adjustment create | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| M021 | Payroll run/approve/pay | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| M022 | Tables CRUD/occupancy administration where present | ONLINE_ONLY_FAIL_CLOSED | ONLINE_ONLY_OK | Explicit Online-only boundary; Offline attempt must stop with Arabic internet-required UX. |
| B001 | Browser `online` event triggers sync | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| B002 | Periodic/automatic inbox pull | OFFLINE_READ_CACHE | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| B003 | Runtime cache warm on login/reconnect | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| B004 | Session refresh while Offline | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| B005 | Fully Offline before clicking action | OFFLINE_REQUIRED | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| B006 | DNS/fetch failure while `navigator.onLine` remains true | OFFLINE_REQUIRED | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| B007 | HTTP 5xx during sync | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| B008 | Temporary reconnect/flapping | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| B009 | Lost server ACK | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| B010 | App restart with pending operations | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| B011 | Duplicate click / repeated retry | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| B012 | Stale cached screen messaging | OFFLINE_READ_CACHE | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| B013 | Durable local success returned to UI | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| B014 | Durable write updates local projection | OFFLINE_REQUIRED | MANUAL | Source path/gate is ready; execute the referenced SH-0007 practical step. |
| B015 | Sync explicit ACK and server receipt | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| B016 | ACK reconciliation refreshes visible row/official identifiers | OFFLINE_REQUIRED | FAIL | Open RC1 blocker or incomplete fail-closed/atomic contract; see defect ledger. |
| B017 | Terminal conflict/DLQ preservation | OFFLINE_REQUIRED | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| B018 | Automatic destructive cleanup/reset | NOT_APPLICABLE | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| N001 | Retail weight/barcode settings | NOT_APPLICABLE | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| N002 | Retail offers/hold-resume/retail website orders | NOT_APPLICABLE | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| N003 | Pharmacy batches/prescriptions/expiry workflows | NOT_APPLICABLE | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| N004 | Warehouse generic POS commerce | NOT_APPLICABLE | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
| N005 | Service/Membership/Logistics generic POS commerce | NOT_APPLICABLE | PASS | Source trace and focused automated evidence satisfy this action; hardware-only proof is separated. |
