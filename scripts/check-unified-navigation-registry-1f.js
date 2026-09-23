'use strict';

const fs=require('fs');
const path=require('path');
const ROOT=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
const registry=require(path.join(ROOT,'sharawla-navigation-registry.js'));

const errors=[];
const fail=m=>errors.push(m);

const EXPECTED=Object.freeze({
  home:'renderHome',
  pos:'renderPOS',
  orders:'renderOrders',
  returns:'renderReturns',
  customers:'renderCustomers',
  deliveryOrders:'renderDeliveryOrders',
  deliverySettings:'renderDeliverySettings',
  delivery:'renderDeliveryOrders',
  kitchen:'renderKitchen',
  shifts:'renderShifts',
  inventory:'renderInventory',
  marketSettings:'renderRetailMarketSettings',
  retailOffers:'renderRetailOffers',
  stockCount:'renderRetailStockCount',
  transfers:'renderRetailTransfers',
  suppliers:'renderRetailSuppliers',
  purchasing:'renderRetailPurchasing',
  expenses:'renderExpenses',
  products:'renderProducts',
  promoCodes:'renderPromoCodes',
  branchProductAvailability:'renderWebsiteAvailability',
  websiteManagement:'renderWebsiteManagement',
  websiteBranchSettings:'renderWebsiteBranchSettings',
  websitePayments:'renderWebsitePayments',
  websiteAppearance:'renderWebsiteAppearance',
  reports:'renderReports',
  users:'renderUsers',
  settings:'renderSettings'
});

function section(startToken,endToken){
  const a=app.indexOf(startToken);
  if(a<0)return null;
  const b=app.indexOf(endToken,a+startToken.length);
  if(b<0)return null;
  return app.slice(a,b+endToken.length);
}

const mapSection=section('const PAGE_RENDERERS=Object.freeze({','});');
if(!mapSection)fail('PAGE_RENDERERS block missing');

const observed={};
if(mapSection){
  const body=mapSection.slice(mapSection.indexOf('{')+1,mapSection.lastIndexOf('}'));
  const re=/\b([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)\s*,?/g;
  let m;
  while((m=re.exec(body)))observed[m[1]]=m[2];
}

for(const [route,renderer] of Object.entries(EXPECTED)){
  if(observed[route]!==renderer)fail(route+': expected '+renderer+' got '+String(observed[route]));
}
for(const route of Object.keys(observed)){
  if(!(route in EXPECTED))fail('unexpected PAGE_RENDERERS route: '+route);
}
if(Object.keys(observed).length!==Object.keys(EXPECTED).length)fail('PAGE_RENDERERS count mismatch');

const show=section('async function showPage(p){','\n}\n\n');
if(!show)fail('showPage block missing');
if(show){
  const iRenderer=show.indexOf('const renderer=PAGE_RENDERERS[p];');
  const iBlock=show.indexOf("if(typeof renderer!=='function'){blockUnknownRoute(p);return;}");
  const iBranch=show.indexOf('if(!state.activeBranchId){renderBranchPicker();return;}');
  const iPermission=show.indexOf("if(!canAccessPage(p)){toast('ليس لديك صلاحية لفتح هذا القسم');return showPage('home');}");
  const iInvoke=show.indexOf('await renderer();');
  if([iRenderer,iBlock,iBranch,iPermission,iInvoke].some(x=>x<0))fail('showPage fail-closed sequence incomplete');
  else if(!(iRenderer<iBlock&&iBlock<iBranch&&iBranch<iPermission&&iPermission<iInvoke))fail('showPage fail-closed ordering invalid');
  if(show.includes('||renderPOS'))fail('legacy unknown-route renderPOS fallback still present in showPage');
  if(show.includes('||renderHome'))fail('unknown-route Home fallback must not exist');
}

const blocker=section('function blockUnknownRoute(p){','\n}\nwindow.__SharawlaNavigationFailClosedV1');
if(!blocker)fail('blockUnknownRoute block missing');
if(blocker){
  for(const [name,re] of [
    ['business-renderer',/\brender[A-Z0-9_$][A-Za-z0-9_$]*\s*\(/],
    ['navigation-recursion',/\bshowPage\s*\(/],
    ['synthetic-click',/\.click\s*\(/],
    ['storage-write',/\b(?:localStorage|sessionStorage|indexedDB)\b/],
    ['network-write',/\b(?:fetch|XMLHttpRequest|supabase|rpc|rest)\s*\(/]
  ]){
    if(re.test(blocker))fail('blockUnknownRoute must not perform '+name);
  }
  if(!blocker.includes("type:'UNKNOWN_ROUTE_BLOCKED'"))fail('unknown-route diagnostic type missing');
  if(!blocker.includes("console.error('[NAV-FAIL-CLOSED] Unknown route blocked'"))fail('unknown-route console diagnostic missing');
  if(!blocker.includes("document.dispatchEvent(new CustomEvent('sharawla-navigation-route-blocked'"))fail('unknown-route diagnostic event missing');
  if(!blocker.includes("toast('تم حظر مسار غير معروف')"))fail('unknown-route user diagnostic missing');
}

// The diagnostic API must be bounded/read-only from the caller perspective.
if(!app.includes("window.__SharawlaNavigationFailClosedV1=Object.freeze({"))fail('1F diagnostic API missing');
if(!app.includes("mode:'FAIL_CLOSED'"))fail('1F diagnostic mode missing');
if(!app.includes('if(navigationFailClosedEvents.length>50)navigationFailClosedEvents.shift();'))fail('1F diagnostic ring must stay bounded');

const fake='__nav_1f_unknown__';
if(observed[fake])fail('negative route unexpectedly registered in PAGE_RENDERERS');
if((registry.routes||[]).some(r=>r.routeKey===fake))fail('negative route unexpectedly registered in unified registry');

// Protected routes / known boundaries.
if(observed.orders!=='renderOrders')fail('Orders V58.3 renderer changed');
if(!app.includes('ORDERS-DATE-WINDOW-V58.3'))fail('Orders V58.3 marker missing');
if(!app.includes("if((page==='marketSettings'||page==='retailOffers')&&!isRetailProfile())return false;"))fail('Restaurant retail-only visibility guard changed');
if(!app.includes("if(page==='websitePayments')return isAdmin()||allowed.has('financialSettings')||allowed.has('websiteAppearance');"))fail('Website Payments deferred permission behavior changed');

for(const key of ['suppliers','purchasing','stockCount','transfers']){
  const r=(registry.routes||[]).find(x=>x.routeKey===key);
  if(r?.migrationStatus!=='CONFLICT_BLOCKED')fail(key+': must remain CONFLICT_BLOCKED during 1F');
}
const wp=(registry.routes||[]).find(x=>x.routeKey==='websitePayments');
if(wp?.migrationStatus!=='DEFERRED_FIX')fail('websitePayments must remain DEFERRED_FIX during 1F');

// 1F must not reclassify the registry or claim canonical route ownership.
if(registry.mode!=='shadow')fail('registry mode must remain shadow during 1F activation');

if(errors.length){
  console.error('Unified Navigation Registry 1F: FAIL');
  errors.forEach(e=>console.error(' - '+e));
  process.exit(1);
}

console.log('Unified Navigation Registry 1F: PASS');
console.log('page_renderers='+Object.keys(EXPECTED).length+'; unknown_route=BLOCK; fallback_business_renderer=0; diagnostics=bounded-memory+event+console+toast; orders_v58_3=preserved; conflicts_preserved=4; websitePayments=DEFERRED_FIX; registry_mode=shadow');
