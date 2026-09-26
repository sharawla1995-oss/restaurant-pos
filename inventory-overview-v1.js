(function(global){
'use strict';

// Sharawla Core Inventory Overview V1.
// READ-ONLY overview layer: no stock mutation, no Point 4/Cutover activation.
// Profile-specific detail owners remain unchanged.
const VERSION='1.1.0-core-profile-aware-rc1-snapshot';
const SNAPSHOT_PREFIX='sharawlaInventoryOverviewSnapshotV1:';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const qty=v=>num(v).toLocaleString('ar-EG',{maximumFractionDigits:3});
const money=v=>num(v).toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2});

function runtimeConfig(){
  try{
    const c=global.SharawlaRuntimeConfig?.current?.();
    if(c&&typeof c==='object')return c;
  }catch{}
  try{
    const c=global.runtimeConfig?.();
    if(c&&typeof c==='object')return c;
  }catch{}
  return null;
}
function profile(){return String(runtimeConfig()?.pos_profile||'').trim().toLowerCase()}
function branchId(){try{return Number(global.currentBranchId?.()||0)||0}catch{return 0}}
function branchLabel(){
  const id=branchId();
  try{return String(global.branchName?.(id)||'').trim()||('Location #'+id)}catch{return 'Location #'+id}
}
function inventoryEnabled(){
  try{
    if(typeof global.moduleEnabled==='function')return global.moduleEnabled('inventory')===true;
  }catch{}
  return false;
}
async function rest(table,query=''){
  if(typeof global.rest!=='function')throw new Error('Inventory Overview: REST runtime غير جاهز');
  return global.rest(table,query);
}
function online(){try{return navigator.onLine!==false}catch{return true}}
function foodSnapshotKey(bid){return `${SNAPSHOT_PREFIX}food:${Number(bid)||0}`}
async function cacheGet(key){try{if(typeof global.odbGet==='function')return await global.odbGet(key)}catch{}try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}}
async function cacheSet(key,value){try{if(typeof global.odbSet==='function')return await global.odbSet(key,value)}catch{}try{localStorage.setItem(key,JSON.stringify(value))}catch{}return value}
function recoveryFallbackFor(table){const f=global.__SharawlaOfflineCacheFallback;return f?.active===true&&String(f.table||'')===String(table)}
async function loadFoodInventoryData(bid){
  let degraded=false;
  if(online()){
    try{
      const ingredients=await rest('ingredients','select=*&order=active.desc,name');
      const ingredientsFallback=recoveryFallbackFor('ingredients');
      const stock=await rest('ingredient_stock',`select=*&branch_id=eq.${bid}&order=id`);
      const stockFallback=recoveryFallbackFor('ingredient_stock');
      if(!ingredientsFallback&&!stockFallback){
        const snapshot={version:1,complete:true,profile:'food',branch_id:Number(bid),cached_at:new Date().toISOString(),ingredients:Array.isArray(ingredients)?ingredients:[],stock:Array.isArray(stock)?stock:[]};
        await cacheSet(foodSnapshotKey(bid),snapshot);
        return {...snapshot,stale:false,source:'live'};
      }
      degraded=true;
    }catch(e){degraded=true;console.warn('[Inventory Overview V1] live food snapshot unavailable',e)}
  }
  const snapshot=await cacheGet(foodSnapshotKey(bid));
  if(!snapshot||snapshot.complete!==true||Number(snapshot.branch_id)!==Number(bid)||!Array.isArray(snapshot.ingredients)||!Array.isArray(snapshot.stock)){
    const e=new Error('المخزون يحتاج إنترنت لعمل Snapshot كاملة أول مرة. لا توجد قراءة محلية كاملة يمكن عرضها بأمان.');e.code='INVENTORY_SNAPSHOT_MISSING';throw e;
  }
  return {...snapshot,stale:true,degraded:degraded||online(),source:'snapshot'};
}
function freshnessNote(data){
  if(!data?.stale)return '<p class="muted" data-inventory-freshness="live">القراءة الحالية من Cloud وتم حفظ Snapshot كاملة لهذا الفرع.</p>';
  const at=data?.cached_at?(global.fmtDate?.(data.cached_at)||data.cached_at):'غير معروف';
  return `<p class="muted" data-inventory-freshness="snapshot">وضع Offline / Cache: الأرقام من آخر Snapshot كاملة محفوظة بتاريخ ${esc(at)}. الحركات المعلقة التي تحتاج حسم Cloud لا يتم اختلاق أثر مخزني لها قبل ACK.</p>`;
}
function pageRoot(){return document.querySelector('#page')}
function navButton(route){
  if(route==='internalSupply')return document.querySelector('#nav [data-beta55-supply-page]');
  return document.querySelector(`#nav button[data-page="${route}"]`);
}
function routeVisible(route){
  const b=navButton(route);
  return !!b&&!b.classList.contains('hidden');
}
function actionsHtml(items){
  const visible=items.filter(x=>routeVisible(x.route));
  if(!visible.length)return '';
  return `<div class="actions" style="margin-top:12px">${visible.map(x=>`<button class="secondary" type="button" data-inventory-route="${esc(x.route)}">${esc(x.label)}</button>`).join('')}</div>`;
}
function wireRouteActions(root){
  root.querySelectorAll('[data-inventory-route]').forEach(b=>b.onclick=()=>{
    const target=navButton(b.dataset.inventoryRoute);
    if(target)target.click();
  });
}
function kpis(cards){
  return `<div class="home-grid">${cards.map(c=>`<div class="panel"><small class="muted">${esc(c.label)}</small><h2 style="margin:.35rem 0 0">${esc(c.value)}</h2>${c.note?`<small class="muted">${esc(c.note)}</small>`:''}</div>`).join('')}</div>`;
}
function shell(title,subtitle,profileCode,body,actions=''){
  const root=pageRoot();if(!root)return;
  root.innerHTML=`<section class="panel" data-inventory-overview-v1="${esc(VERSION)}" data-inventory-profile="${esc(profileCode)}"><div class="section-head"><div><h2>📦 ${esc(title)}</h2><p class="muted">${esc(subtitle)}</p></div><span class="tag">${esc(branchLabel())}</span></div></section>${body}${actions}`;
  wireRouteActions(root);
}
function errorView(message,code='ERROR'){
  const root=pageRoot();if(!root)return;
  root.innerHTML=`<div class="panel" data-inventory-overview-v1="${esc(VERSION)}" data-inventory-fail-closed="${esc(code)}"><h2>📦 المخزون</h2><div class="empty">${esc(message)}</div></div>`;
}

async function renderFoodOverview(p){
  const bid=branchId(),data=await loadFoodInventoryData(bid),ingredients=data.ingredients,stock=data.stock;
  const active=(ingredients||[]).filter(x=>x.active!==false);
  const sm=new Map((stock||[]).map(x=>[String(x.ingredient_id),x]));
  const tracked=active.filter(x=>x.track_inventory!==false);
  const rows=tracked.map(i=>{
    const s=sm.get(String(i.id))||{};
    return {id:i.id,name:i.name||('#'+i.id),quantity:num(s.quantity),minimum:num(i.minimum_quantity),averageCost:num(s.average_unit_cost??i.cost_per_unit)};
  });
  const low=rows.filter(x=>x.quantity<=x.minimum).sort((a,b)=>a.quantity-b.quantity);
  const zero=rows.filter(x=>x.quantity<=0);
  const value=rows.reduce((a,x)=>a+x.quantity*x.averageCost,0);
  const alertRows=low.slice(0,8);
  const body=`${freshnessNote(data)}${kpis([
    {label:'الخامات النشطة',value:String(active.length)},
    {label:'خامات تحت المتابعة',value:String(tracked.length)},
    {label:'منخفض / عند الحد',value:String(low.length)},
    {label:'رصيد صفر أو أقل',value:String(zero.length)},
    {label:'قيمة تقريبية للمخزون',value:money(value)}
  ])}
  <div class="panel"><div class="section-head"><div><h3>تنبيهات الخامات</h3><p class="muted">هذه نظرة عامة فقط. تعريف الخام والوحدات والتكلفة وتعديل الرصيد تظل داخل شاشة «الخامات».</p></div></div>
  <div class="table-wrap"><table><thead><tr><th>الخامة</th><th>الرصيد</th><th>الحد الأدنى</th></tr></thead><tbody>${alertRows.map(x=>`<tr><td>${esc(x.name)}</td><td class="${x.quantity<=0?'negative':''}"><b>${qty(x.quantity)}</b></td><td>${qty(x.minimum)}</td></tr>`).join('')||'<tr><td colspan="3">لا توجد تنبيهات مخزون حاليًا.</td></tr>'}</tbody></table></div></div>`;
  const actions=actionsHtml([
    {route:'foodIngredients',label:'🧪 إدارة الخامات'},
    {route:'stockCount',label:'🧮 الجرد'},
    {route:'transfers',label:'🔄 التحويلات'},
    {route:'internalSupply',label:'🏭 التوريد الداخلي'}
  ]);
  shell('نظرة عامة على المخزون','Core Inventory Overview • Restaurant / Cafe',p,body,actions);
}

async function retailData(){
  const bid=branchId();
  const [products,balances,settings,variantBalances,variants]=await Promise.all([
    rest('products','select=id,name,active&active=eq.true&order=name'),
    rest('retail_inventory_balances',`select=*&branch_id=eq.${bid}`),
    rest('retail_inventory_settings',`select=*&branch_id=eq.${bid}`).catch(()=>[]),
    rest('retail_variant_inventory_balances',`select=*&branch_id=eq.${bid}`).catch(()=>[]),
    rest('product_variants','select=id,product_id,name,active&active=eq.true&order=product_id,id').catch(()=>[])
  ]);
  return {products:products||[],balances:balances||[],settings:settings||[],variantBalances:variantBalances||[],variants:variants||[]};
}
async function renderRetailOverview(p){
  const d=await retailData(),settings=d.settings[0]||{default_low_stock_threshold:0};
  const by=new Map(d.balances.map(x=>[String(x.product_id),x]));
  const threshold=r=>num(r?.low_stock_threshold??settings.default_low_stock_threshold);
  const rows=d.products.map(x=>{const b=by.get(String(x.id))||{};return{id:x.id,name:x.name,quantity:num(b.quantity),low:threshold(b),track:b.track_inventory!==false,cost:num(b.average_unit_cost)}});
  const low=rows.filter(x=>x.track&&x.quantity<=x.low).sort((a,b)=>a.quantity-b.quantity);
  const zero=rows.filter(x=>x.track&&x.quantity<=0);
  const value=d.balances.reduce((a,x)=>a+num(x.quantity)*num(x.average_unit_cost),0)+d.variantBalances.reduce((a,x)=>a+num(x.quantity)*num(x.average_unit_cost),0);
  const body=`${kpis([
    {label:'الأصناف النشطة',value:String(d.products.length)},
    {label:'أرصدة Variants',value:String(d.variantBalances.length)},
    {label:'منخفض / عند الحد',value:String(low.length)},
    {label:'رصيد صفر أو أقل',value:String(zero.length)},
    {label:'قيمة تقريبية للمخزون',value:money(value)}
  ])}
  <div class="panel"><div class="section-head"><div><h3>تنبيهات المخزون</h3><p class="muted">الـOverview لا يغيّر الرصيد. إعداد حدود التنبيه والتتبع والتسويات يظل في إدارة الأرصدة.</p></div><button id="inventoryRetailDetail" class="primary" type="button">⚙️ إدارة الأرصدة والسياسات</button></div>
  <div class="table-wrap"><table><thead><tr><th>الصنف</th><th>الرصيد</th><th>حد التنبيه</th></tr></thead><tbody>${low.slice(0,10).map(x=>`<tr><td>${esc(x.name)}</td><td class="${x.quantity<=0?'negative':''}"><b>${qty(x.quantity)}</b></td><td>${qty(x.low)}</td></tr>`).join('')||'<tr><td colspan="3">لا توجد تنبيهات مخزون حاليًا.</td></tr>'}</tbody></table></div></div>`;
  const actions=actionsHtml([
    {route:'stockCount',label:'🧮 الجرد'},
    {route:'transfers',label:'🔄 التحويلات'},
    {route:'purchasing',label:'📥 المشتريات'},
    {route:'suppliers',label:'🚚 الموردون'},
    {route:'internalSupply',label:'🏭 التوريد الداخلي'}
  ]);
  shell('نظرة عامة على المخزون','Core Inventory Overview • Retail / Market',p,body,actions);
  const detail=document.querySelector('#inventoryRetailDetail');
  if(detail)detail.onclick=()=>{
    if(typeof global.renderRetailInventory==='function')return global.renderRetailInventory();
    errorView('إدارة أرصدة Retail غير متاحة في هذا الإصدار','RETAIL_DETAIL_MISSING');
  };
}

async function renderWarehouseOverview(p){
  const d=await retailData();
  const baseValue=d.balances.reduce((a,x)=>a+num(x.quantity)*num(x.average_unit_cost),0);
  const variantValue=d.variantBalances.reduce((a,x)=>a+num(x.quantity)*num(x.average_unit_cost),0);
  const nonPositive=d.balances.filter(x=>num(x.quantity)<=0).length+d.variantBalances.filter(x=>num(x.quantity)<=0).length;
  const body=`${kpis([
    {label:'أرصدة الأصناف',value:String(d.balances.length)},
    {label:'أرصدة Variants',value:String(d.variantBalances.length)},
    {label:'رصيد صفر أو أقل',value:String(nonPositive)},
    {label:'قيمة مخزون أساسي',value:money(baseValue)},
    {label:'قيمة Variants',value:money(variantValue)}
  ])}
  <div class="panel"><h3>Warehouse Inventory</h3><p class="muted">هذه شاشة Overview للموقع الحالي. تشغيل Warehouse Center والتوريد والجرد والتحويلات يظل عبر الـowners الحالية، ولا يتم أي Stock Write من هذه الشاشة.</p></div>`;
  const actions=actionsHtml([
    {route:'stockCount',label:'🧮 الجرد'},
    {route:'transfers',label:'🔄 التحويلات'},
    {route:'purchasing',label:'📥 المشتريات'},
    {route:'suppliers',label:'🚚 الموردون'},
    {route:'internalSupply',label:'🏭 التوريد الداخلي'}
  ]);
  shell('نظرة عامة على المخزون','Core Inventory Overview • Warehouse',p,body,actions);
}

async function renderPharmacyOverview(p){
  const bid=branchId(),today=new Date().toISOString().slice(0,10),d90=new Date(Date.now()+90*86400000).toISOString().slice(0,10);
  const [products,details,batches]=await Promise.all([
    rest('products','select=id,name,active&active=eq.true&order=name'),
    rest('pharmacy_product_details','select=*').catch(()=>[]),
    rest('pharmacy_batches',`select=*&branch_id=eq.${bid}&order=expiry_date.asc,id.asc`).catch(()=>[])
  ]);
  const valid=(batches||[]).filter(x=>x.active!==false&&num(x.quantity)>0&&String(x.expiry_date||'')>=today);
  const expired=(batches||[]).filter(x=>x.active!==false&&num(x.quantity)>0&&String(x.expiry_date||'')<today);
  const expiring=valid.filter(x=>String(x.expiry_date||'')<=d90);
  const stockBy=new Map();
  valid.forEach(x=>stockBy.set(String(x.product_id),num(stockBy.get(String(x.product_id)))+num(x.quantity)));
  const low=(details||[]).filter(x=>num(x.reorder_level)>0&&num(stockBy.get(String(x.product_id)))<=num(x.reorder_level));
  const value=valid.reduce((a,x)=>a+num(x.quantity)*num(x.cost),0);
  const pm=new Map((products||[]).map(x=>[String(x.id),x]));
  const body=`${kpis([
    {label:'الأدوية النشطة',value:String((products||[]).length)},
    {label:'باتشات سارية برصيد',value:String(valid.length)},
    {label:'ينتهي خلال 90 يوم',value:String(expiring.length)},
    {label:'باتشات منتهية برصيد',value:String(expired.length)},
    {label:'عند/تحت حد الطلب',value:String(low.length)},
    {label:'قيمة تقريبية للباتشات السارية',value:money(value)}
  ])}
  <div class="panel"><h3>تنبيهات الصلاحية</h3><div class="table-wrap"><table><thead><tr><th>الدواء</th><th>Batch</th><th>الصلاحية</th><th>الكمية</th></tr></thead><tbody>${expiring.slice(0,10).map(x=>`<tr><td>${esc(pm.get(String(x.product_id))?.name||x.product_id)}</td><td>${esc(x.batch_no||'-')}</td><td>${esc(x.expiry_date||'-')}</td><td>${qty(x.quantity)}</td></tr>`).join('')||'<tr><td colspan="4">لا توجد صلاحيات قريبة حاليًا.</td></tr>'}</tbody></table></div></div>`;
  shell('نظرة عامة على المخزون','Core Inventory Overview • Pharmacy',p,body,'');
}

const ADAPTERS=Object.freeze({
  restaurant:renderFoodOverview,
  cafe:renderFoodOverview,
  retail:renderRetailOverview,
  market:renderRetailOverview,
  warehouse:renderWarehouseOverview,
  pharmacy:renderPharmacyOverview
});

async function render(){
  if(!inventoryEnabled())return errorView('موديول المخزون غير مفعّل لهذا النشاط أو لهذا الـProfile.','INVENTORY_MODULE_OFF');
  const p=profile();
  if(!p)return errorView('تعذر تحديد Activity Profile من Runtime Config. تم إيقاف المسار بأمان.','PROFILE_UNKNOWN');
  const adapter=ADAPTERS[p];
  if(!adapter)return errorView(`لا يوجد Inventory Adapter معتمد للنشاط (${p}). تم إيقاف العرض بأمان بدل استخدام Restaurant fallback.`,'PROFILE_ADAPTER_MISSING');
  try{return await adapter(p)}catch(e){
    console.error('[Inventory Overview V1]',e);
    return errorView(e?.message||String(e),e?.code||'ADAPTER_ERROR');
  }
}

global.__SharawlaInventoryOverviewV1=Object.freeze({
  version:VERSION,
  mode:'CORE_PROFILE_AWARE_READ_ONLY',
  profiles:Object.freeze(Object.keys(ADAPTERS)),
  loadFoodInventoryData,foodSnapshotKey,recoveryFallbackFor,
  render
});
})(window);
