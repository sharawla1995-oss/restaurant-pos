# Sharawla Capability Architecture — Beta32 Foundation

## الهدف
Sharawla Platform تظل منصة واحدة. لا يتم إنشاء Fork مستقل لكل نشاط. كل Business يحدد له Profile، والـProfile يركب من Capabilities قابلة لإعادة الاستخدام.

## المستويات
1. **Core** — تسجيل الدخول، الترخيص، الفروع، المستخدمون، الصلاحيات، الورديات، طرق الدفع، التقارير، Offline، Updates.
2. **Shared Capabilities** — POS، الطلبات، الأصناف، الباركود، المخزون، الموردون، المشتريات، المرتجعات، الدليفري، الموقع، العروض.
3. **Domain Capabilities** — مطبخ وترابيزات، أدوية وروشتات وتأمين، شحنات وCOD وتتبع، عضويات وحجوزات وحضور.
4. **Profile Preset** — مجموعة Features افتراضية لنوع النشاط.
5. **Business Override** — مستقبلًا: تفعيل/تعطيل Feature لنشاط محدد من Sharawla Cloud بدون تغيير نوع النشاط بالكامل.

## Profiles الرسمية
- `restaurant` — Food Service — منفذ حاليًا.
- `retail` — Commerce — منفذ حاليًا.
- `pharmacy` — Pharmacy — منفذ حاليًا/تحت Acceptance.
- `logistics` — Shipping & Courier — مخطط.
- `membership` — Gym / Club / Academy / Booking — مخطط.
- `warehouse` — Warehousing & Distribution — مخطط.

## قواعد المعمارية
- Feature واحدة = مصدر كود واحد قدر الإمكان.
- نقل Feature من Profile لآخر لا يعني نسخ الكود.
- أي Feature لها Dependencies معلنة.
- لا يتم حذف بيانات Feature بمجرد تعطيلها.
- التغيير الخاص بمجال يتم داخل Domain Adapter/Capability ولا يغير Core لباقي الأنشطة.
- التغيير الخاص بعميل واحد يكون Business Override وليس Fork.
- Legacy `enabled_modules` يظل مدعومًا أثناء الهجرة.
- مستقبلًا Sharawla Cloud يمكن أن يرسل `enabled_features` بدل الاعتماد الكامل على `enabled_modules`.

## مثال
### Pharmacy
`POS + Inventory + Purchasing + Batch + Expiry + Prescriptions + Insurance + Delivery + Website`

### Retail
`POS + Inventory + Purchasing + Barcode + Promotions + Delivery + Website`

### Logistics
`Customers + Shipments + Waybills + Pickup Requests + Zones/Pricing + Drivers + Tracking + COD + Settlements + Returns`

### Gym / Membership
`Members + Plans + Subscriptions + Renewals + Check-in + Classes + Bookings + Freeze + Trainers`

ويمكن إضافة `POS + Inventory` للجيم لو كان يبيع منتجات، بدون بناء كاشير جديد.

## Beta32 Scope
Beta32 هو **Foundation فقط**:
- Capability Registry مركزي داخل التطبيق.
- Dependency validation.
- Profile presets.
- Legacy Module → Capability bridge.
- لا يغير Navigation أو البيع أو الطباعة أو التحديثات أو هوية الجهاز.
- لا يغير Production Cloud أو Production POS.

المرحلة التالية بعد Acceptance:
- إضافة Cloud tables/RPCs للـfeatures/profile_features/business_features في Migration منفصلة وآمنة.
- ربط Admin V2 بFeature Composer.
- تحويل كل Engine تدريجيًا لاستخدام Capability Registry بدل منطق مكرر.