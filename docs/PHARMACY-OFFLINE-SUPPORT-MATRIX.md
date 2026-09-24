# Sharawla Pharmacy Offline Support Matrix

Status: DESIGN / CURRENT-BEHAVIOR AUDIT
Implementation: NOT STARTED
Runtime change: NONE
DB mutation: NONE

## 1. Current truth

Current Pharmacy POS explicitly blocks checkout while offline.

Current UI message states that batch/insurance Pharmacy sale requires internet.

Therefore:
- Pharmacy sale Offline = NOT SUPPORTED today.
- Pharmacy insurance sale Offline = NOT SUPPORTED.
- Pharmacy batch management Offline = NOT SUPPORTED.
- Pharmacy prescription management Offline = NOT SUPPORTED.

Shared generic return UI may attempt Offline fallback, but no Pharmacy-specific return owner exists.

This is unsafe for Pharmacy and must be blocked until Pharmacy return ownership is closed.

## 2. Why Pharmacy Offline is different

A Pharmacy sale is not only:
order + items + payments.

It also includes:
- valid non-expired batch stock;
- batch allocation;
- batch movement ledger;
- possible prescription requirement;
- prescription fulfillment state;
- possible controlled-drug policy;
- possible insurer plan/approval;
- insurance claim state.

A stale local cache can create a medically/financially invalid transaction if treated like ordinary Retail stock.

Therefore Pharmacy Offline must be feature-specific and fail closed where freshness is essential.

## 3. Recommended V1 staged Offline model

### Stage PH-OFF-0 — Current

Online-only Pharmacy sale.

Keep:
- cached navigation/bootstrap;
- local printing of already-loaded data;
- general app Offline shell.

Block:
- Pharmacy checkout;
- Pharmacy return;
- batch receiving/adjustment;
- prescription mutation;
- insurance mutation.

Status:
current behavior plus explicit Pharmacy return block.

### Stage PH-OFF-1 — Cash non-insurance sale

Future optional.

Allow Offline only for:
- cash/wallet/instapay non-insurance sale;
- non-controlled medicines;
- batch cache validated recently according to policy;
- prescription-free items, OR prescription context fully cached and eligible under explicit policy.

Required local data:
- product master;
- prescription_required flag;
- controlled_drug flag;
- active batch list;
- expiry date;
- local batch quantity;
- sale price/cost;
- branch identity;
- shift;
- payment methods.

Local transaction must:
- allocate FEFO deterministically;
- deduct local batch projection;
- deduct shared product stock projection;
- create durable order;
- create batch allocation records locally;
- queue one canonical sync document.

### Stage PH-OFF-2 — Prescription sale

Only after line-level prescription fulfillment exists.

Required:
- cached prescription header;
- cached items;
- previously dispensed quantities;
- clear conflict semantics.

Offline sale must not over-dispense if another device can use the same prescription online.

Therefore multi-device prescription dispensing may require:
- online-only prescription fulfillment;
or
- reservation/token ownership.

Do not enable without concurrency design.

### Stage PH-OFF-3 — Insurance sale

Recommended:
remain Online-only in early V1.

Reason:
- plan active state;
- coverage;
- prior approval;
- limits;
- claim status;
- insurer receivable
may require current server authority.

Only enable later if a signed/cacheable insurer policy contract exists.

### Stage PH-OFF-4 — Controlled drug

Recommended:
Online-only unless jurisdiction/product policy explicitly allows Offline and the audit contract is proven.

Do not permit controlled-drug Offline sale merely because ordinary medicines support Offline.

## 4. Pharmacy return Offline

Current:
UNSAFE / must be blocked.

Future Pharmacy return local-first requires:

- original order cached;
- original order items cached;
- original pharmacy_order_batch_allocations cached;
- original batch identity retained;
- available return quantity tracked;
- Pharmacy return canonical document;
- local batch restoration projection;
- server idempotent Pharmacy return owner;
- sync authorization re-check;
- insurance/prescription correction semantics.

### Original batch restoration

Default return policy should restore to original batch only when:
- batch identity is known;
- product matches;
- return is commercially accepted.

If regulatory/business policy requires quarantine instead:
- return must create a quarantine batch/location state instead of saleable stock.

This policy must be explicit before implementation.

## 5. Batch receiving Offline

Recommended V1:
ONLINE-ONLY.

Reason:
- supplier/receipt authority;
- duplicate batch number;
- current inventory;
- cost update;
- Point4 stock ownership;
- possible multi-device conflict.

Future support needs:
- canonical GRN/batch document identity;
- local durable receipt;
- idempotent backend receive owner;
- duplicate batch merge/create rules.

## 6. Batch adjustment/waste Offline

Recommended V1:
ONLINE-ONLY.

Future:
may be supported after:
- Action+Location;
- reason codes;
- local batch projection;
- idempotent backend adjustment;
- approval threshold policy.

Expired/waste stock is sensitive and should not be a casual offline editor action.

## 7. Prescription mutation Offline

Create prescription:
possible future Offline only if it is purely a local record and no remote uniqueness/approval is required.

Dispense prescription:
not safe until fulfillment/concurrency contract exists.

Website prescription review:
ONLINE-ONLY.

## 8. Insurance Offline

Company/plan management:
ONLINE-ONLY.

Claim submit/approve/settle:
ONLINE-ONLY.

Insurance sale:
ONLINE-ONLY in Pharmacy V1 recommendation.

Patient payment may not be enough to complete the insurer portion without online plan/approval authority.

## 9. Controlled-drug Offline

Default:
DENY.

If ever enabled:
- dedicated capability;
- dedicated Action;
- explicit jurisdiction/business policy;
- immutable local audit;
- secure clock/sequence considerations;
- quantity/patient/prescriber fields;
- sync-before-next-dispense policy where required.

## 10. Cached expiry correctness

Offline batch sale must compare expiry using local trusted date.

Clock manipulation can affect expiry checks.

Before Pharmacy Offline sale closure, define:
- trusted time source;
- clock rollback handling;
- last verified server time;
- fail-closed threshold when clock confidence is insufficient.

Do not sell expired stock because local system time was manipulated backwards.

## 11. Multi-device conflict

Two Pharmacy devices can otherwise sell the same cached batch stock while offline.

Required policy before PH-OFF-1 in multi-device branches:

Option A:
offline sale allowed only on designated Primary inventory-owning device.

Option B:
pre-allocated device stock buckets.

Option C:
allow local oversell risk and reconcile later.

Option C is not recommended for batch-controlled Pharmacy stock.

The chosen model must align with Offline Native V2 ownership.

## 12. Canonical transaction identity

Every Pharmacy Offline sale/return must use:
- UUIDv4 client_tx_id;
- document_uid;
- stable line_uid;
- effect identity;
- exact retry reuse.

Do not use current PH-<timestamp>-<random> TX format for Offline V2.

## 13. Sync authorization

At sync time re-check:
- trusted Profile=pharmacy;
- sales/return Action;
- Location scope;
- prescription rules;
- controlled-drug policy;
- insurance policy if applicable;
- batch/product invariants that can still be enforced safely.

If conflict:
- keep operation unresolved;
- show exact reason;
- no silent alternative batch substitution on server.

## 14. UI behavior

Offline Pharmacy POS should visibly show capability state:

Allowed:
- "بيع أوفلاين متاح" only for permitted item/payment classes.

Blocked item:
- "هذا الصنف يحتاج اتصال بالإنترنت" with reason:
  - تأمين
  - دواء مراقب
  - روشتة غير متاحة أو تحتاج تحقق
  - بيانات الباتش غير مؤكدة

Do not let user fill a long transaction and fail only on final click when the restriction was knowable earlier.

## 15. Recommended Pharmacy V1 commercial promise

Until PH-OFF-1 is implemented:

Pharmacy:
- system shell/cache may work offline;
- Pharmacy sales require internet.

This is weaker than Restaurant/Retail but honest.

Preferred product goal before broad Pharmacy release:
- implement PH-OFF-1 for ordinary non-insurance, non-controlled batch sales.

Insurance/controlled/prescription-sensitive cases may remain online-only explicitly.

## 16. Acceptance for PH-OFF-1

Test:
- ordinary medicine;
- two valid batches with different expiry;
- FEFO local allocation;
- local batch deduction;
- restart;
- durable outbox;
- reconnect;
- exactly-once server order;
- batch allocations match;
- batch movements match;
- shared product stock matches;
- lost ACK retry;
- duplicate retry;
- expiry crosses while offline;
- permission revoked before sync;
- wrong location;
- stale batch conflict.

Return acceptance:
- partial;
- full;
- original batch restore/quarantine;
- restart;
- sync exactly once.

## 17. Current state

Current Pharmacy sale Offline:
NOT SUPPORTED.

Current Pharmacy return Offline:
UNSAFE because no Pharmacy return owner.

Recommended immediate corrective when implementation begins:
block Pharmacy generic Offline return until dedicated owner exists.

Pharmacy Offline V1 design:
CLOSED for staged policy.

Implementation:
NOT STARTED.
