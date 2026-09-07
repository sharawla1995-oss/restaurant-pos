Top Burger POS V9.2.7 — TIMED AVAILABILITY

- Compact website availability table on mobile.
- Product availability actions per branch:
  * تشغيل الآن
  * إيقاف 30 دقيقة
  * إيقاف ساعة
  * إيقاف ساعتين
  * إيقاف لوقت محدد
  * إيقاف يدوي
- Timed pauses automatically become available again in the POS UI after the time expires.
- Requires running supabase-v9-2-7-timed-availability.sql once.
- Website must read website_paused_until to hide temporarily paused products.
