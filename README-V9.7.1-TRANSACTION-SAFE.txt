Top Burger POS V9.7.1 - Transaction Safe Checkout

What changed:
- POS checkout is now saved through one Supabase RPC transaction.
- Order + items + modifiers + payments + promo redemption + audit log succeed together or fail together.
- Promo usage is revalidated inside the transaction and the promo row is locked during checkout to reduce concurrent over-use.
- Payment totals and item subtotal are verified before commit.
- Open shift / employee / branch are validated server-side.
- Double-submit protection was added in the POS client.
- Customer creation remains independent; a failed sale can leave a newly created customer record, but cannot leave a partial invoice.

Install:
1) Keep the existing V9.7.0 database migration installed.
2) Run supabase-v9-7-1-transaction-safe.sql in Supabase SQL Editor once.
3) Upload/deploy this V9.7.1 POS build.

Website V5.2.0 is not changed by this migration. It keeps using its current website-order function.
