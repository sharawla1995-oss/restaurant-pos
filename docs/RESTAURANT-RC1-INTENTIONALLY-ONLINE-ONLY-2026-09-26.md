# Sharawla POS — Intentionally Online-only Actions

Candidate `10.5.4-beta.58.30`. These actions must never claim Offline success. `ONLINE_ONLY_OK` means the current candidate has an explicit fail-closed boundary; `FAIL` means its atomic/no-partial-mutation or Arabic UX contract is still incomplete.

| ID | Action | Verdict |
|---|---|---|
| A001 | Activation form: submit license key | ONLINE_ONLY_OK |
| A002 | Activation: retry verification | ONLINE_ONLY_OK |
| A003 | Activation: change license key | ONLINE_ONLY_OK |
| A005 | First-time backend setup form | ONLINE_ONLY_OK |
| A007 | Login without any cached valid session | ONLINE_ONLY_OK |
| A013 | Add branch | ONLINE_ONLY_OK |
| A014 | Manage branches: edit/toggle settings | ONLINE_ONLY_OK |
| A018 | Update center: check/download/install update | ONLINE_ONLY_OK |
| A020 | Developer contact / WhatsApp | ONLINE_ONLY_OK |
| P022 | Apply promo code | ONLINE_ONLY_OK |
| C012 | Import customers from file | ONLINE_ONLY_OK |
| D012 | Delivery payment change after completion | ONLINE_ONLY_OK |
| D013 | Confirm/reject website payment evidence | ONLINE_ONLY_OK |
| D014 | View uploaded payment receipt | ONLINE_ONLY_OK |
| D016 | Settle one driver order | ONLINE_ONLY_OK |
| D017 | Settle all driver custody | ONLINE_ONLY_OK |
| D021 | Add/edit/deactivate driver | ONLINE_ONLY_OK |
| D022 | Add/edit/toggle delivery zone | ONLINE_ONLY_OK |
| S013 | Edit expense | ONLINE_ONLY_OK |
| S015 | Treasury page/read | ONLINE_ONLY_OK |
| S016 | Treasury post | ONLINE_ONLY_OK |
| R007 | Historical/live Cloud report outside cached data | ONLINE_ONLY_OK |
| I004 | Manual product/ingredient stock adjustment | ONLINE_ONLY_OK |
| I005 | Supplier list/history | ONLINE_ONLY_OK |
| I006 | Create/edit/deactivate supplier | ONLINE_ONLY_OK |
| I007 | Purchase draft/order create/edit | ONLINE_ONLY_OK |
| I008 | Purchase receive/approve/post/cancel | ONLINE_ONLY_OK |
| I009 | Purchase return/debit/landed-cost actions | ONLINE_ONLY_OK |
| I010 | Purchase attachment archive search/view | FAIL |
| I011 | Upload/delete purchase attachment | FAIL |
| I012 | Stock count create/count/post/close | ONLINE_ONLY_OK |
| I013 | Transfer create/send/receive/cancel | ONLINE_ONLY_OK |
| I014 | Internal supply request/issue/receive | ONLINE_ONLY_OK |
| I015 | Waste/spoilage create/approve | ONLINE_ONLY_OK |
| I016 | Ingredients list/stock/cost from last load | ONLINE_ONLY_OK |
| I017 | Ingredient create/edit/conversion | ONLINE_ONLY_OK |
| I018 | Recipe draft/create/edit/activate | ONLINE_ONLY_OK |
| I019 | Recipe/waste/production advanced operations | ONLINE_ONLY_OK |
| W001 | Open Online Orders page while Offline | ONLINE_ONLY_OK |
| W002 | Search/filter/paginate live website orders | ONLINE_ONLY_OK |
| W003 | Open website order detail/address | ONLINE_ONLY_OK |
| W004 | Accept website order | ONLINE_ONLY_OK |
| W005 | Reject website order | ONLINE_ONLY_OK |
| W006 | Confirm/reject/unpaid payment evidence | ONLINE_ONLY_OK |
| W007 | Website management hub read | ONLINE_ONLY_OK |
| W008 | Website availability/product toggle | ONLINE_ONLY_OK |
| W009 | Website branch settings/hours | ONLINE_ONLY_OK |
| W010 | Website payment configuration | ONLINE_ONLY_OK |
| W011 | Website appearance/logo/image upload/remove | FAIL |
| M002 | Create/edit/toggle/sort category | FAIL |
| M003 | Create/edit/toggle/sort product | FAIL |
| M004 | Product options/modifier mapping/removals | FAIL |
| M005 | Product image upload/remove | FAIL |
| M006 | Create/edit/toggle modifier | FAIL |
| M007 | Promo list/read | FAIL |
| M008 | Promo create/edit/toggle/delete | FAIL |
| M009 | Users list/permissions | ONLINE_ONLY_OK |
| M010 | Create/edit/activate/deactivate user | FAIL |
| M011 | Change another user's password | FAIL |
| M012 | Business identity/financial/settings save | FAIL |
| M017 | Employee list/details/statement | ONLINE_ONLY_OK |
| M018 | Employee create/edit/salary | ONLINE_ONLY_OK |
| M019 | Advance create/approve/reject/disburse | ONLINE_ONLY_OK |
| M020 | Adjustment create | ONLINE_ONLY_OK |
| M021 | Payroll run/approve/pay | ONLINE_ONLY_OK |
| M022 | Tables CRUD/occupancy administration where present | ONLINE_ONLY_OK |
