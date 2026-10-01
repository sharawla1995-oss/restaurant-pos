(function(global){
'use strict';
const VERSION='reports-v2-ui.2-dfr01',KEY='sharawlaRuntimeConfigV1';
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
function table(headers,rows,empty='لا توجد بيانات'){return `<div class="table-wrap"><table><thead><tr>${headers.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.join('')||`<tr><td colspan="${headers.length}">${esc(empty)}</td></tr>`}</tbody></table></div>`}
function roleLabel(code){return ({po_created:'إنشاء PO',grn_received:'استلام GRN',supplier_return_created:'مرتجع مورد'})[code]||code}
async function renderDFR01(args){
 const [payments,employees,customers]=await Promise.all([
   rpc('report_sales_by_payment_method_v1',args),
   rpc('report_sales_by_employee_v1',args),
   rpc('report_sales_by_customer_v1',{...args,p_limit:100})
 ]);
 let html=`<h3>تفاصيل المبيعات — DFR-01</h3>`;
 html+=`<div class="panel"><h3>حسب طريقة الدفع</h3>${table(['الطريقة','مبيعات','مرتجعات','الصافي','فواتير','عمليات مرتجع'],(payments||[]).map(x=>`<tr><td>${esc(x.method)}</td><td>${money(x.sale_amount)}</td><td>${money(x.refund_amount)}</td><td>${money(x.net_amount)}</td><td>${x.order_count}</td><td>${x.return_count}</td></tr>`))}</div>`;
 html+=`<div class="panel"><h3>حسب الموظف</h3><p class="muted">المرتجعات هنا منسوبة للموظف الذي نفّذ المرتجع، وليس موظف الفاتورة الأصلية.</p>${table(['الموظف','فواتير بيع','قيمة البيع','مرتجعات منفذة','قيمة المرتجع','صافي النشاط','متوسط الفاتورة'],(employees||[]).map(x=>`<tr><td>${esc(x.employee_name)}</td><td>${x.sales_orders}</td><td>${money(x.gross_sales)}</td><td>${x.returns_processed}</td><td>${money(x.refund_value)}</td><td>${money(x.net_activity)}</td><td>${money(x.avg_ticket)}</td></tr>`))}</div>`;
 html+=`<div class="panel"><h3>حسب العميل</h3><p class="muted">دي حركة مبيعات مرتبطة بالفاتورة، وليست رصيد حسابات مدينة.</p>${table(['العميل','الفواتير','إجمالي البيع','مرتجعات فواتيره','صافي المبيعات','متوسط الفاتورة'],(customers||[]).map(x=>`<tr><td>${esc(x.customer_name)}</td><td>${x.orders}</td><td>${money(x.gross_sales)}</td><td>${money(x.returns_against_customer_orders)}</td><td>${money(x.net_sales)}</td><td>${money(x.avg_ticket)}</td></tr>`))}</div>`;
 if(has('inventory.purchasing')){
   const [suppliers,purchaseEmployees,pos]=await Promise.all([
     rpc('report_purchases_by_supplier_v1',args),
     rpc('report_purchases_by_employee_v1',args),
     rpc('report_purchase_orders_detail_v1',{...args,p_supplier_id:null,p_status:null})
   ]);
   html+=`<h3>تفاصيل المشتريات — DFR-01</h3>`;
   html+=`<div class="panel"><h3>حسب المورد</h3><p class="muted">صافي مشتريات تشغيلي = قيمة المستلم − مرتجعات المورد، وليس رصيدًا مستحقًا للمورد.</p>${table(['المورد','GRN','المستلم','مرتجع المورد','صافي المشتريات'],(suppliers||[]).map(x=>`<tr><td>${esc(x.supplier_name)}</td><td>${x.grn_count}</td><td>${money(x.received_value)}</td><td>${money(x.supplier_return_value)}</td><td>${money(x.net_purchase_value)}</td></tr>`))}</div>`;
   html+=`<div class="panel"><h3>حسب دور الموظف</h3>${table(['الدور','الموظف','المستندات','القيمة التشغيلية'],(purchaseEmployees||[]).map(x=>`<tr><td>${esc(roleLabel(x.role_code))}</td><td>${esc(x.employee_name)}</td><td>${x.document_count}</td><td>${money(x.operational_value)}</td></tr>`))}</div>`;
   html+=`<div class="panel"><h3>أوامر الشراء</h3>${table(['PO','المورد','أنشأه','اعتمده','الحالة','المطلوب','المستلم','المتبقي','قيمة المتبقي'],(pos||[]).map(x=>`<tr><td>${esc(x.po_number||('#'+x.purchase_order_id))}</td><td>${esc(x.supplier_name)}</td><td>${esc(x.created_by_employee_name||'—')}</td><td>${esc(x.approved_by_employee_name||'—')}</td><td>${esc(x.status)}</td><td>${money(x.ordered_value)}</td><td>${money(x.received_value)}</td><td>${Number(x.outstanding_quantity||0).toFixed(3)}</td><td>${money(x.outstanding_value)}</td></tr>`))}</div>`;
 }
 return html;
}
async function open(){
 const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card" style="width:min(1180px,96vw);max-height:94vh;overflow:auto"><div class="section-head"><div><h2>📊 Reports V2</h2><p class="muted">تقارير موحدة حسب الـCapabilities المفعلة.</p></div><button class="secondary" data-r-close>إغلاق</button></div><div class="form-grid"><label>من<input type="date" data-r-from value="${monthStart()}"></label><label>إلى<input type="date" data-r-to value="${today()}"></label><label>&nbsp;<button class="primary" data-r-run>تشغيل التقرير</button></label><label>&nbsp;<button class="secondary" data-r-detail>تفاصيل DFR-01</button></label></div><div data-r-out style="margin-top:14px"></div></div>`;document.body.appendChild(m);
 m.onclick=async e=>{if(e.target===m||e.target.closest('[data-r-close]'))return m.remove();const run=e.target.closest('[data-r-run]'),detail=e.target.closest('[data-r-detail]');if(!run&&!detail)return;const from=m.querySelector('[data-r-from]').value,to=m.querySelector('[data-r-to]').value;if(!from||!to)return toast('اختر الفترة');const out=m.querySelector('[data-r-out]');out.innerHTML='<div class="empty">جاري التحميل…</div>';try{const args={p_branch_id:branch(),p_from:isoStart(from),p_to:isoEnd(to)};if(detail){out.innerHTML=await renderDFR01(args);return}const [sales,items]=await Promise.all([rpc('report_sales_summary_v2',args),rpc('report_item_sales_v2',{...args,p_limit:100})]);let html=`<h3>المبيعات</h3><div class="home-grid">${card('صافي المبيعات',money(sales.net_sales))}${card('عدد الفواتير',sales.orders)}${card('المرتجعات',money(sales.returns))}${card('متوسط الفاتورة',money(sales.avg_ticket))}${card('تكلفة البضاعة',money(sales.cogs))}${card('مجمل الربح',money(sales.gross_profit))}</div><div class="panel"><h3>مبيعات الأصناف</h3><div class="table-wrap"><table><thead><tr><th>الصنف</th><th>المباع</th><th>المرتجع</th><th>صافي الكمية</th><th>صافي المبيعات</th><th>الربح</th></tr></thead><tbody>${(items||[]).map(x=>`<tr><td>${esc(x.product_name)}${x.variant_name?` — ${esc(x.variant_name)}`:''}</td><td>${x.qty_sold}</td><td>${x.qty_returned}</td><td>${x.net_qty}</td><td>${money(x.net_revenue)}</td><td>${money(x.gross_profit)}</td></tr>`).join('')||'<tr><td colspan="6">لا توجد بيانات</td></tr>'}</tbody></table></div></div>`;
 if(has('inventory.stock')){const inv=await rpc('report_inventory_summary_v2',{p_branch_id:branch()});html+=`<h3>المخزون</h3><div class="home-grid">${card('قيمة المخزون',money(inv.stock_value))}${card('Stock Units',inv.sku_count)}${card('منخفض المخزون',inv.low_stock_count)}${card('مخزون سالب',inv.negative_stock_count)}</div>`}
 if(has('inventory.purchasing')){const p=await rpc('report_purchasing_summary_v2',args);html+=`<h3>المشتريات</h3><div class="home-grid">${card('أوامر الشراء',p.po_count)}${card('قيمة المستلم',money(p.received_value))}${card('مرتجعات المورد',money(p.supplier_return_value))}${card('صافي المشتريات',money(p.net_purchases))}</div>`}
 if(has('commerce.b2b_orders')||has('commerce.custom_orders')||has('commerce.quotations')){const d=await rpc('report_order_documents_v2',args);html+=`<h3>الطلبات المتقدمة</h3><div class="home-grid">${card('المستندات',d.documents)}${card('القيمة',money(d.value))}${card('المقدمات',money(d.deposits))}${card('القيمة المفتوحة',money(d.open_value))}</div>`}
 if(has('food.costing')||has('food.recipes')||has('food.waste')){const f=await rpc('report_food_summary_v2',args);html+=`<h3>Food Cost</h3><div class="home-grid">${card('Food Cost',money(f.food_cost),`${Number(f.food_cost_percent||0).toFixed(2)}%`)}${card('Waste',money(f.waste_cost))}${card('Production Batches',f.production_batches)}${card('Average Yield',`${Number(f.average_yield_percent||0).toFixed(2)}%`)}</div>`}
 out.innerHTML=html;}catch(err){out.innerHTML=`<div class="empty">${esc(err.message||err)}</div>`}};
}
function start(){inject();observer=new MutationObserver(inject);observer.observe(document.body,{childList:true,subtree:true});global.__SharawlaReportsV2=Object.freeze({version:VERSION,open,renderDFR01})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
