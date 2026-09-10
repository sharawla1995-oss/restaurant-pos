(function(global){
  'use strict';

  const core=global.SharawlaRuntimeCore;
  if(!core)throw new Error('SharawlaRuntimeCore must load before Retail Engine.');

  // Retail Phase 1 is intentionally a shell/capability engine only.
  // It does NOT reuse Restaurant delivery/kitchen/table rules and it does NOT
  // introduce Retail checkout or inventory transaction semantics yet.
  const LEGACY_MODULES=Object.freeze([
    'customers','expenses','inventory','reports','pos','barcode'
  ]);

  const PAGE_MODULE=Object.freeze({
    customers:'customers',
    inventory:'inventory',
    expenses:'expenses',
    reports:'reports',
    products:'pos'
  });

  const PAGE_TITLES=Object.freeze({
    home:'الرئيسية',
    customers:'العملاء',
    shifts:'الورديات',
    inventory:'المخزون',
    expenses:'المصروفات',
    products:'الأصناف',
    reports:'التقارير',
    users:'المستخدمون',
    settings:'الإعدادات'
  });

  // Phase 1 deliberately excludes cashier/orders/returns until the Retail
  // transaction model and barcode checkout are implemented and regression-tested.
  const ALL_PAGES=Object.freeze([
    'home','customers','shifts','inventory','expenses','products','reports','users','settings'
  ]);

  const ROLE_PAGES=Object.freeze({
    admin:ALL_PAGES,
    cashier:Object.freeze(['home','customers','shifts','products']),
    callcenter:Object.freeze(['home','customers','products']),
    delivery:Object.freeze(['home'])
  });

  const PERMISSION_DEFS=Object.freeze([
    ['customers','العملاء'],
    ['shifts','الورديات'],
    ['inventory','المخزون'],
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
    ['📦 Retail',['customers','shifts','inventory','products']],
    ['📊 الإدارة',['expenses','reports','settings']],
    ['🏪 الفروع',['branchManagement']],
    ['⚙️ النظام',['businessSettings','printingSettings','financialSettings']]
  ].map(([name,keys])=>Object.freeze([name,Object.freeze(keys)])));

  core.registerEngine({
    code:'retail',
    displayName:'Retail',
    phase:'foundation-shell',

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
