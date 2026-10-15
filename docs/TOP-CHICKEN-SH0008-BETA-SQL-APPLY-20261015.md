# Top Chicken SH-0008 — Beta SQL Apply Verification (2026-10-15)

**Applied: SQL ONLY — 4/4 PASS; no Edge deploy, no Central Admin grant, no Windows release or device update.**

## Authorization and scope
User explicitly declined creating a new backup and replied "نفذ" to the separate consent request to apply **four specified reviewed SQL packages** on **Top Chicken Beta only**. PostgreSQL 17.6 project `xihcxydjnzemflhedzor`, business `5358328c-9724-49aa-affc-1bce8be90f92`, branch 22. **User's risk acceptance does not make backup/restore PASS.** No backup or isolated restore was performed. No deletes or data resets were part of these migrations.

Preflight `review-only/top-chicken-sh0008-beta-live-readonly-preflight.sql` returned all baseline flags true. Only exact Git blobs from the pinned source commit `7ad3559a69f5dc8d919486ed90e2692e4c38df96` were submitted through Supabase `apply_migration`, one migration at a time.

| Applied migration name | Exact Git blob SHA-1 | Tool result |
| --- | --- | --- |
| `top_chicken_sh0008_staff_create_v1_20261015` | `9208b2387d33f7d2dde739be881cca4676a855d6` | `success:true` |
| `top_chicken_sh0008_staff_manage_v1_20261015` | `9caa952bb3c5793643d277ddee8bf5950342e84a` | `success:true` |
| `top_chicken_sh0008_verified_tenant_feature_owner_v1_20261015` | `28b784c2b0a202f88ded8a190575a199b43b0c33` | `success:true` |
| `top_chicken_sh0008_modifier_quantity_additive_v1_20261015` | `9f9a435dcd66acc38372cd4a090376690fcc9de8` | `success:true` |

All four migration names confirmed in live migration ledger via `list_migrations`. **DO NOT RERUN** any of these; exact DDL is now applied. The additive quantity column and trigger exist in shared Beta table `order_item_modifiers` (not scoped at table-schema level to Top Chicken). Zero historic modifier rows existed, and source protected the previous authoritative `create_pos_order_atomic` body, but future modifier INSERT semantics for other Beta tenants could be affected by the trigger. Verify compatibility before enabling other-tenant traffic.

## Read-only postflight (live Beta)

- Top Chicken create/manage receipt tables exist, all expected RPCs exist, verified tenant resolver condition exists, `quantity` column/trigger exist.
- Staff direct `anon` create reserve execute **false**; direct `authenticated` manage execute **false**.
- Create receipts **0**, manage receipts **0**. Top Chicken grants **0**; Entitlements **NOT ACTIVATED**.
- Original legacy singleton operational business binding still **1**, legacy business grants still **36**. No tenant entitlement modification.
- Top Chicken customers **5,860**, addresses **4,838**, products **42**, product image storage objects **42**, employees **2**, orders **1**; offline order status server receipts **0**.
- Website intake branch 22 **OFF**.
- Beta Edge slugs remain **smart-function**, **hr-staff-api**, **hr-staff-app-beta**. **top-chicken-staff not deployed**.
- No recorded real hosted website→POS pickup/delivery acceptance or physical SH-0008 acceptance. No updater feed/release publication.

## Next separate authorization gates

1. Review and authorize **dedicated Beta `top-chicken-staff` Edge function** as a separate action. Its source remains pinned at `supabase/functions/top-chicken-staff/index.ts` Git blob `f61d0d6612a2040392f9e581f57daef65c78c77d` plus `staff-domain.mjs` `10da9940245229e807d0be2d24a0ee59fb2b50f7`. No change to shared `smart-function`. Deny password reset pending revocation design.
2. **Cloud Entitlements** must be granted only through audited/authenticated Central Admin, with a separately reviewed exact code set and explicit authorization. Never raw SQL grants or copying old tenant grants.
3. With independent test authorization, real hosted authenticated staff and website order test, physical SH-0008 local offline queue handling and a separately approved Windows update release are still required. **Do not install rc.9 on SH-0008 yet**.
