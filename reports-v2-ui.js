(function(global){
'use strict';
const VERSION='reports-v2-ui.1',KEY='sharawlaRuntimeConfigV1';
let observer=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money=v=>Number(v||0).toFixed(2);
const rpc=(n,p)=>global.rpc(n,p),toast=m=>{try{return global.toast?.(m)}catch{};console.warn(m)};
function cfg(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch{return {}}}
function features(){return new Set((cfg().enabled_features||[]).map(x=>String(x).toLowerCase()))}
function has(x){return features().has(String(x).toLowerCase())}
function branch(){try{return Number(global.currentBranchId?.()||0)}catch{return 0}}
function onPage(){return /التقارير/.test(String(document.querySelector('#pageTitle')?.textContent||''))}
function inject(){if(!onPage()||document.querySelector('[data-reports-v2-open]'))return;const page=document.querySelector('#page');if(!page)return;const host=page.querySelector('.section-head')||page.firstElementChild||page;const b=document.createElement('button');b.className='primary';b.dataset.reportsV2Open='1';b.textContent='📊 التقارير المتقدمة V2';b.onclick=open;host.appendChild(b)}
function isoStart(v){return new Date(`${v}T00:00:00`).toISOString()}
function isoEnd(v){const d=new Date(`${v}T00:00:00`);d.setDate(d.getDate()+1);return d.toISOString()}
function today(){return new Date().toISOString().slice(0,10)}
function monthStart(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`}
function card(title,value,small=''){return `<div class="panel" style="padding:12px"><small>${esc(title)}</small><h3>${esc(value)}</h3>${small?`<div class="muted">${esc(small)}</div>`:''}</div>`}
async function open(){
 const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card" style="width:min(1180px,96vw);max-height:94vh;overflow:auto"><div class="section-head"><div><h2>📊 Reports V2</h2><p class="muted">تقارير موحدة حسب الـCapabilities المفعلة.</p></div><button class="secondary" data-r-close>إغلاق</button></div><div class="form-grid"><label>من<input type="date" data-r-from value="${monthStart()}"></label><label>إلى<input type="date" data-r-to value="${today()}"></label><label>&nbsp;<button class="primary" data-r-run>تشغيل التقرير</button></label></div><div data-r-out style="margin-top:14px"></div></div>`;document.body.appendChild(m);
 m.onclick=async e=>{if(e.target===m||e.target.closest('[data-r-close]'))return m.remove();if(!e.target.closest('[data-r-run]'))return;const from=m.querySelector('[data-r-from]').value,to=m.querySelector('[data-r-to]').value;if(!from||!to)return toast('اختر الفترة');const out=m.querySelector('[data-r-out]');out.innerHTML='<div class="empty">جاري التحميل…</div>';try{const args={p_branch_id:branch(),p_from:isoStart(from),p_to:isoEnd(to)};const [sales,items]=await Promise.all([rpc('report_sales_summary_v2',args),rpc('report_item_sales_v2',{...args,p_limit:100})]);let html=`<h3>المبيعات</h3><div class="home-grid">${card('صافي المبيعات',money(sales.net_sales))}${card('عدد الفواتير',sales.orders)}${card('المرتجعات',money(sales.returns))}${card('متوسط الفاتورة',money(sales.avg_ticket))}${card('تكلفة البضاعة',money(sales.cogs))}${card('مجمل الربح',money(sales.gross_profit))}</div><div class="panel"><h3>مبيعات الأصناف</h3><div class="table-wrap"><table><thead><tr><th>الصنف</th><th>المباع</th><th>المرتجع</th><th>صافي الكمية</th><th>صافي المبيعات</th><th>الربح</th></tr></thead><tbody>${(items||[]).map(x=>`<tr><td>${esc(x.product_name)}${x.variant_name?` — ${esc(x.variant_name)}`:''}</td><td>${x.qty_sold}</td><td>${x.qty_returned}</td><td>${x.net_qty}</td><td>${money(x.net_revenue)}</td><td>${money(x.gross_profit)}</td></tr>`).join('')||'<tr><td colspan="6">لا توجد بيانات</td></tr>'}</tbody></table></div></div>`;
 if(has('inventory.stock')){const inv=await rpc('report_inventory_summary_v2',{p_branch_id:branch()});html+=`<h3>المخزون</h3><div class="home-grid">${card('قيمة المخزون',money(inv.stock_value))}${card('Stock Units',inv.sku_count)}${card('منخفض المخزون',inv.low_stock_count)}${card('مخزون سالب',inv.negative_stock_count)}</div>`}
 if(has('inventory.purchasing')){const p=await rpc('report_purchasing_summary_v2',args);html+=`<h3>المشتريات</h3><div class="home-grid">${card('أوامر الشراء',p.po_count)}${card('قيمة المستلم',money(p.received_value))}${card('مرتجعات المورد',money(p.supplier_return_value))}${card('صافي المشتريات',money(p.net_purchases))}</div>`}
 if(has('commerce.b2b_orders')||has('commerce.custom_orders')||has('commerce.quotations')){const d=await rpc('report_order_documents_v2',args);html+=`<h3>الطلبات المتقدمة</h3><div class="home-grid">${card('المستندات',d.documents)}${card('القيمة',money(d.value))}${card('المقدمات',money(d.deposits))}${card('القيمة المفتوحة',money(d.open_value))}</div>`}
 if(has('food.costing')||has('food.recipes')||has('food.waste')){const f=await rpc('report_food_summary_v2',args);html+=`<h3>Food Cost</h3><div class="home-grid">${card('Food Cost',money(f.food_cost),`${Number(f.food_cost_percent||0).toFixed(2)}%`)}${card('Waste',money(f.waste_cost))}${card('Production Batches',f.production_batches)}${card('Average Yield',`${Number(f.average_yield_percent||0).toFixed(2)}%`)}</div>`}
 out.innerHTML=html;}catch(err){out.innerHTML=`<div class="empty">${esc(err.message||err)}</div>`}};
}
function start(){inject();observer=new MutationObserver(inject);observer.observe(document.body,{childList:true,subtree:true});global.__SharawlaReportsV2=Object.freeze({version:VERSION,open})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
