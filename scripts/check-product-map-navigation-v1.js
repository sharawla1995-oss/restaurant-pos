'use strict';
const fs=require('fs');
const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('product-map-navigation-v1.js','utf8');
const css=fs.readFileSync('styles.css','utf8');
const reg=fs.readFileSync('sharawla-navigation-registry.js','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const runtimeVersion=String(pkg.version||'');
const fail=[];
const need=(ok,msg)=>{if(!ok)fail.push(msg)};

need(runtimeVersion.startsWith('10.5.4-beta.58.'),'Product Map candidate must stay on Beta58 acceptance line');
need(html.split('sharawla-navigation-registry.js?v='+runtimeVersion).length-1===1,'Runtime registry metadata must load exactly once at package version');
need(html.split('product-map-navigation-v1.js?v='+runtimeVersion).length-1===1,'Product Map layer must load exactly once at package version');
need(html.indexOf('sharawla-navigation-registry.js')<html.indexOf('product-map-navigation-v1.js'),'Registry metadata must load before Product Map layer');

need(js.includes('Presentation-only grouping layer. It MUST NOT dispatch routes or change permissions.'),'Presentation-only contract marker missing');
need(!/\.onclick\s*=/.test(js),'Product Map layer must not own onclick handlers');
need(!/addEventListener\(\s*['"]click['"]/.test(js),'Product Map layer must not add click dispatch listeners');
need(!/showPage\s*\(/.test(js),'Product Map layer must not call showPage');
need(!/\brpc\s*\(/.test(js),'Product Map layer must not call RPCs');
need(!/\brest\s*\(/.test(js),'Product Map layer must not call REST');
need(!/render[A-Z][A-Za-z0-9_]*\s*\(/.test(js),'Product Map layer must not call business renderers');

need(js.includes("if(node.dataset?.page)return String(node.dataset.page);"),'data-page adapter missing');
need(js.includes("if(node.dataset?.beta54Page)return String(node.dataset.beta54Page);"),'Beta54 adapter missing');
need(js.includes("data-beta55-supply-page"),'Central Warehouse supply adapter missing');
need(js.includes("if(node.dataset?.pharmacyPage)return String(node.dataset.pharmacyPage);"),'Pharmacy adapter missing');
need(js.includes("if(node.matches?.('[data-beta55-hr-group]'))return '__hr_group__';"),'HR grouped-unit preservation missing');

for(const pair of [
  ["'online-orders':'online-orders'",'Online Orders must have its own Product Map section'],
  ["operations:'profile-operations'",'Restaurant operations alias missing'],
  ["'digital-channels':'website'",'Digital channels must group under Website Management'],
  ["employees:'hr'",'Employee routes must group under Employees'],
  ["integrations:'integrations'",'Integrations reserved group alias missing'],
  ["settings:'administration'",'Settings routes must group under Administration']
]) need(js.includes(pair[0]),pair[1]);

for(const label of ['المبيعات','الطلبات الأونلاين','المخزون والمشتريات','الموظفون','المالية','التقارير','إدارة الموقع','التكاملات','الإدارة والإعدادات']){
  need(js.includes("label:'"+label+"'"),'Restaurant Product Map label missing: '+label);
}
for(const pair of [
  ["onlineOrders:'online-orders'",'onlineOrders must stay in its own operational inbox section'],
  ["deliveryOrders:'profile-operations'",'Delivery Orders must live under Restaurant Operations'],
  ["delivery:'profile-operations'",'Delivery alias must live under Restaurant Operations'],
  ["kitchen:'profile-operations'",'Kitchen must live under Restaurant Operations'],
  ["tables:'profile-operations'",'Tables must live under Restaurant Operations'],
  ["foodOperations:'inventory-purchasing'",'Production/Waste must live under Inventory & Purchasing']
]) need(js.includes(pair[0]),pair[1]);

need(js.includes("restaurant:'تشغيل المطعم'"),'Restaurant operations label must be profile-aware');
need(js.includes("pharmacy:'تشغيل الصيدلية'"),'Pharmacy operations label must not leak Restaurant wording');
need(js.includes("retail:'تشغيل المتجر'"),'Retail operations label must not leak Restaurant wording');
need(js.includes("SharawlaRuntimeConfig?.current?.()?.pos_profile"),'Profile-aware label must use authoritative Runtime Config');
need(js.includes("never invents a button just to make an empty section visible"),'Empty Integrations section must not create a fake route/button');

need(js.includes("nav.appendChild(frag);"),'Top-level units must remain direct #nav children');
need(js.includes("planSignature(plan)===currentSignature(nav)"),'Idempotent structure audit missing');
need(js.includes("REGISTRY_MISSING"),'Missing registry must fail closed');
need(css.includes('.sidebar nav .sharawla-nav-group-label'),'Product Map label styles missing');

need(/routeKey:'orders'[^\n]+conflictStatus:'LOCKED'[^\n]+migrationStatus:L/.test(reg),'Orders V58.3 locked-owner marker regressed');
for(const route of ['suppliers','purchasing','stockCount','transfers']){
  need(new RegExp("routeKey:'"+route+"'[^\\n]+migrationStatus:C").test(reg),route+' conflict-blocked marker regressed');
}
need(/routeKey:'websitePayments'[^\n]+migrationStatus:D/.test(reg),'websitePayments deferred marker regressed');

if(fail.length){
  console.error('Restaurant Product Map Navigation V1: FAIL');
  fail.forEach(x=>console.error('- '+x));
  process.exit(1);
}
console.log('Restaurant Product Map Navigation V1: PASS');
console.log('mode=restaurant-product-map; presentation-only; registry=read-only-metadata; route-owners=unchanged; permissions=unchanged');
