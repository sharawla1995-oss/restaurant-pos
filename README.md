# Restaurant POS Cloud

نسخة كاشير سحابية Static لا تحتاج Node.js على جهاز الكاشير.

## التشغيل
1. ارفع الملفات الموجودة داخل هذا المجلد إلى GitHub repository `restaurant-pos`.
2. انشر الـrepository على Vercel أو Netlify كـ Static Site.
3. افتح الرابط الناتج.
4. في أول تشغيل أدخل Supabase Project URL وPublishable key.
5. سجل الدخول بحساب Supabase Auth الذي تم إنشاؤه وربطه بجدول `employees`.

## أمان
- لا تضع Secret key أو service_role داخل البرنامج.
- Publishable key مسموح استخدامه في المتصفح مع RLS.
- صلاحيات البيانات تعتمد على RLS في Supabase.

## ملاحظة
هذه النسخة Cloud MVP وتحتوي على الكاشير، الطلبات، الشيفت، الأصناف، المصروفات، مخزون الخامات، التقارير، المستخدمين، وواجهة PWA. يمكن توسيعها لاحقًا للطباعة وشاشة المطبخ والوصفات والمشتريات والصلاحيات الدقيقة.
