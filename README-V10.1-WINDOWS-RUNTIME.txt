Top Burger POS Windows V10.1 Runtime
====================================
- نفس واجهة الكاشير الحالية داخل Electron.
- SQLite محلية مع WAL + synchronous FULL.
- تخزين KV المستخدم حاليًا للكاش والـ Offline Queue داخل SQLite.
- جدول local_operations مستقل تمهيدًا لتحويل كل الحركات إلى Local-first.
- Native Windows printing bridge: قراءة الطابعات والطباعة من Electron.
- Backup يدوي + Backup تلقائي عند الإغلاق، والاحتفاظ بآخر 30 نسخة.
- لا يوجد SQL جديد في V10.1؛ يعتمد على Supabase V9.8.1 الحالي.

هذه Runtime وليست المرحلة النهائية للـ Local-first: فتح وردية جديدة Offline بالكامل وربطها بحركات البيع سيأتي في المرحلة التالية قبل اعتماد Setup التشغيل النهائي.
