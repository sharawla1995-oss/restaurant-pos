Top Burger POS V10.4.10 — Website Order Flow Integration

Built directly on V10.4.9.

Changes only around website-order workflow:
- Website Delivery: received/new -> preparing -> ready -> out_for_delivery -> delivered.
- Website Pickup: received/new -> preparing -> ready -> completed.
- Final Pickup action text is now: "تم تسليم الطلب للعميل".
- Delivery queue includes PREPARING and READY explicitly.
- Kitchen no longer marks website Delivery completed from READY.
- Shared Supabase patch enables phone-only tracking and customer cancellation until PREPARING.
- V10.4.9 offline/sync/backup behavior is preserved.

Run supabase-v10-4-10-website-tracking-cancel.sql once before testing website tracking/cancel.
