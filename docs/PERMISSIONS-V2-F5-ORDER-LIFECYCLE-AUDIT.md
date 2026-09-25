# PV2-F5 — Order Lifecycle Owner Audit / Closure Plan

Status: **AUDIT PASS / NO RUNTIME OR DB MUTATION IN THIS COMMIT**

Runtime baseline: `10.5.4-beta.58.29`

This audit intentionally does **not** replace any Order owner. It freezes the current
mutation surface before the next source implementation batch.

## Current direct renderer surface

`app.js` currently contains exactly **7** direct authenticated `orders` PATCH call sites:

1. legacy Delivery page: `delivered`;
2. Kitchen page: dynamic `new -> preparing -> ready -> completed` status path;
3. Driver picker: assign driver + `out_for_delivery`;
4. Delivery detail: `preparing`;
5. Delivery detail: `ready`;
6. Pickup detail: `completed`;
7. Delivery detail legacy fallback: `delivered`.

The two direct `delivered` paths are not the authoritative Online completion owner:
`beta55-delivery-settlement-shift-cash.js` intercepts Online `data-delivered` clicks
and routes them to `delivery_mark_delivered_v2`. Offline is deliberately allowed to
fall through to the proven legacy/offline path so custody can be materialized by
`trg_ensure_delivery_custody_snapshot_v2` when the queued mutation reaches the server.

## Existing authoritative / special owners that must be preserved

- `delivery_mark_delivered_v2(bigint,text,text)`
  - Action: `delivery.mark_delivered`
  - optional payment change additionally requires `delivery.payment.change_at_delivery`
  - branch check, idempotency, payment ledger alignment, custody, settlement safety, audit.

- `accept_website_order(bigint)`
  - website acceptance creates the POS order and its items;
  - must not be replaced by a generic status owner.

- `cancel_website_order_customer(bigint,text)`
  - anonymous/customer phone-authorized cancellation;
  - accepted order may be cancelled only while POS status is `new`;
  - this path is **not** an employee Action permission and must not be broken by employee-only triggers.

- `review_order_payment(bigint,text)`
  - website payment review path;
  - branch-scoped legacy owner;
  - separate owner hardening is required before generic Orders UPDATE can be revoked.

## F5 implementation split

Do not revoke authenticated `orders` UPDATE globally in one step.

F5 must be split so each mutation class gets an owner without breaking Offline,
website-customer cancellation, delivery custody, or payment review:

- **F5A Fulfillment:** preparing / ready / pickup completed.
- **F5B Driver Assignment:** driver + out_for_delivery transition.
- **F5C Delivery Completion:** preserve `delivery_mark_delivered_v2`; remove Online direct bypass only after Runtime routing proof. Offline remains through the accepted offline bridge until its owner is explicitly migrated.
- **F5D Website Payment Review:** harden `review_order_payment` with an explicit Action.
- **F5E Orders table privilege closure:** only after all internal/customer/offline mutation paths are proven compatible.

No DB deployment is authorized by this audit.
