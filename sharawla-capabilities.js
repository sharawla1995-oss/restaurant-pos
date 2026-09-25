(function(global){
'use strict';
const VERSION='10.5.4-beta.32';
const BASE_FEATURES=Object.freeze([
  'core.auth','core.licensing','core.branches','core.users','core.permissions','core.shifts','core.payments','core.reports','core.audit','core.notifications','core.offline','core.updates'
]);
const FEATURE_ROWS=[
  ['core.auth','Core','تسجيل الدخول',[]],['core.licensing','Core','الترخيص والأجهزة',['core.auth']],['core.branches','Core','الفروع',['core.auth']],['core.users','Core','المستخدمون',['core.auth']],['core.permissions','Core','الصلاحيات',['core.users']],['core.customers','Core','العملاء',['core.auth']],['core.shifts','Core','الورديات',['core.auth']],['core.payments','Core','طرق الدفع',['core.auth']],['core.expenses','Core','المصروفات',['core.auth']],['core.reports','Core','التقارير',['core.auth']],['core.audit','Core','سجل التدقيق',['core.auth']],['core.notifications','Core','التنبيهات',['core.auth']],['core.offline','Core','العمل بدون إنترنت',['core.auth']],['core.updates','Core','التحديثات',['core.licensing']],
  ['commerce.pos','Commerce','الكاشير',['core.payments','core.shifts']],['commerce.orders','Commerce','الفواتير والطلبات',['commerce.pos']],['commerce.products','Commerce','الأصناف',['commerce.pos']],['commerce.barcode','Commerce','الباركود',['commerce.products']],['commerce.promotions','Commerce','العروض والبرومو كود',['commerce.products']],['commerce.returns','Commerce','المرتجعات',['commerce.orders']],['commerce.website','Commerce','الموقع والطلبات أونلاين',['commerce.products']],['commerce.delivery','Commerce','الدليفري',['commerce.orders','core.customers']],['commerce.pickup','Commerce','استلام من الفرع',['commerce.orders']],
  ['inventory.stock','Inventory','المخزون',['commerce.products']],['inventory.count','Inventory','الجرد',['inventory.stock']],['inventory.transfers','Inventory','تحويلات الفروع',['inventory.stock','core.branches']],['inventory.suppliers','Inventory','الموردون',['core.auth']],['inventory.receiving','Inventory','الاستلام',['inventory.stock']],['inventory.purchasing','Inventory','المشتريات',['inventory.suppliers','inventory.receiving']],['inventory.multi_warehouse','Inventory','مخازن متعددة',['inventory.stock']],['inventory.batch','Inventory','الباتشات والتشغيلات',['inventory.stock']],['inventory.expiry','Inventory','الصلاحية',['inventory.batch']],['inventory.serials','Inventory','السيريال/IMEI',['inventory.stock']],
  ['food.kitchen','Food Service','المطبخ/KDS',['commerce.orders']],['food.modifiers','Food Service','الإضافات والتعديلات',['commerce.products']],['food.tables','Food Service','الترابيزات والصالة',['commerce.orders']],['food.recipes','Food Service','الوصفات',['inventory.stock','commerce.products']],['food.ingredients','Food Service','المكونات',['food.recipes']],
  ['pharmacy.catalog','Pharmacy','دليل الأدوية',['commerce.products']],['pharmacy.prescriptions','Pharmacy','الروشتات',['core.customers','pharmacy.catalog']],['pharmacy.controlled_drugs','Pharmacy','الأدوية المراقبة',['pharmacy.catalog','pharmacy.prescriptions']],['pharmacy.alternatives','Pharmacy','البدائل',['pharmacy.catalog']],['pharmacy.insurance','Pharmacy','التأمين الطبي',['core.customers','commerce.pos']],['pharmacy.claims','Pharmacy','مطالبات التأمين',['pharmacy.insurance','commerce.orders']],
  ['logistics.shipments','Logistics','الشحنات',['core.customers']],['logistics.waybills','Logistics','بوالص الشحن',['logistics.shipments']],['logistics.pickup_requests','Logistics','طلبات الاستلام',['logistics.shipments']],['logistics.zones_pricing','Logistics','المناطق والتسعير',['core.branches']],['logistics.drivers','Logistics','السائقون والمندوبون',['core.users']],['logistics.tracking','Logistics','تتبع الشحنة',['logistics.shipments']],['logistics.cod','Logistics','تحصيل COD',['logistics.shipments','core.payments']],['logistics.client_settlements','Logistics','تسويات العملاء',['logistics.cod']],['logistics.returns','Logistics','مرتجعات الشحن',['logistics.shipments']],
  ['membership.members','Membership','الأعضاء',['core.customers']],['membership.plans','Membership','خطط العضوية',['core.payments']],['membership.subscriptions','Membership','الاشتراكات',['membership.members','membership.plans']],['membership.renewals','Membership','التجديدات',['membership.subscriptions']],['membership.checkin','Membership','تسجيل الدخول والحضور',['membership.subscriptions']],['membership.classes','Membership','الحصص',['membership.members']],['membership.bookings','Membership','الحجوزات',['membership.classes']],['membership.freeze','Membership','تجميد العضوية',['membership.subscriptions']],['membership.trainers','Membership','المدربون',['core.users']],
  ['service.jobs','Service','أوامر الخدمة',['core.customers']],['service.appointments','Service','المواعيد',['core.customers']],['service.assets','Service','أصول العميل',['core.customers']]
];
const FEATURES=new Map(FEATURE_ROWS.map(([code,domain,label,dependsOn])=>[code,Object.freeze({code,domain,label,dependsOn:Object.freeze([...dependsOn])})]));
const PROFILES=Object.freeze({
  restaurant:Object.freeze({code:'restaurant',domain:'food_service',label:'مطاعم وكافيهات',implemented:true,features:Object.freeze([
    ...BASE_FEATURES,'core.customers','core.expenses','commerce.pos','commerce.orders','commerce.products','commerce.barcode','commerce.promotions','commerce.returns','commerce.website','commerce.delivery','commerce.pickup','inventory.stock','inventory.suppliers','inventory.receiving','inventory.purchasing','food.kitchen','food.modifiers','food.tables'
  ])}),
  retail:Object.freeze({code:'retail',domain:'commerce',label:'تجزئة وسوبر ماركت',implemented:true,features:Object.freeze([
    ...BASE_FEATURES,'core.customers','core.expenses','commerce.pos','commerce.orders','commerce.products','commerce.barcode','commerce.promotions','commerce.returns','commerce.website','commerce.delivery','commerce.pickup','inventory.stock','inventory.count','inventory.transfers','inventory.suppliers','inventory.receiving','inventory.purchasing'
  ])}),
  pharmacy:Object.freeze({code:'pharmacy',domain:'pharmacy',label:'صيدليات',implemented:true,features:Object.freeze([
    ...BASE_FEATURES,'core.customers','core.expenses','commerce.pos','commerce.orders','commerce.products','commerce.barcode','commerce.promotions','commerce.returns','commerce.website','commerce.delivery','commerce.pickup','inventory.stock','inventory.count','inventory.transfers','inventory.suppliers','inventory.receiving','inventory.purchasing','inventory.batch','inventory.expiry','pharmacy.catalog','pharmacy.prescriptions','pharmacy.controlled_drugs','pharmacy.alternatives','pharmacy.insurance','pharmacy.claims'
  ])}),
  logistics:Object.freeze({code:'logistics',domain:'logistics',label:'شحن ولوجستيات',implemented:false,features:Object.freeze([
    ...BASE_FEATURES,'core.customers','core.expenses','logistics.shipments','logistics.waybills','logistics.pickup_requests','logistics.zones_pricing','logistics.drivers','logistics.tracking','logistics.cod','logistics.client_settlements','logistics.returns'
  ])}),
  membership:Object.freeze({code:'membership',domain:'membership',label:'جيم وعضويات وحجوزات',implemented:false,features:Object.freeze([
    ...BASE_FEATURES,'core.customers','core.expenses','membership.members','membership.plans','membership.subscriptions','membership.renewals','membership.checkin','membership.classes','membership.bookings','membership.freeze','membership.trainers'
  ])}),
  warehouse:Object.freeze({code:'warehouse',domain:'commerce',label:'مخازن وتوزيع',implemented:false,features:Object.freeze([
    ...BASE_FEATURES,'core.customers','core.expenses','commerce.products','commerce.barcode','inventory.stock','inventory.count','inventory.transfers','inventory.suppliers','inventory.receiving','inventory.purchasing','inventory.multi_warehouse','inventory.batch','inventory.expiry','inventory.serials'
  ])})
});
const MODULE_TO_FEATURES=Object.freeze({
  pos:['commerce.pos','commerce.orders','commerce.products','core.payments','core.shifts'],
  customers:['core.customers'],inventory:['inventory.stock','inventory.count','inventory.transfers','inventory.suppliers','inventory.receiving','inventory.purchasing'],
  returns:['commerce.returns'],reports:['core.reports'],expenses:['core.expenses'],barcode:['commerce.barcode'],delivery:['commerce.delivery'],pickup:['commerce.pickup'],website:['commerce.website'],promocodes:['commerce.promotions'],
  restaurant:['food.kitchen','food.modifiers','food.tables'],
  pharmacy:['pharmacy.catalog','pharmacy.prescriptions','pharmacy.controlled_drugs','pharmacy.alternatives','inventory.batch','inventory.expiry'],
  insurance:['pharmacy.insurance','pharmacy.claims']
});
function norm(v){return String(v||'').trim().toLowerCase()}
function unique(values){return [...new Set((Array.isArray(values)?values:[]).map(norm).filter(Boolean))]}
function getFeature(code){return FEATURES.get(norm(code))||null}
function getProfile(code){return PROFILES[norm(code)]||null}
function listFeatures(){return [...FEATURES.values()].map(x=>({...x,dependsOn:[...x.dependsOn]}))}
function listProfiles(){return Object.values(PROFILES).map(x=>({...x,features:[...x.features]}))}
function dependencyClosure(values){
  const out=new Set();const stack=[...unique(values)];
  while(stack.length){const code=stack.pop();if(out.has(code))continue;const f=getFeature(code);if(!f)continue;out.add(code);for(const dep of f.dependsOn)stack.push(dep)}
  return [...out];
}
function preserveCloudFeatures(values){
  const raw=unique(values);
  return unique([...raw,...dependencyClosure(raw)]);
}
function validateSelection(values){
  const selected=new Set(unique(values));const unknown=[...selected].filter(x=>!FEATURES.has(x));const missing=[];
  for(const code of selected){const f=getFeature(code);if(!f)continue;for(const dep of f.dependsOn)if(!selected.has(dep))missing.push({feature:code,dependency:dep})}
  return {ok:unknown.length===0&&missing.length===0,unknown,missing};
}
function fromModules(modules){const rows=[...BASE_FEATURES];for(const mod of unique(modules))for(const f of MODULE_TO_FEATURES[mod]||[])rows.push(f);return dependencyClosure(rows)}
function resolveRuntime(config){
  const profile=norm(config?.pos_profile);const preset=getProfile(profile);let features=[];let source='profile-preset';
  if(Array.isArray(config?.enabled_features)&&config.enabled_features.length){features=preserveCloudFeatures(config.enabled_features);source='cloud-features'}
  else if(config?.modules_configured===true){features=fromModules(config.enabled_modules);source='legacy-modules'}
  else features=dependencyClosure(preset?.features||BASE_FEATURES);
  return Object.freeze({profile,domain:preset?.domain||'unknown',implemented:preset?.implemented===true,source,features:Object.freeze(features)});
}
function selfValidate(){
  const errors=[];
  for(const f of FEATURES.values())for(const dep of f.dependsOn)if(!FEATURES.has(dep))errors.push(`Unknown dependency ${dep} for ${f.code}`);
  for(const p of Object.values(PROFILES))for(const code of p.features)if(!FEATURES.has(code))errors.push(`Unknown feature ${code} in profile ${p.code}`);
  const visiting=new Set(),done=new Set();
  function walk(code){if(done.has(code))return;if(visiting.has(code)){errors.push(`Dependency cycle at ${code}`);return}visiting.add(code);for(const dep of getFeature(code)?.dependsOn||[])walk(dep);visiting.delete(code);done.add(code)}
  for(const code of FEATURES.keys())walk(code);
  if(errors.length)throw new Error(`Sharawla Capability Registry invalid: ${errors.join('; ')}`);
  return true;
}
selfValidate();
global.SharawlaCapabilities=Object.freeze({VERSION,BASE_FEATURES,FEATURE_COUNT:FEATURES.size,PROFILE_COUNT:Object.keys(PROFILES).length,getFeature,getProfile,listFeatures,listProfiles,dependencyClosure,preserveCloudFeatures,validateSelection,fromModules,resolveRuntime,selfValidate});
})(window);
