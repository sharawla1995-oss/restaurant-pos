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
  const PAGE_MODULE=Object.freeze({
    pos:'pos',
    orders:'pos',
    products:'pos',
    shifts:'pos',
    returns:'returns',
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
    home:'الرئيسية',pos:'الكاشير',orders:'الطلبات',returns:'المرتجعات',customers:'العملاء',
    deliveryOrders:'طلبات الدليفري',deliverySettings:'إعدادات الدليفري',delivery:'الدليفري',
    kitchen:'المطبخ',shifts:'الشيفت',inventory:'المخزون',expenses:'المصروفات',products:'الأصناف',
    promoCodes:'البرومو كود',branchProductAvailability:'توافر أصناف الموقع',websiteManagement:'إدارة الموقع',
    websiteBranchSettings:'استقبال الطلبات ومدة التجهيز',websitePayments:'طرق الدفع على الموقع',
    websiteAppearance:'تصميم وقائمة الموقع',reports:'التقارير',users:'المستخدمون',settings:'الإعدادات'
  });

  const ALL_PAGES=Object.freeze([
    'home','pos','orders','returns','customers','deliveryOrders','deliverySettings','delivery','kitchen',
    'shifts','inventory','expenses','products','promoCodes','branchProductAvailability','reports','users','settings'
  ]);

  const ROLE_PAGES=Object.freeze({
    admin:ALL_PAGES,
    cashier:Object.freeze(['home','pos','orders','returns','customers','deliveryOrders','delivery','shifts']),
    callcenter:Object.freeze(['home','pos','orders','returns','customers','deliveryOrders','delivery']),
    delivery:Object.freeze(['home','pos','orders','returns','customers','deliveryOrders','delivery'])
  });

  const PERMISSION_DEFS=Object.freeze([
    ['pos','الكاشير'],['orders','الطلبات'],['returns','↩️ المرتجعات'],['customers','العملاء'],['deliveryOrders','طلبات الدليفري'],['shifts','الشيفت'],
    ['expenses','المصروفات'],['reports','التقارير'],['products','الأصناف'],['promoCodes','🎟️ البرومو كود'],['deliverySettings','إعدادات الدليفري'],
    ['kitchen','المطبخ'],['inventory','المخزون'],['settings','الإعدادات'],
    ['branchProductAvailability','🌐 إدارة توافر أصناف الموقع'],
    ['websiteBranchSettings','🔥 إدارة استقبال طلبات الموقع ومدة التجهيز'],
    ['branchManagement','🏪 إدارة الفروع'],
    ['businessSettings','🎨 هوية وإعدادات النشاط'],
    ['printingSettings','🖨️ إعدادات الطباعة'],
    ['financialSettings','💳 طرق الدفع والضريبة والخدمة'],
    ['websiteAppearance','🌐 تصميم وإعدادات الموقع'],
    ['discount','🏷️ السماح بالخصم']
  ].map(row=>Object.freeze(row)));

  const PERMISSION_GROUPS=Object.freeze([
    ['🧾 المبيعات',['pos','orders','returns','customers','deliveryOrders','shifts']],
    ['📊 الإدارة',['expenses','reports','products','promoCodes','settings']],
    ['🚚 التشغيل',['deliverySettings','kitchen','inventory']],
    ['🌐 إدارة الموقع',['branchProductAvailability','websiteBranchSettings','websiteAppearance']],
    ['🏪 الفروع',['branchManagement']],
    ['⚙️ النظام',['businessSettings','printingSettings','financialSettings','discount']]
  ].map(([name,keys])=>Object.freeze([name,Object.freeze(keys)])));

  const OPERATIONAL_FLAGS=Object.freeze({
    deliveryOrders:'enable_delivery',
    delivery:'enable_delivery',
    kitchen:'enable_kitchen',
    inventory:'enable_inventory'
  });

  const REPORT_ORDER_TYPES=Object.freeze([
    Object.freeze({code:'takeaway',label:'تيك أواي'}),
    Object.freeze({code:'pickup',label:'استلام من الفرع'}),
    Object.freeze({code:'delivery',label:'دليفري'}),
    Object.freeze({code:'dinein',label:'صالة'})
  ]);

  core.registerEngine({
    code:'restaurant',
    displayName:'Restaurant',
    bootstrapDefault:true,

    resolveModules(modules,configured){
      return configured ? core.normalizeModules(modules) : [...LEGACY_MODULES];
    },

    pageAllowed(config,page){
      const moduleCode=PAGE_MODULE[page]||null;
      return !moduleCode || core.moduleEnabled(config,moduleCode);
    },

    pageOperationalAllowed(_config,page,settings){
      const flag=OPERATIONAL_FLAGS[page]||null;
      return !flag || !!settings?.[flag];
    },

    shiftCloseBlockers(orders){
      return orders.filter(o=>(o.order_type==='delivery'&&!['delivered','cancelled','completed'].includes(o.status))||(String(o.source||'')==='website'&&o.order_type!=='delivery'&&!['completed','cancelled'].includes(o.status)));
    },

    reportOrderTypes(){
      return REPORT_ORDER_TYPES.map(x=>({...x}));
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

  // Additive feature layers. Each file self-gates on Runtime Config; loading them
  // never enables a capability by itself and never changes legacy Restaurant flow.
  const load=(key,src)=>{if(document.querySelector(`script[data-${key}]`))return;const s=document.createElement('script');s.src=src;s.defer=true;s.setAttribute(`data-${key}`,'1');document.head.appendChild(s)};
  load('sharawla-food-recipe-runtime-v1','food-recipe-runtime-bridge.js?v=food-recipe-runtime-v1.0');
  load('sharawla-food-recipe-ui-v1','food-recipe-ui-v1.js?v=food-recipe-ui-v1.0');
  load('sharawla-food-advanced-ui-v1','food-advanced-ui-v1.js?v=food-advanced-ui-v1.0');
})(window);
