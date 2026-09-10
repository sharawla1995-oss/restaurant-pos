(function(global){
  'use strict';

  const core=global.SharawlaRuntimeCore;
  if(!core)throw new Error('SharawlaRuntimeCore must load before Retail Engine.');

  // Retail engine remains isolated from Restaurant delivery/kitchen/table rules.
  // Beta.15 adds Retail inventory foundation and generic returns integration.
  const LEGACY_MODULES=Object.freeze([
    'customers','expenses','inventory','reports','returns','pos','barcode'
  ]);

  const PAGE_MODULE=Object.freeze({
    customers:'customers',
    inventory:'inventory',
    expenses:'expenses',
    reports:'reports',
    returns:'returns',
    products:'pos',
    pos:'pos'
  });

  const PAGE_TITLES=Object.freeze({
    home:'الرئيسية',
    pos:'نقطة البيع',
    customers:'العملاء',
    shifts:'الورديات',
    inventory:'المخزون',
    returns:'المرتجعات',
    expenses:'المصروفات',
    products:'الأصناف',
    reports:'التقارير',
    users:'المستخدمون',
    settings:'الإعدادات'
  });

  // Retail checkout + inventory + returns are enabled. Restaurant-only
  // delivery/kitchen/table/website semantics remain excluded from Retail.
  const ALL_PAGES=Object.freeze([
    'home','pos','customers','shifts','inventory','returns','expenses','products','reports','users','settings'
  ]);

  const ROLE_PAGES=Object.freeze({
    admin:ALL_PAGES,
    cashier:Object.freeze(['home','pos','customers','shifts','products','returns']),
    callcenter:Object.freeze(['home','customers','products']),
    delivery:Object.freeze(['home'])
  });

  const PERMISSION_DEFS=Object.freeze([
    ['pos','نقطة البيع'],
    ['customers','العملاء'],
    ['shifts','الورديات'],
    ['inventory','المخزون'],
    ['returns','المرتجعات'],
    ['expenses','المصروفات'],
    ['products','الأصناف'],
    ['reports','التقارير'],
    ['settings','الإعدادات'],
    ['branchManagement','🏪 إدارة الفروع'],
    ['businessSettings','🎨 هوية وإعدادات النشاط'],
    ['printingSettings','🖨️ إعدادات الطباعة'],
    ['financialSettings','💳 طرق الدفع والضريبة والخدمة']
  ].map(row=>Object.freeze(row)));

  const PERMISSION_GROUPS=Object.freeze([
    ['🧾 نقطة البيع',['pos']],
    ['📦 Retail',['customers','shifts','inventory','products','returns']],
    ['📊 الإدارة',['expenses','reports','settings']],
    ['🏪 الفروع',['branchManagement']],
    ['⚙️ النظام',['businessSettings','printingSettings','financialSettings']]
  ].map(([name,keys])=>Object.freeze([name,Object.freeze(keys)])));

  core.registerEngine({
    code:'retail',
    displayName:'Retail',
    phase:'inventory-foundation',

    resolveModules(modules,configured){
      return configured ? core.normalizeModules(modules) : [...LEGACY_MODULES];
    },

    pageAllowed(config,page){
      if(!ALL_PAGES.includes(page))return false;
      const moduleCode=PAGE_MODULE[page]||null;
      return !moduleCode || core.moduleEnabled(config,moduleCode);
    },

    pageOperationalAllowed(){
      return true;
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
