# SH-0007 — 10.5.4-beta.58.29 — G3 Restaurant Menu Cleanup Evidence

Date: 2026-09-25
Device: SH-0007
Branch: TEST
Profile: restaurant

## Manual dashboard/menu review

Visible Restaurant/shared operational entries reviewed:

- الكاشير
- الطلبات
- طلبات الدليفري
- المرتجعات
- العملاء
- الورديات
- التقارير
- المصروفات
- الأصناف
- المخزون
- جرد الخامات
- الموردين
- مشتريات الخامات
- تحويلات الخامات
- إدارة الموقع
- إعدادات الدليفري
- الطلبات الأونلاين
- البرومو كود
- الإعدادات
- المستخدمين والصلاحيات
- الوصفات وFood Cost
- الطاولات
- الصالات والترابيزات
- المطبخ
- الخزنة
- الموظفين
- الإنتاج والهالك

No Retail-only or Pharmacy-only operational card was observed.

## Internal tooling observed

### مركز اختبار Beta

Source owner:
beta-self-test.js

Behavior:
- enabled only when app channel is beta OR app version is prerelease (alpha/beta/rc/preview);
- not part of Stable customer navigation.

Decision:
Expected Beta-only tooling.
Not Restaurant leakage.
Not a Stable menu blocker.

### تشخيص Sharawla

Source owner:
owner-diagnostics.js

Behavior:
- hidden unless Owner Diagnostics is explicitly unlocked;
- requires online verification using Owner Diagnostic Code;
- unlock expires after 30 minutes;
- access code is not stored locally.

Decision:
Expected temporary owner/support tooling.
Not ordinary customer navigation.
Not Restaurant leakage.

## Gate decision

G3 — Restaurant Menu Cleanup:
PASS / CLOSED

Reason:
- all normal visible operational cards are Restaurant/shared;
- no unrelated-profile leakage observed;
- Beta Test Center is prerelease-only tooling;
- Sharawla Diagnostics is explicitly unlocked temporary owner tooling.

## Remaining gate

G2 — Representative native Touch Pass:
OPEN / MANUAL / BLOCKED BY TOUCH HARDWARE AVAILABILITY

No Production system was touched.
