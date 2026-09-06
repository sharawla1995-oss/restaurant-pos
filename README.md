# Top Burger POS V8.6

تحديث إدارة وتشغيل فوق V8.5:
- رسوم التوصيل يدوية دائمًا، والمنطقة ليست شرطًا لتأكيد أوردر الدليفري.
- فلاتر المصروفات: اليوم/أمس/الأسبوع/الشهر/فترة مخصصة + إجمالي الفترة + تعديل المصروف.
- تعديل العملاء وإدارة عناوينهم.
- تعديل/إيقاف المناديب ومناطق الدليفري.
- إضافة/تعديل/إيقاف التصنيفات والأصناف.
- يحافظ على فصل الفروع والطباعة وجلب بيانات العميل.

ملاحظة: إنشاء مستخدم Auth جديد من داخل GitHub Pages لم يتم تزويره أو تنفيذه بمفتاح سري داخل المتصفح؛ يحتاج Backend/Edge Function آمن كخطوة منفصلة.


## V8.7.3 — Branch + Role Permissions Fix
- One-branch cashier enters the assigned branch directly.
- Cashier pages: Home, POS, Orders, Customers, Delivery Orders, Shift.
- Call center pages: Home, POS, Orders, Customers, Delivery Orders.
- Admin retains all sections.
- Direct page access is guarded, not only hidden in the menu.
- Requires running `supabase-v8-7-3-branches.sql` once.
