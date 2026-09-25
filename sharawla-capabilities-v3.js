(function(global){
'use strict';
const VERSION='10.5.4-beta.39';
const base=global.SharawlaCapabilities;
if(!base)throw new Error('Sharawla Capability Registry must load before Capability V3 overlay.');

const EXTRA_ROWS=[
 ['commerce.variants','Commerce','متغيرات الصنف',['commerce.products']],
 ['commerce.custom_orders','Commerce','الطلبات المخصصة',['commerce.orders','core.customers']],
 ['commerce.price_tiers','Commerce','فئات وشرائح الأسعار',['commerce.products','core.customers']],
 ['commerce.gift_cards','Commerce','بطاقات وقسائم الهدايا',['core.payments']],
 ['commerce.loyalty','Commerce','الولاء والنقاط',['commerce.orders','core.customers']],
 ['commerce.installments','Commerce','التقسيط',['commerce.orders','finance.receivables']],
 ['commerce.trade_in','Commerce','الاستبدال والمستعمل',['commerce.products','inventory.stock']],
 ['commerce.consignment','Commerce','البيع بالأمانة',['inventory.stock','inventory.suppliers']],
 ['commerce.b2b_orders','Commerce','أوامر البيع B2B',['commerce.orders','core.customers']],
 ['commerce.quotations','Commerce','عروض الأسعار',['commerce.orders','core.customers']],
 ['commerce.return_policies','Commerce','سياسات المرتجع',['commerce.returns']],
 ['commerce.weight_sales','Commerce','البيع بالوزن والميزان',['commerce.pos','commerce.products']],
 ['commerce.bundles_kits','Commerce','الأطقم والباقات',['commerce.products','inventory.stock']],
 ['commerce.b2b_portal','Commerce','بوابة عملاء B2B',['commerce.b2b_orders','commerce.website']],
 ['commerce.season_pricing','Commerce','السيزنات والتخفيضات المجدولة',['commerce.products','commerce.promotions']],
 ['inventory.purchase_orders','Inventory','أوامر الشراء',['inventory.purchasing','inventory.suppliers']],
 ['inventory.supplier_returns','Inventory','مرتجعات الموردين',['inventory.receiving','inventory.stock','inventory.suppliers']],
 ['inventory.replenishment','Inventory','إعادة الطلب والتوريد',['inventory.purchasing','inventory.stock']],
 ['inventory.landed_cost','Inventory','التكلفة المحملة',['inventory.purchasing','inventory.receiving']],
 ['inventory.returnables','Inventory','العهد والعبوات المرتجعة',['core.customers','inventory.stock']],
 ['inventory.testers','Inventory','العينات والتسترز',['inventory.stock']],
 ['food.prep','Food Service','التحضيرات ونصف المصنع',['food.ingredients','inventory.stock']],
 ['food.production','Food Service','الإنتاج والتحضير',['food.prep','food.recipes','inventory.stock']],
 ['food.waste','Food Service','الهالك والفاقد',['inventory.stock']],
 ['food.costing','Food Service','تكلفة الطعام والربحية',['food.recipes','inventory.purchasing','inventory.stock']],
 ['service.warranty','Service','الضمان',['core.customers','service.jobs']],
 ['service.packages','Service','الباقات والجلسات',['core.customers','service.appointments']],
 ['service.installation','Service','التركيب الميداني',['service.jobs']],
 ['finance.credit','Finance','الائتمان وحدود المديونية',['commerce.orders','core.customers']],
 ['finance.receivables','Finance','حسابات العملاء والمديونيات',['commerce.orders','core.customers']],
 ['finance.collections','Finance','التحصيلات وسندات القبض',['core.payments','finance.receivables']],
 ['finance.aging','Finance','أعمار الديون',['finance.receivables']],
 ['finance.commissions','Finance','العمولات',['core.users']],
 ['fiscal.receipts','Fiscal','الإيصال الإلكتروني',['commerce.orders','core.payments']],
 ['fiscal.invoices','Fiscal','الفاتورة الإلكترونية',['commerce.orders','core.customers']],
 ['automotive.fitment','Automotive','توافق قطع الغيار',['commerce.products']],
 ['automotive.cross_reference','Automotive','الأرقام البديلة و OEM',['commerce.products']],
 ['automotive.vin','Automotive','البحث بالشاسيه VIN',['automotive.fitment']],
 ['healthcare.emr','Healthcare','الملف الطبي المبسط',['core.customers']],
 ['healthcare.insurance','Healthcare','تأمين الخدمات الطبية',['core.payments','healthcare.emr']],
 ['education.school_lists','Education','قوائم المدارس والمؤسسات',['commerce.b2b_orders','commerce.products']],
 ['integrations.delivery_aggregators','Integrations','تكامل منصات التوصيل',['commerce.delivery','commerce.orders']]
];

const EXTRA=new Map(EXTRA_ROWS.map(([code,domain,label,dependsOn])=>[code,Object.freeze({code,domain,label,dependsOn:Object.freeze([...dependsOn])})]));
const DEP_OVERRIDES=new Map([
 ['food.ingredients',Object.freeze(['inventory.stock'])],
 ['food.recipes',Object.freeze(['commerce.products','food.ingredients','inventory.stock'])]
]);
const PROFILE_META=Object.freeze({
 restaurant:Object.freeze({code:'restaurant',domain:'food_service',label:'مطاعم وكافيهات',implemented:true,active:true}),
 retail:Object.freeze({code:'retail',domain:'commerce',label:'تجزئة وسوبر ماركت',implemented:true,active:true}),
 pharmacy:Object.freeze({code:'pharmacy',domain:'pharmacy',label:'صيدليات',implemented:true,active:true}),
 service:Object.freeze({code:'service',domain:'service',label:'خدمات ومواعيد وصيانة',implemented:true,active:true}),
 warehouse:Object.freeze({code:'warehouse',domain:'commerce',label:'مخازن وتوزيع',implemented:true,active:true}),
 membership:Object.freeze({code:'membership',domain:'membership',label:'جيم وعضويات وحجوزات',implemented:true,active:true}),
 logistics:Object.freeze({code:'logistics',domain:'logistics',label:'شحن ولوجستيات',implemented:true,active:true}),
 general:Object.freeze({code:'general',domain:'general',label:'عام',implemented:false,active:false})
});
function norm(v){return String(v||'').trim().toLowerCase()}
function unique(values){return [...new Set((Array.isArray(values)?values:[]).map(norm).filter(Boolean))]}
function cloneFeature(row){return row?{...row,dependsOn:[...(row.dependsOn||[])]}:null}
function getFeature(code){
 const key=norm(code);
 const extra=EXTRA.get(key);if(extra)return extra;
 const old=base.getFeature(key);if(!old)return null;
 const deps=DEP_OVERRIDES.get(key);return deps?Object.freeze({...old,dependsOn:Object.freeze([...deps])}):old;
}
function listFeatures(){
 const rows=new Map();
 for(const row of base.listFeatures())rows.set(norm(row.code),cloneFeature(getFeature(row.code)));
 for(const row of EXTRA.values())rows.set(row.code,cloneFeature(row));
 return [...rows.values()];
}
function dependencyClosure(values){
 const out=new Set(),stack=[...unique(values)];
 while(stack.length){
  const code=stack.pop();if(out.has(code))continue;
  out.add(code); // Preserve future Cloud feature codes even before a local catalog update.
  const f=getFeature(code);if(!f)continue;
  for(const dep of f.dependsOn||[])stack.push(norm(dep));
 }
 return [...out];
}
function preserveCloudFeatures(values){
 // Cloud Runtime V2 is authoritative. Never drop a code returned by Cloud.
 // Known dependencies are added defensively for offline/cache continuity.
 return dependencyClosure(values);
}
function validateSelection(values){
 const selected=new Set(unique(values)),unknown=[...selected].filter(x=>!getFeature(x)),missing=[];
 for(const code of selected){const f=getFeature(code);if(!f)continue;for(const dep of f.dependsOn||[])if(!selected.has(dep))missing.push({feature:code,dependency:dep})}
 return {ok:unknown.length===0&&missing.length===0,unknown,missing};
}
function getProfile(code){
 const key=norm(code),meta=PROFILE_META[key];if(!meta)return null;
 const old=base.getProfile(key);return Object.freeze({...old,...meta,features:Object.freeze([...(old?.features||[])])});
}
function listProfiles(){return Object.keys(PROFILE_META).map(code=>{const p=getProfile(code);return {...p,features:[...p.features]}})}
function resolveRuntime(config){
 const profile=norm(config?.pos_profile),preset=getProfile(profile);
 if(Array.isArray(config?.enabled_features)){
  const features=preserveCloudFeatures(config.enabled_features);
  const implemented=typeof config?.profile_implemented==='boolean'?config.profile_implemented:preset?.implemented===true;
  return Object.freeze({profile,domain:preset?.domain||'unknown',implemented,source:'cloud-features-v3-authoritative',features:Object.freeze(features)});
 }
 const old=base.resolveRuntime(config||{});
 return Object.freeze({...old,profile,domain:preset?.domain||old.domain||'unknown',implemented:typeof config?.profile_implemented==='boolean'?config.profile_implemented:preset?.implemented===true,features:Object.freeze(dependencyClosure(old.features||[]))});
}
function selfValidate(){
 base.selfValidate();
 const rows=listFeatures(),errors=[];
 if(rows.length!==107)errors.push(`Expected 107 capabilities, found ${rows.length}`);
 if(EXTRA.size!==42)errors.push(`Expected 42 V3 additions, found ${EXTRA.size}`);
 for(const f of rows)for(const dep of f.dependsOn||[])if(!getFeature(dep))errors.push(`Unknown dependency ${dep} for ${f.code}`);
 const visiting=new Set(),done=new Set();
 function walk(code){if(done.has(code))return;if(visiting.has(code)){errors.push(`Dependency cycle at ${code}`);return}visiting.add(code);for(const dep of getFeature(code)?.dependsOn||[])walk(dep);visiting.delete(code);done.add(code)}
 for(const f of rows)walk(f.code);
 if(listProfiles().length!==8)errors.push(`Expected 8 profiles, found ${listProfiles().length}`);
 if(errors.length)throw new Error(`Sharawla Capability V3 invalid: ${errors.join('; ')}`);
 return true;
}
selfValidate();
global.SharawlaCapabilities=Object.freeze({...base,VERSION,CATALOG_VERSION:3,FEATURE_COUNT:107,PROFILE_COUNT:8,getFeature,listFeatures,dependencyClosure,preserveCloudFeatures,validateSelection,getProfile,listProfiles,resolveRuntime,selfValidate,V3_EXTRA_CODES:Object.freeze([...EXTRA.keys()])});
})(window);
