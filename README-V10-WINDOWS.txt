Top Burger POS V10.0 Windows Foundation
=======================================

دي بداية نسخة Windows من نفس الكاشير الحالي، وليست إعادة تصميم.

الموجود في V10.0:
- نفس index.html / app.js / styles.css ونفس واجهة الكاشير.
- تشغيل داخل Electron كبرنامج Windows.
- SQLite محلية حقيقية داخل مجلد بيانات البرنامج.
- طبقة التخزين Offline الحالية (bootstrap + queue + cached orders) تستخدم SQLite تلقائيًا في نسخة Windows بدل IndexedDB.
- Supabase يظل مسؤولًا عن المزامنة والبيانات المركزية كما هو الآن.
- Backup تلقائي لملف SQLite عند قفل البرنامج بشكل طبيعي.
- الاحتفاظ بآخر 30 Backup في Documents\\TopBurgerPOS\\Backups.
- Backup يدوي متاح من Electron API تمهيدًا لربطه بزر داخل الإعدادات.

مهم:
V10.0 هي Foundation فقط. فتح/قفل الوردية Offline بالكامل والطباعة المباشرة RAW للطابعة سيضافان في المراحل التالية بعد اختبار الأساس.

تشغيل نسخة التطوير على Windows:
1) ثبّت Node.js LTS.
2) افتح CMD داخل مجلد المشروع.
3) npm install
4) npm start

إنشاء Setup.exe:
1) npm install
2) npm run dist
3) ستجد ملف التثبيت داخل dist

ملف الداتا المحلي:
%APPDATA%\\top-burger-pos-windows\\data\\topburger-pos.sqlite
(المسار الفعلي تحدده Electron حسب Windows userData)

Backups:
Documents\\TopBurgerPOS\\Backups

لا يوجد SQL جديد مطلوب لهذه الخطوة؛ V10 يعتمد على SQL V9.8.1 الموجود بالفعل على Supabase.
