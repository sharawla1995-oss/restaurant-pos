# SH-0007 — 10.5.4-beta.58.26 Runtime Operator Checklist

Status: OPERATOR CHECKLIST
Purpose: close G0 -> G3 when the laptop/device is available
Target device: SH-0007 only
Production devices: DO NOT USE

---

## 0. Hard safety boundary

Do not run this checklist on:
- SH-0005
- SH-0006

Do not:
- activate Canonical Stock;
- activate Cutover;
- change Canonical Fingerprint;
- Rebind a Production device;
- point SH-0007 to Production backend;
- run Beta against Top Burger Production.

Target:
- Support Code: SH-0007
- Beta Business: تجريبي
- Branch: TEST
- Beta backend only.

---

## 1. Candidate artifact

Approved SH-0007 x64 artifact:

Artifact ID:
`10827943631`

Artifact name:
`sharawla-pos-f76d22b4caa2fb537e72ce4339963d4ce7964a11-sh0007-x64`

Expected ZIP digest:
`sha256:e0cad61a208754b5183946b7835cfbaafe36b58441ce10614ebe84ac8f60a1fd`

Expected installer inside:
`Sharawla-POS-Setup-10.5.4-beta.58.26.exe`

The commit `f76d22...` is documentation-only relative to runtime source `047a468...`.

No newer docs-only branch commit requires a different Runtime installer.

---

## 2. Before install

Record:
- current app version;
- Support Code;
- Business name;
- current branch;
- current Update channel;
- Offline pending count;
- whether an open shift exists.

Expected identity:
- SH-0007
- Beta channel
- isolated Beta Business/backend.

If identity does not match:
STOP.
Do not install/run acceptance.

---

## 3. Install 58.26

Install only on SH-0007.

After launch verify:
- version badge shows 10.5.4-beta.58.26;
- channel = BETA;
- app reaches Login normally;
- no Activation/Rebind prompt;
- Support Code remains SH-0007;
- Business remains تجريبي;
- branch remains TEST / intended Beta branch.

Any identity regression:
FAIL G0 immediately.

---

## 4. Pre-acceptance health

Before Full Sandbox:
- login as Beta Admin/test admin;
- confirm normal navigation loads;
- confirm no unexpected Production data;
- confirm Offline queue status is visible;
- note unresolved count before test.

Record:
`offline_unresolved_before = ____`

---

## 5. Open Full Acceptance Center

Path:
Owner Diagnostics
-> Full Acceptance Center

Select:
- Profile: restaurant
- Level: full
- Mode: sandbox

Use:
**Full Sandbox**

Do not use a Production/write mode outside the SH-0007 sandbox lock.

---

## 6. G0 required result

Critical required row:

`beta55.restaurant-full-roundtrip ........ PASS`

Also require:
- cleanup_zero = true;
- cleanup residue = 0;
- no new unresolved Offline delta.

Record:
`offline_unresolved_after = ____`

Required:
`offline_unresolved_before == offline_unresolved_after`

---

## 7. If Restaurant Full Roundtrip fails

Capture the exact line:

`[restaurant-full-roundtrip:<stage>] <error>`

Possible stage examples:
- fixture
- ingredients
- UOM
- opening-stock-adjustment
- supplier
- purchase-order
- purchase-receive
- supplier-return
- stock-count
- stock-transfer
- waste
- sale-recipe
- prep-recipe
- production
- tables-open
- sale
- return
- tables-close

Do not:
- rerun blindly multiple times;
- weaken Point4 Identity V1;
- replace UUIDv4 requirement;
- disable cleanup guard;
- ignore residue.

Stop and fix the exact stage owner.

---

## 8. Broad regression rows

G0 is not accepted if critical existing gates regress.

Verify at minimum:
- navigation smoke = PASS;
- Offline Native health = PASS;
- Login/Permissions = PASS;
- Delivery/Settlement gates = PASS;
- Shift/Cash integration = PASS;
- Backup/Recovery gates = PASS;
- Printing contract = PASS.

MANUAL rows remain MANUAL unless manually executed.
Do not convert MANUAL to PASS by assumption.

---

## 9. G1 Shared Routes — manual clicks

After G0 PASS open each route manually.

### Suppliers

Expected Restaurant presentation:
- الموردين
- Restaurant supplier workflow
- no Retail-specific catalog/variant leakage.

Result:
PASS / FAIL

### Purchasing

Expected:
- مشتريات الخامات
- Draft -> Approved -> Partial/Received style Restaurant ingredient purchase flow
- no Retail-only purchase UI.

Result:
PASS / FAIL

### Stock Count

Expected:
- جرد الخامات
- Restaurant ingredient stock count
- no Retail product-stock leakage.

Result:
PASS / FAIL

### Transfers

Expected:
- تحويلات الخامات
- Restaurant ingredient transfer flow
- no Retail product transfer leakage.

Result:
PASS / FAIL

G1 passes only if all four PASS.

---

## 10. G2 Touch runtime pass

Use normal touch interaction where available.

### POS
Check:
- product/category selection;
- cart controls;
- primary sale controls;
- no precision-only action.

### Customers
Check:
- search;
- + عميل جديد;
- edit;
- addresses;
- buttons are comfortably tappable.

### Orders
Check:
- cards/list;
- open order details;
- status/action controls reachable.

### Kitchen / Delivery
Check:
- order cards;
- status buttons;
- driver/payment controls reachable.

### Inventory Overview
Check:
- cards/tables scroll;
- tabs/links reachable.

### Settings
Check:
- Settings Hub tabs;
- printing/financial/features controls;
- no hover-only critical action.

G2 passes when representative workflows are touch-usable without critical hover/mouse-only dependency.

---

## 11. G3 Menu & Function Cleanup closure

Close G3 only when:
- G0 PASS;
- G1 PASS;
- G2 PASS;
- no known route collision;
- no Retail leakage in Restaurant shared routes;
- accepted Cashier layout still intact.

Formal result:
`Menu & Function Cleanup = CLOSED`

---

## 12. Evidence to capture

Preferred evidence:
- screenshot/photo of Full Acceptance result;
- exact text output for restaurant-full-roundtrip;
- before/after Offline unresolved counts;
- screenshot of each Shared Route;
- short touch notes for the six representative screens.

Do not rely on memory alone for closure.

---

## 13. Exact continuation after G3

Start:

`docs/PERMISSIONS-V2-IMPLEMENTATION-BATCH-PLAN.md`

Sequence begins:
- P0 Permission Contract Freeze
- P1 Action Catalog additive expansion
- P2 Core Transaction Owner Guards
- ...
- P11 Authorization Acceptance

Do not jump directly to:
- Kitchen Stations;
- Support Center;
- Sharawla AI Operator

before their prerequisite gates are closed.

---

## 14. Final operator result block

Fill when executed:

Version:
`10.5.4-beta.58.26`

Device:
`SH-0007`

G0 Full Acceptance:
PASS / FAIL

restaurant-full-roundtrip:
PASS / FAIL

cleanup_zero:
true / false

Offline unresolved:
before ____ / after ____

G1 Shared Routes:
PASS / FAIL

G2 Touch:
PASS / FAIL

G3 Menu Cleanup:
CLOSED / OPEN

Exact failure stage if any:
__________

Notes:
__________
