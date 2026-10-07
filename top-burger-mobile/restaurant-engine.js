(function(global){
  'use strict';

  const core=global.SharawlaRuntimeCore;
  if(!core)throw new Error('SharawlaRuntimeCore must load before Restaurant Engine.');

  // Restaurant compatibility set preserves V10.4.21 behavior for legacy
  // Restaurant businesses that have not received explicit module mappings yet.
  const LEGACY_MODULES=Object.freeze([
    'pos','kitchen','delivery','pickup','website','inventory',
    'returns','promocodes','expenses','reports','customers','tables'
  ]);

  // Restaurant-only page → module ownership. Multi-Industry Core never needs to
  // know these page names or module relationships.
  const PAGE_FEATURE=Object.freeze({
    foodRecipes:'food.recipes'
  });

  const PAGE_MODULE=Object.freeze({
    pos:'pos',
    orders:'pos',
    products:'pos',
    shifts:'pos',
    returns:'returns',
    approvals:'returns',
    customers:'customers',
    deliveryOrders:'delivery',
    deliverySettings:'delivery',
    delivery:'delivery',
    kitchen:'kitchen',
    inventory:'inventory',
    expenses:'expenses',
    promoCodes:'promocodes',
    reports:'reports',
    branchProductAvailability:'website',
    websiteManagement:'website',
    websiteBranchSettings:'website',
    websitePayments:'website',
    websiteAppearance:'website'
  });

  const PAGE_TITLES=Object.freeze({
    home:'الرئيسية',pos:'الكاشير',orders:'الطلبات',returns:'المرتجعات',approvals:'موافقات المدير',customers:'العملاء',
    deliveryOrders:'طلبات الدليفري',deliverySettings:'إعدادات الدليفري',delivery:'الدليفري',
    kitchen:'المطبخ',shifts:'الشيفت',inventory:'المخزون',foodRecipes:'الوصفات',expenses:'المصروفات',products:'الأصناف',
    promoCodes:'البرومو كود',branchProductAvailability:'توافر أصناف الموقع',websiteManagement:'إدارة الموقع',
    websiteBranchSettings:'استقبال الطلبات ومدة التجهيز',websitePayments:'طرق الدفع على الموقع',
    websiteAppearance:'تصميم وقائمة الموقع',reports:'التقارير',users:'المستخدمون',settings:'الإعدادات'
  });

  const ALL_PAGES=Object.freeze([
    'home','pos','orders','returns','approvals','customers','deliveryOrders','deliverySettings','delivery','kitchen',
    'shifts','inventory','foodRecipes','expenses','products','promoCodes','branchProductAvailability','reports','users','settings'
  ]);

  const ROLE_PAGES=Object.freeze({
    admin:ALL_PAGES,
    cashier:Object.freeze(['home','pos','orders','returns','customers','deliveryOrders','delivery','shifts']),
    callcenter:Object.freeze(['home','pos','orders','returns','customers','deliveryOrders','delivery']),
    delivery:Object.freeze(['home','pos','orders','returns','customers','deliveryOrders','delivery'])
  });

  const PERMISSION_DEFS=Object.freeze([
    ['pos','الكاشير'],['orders','الطلبات'],['returns','↩️ شاشة المرتجعات'],['returnExecute','↩️ تنفيذ المرتجع مباشرة'],['returnApprovals','✅ اعتماد المرتجعات'],['customers','العملاء'],['deliveryOrders','طلبات الدليفري'],['deliverySettlement','💰 تسوية تحصيلات المندوبين'],['deliveryPaymentCorrection','💳 تعديل طريقة دفع الدليفري'],['shifts','الشيفت'],
    ['expenses','المصروفات'],['reports','التقارير'],['products','الأصناف'],['promoCodes','🎟️ البرومو كود'],['deliverySettings','إعدادات الدليفري'],
    ['kitchen','المطبخ'],['inventory','المخزون'],['settings','الإعدادات'],
    ['branchProductAvailability','🌐 إدارة توافر أصناف الموقع'],
    ['websiteBranchSettings','🔥 إدارة استقبال طلبات الموقع ومدة التجهيز'],
    ['branchManagement','🏪 إدارة الفروع'],
    ['businessSettings','🎨 هوية وإعدادات النشاط'],
    ['printingSettings','🖨️ إعدادات الطباعة'],
    ['financialSettings','💳 طرق الدفع والضريبة والخدمة'],
    ['websiteAppearance','🌐 تصميم وإعدادات الموقع'],
    ['discount','🏷️ السماح بالخصم'],
    ['hr.employees.view','HR • عرض الموظفين'],['hr.employees.create','HR • إضافة موظف'],['hr.employees.edit','HR • تعديل موظف'],
    ['hr.salary.view','HR • عرض الرواتب'],['hr.salary.manage','HR • تعديل الرواتب'],
    ['hr.attendance.view','HR • عرض الحضور'],['hr.attendance.manage','HR • اعتماد الحضور'],['hr.attendance.adjust','HR • تصحيح الحضور'],
    ['hr.schedules.view','HR • عرض الجداول'],['hr.schedules.manage','HR • إدارة الجداول'],
    ['hr.geofence.manage','HR • إدارة نطاق الفرع'],['hr.staff_accounts.manage','HR • حسابات تطبيق الموظفين'],
    ['hr.leave.view','HR • عرض الإجازات'],['hr.leave.manage','HR • اعتماد الإجازات'],
    ['hr.deduction_rules.view','HR • عرض قواعد الخصم'],['hr.deduction_rules.manage','HR • إدارة قواعد الخصم'],
    ['hr.advances.view','HR • عرض السلف'],['hr.advances.create','HR • إنشاء سلفة'],['hr.advances.approve','HR • اعتماد سلفة'],['hr.advances.disburse','HR • صرف سلفة'],
    ['hr.adjustments.view','HR • عرض الخصومات والمكافآت'],['hr.adjustments.manage','HR • إدارة الخصومات والمكافآت'],
    ['hr.payroll.view','HR • عرض المرتبات'],['hr.payroll.run','HR • إعداد المرتبات'],['hr.payroll.approve','HR • اعتماد المرتبات'],['hr.payroll.pay','HR • صرف المرتبات'],
    ['hr.reports.view','HR • التقارير'],['hr.settings.manage','HR • الإعدادات'],
    ['branch.hr.adjustments.request','الفرع • رفع طلب جزاء / مكافأة'],
    ['branch.hr.finance.view','الفرع • عرض مستحقات HR المعتمدة'],
    ['branch.hr.finance.disburse','الفرع • صرف السلف والمرتبات المعتمدة'],
    ['treasury.post','الخزنة • تسجيل حركة مالية']
  ].map(row=>Object.freeze(row)));

  const PERMISSION_GROUPS=Object.freeze([
    ['🧾 المبيعات',['pos','orders','returns','returnExecute','returnApprovals','customers','deliveryOrders','shifts']],
    ['📊 الإدارة',['expenses','reports','products','promoCodes','settings']],
    ['🚚 التشغيل',['deliverySettings','deliverySettlement','deliveryPaymentCorrection','kitchen','inventory']],
    ['🌐 إدارة الموقع',['branchProductAvailability','websiteBranchSettings','websiteAppearance']],
    ['🏪 الفروع',['branchManagement']],
    ['⚙️ النظام',['businessSettings','printingSettings','financialSettings','discount']],
    ['👥 الموارد البشرية',["hr.employees.view","hr.employees.create","hr.employees.edit","hr.salary.view","hr.salary.manage","hr.attendance.view","hr.attendance.manage","hr.attendance.adjust","hr.schedules.view","hr.schedules.manage","hr.geofence.manage","hr.staff_accounts.manage","hr.leave.view","hr.leave.manage","hr.deduction_rules.view","hr.deduction_rules.manage","hr.advances.view","hr.advances.create","hr.advances.approve","hr.adjustments.view","hr.adjustments.manage","hr.payroll.view","hr.payroll.run","hr.payroll.approve","hr.reports.view","hr.settings.manage"]],
    ['🏪 مدير الفرع / HR المالي',["branch.hr.adjustments.request","branch.hr.finance.view","branch.hr.finance.disburse","treasury.post"]]
  ].map(([name,keys])=>Object.freeze([name,Object.freeze(keys)])));

  const OPERATIONAL_FLAGS=Object.freeze({
    deliveryOrders:'enable_delivery',
    delivery:'enable_delivery',
    kitchen:'enable_kitchen',
    inventory:'enable_inventory'
  });

  core.registerEngine({
    code:'restaurant',
    displayName:'Restaurant',

    resolveModules(modules,configured){
      return configured ? core.normalizeModules(modules) : [...LEGACY_MODULES];
    },

    pageAllowed(config,page){
      const featureCode=PAGE_FEATURE[page]||null;
      if(featureCode && !core.featureEnabled(config,featureCode))return false;
      const moduleCode=PAGE_MODULE[page]||null;
      return !moduleCode || core.moduleEnabled(config,moduleCode);
    },

    pageOperationalAllowed(_config,page,settings){
      const flag=OPERATIONAL_FLAGS[page]||null;
      return !flag || !!settings?.[flag];
    },

    pageTitle(page){
      return PAGE_TITLES[page]||page;
    },

    allPages(){
      return [...ALL_PAGES];
    },

    rolePages(role){
      return [...(ROLE_PAGES[role]||ROLE_PAGES.cashier)];
    },

    permissionDefs(){
      return PERMISSION_DEFS.map(row=>[row[0],row[1]]);
    },

    permissionGroups(){
      return PERMISSION_GROUPS.map(([title,keys])=>[title,[...keys]]);
    }
  });
})(window);
