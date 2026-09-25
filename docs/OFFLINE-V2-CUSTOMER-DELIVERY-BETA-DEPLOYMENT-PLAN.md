# Offline V2 Customer + Delivery — Controlled Beta Deployment Plan

Status: PRE-DEPLOYMENT / NO DB WRITE
Target: isolated Beta backend xihcxydjnzemflhedzor / SH-0007 only.
Production SH-0005 / SH-0006: forbidden.
Canonical Stock: OFF. Cutover: OFF.

## Authorized source artifacts, in exact order
1. supabase-offline-v2-customer-delivery-owners-v1.sql
2. supabase-beta45-offline-v2-transport-v1.sql

The first artifact creates the additive receipt table and five durable wrappers. The second replaces only the Offline V2 outer transport definition so its whitelist/dispatch can reach those wrappers. Never apply artifact 2 first.

## Read-only preflight
Require all before any write:
- target project id exactly xihcxydjnzemflhedzor;
- offline_customer_delivery_receipts_v1 absent before first deployment, or if present its definition is reconciled against the authorized artifact;
- accepted delegated owners exist with exact signatures:
  - customer_create_v2(text,text,text,text,text)
  - customer_update_v2(bigint,text,text,text,text,text)
  - customer_address_save_v2(bigint,bigint,text,text,text,text,boolean)
  - customer_address_delete_v2(bigint)
  - order_assign_driver_v2(bigint,bigint)
- sharawla_offline_v2_apply_event(jsonb) exists;
- order_status_apply_offline_v2(bigint,text,text) remains present;
- delivery_mark_delivered_v2(bigint,text,text) remains present;
- authenticated has EXECUTE on the accepted delegated owners required by the current Online UI;
- no source artifact contains direct customer/order business DML in the new wrappers;
- CI for the authorized HEAD is green.

Fail closed on any mismatch. Do not repair unrelated prerequisites inside this deployment.

## Deployment
Apply artifact 1 as one transaction. Verify table + five wrapper signatures, SECURITY DEFINER/search_path, ACL and function definitions.
Only then apply artifact 2. Verify the outer function contains all five exact operation/RPC bindings while preserving sale/return/expense/shift/order_status dispatch.

## Immediate post-deploy verification
Read-only:
- five wrappers present;
- receipt table RLS enabled and direct authenticated table access revoked;
- authenticated EXECUTE granted only on wrapper functions as specified;
- outer transport exact new bindings present;
- existing order_status binding remains order_status_apply_offline_v2;
- no change to Canonical Stock/Cutover;
- no unexpected function or table definition drift.

Do not run destructive acceptance automatically.

## Runtime acceptance after the single consolidated SH-0007 build
Run named executable tests:
- offline.customer-create-runtime-e2e
- offline.customer-dependent-address-runtime-e2e
- offline.customer-mutations-runtime-e2e
- offline.delivery-driver-runtime-e2e
- offline.delivery-economic-runtime-e2e
- offline.return-runtime-e2e
- offline.expense-runtime-e2e
- offline.order-status-runtime-e2e

Then Full Sandbox and Deep Chaos. Preserve any failure envelope; do not mutate/retry a malformed historical envelope.

## Authorization boundary
This plan does not authorize Production, Canonical Stock, Cutover, or unrelated migrations.
