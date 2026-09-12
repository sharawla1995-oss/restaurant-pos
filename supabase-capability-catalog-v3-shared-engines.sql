-- Sharawla Capability Catalog V3 — Shared Engines
-- Adds 42 PLANNED capabilities to the existing 65-capability catalog.
-- IMPORTANT: catalog-only migration. It creates NO profile/category/business assignments.
-- Production impact target: zero. Existing runtime effective features must remain unchanged.

begin;

with new_features(code,domain,name_ar,name_en,description) as (
  values
    -- Commerce shared engines
    ('commerce.variants','Commerce','المتغيرات والمصفوفات','Variants & Matrices','Shared variant matrix for size, color, shade, model and other product dimensions.'),
    ('commerce.custom_orders','Commerce','الطلبات المخصصة','Custom Orders','Pre-orders/custom orders with due date, attachments, notes and deposit workflow.'),
    ('commerce.price_tiers','Commerce','فئات وشرائح الأسعار','Price Tiers','Customer price levels and quantity-based pricing tiers.'),
    ('commerce.gift_cards','Commerce','بطاقات وقسائم الهدايا','Gift Cards & Vouchers','Stored-value gift cards and vouchers with balance tracking.'),
    ('commerce.loyalty','Commerce','الولاء والنقاط','Loyalty','Points, stamps and reward rules linked to customers and orders.'),
    ('commerce.installments','Commerce','التقسيط','Installments','Internal or provider-backed installment schedules and collections.'),
    ('commerce.trade_in','Commerce','الاستبدال والمستعمل','Trade-in & Used Stock','Trade-in intake, valuation and used-stock lifecycle.'),
    ('commerce.consignment','Commerce','البيع بالأمانة','Consignment','Consignment stock ownership and periodic settlement with suppliers/brands.'),
    ('commerce.b2b_orders','Commerce','أوامر البيع B2B','B2B Sales Orders','Sales-order workflow for wholesale and business customers.'),
    ('commerce.quotations','Commerce','عروض الأسعار','Quotations','Quotations that can convert into orders/invoices.'),
    ('commerce.return_policies','Commerce','سياسات المرتجع','Return Policies','Configurable return windows, conditions and product/category restrictions.'),
    ('commerce.weight_sales','Commerce','البيع بالوزن والميزان','Weighted Sales','Weighted-item sales and scale/barcode integration contracts.'),
    ('commerce.bundles_kits','Commerce','الأطقم والباقات','Bundles & Kits','Sell assembled kits/bundles and optionally explode/rebuild component stock.'),
    ('commerce.b2b_portal','Commerce','بوابة عملاء B2B','B2B Customer Portal','Customer self-service portal for orders, prices, statements and account status.'),
    ('commerce.season_pricing','Commerce','السيزنات والتخفيضات المجدولة','Season Pricing','Season collections and scheduled markdown/pricing rules.'),

    -- Inventory / purchasing shared engines
    ('inventory.purchase_orders','Inventory','أوامر الشراء','Purchase Orders','Purchase-order workflow over suppliers and purchasing.'),
    ('inventory.supplier_returns','Inventory','مرتجعات الموردين','Supplier Returns','Return received stock to suppliers with stock and value reconciliation.'),
    ('inventory.replenishment','Inventory','إعادة الطلب والتوريد','Replenishment','Reorder suggestions and replenishment workflow based on stock demand.'),
    ('inventory.landed_cost','Inventory','التكلفة المحملة','Landed Cost','Allocate freight, duty and other landed costs across received stock.'),
    ('inventory.returnables','Inventory','العهد والعبوات المرتجعة','Returnables','Track returnable containers/assets/deposits such as crates and bottles.'),
    ('inventory.testers','Inventory','العينات والتسترز','Testers & Samples','Track tester/sample stock as controlled consumable inventory.'),

    -- Food advanced recipe/production stack
    ('food.prep','Food Service','التحضيرات ونصف المصنع','Prep Items','Prepared/semi-finished items produced from ingredients and reused by recipes.'),
    ('food.production','Food Service','الإنتاج والتحضير','Production','Production batches, actual yield and consumption for prep/final food output.'),
    ('food.waste','Food Service','الهالك والفاقد','Waste','Structured waste/spoilage recording with reason, quantity and cost.'),
    ('food.costing','Food Service','تكلفة الطعام والربحية','Food Costing','Recipe cost, weighted cost snapshots, food-cost percentage and variance analysis.'),

    -- Service shared engines
    ('service.warranty','Service','الضمان','Warranty','Store/agent/extended warranty contracts linked to sold items, serials and jobs.'),
    ('service.packages','Service','الباقات والجلسات','Service Packages','Multi-session/service packages with remaining balance and consumption.'),
    ('service.installation','Service','التركيب الميداني','Installation','Installation jobs, scheduling and completion linked to sales/delivery.'),

    -- Finance shared engines
    ('finance.credit','Finance','الائتمان وحدود المديونية','Credit Control','Credit limits, payment terms and sale-blocking rules for account customers.'),
    ('finance.receivables','Finance','حسابات العملاء والمديونيات','Receivables','Customer balances, due dates and account statements.'),
    ('finance.collections','Finance','التحصيلات وسندات القبض','Collections','Collections, receipts, cash/cheque settlement and collector handover.'),
    ('finance.aging','Finance','أعمار الديون','Aging','Receivables aging analysis such as 30/60/90 day buckets.'),
    ('finance.commissions','Finance','العمولات','Commissions','Configurable commissions for sales reps, staff, technicians, doctors or brands.'),

    -- Fiscal / compliance shared engines
    ('fiscal.receipts','Fiscal','الإيصال الإلكتروني','Electronic Receipt','Country-specific electronic receipt integration and compliance workflow.'),
    ('fiscal.invoices','Fiscal','الفاتورة الإلكترونية','Electronic Invoice','Country-specific electronic invoice integration and compliance workflow.'),

    -- Automotive specialization
    ('automotive.fitment','Automotive','توافق قطع الغيار','Vehicle Fitment','Product compatibility by vehicle make/model/year/engine.'),
    ('automotive.cross_reference','Automotive','الأرقام البديلة و OEM','Cross Reference','OEM/aftermarket/cross-reference part-number search and mapping.'),
    ('automotive.vin','Automotive','البحث بالشاسيه VIN','VIN Lookup','Vehicle identification and fitment lookup by VIN/chassis.'),

    -- Healthcare specialization
    ('healthcare.emr','Healthcare','الملف الطبي المبسط','EMR','Patient medical profile, history, allergies and attachments with stricter permissions.'),
    ('healthcare.insurance','Healthcare','تأمين الخدمات الطبية','Medical Service Insurance','Coverage, approvals, co-pay and insurer settlement for clinics/medical centers.'),

    -- Education / institutional specialization
    ('education.school_lists','Education','قوائم المدارس والمؤسسات','School & Institutional Lists','Reusable school/institution item lists and institutional-order workflow.'),

    -- External integrations
    ('integrations.delivery_aggregators','Integrations','تكامل منصات التوصيل','Delivery Aggregators','Import, status and commission reconciliation for external delivery marketplaces.')
)
insert into public.features(code,domain,name_ar,name_en,description,active,implemented,settings_schema,feature_class)
select nf.code,nf.domain,nf.name_ar,nf.name_en,nf.description,true,false,'{}'::jsonb,'planned'
from new_features nf
where not exists (select 1 from public.features f where f.code=nf.code);

-- Dependencies are capability-level prerequisites only. No assignments are created here.
with deps(feature_code,depends_on_code) as (
  values
    ('commerce.variants','commerce.products'),
    ('commerce.custom_orders','commerce.orders'),
    ('commerce.custom_orders','core.customers'),
    ('commerce.price_tiers','commerce.products'),
    ('commerce.price_tiers','core.customers'),
    ('commerce.gift_cards','core.payments'),
    ('commerce.loyalty','core.customers'),
    ('commerce.loyalty','commerce.orders'),
    ('commerce.installments','commerce.orders'),
    ('commerce.installments','finance.receivables'),
    ('commerce.trade_in','commerce.products'),
    ('commerce.trade_in','inventory.stock'),
    ('commerce.consignment','inventory.suppliers'),
    ('commerce.consignment','inventory.stock'),
    ('commerce.b2b_orders','commerce.orders'),
    ('commerce.b2b_orders','core.customers'),
    ('commerce.quotations','core.customers'),
    ('commerce.quotations','commerce.orders'),
    ('commerce.return_policies','commerce.returns'),
    ('commerce.weight_sales','commerce.pos'),
    ('commerce.weight_sales','commerce.products'),
    ('commerce.bundles_kits','commerce.products'),
    ('commerce.bundles_kits','inventory.stock'),
    ('commerce.b2b_portal','commerce.website'),
    ('commerce.b2b_portal','commerce.b2b_orders'),
    ('commerce.season_pricing','commerce.products'),
    ('commerce.season_pricing','commerce.promotions'),

    ('inventory.purchase_orders','inventory.purchasing'),
    ('inventory.purchase_orders','inventory.suppliers'),
    ('inventory.supplier_returns','inventory.receiving'),
    ('inventory.supplier_returns','inventory.suppliers'),
    ('inventory.supplier_returns','inventory.stock'),
    ('inventory.replenishment','inventory.stock'),
    ('inventory.replenishment','inventory.purchasing'),
    ('inventory.landed_cost','inventory.purchasing'),
    ('inventory.landed_cost','inventory.receiving'),
    ('inventory.returnables','inventory.stock'),
    ('inventory.returnables','core.customers'),
    ('inventory.testers','inventory.stock'),

    ('food.prep','food.ingredients'),
    ('food.prep','inventory.stock'),
    ('food.production','food.recipes'),
    ('food.production','food.prep'),
    ('food.production','inventory.stock'),
    ('food.waste','inventory.stock'),
    ('food.costing','food.recipes'),
    ('food.costing','inventory.purchasing'),
    ('food.costing','inventory.stock'),

    ('service.warranty','service.jobs'),
    ('service.warranty','core.customers'),
    ('service.packages','service.appointments'),
    ('service.packages','core.customers'),
    ('service.installation','service.jobs'),

    ('finance.credit','core.customers'),
    ('finance.credit','commerce.orders'),
    ('finance.receivables','core.customers'),
    ('finance.receivables','commerce.orders'),
    ('finance.collections','finance.receivables'),
    ('finance.collections','core.payments'),
    ('finance.aging','finance.receivables'),
    ('finance.commissions','core.users'),

    ('fiscal.receipts','commerce.orders'),
    ('fiscal.receipts','core.payments'),
    ('fiscal.invoices','commerce.orders'),
    ('fiscal.invoices','core.customers'),

    ('automotive.fitment','commerce.products'),
    ('automotive.cross_reference','commerce.products'),
    ('automotive.vin','automotive.fitment'),

    ('healthcare.emr','core.customers'),
    ('healthcare.insurance','healthcare.emr'),
    ('healthcare.insurance','core.payments'),

    ('education.school_lists','commerce.products'),
    ('education.school_lists','commerce.b2b_orders'),

    ('integrations.delivery_aggregators','commerce.delivery'),
    ('integrations.delivery_aggregators','commerce.orders')
)
insert into public.feature_dependencies(feature_id,depends_on_feature_id)
select f.id,d.id
from deps x
join public.features f on f.code=x.feature_code
join public.features d on d.code=x.depends_on_code
where not exists (
  select 1 from public.feature_dependencies fd
  where fd.feature_id=f.id and fd.depends_on_feature_id=d.id
);

-- Safety gates: V3 additions must remain planned and unassigned after this migration.
do $$
declare
  v_new_count integer;
  v_bad_state integer;
  v_assignments integer;
begin
  select count(*) into v_new_count
  from public.features
  where code = any(array[
    'commerce.variants','commerce.custom_orders','commerce.price_tiers','commerce.gift_cards','commerce.loyalty','commerce.installments','commerce.trade_in','commerce.consignment','commerce.b2b_orders','commerce.quotations','commerce.return_policies','commerce.weight_sales','commerce.bundles_kits','commerce.b2b_portal','commerce.season_pricing',
    'inventory.purchase_orders','inventory.supplier_returns','inventory.replenishment','inventory.landed_cost','inventory.returnables','inventory.testers',
    'food.prep','food.production','food.waste','food.costing',
    'service.warranty','service.packages','service.installation',
    'finance.credit','finance.receivables','finance.collections','finance.aging','finance.commissions',
    'fiscal.receipts','fiscal.invoices',
    'automotive.fitment','automotive.cross_reference','automotive.vin',
    'healthcare.emr','healthcare.insurance','education.school_lists','integrations.delivery_aggregators'
  ]::text[]);
  if v_new_count <> 42 then
    raise exception 'Capability Catalog V3 expected 42 new capabilities, found %', v_new_count;
  end if;

  select count(*) into v_bad_state
  from public.features
  where code = any(array[
    'commerce.variants','commerce.custom_orders','commerce.price_tiers','commerce.gift_cards','commerce.loyalty','commerce.installments','commerce.trade_in','commerce.consignment','commerce.b2b_orders','commerce.quotations','commerce.return_policies','commerce.weight_sales','commerce.bundles_kits','commerce.b2b_portal','commerce.season_pricing',
    'inventory.purchase_orders','inventory.supplier_returns','inventory.replenishment','inventory.landed_cost','inventory.returnables','inventory.testers',
    'food.prep','food.production','food.waste','food.costing',
    'service.warranty','service.packages','service.installation',
    'finance.credit','finance.receivables','finance.collections','finance.aging','finance.commissions',
    'fiscal.receipts','fiscal.invoices',
    'automotive.fitment','automotive.cross_reference','automotive.vin',
    'healthcare.emr','healthcare.insurance','education.school_lists','integrations.delivery_aggregators'
  ]::text[])
  and (implemented<>false or feature_class<>'planned' or active<>true);
  if v_bad_state <> 0 then
    raise exception 'Capability Catalog V3 safety violation: new capabilities must be active catalog entries but planned/unimplemented';
  end if;

  select count(*) into v_assignments
  from (
    select pf.feature_id from public.profile_features pf
    join public.features f on f.id=pf.feature_id where f.code = any(array[
      'commerce.variants','commerce.custom_orders','commerce.price_tiers','commerce.gift_cards','commerce.loyalty','commerce.installments','commerce.trade_in','commerce.consignment','commerce.b2b_orders','commerce.quotations','commerce.return_policies','commerce.weight_sales','commerce.bundles_kits','commerce.b2b_portal','commerce.season_pricing',
      'inventory.purchase_orders','inventory.supplier_returns','inventory.replenishment','inventory.landed_cost','inventory.returnables','inventory.testers',
      'food.prep','food.production','food.waste','food.costing','service.warranty','service.packages','service.installation','finance.credit','finance.receivables','finance.collections','finance.aging','finance.commissions','fiscal.receipts','fiscal.invoices','automotive.fitment','automotive.cross_reference','automotive.vin','healthcare.emr','healthcare.insurance','education.school_lists','integrations.delivery_aggregators'
    ]::text[])
    union all
    select acf.feature_id from public.activity_category_features acf
    join public.features f on f.id=acf.feature_id where f.code = any(array[
      'commerce.variants','commerce.custom_orders','commerce.price_tiers','commerce.gift_cards','commerce.loyalty','commerce.installments','commerce.trade_in','commerce.consignment','commerce.b2b_orders','commerce.quotations','commerce.return_policies','commerce.weight_sales','commerce.bundles_kits','commerce.b2b_portal','commerce.season_pricing',
      'inventory.purchase_orders','inventory.supplier_returns','inventory.replenishment','inventory.landed_cost','inventory.returnables','inventory.testers','food.prep','food.production','food.waste','food.costing','service.warranty','service.packages','service.installation','finance.credit','finance.receivables','finance.collections','finance.aging','finance.commissions','fiscal.receipts','fiscal.invoices','automotive.fitment','automotive.cross_reference','automotive.vin','healthcare.emr','healthcare.insurance','education.school_lists','integrations.delivery_aggregators'
    ]::text[])
    union all
    select bf.feature_id from public.business_features bf
    join public.features f on f.id=bf.feature_id where f.code = any(array[
      'commerce.variants','commerce.custom_orders','commerce.price_tiers','commerce.gift_cards','commerce.loyalty','commerce.installments','commerce.trade_in','commerce.consignment','commerce.b2b_orders','commerce.quotations','commerce.return_policies','commerce.weight_sales','commerce.bundles_kits','commerce.b2b_portal','commerce.season_pricing',
      'inventory.purchase_orders','inventory.supplier_returns','inventory.replenishment','inventory.landed_cost','inventory.returnables','inventory.testers','food.prep','food.production','food.waste','food.costing','service.warranty','service.packages','service.installation','finance.credit','finance.receivables','finance.collections','finance.aging','finance.commissions','fiscal.receipts','fiscal.invoices','automotive.fitment','automotive.cross_reference','automotive.vin','healthcare.emr','healthcare.insurance','education.school_lists','integrations.delivery_aggregators'
    ]::text[])
  ) s;
  if v_assignments <> 0 then
    raise exception 'Capability Catalog V3 safety violation: new capabilities must not be assigned by this migration';
  end if;
end $$;

commit;
