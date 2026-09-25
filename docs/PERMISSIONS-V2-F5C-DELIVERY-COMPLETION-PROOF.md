# Permissions V2 — F5C Delivery Completion Routing Proof

Status: **SOURCE PROOF PASS / NO RUNTIME REWIRE / NO DB DEPLOY**

The accepted Online owner remains `delivery_mark_delivered_v2(bigint,text,text)`.
It enforces `delivery.mark_delivered`, branch access, delivery/driver/status invariants,
idempotency, final payment, custody, settlement/audit semantics. Payment changes at
completion retain the separate `delivery.payment.change_at_delivery` gate.

Runtime proof:
- `beta55-delivery-settlement-shift-cash.js` capture-intercepts both Online
  `data-delivered` surfaces before the legacy handlers and calls the authoritative RPC.
- Offline deliberately does **not** intercept. The two legacy direct delivered PATCH
  paths remain the accepted Offline queue bridge so the proven custody trigger can
  materialize custody when replay reaches the server.
- Therefore F5C performs no destructive app.js rewrite and no Orders privilege revoke.

F5E remains blocked until every Orders mutation family, including Offline/customer/system
paths, is compatible with final privilege closure.
