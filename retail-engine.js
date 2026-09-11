(function(global){
  'use strict';

  const core=global.SharawlaRuntimeCore;
  if(!core)throw new Error('SharawlaRuntimeCore must load before Retail Engine.');

  // Retail stays isolated from Restaurant delivery/kitchen/table rules.
  // Beta.19 restores shared Core sales-document parity without importing Restaurant-only behavior.
  const LEGACY_MODULES=Object.freeze([
    'customers','expenses','inventory','reports','returns','pos','barcode'
  ]);

  const PAGE_MODULE=Object.freeze({
    orders:'pos',
    customers:'customers',
    inventory:'inventory',
    suppliers:'inventory',
    purchasing:'inventory',
    marketSettings:'inventory',
    retailOffers:'pos',
    stockCount:'inventory',
    transfers:'inventory',
    websiteManagement:'website',
    expenses:'expenses',
    reports:'reports',
    returns:'returns',
    products:'pos',
    pos:'pos'
  });

  const PAGE_TITLES=Object.freeze({
    home:'الرئيسية',
    pos:'نقطة البيع',
    orders:'الفواتير',
    customers:'العملاء',
    shifts:'الورديات',
    inventory:'المخزون',
    suppliers:'الموردين',
    purchasing:'المشتريات والاستلام',
    marketSettings:'وحدات وباركود الوزن',
    retailOffers:'عروض الماركت',
    stockCount:'الجرد',
    transfers:'تحويلات الفروع',
    websiteManagement:'إدارة الموقع',
    returns:'المرتجعات',
    expenses:'المصروفات',
    products:'الأصناف',
    reports:'التقارير',
    users:'المستخدمون',
    settings:'الإعدادات'
  });

  const ALL_PAGES=Object.freeze([
    'home','pos','orders','customers','shifts','inventory','marketSettings','retailOffers','stockCount','transfers','suppliers','purchasing','websiteManagement','returns','expenses','products','reports','users','settings'
  ]);

  const ROLE_PAGES=Object.freeze({
    admin:ALL_PAGES,
    cashier:Object.freeze(['home','pos','orders','customers','shifts','products','returns']),
    callcenter:Object.freeze(['home','orders','customers','products']),
    delivery:Object.freeze(['home'])
  });

  const PERMISSION_DEFS=Object.freeze([
    ['pos','نقطة البيع'],
    ['orders','الفواتير'],
    ['customers','العملاء'],
    ['shifts','الورديات'],
    ['inventory','المخزون'],
    ['suppliers','الموردين'],
    ['purchasing','المشتريات والاستلام'],
    ['marketSettings','وحدات وباركود الوزن'],
    ['retailOffers','عروض الماركت'],
    ['stockCount','الجرد'],
    ['transfers','تحويلات الفروع'],
    ['websiteManagement','إدارة الموقع'],
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
    ['🧾 نقطة البيع',['pos','orders']],
    ['📦 Retail',['customers','shifts','inventory','marketSettings','retailOffers','stockCount','transfers','suppliers','purchasing','websiteManagement','products','returns']],
    ['📊 الإدارة',['expenses','reports','settings']],
    ['🏪 الفروع',['branchManagement']],
    ['⚙️ النظام',['businessSettings','printingSettings','financialSettings']]
  ].map(([name,keys])=>Object.freeze([name,Object.freeze(keys)]));

  core.registerEngine({
    code:'retail',
    displayName:'Retail',
    phase:'core-parity-fix-pack',

    resolveModules(modules,configured){
      return configured ? core.normalizeModules(modules) : [...LEGACY_MODULES];
    },

    pageAllowed(config,page){
      if(!ALL_PAGES.includes(page))return false;
      const moduleCode=PAGE_MODULE[page]||null;
      return !moduleCode || core.moduleEnabled(config,moduleCode);
    },

    pageOperationalAllowed(){return true;},

    // Retail sales are complete transactions when committed. Pending website
    // requests live in retail_website_orders before acceptance and therefore do
    // not belong to the current POS shift. They must not inherit Restaurant
    // delivery/preparation blockers.
    shiftCloseBlockers(){return [];},

    pageTitle(page){return PAGE_TITLES[page]||page;},
    allPages(){return [...ALL_PAGES];},
    rolePages(role){return [...(ROLE_PAGES[role]||ROLE_PAGES.cashier)];},
    permissionDefs(){return PERMISSION_DEFS.map(row=>[row[0],row[1]]);},
    permissionGroups(){return PERMISSION_GROUPS.map(([title,keys])=>[title,[...keys]]);}
  });

  // Website integration remains isolated from Restaurant Engine.
  if(!document.querySelector('script[data-sharawla-retail-website-orders]')){
    const s=document.createElement('script');
    s.src='retail-website-pos.js?v=10.5.4-beta.19';
    s.defer=true;
    s.dataset.sharawlaRetailWebsiteOrders='1';
    document.head.appendChild(s);
  }
})(window);
