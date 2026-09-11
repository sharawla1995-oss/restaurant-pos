(function(global){
  'use strict';
  const core=global.SharawlaRuntimeCore;
  if(!core)throw new Error('SharawlaRuntimeCore must load before Pharmacy Engine.');

  // Beta31 hotfix: Pharmacy UI runs in a separate classic script and cannot
  // see app.js's lexical sharawlaRuntimeConfig directly. Expose a read-only
  // runtimeConfig getter backed by the canonical Runtime Config cache.
  if(typeof global.runtimeConfig!=='function'){
    global.runtimeConfig=()=>{
      try{
        const raw=JSON.parse(localStorage.getItem('sharawlaRuntimeConfigV1')||'null');
        return raw&&typeof raw==='object'?raw:null;
      }catch{return null}
    };
  }

  const LEGACY_MODULES=Object.freeze(['pos','customers','inventory','returns','reports','expenses','barcode','delivery','website','promocodes','pharmacy','insurance']);
  const PAGE_MODULE=Object.freeze({
    orders:'pos',customers:'customers',deliveryOrders:'delivery',deliverySettings:'delivery',inventory:'inventory',
    suppliers:'inventory',purchasing:'inventory',stockCount:'inventory',transfers:'inventory',promoCodes:'promocodes',
    websiteManagement:'website',returns:'returns',expenses:'expenses',products:'pos',reports:'reports',pos:'pos',
    pharmacyCatalog:'pharmacy',pharmacyBatches:'pharmacy',pharmacyExpiry:'pharmacy',pharmacyPrescriptions:'pharmacy',
    pharmacyInsurance:'insurance',pharmacyClaims:'insurance'
  });
  const PAGE_TITLES=Object.freeze({
    home:'الرئيسية',pos:'كاشير الصيدلية',orders:'الفواتير',customers:'العملاء',deliveryOrders:'طلبات الدليفري',
    deliverySettings:'إدارة الدليفري',shifts:'الورديات',inventory:'المخزون',suppliers:'الموردين',
    purchasing:'المشتريات والاستلام',stockCount:'الجرد',transfers:'تحويلات الفروع',promoCodes:'البرومو كود',
    websiteManagement:'إدارة الموقع',returns:'المرتجعات',expenses:'المصروفات',products:'الأصناف',reports:'التقارير',
    users:'المستخدمون',settings:'الإعدادات',pharmacyCatalog:'دليل الأدوية',pharmacyBatches:'الباتشات والتشغيلات',
    pharmacyExpiry:'الصلاحيات والتنبيهات',pharmacyPrescriptions:'الروشتات',pharmacyInsurance:'شركات التأمين',pharmacyClaims:'مطالبات التأمين'
  });
  const ALL_PAGES=Object.freeze([
    'home','pos','orders','customers','pharmacyCatalog','pharmacyBatches','pharmacyExpiry','pharmacyPrescriptions',
    'pharmacyInsurance','pharmacyClaims','deliveryOrders','shifts','inventory','stockCount','transfers','suppliers','purchasing',
    'promoCodes','websiteManagement','returns','expenses','products','reports','users','settings','deliverySettings'
  ]);
  const ROLE_PAGES=Object.freeze({
    admin:ALL_PAGES,
    cashier:Object.freeze(['home','pos','orders','customers','pharmacyCatalog','pharmacyBatches','pharmacyPrescriptions','returns','shifts']),
    pharmacist:Object.freeze(['home','pos','orders','customers','pharmacyCatalog','pharmacyBatches','pharmacyExpiry','pharmacyPrescriptions','pharmacyInsurance','pharmacyClaims','inventory','returns','shifts']),
    callcenter:Object.freeze(['home','orders','customers','pharmacyCatalog','pharmacyPrescriptions','deliveryOrders']),
    delivery:Object.freeze(['home','deliveryOrders'])
  });
  const PERMISSION_DEFS=Object.freeze([
    ['pos','كاشير الصيدلية'],['orders','الفواتير'],['customers','العملاء'],['pharmacyCatalog','دليل الأدوية'],
    ['pharmacyBatches','الباتشات والتشغيلات'],['pharmacyExpiry','الصلاحيات والتنبيهات'],['pharmacyPrescriptions','الروشتات'],
    ['pharmacyInsurance','شركات وخطط التأمين'],['pharmacyClaims','مطالبات التأمين'],['deliveryOrders','طلبات الدليفري'],
    ['deliverySettings','إدارة الدليفري'],['shifts','الورديات'],['inventory','المخزون'],['stockCount','الجرد'],
    ['transfers','تحويلات الفروع'],['suppliers','الموردين'],['purchasing','المشتريات والاستلام'],['promoCodes','البرومو كود'],
    ['websiteManagement','إدارة الموقع'],['returns','المرتجعات'],['expenses','المصروفات'],['products','الأصناف'],['reports','التقارير'],
    ['settings','الإعدادات'],['branchManagement','إدارة الفروع'],['businessSettings','هوية وإعدادات النشاط'],
    ['printingSettings','إعدادات الطباعة'],['financialSettings','طرق الدفع والضريبة والخدمة']
  ].map(r=>Object.freeze(r)));
  const PERMISSION_GROUPS=Object.freeze([
    ['💊 البيع والصيدلية',['pos','orders','customers','pharmacyCatalog','pharmacyBatches','pharmacyExpiry','pharmacyPrescriptions']],
    ['🧾 التأمين',['pharmacyInsurance','pharmacyClaims']],
    ['📦 المخزون والمشتريات',['inventory','stockCount','transfers','suppliers','purchasing','products']],
    ['🛵 الدليفري والموقع',['deliveryOrders','deliverySettings','websiteManagement','promoCodes']],
    ['📊 الإدارة',['shifts','returns','expenses','reports','settings']],
    ['🏪 الفروع',['branchManagement']],['⚙️ النظام',['businessSettings','printingSettings','financialSettings']]
  ].map(([n,k])=>Object.freeze([n,Object.freeze(k)]));
  const REPORT_ORDER_TYPES=Object.freeze([
    Object.freeze({code:'takeaway',label:'بيع صيدلية'}),Object.freeze({code:'pickup',label:'استلام من الفرع'}),Object.freeze({code:'delivery',label:'توصيل'})
  ]);

  core.registerEngine({
    code:'pharmacy',displayName:'Pharmacy',phase:'pharmacy-complete-beta31',
    resolveModules(modules,configured){return configured?core.normalizeModules(modules):[...LEGACY_MODULES]},
    pageAllowed(config,page){if(!ALL_PAGES.includes(page))return false;const moduleCode=PAGE_MODULE[page]||null;return !moduleCode||core.moduleEnabled(config,moduleCode)},
    pageOperationalAllowed(){return true},shiftCloseBlockers(){return []},reportOrderTypes(){return REPORT_ORDER_TYPES.map(x=>({...x}))},
    pageTitle(page){return PAGE_TITLES[page]||page},allPages(){return [...ALL_PAGES]},rolePages(role){return [...(ROLE_PAGES[role]||ROLE_PAGES.cashier)]},
    permissionDefs(){return PERMISSION_DEFS.map(r=>[r[0],r[1]])},permissionGroups(){return PERMISSION_GROUPS.map(([t,k])=>[t,[...k]])}
  });
  if(!core.hasEngine('pharmacy'))throw new Error('Pharmacy Engine registration failed.');
  global.__SharawlaPharmacyEngineLoaded=true;
})(window);
