(function(global){
  'use strict';

  const core=global.SharawlaRuntimeCore;
  if(!core)throw new Error('SharawlaRuntimeCore must load before Retail Engine.');

  // Retail engine remains isolated from Restaurant delivery/kitchen/table rules.
  // Beta.20 hotfix preserves beta.19 Core Parity behavior and fixes engine startup.
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
  ].map(([name,keys])=>Object.freeze([name,Object.freeze(keys)])));

  const REPORT_ORDER_TYPES=Object.freeze([
    Object.freeze({code:'takeaway',label:'بيع تجزئة'}),
    Object.freeze({code:'pickup',label:'استلام من الفرع'}),
    Object.freeze({code:"delivery",label:'توصيل'})
  ]);

  // Commercial rule for Retail promotions.
  // Automatic Retail Offer and Promo Code must not stack with each other.
  // The higher automatic discount wins; an authorised manual discount may then
  // be added, with the final combined discount capped at the order subtotal.
  const PROMOTION_STACK_POLICY=Object.freeze({
    automatic:'best_of_promo_or_offer',
    manual:'add_after_automatic_if_authorized',
    cap:'subtotal'
  });

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

    pageOperationalAllowed(){
      return true;
    },

    shiftCloseBlockers(){
      return [];
    },

    reportOrderTypes(){
      return REPORT_ORDER_TYPES.map(x=>({...x}));
    },

    promotionStackPolicy(){
      return {...PROMOTION_STACK_POLICY};
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

  if(!core.hasEngine('retail'))throw new Error('Retail Engine registration failed.');
  global.__SharawlaRetailEngineLoaded=true;

  // Website integration stays isolated from app.js and Restaurant Engine.
  if(!document.querySelector('script[data-sharawla-retail-website-orders]')){
    const s=document.createElement('script');
    s.src='retail-website-pos.js?v=10.5.4-beta.20';
    s.defer=true;
    s.dataset.sharawlaRetailWebsiteOrders='1';
    document.head.appendChild(s);
  }
})(window);
