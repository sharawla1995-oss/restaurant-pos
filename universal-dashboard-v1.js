(function(global){
'use strict';
const engine=global.SharawlaUniversalDashboardEngineV1;
const host=global.__SharawlaUniversalDashboardHostV1;
if(!engine||!host)return;

const VERSION='1.0.0';
const runtime={period:'today',from:'',to:'',branchMode:'current',selectedBranchId:null,controller:null,gate:engine.createRequestGate(),cache:new Map()};
const esc=value=>host.escape(value);
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const money=value=>host.formatMoney(number(value));
const stateCopy=value=>JSON.parse(JSON.stringify(value));

function queryScope(scope,period){
 const branch=scope.branchIds.length===1?`branch_id=eq.${scope.branchIds[0]}`:`branch_id=in.(${scope.branchIds.join(',')})`;
 return `${branch}&created_at=gte.${encodeURIComponent(period.from)}&created_at=lte.${encodeURIComponent(period.to)}`;
}
function widget(id){return document.querySelector(`[data-dashboard-widget="${id}"]`)}
function widgetState(id,state,message=''){
 const root=widget(id);if(!root)return;
 const labels={loading:'جاري تحميل البيانات…',empty:'لا توجد بيانات في النطاق المحدد.',error:'تعذر تحميل هذا الجزء.',offline_unavailable:'غير متاح من البيانات المحلية الحالية.',unsupported:'غير مدعوم من مصدر موثوق في الإصدار الحالي.'};
 root.dataset.state=state;root.innerHTML=`<div class="ud-state ud-state-${esc(state)}"><span>${state==='loading'?'◌':state==='error'?'!':state==='empty'?'○':'◇'}</span><p>${esc(message||labels[state]||'غير متاح')}</p>${state==='error'?'<button type="button" data-dashboard-retry>إعادة المحاولة</button>':''}</div>`;
 const retry=root.querySelector('[data-dashboard-retry]');if(retry)retry.onclick=()=>loadDashboard();
}
function card(label,value,note='',tone='blue'){
 return `<article class="ud-kpi tone-${esc(tone)}"><span>${esc(label)}</span><strong>${esc(value)}</strong>${note?`<small>${esc(note)}</small>`:''}</article>`;
}
function barRows(rows,label,value,formatter=value=>String(value)){
 const max=Math.max(0,...rows.map(value));
 return `<div class="ud-bars">${rows.map(row=>{const amount=value(row),width=max>0?Math.max(2,amount/max*100):0;return `<div class="ud-bar-row"><span>${esc(label(row))}</span><div><i style="width:${width.toFixed(2)}%"></i></div><b>${esc(formatter(amount,row))}</b></div>`}).join('')}</div>`;
}
function renderWidget(id,html){const root=widget(id);if(root){root.dataset.state='ready';root.innerHTML=html}}
function branchLabel(id,ctx){return ctx.branches.find(branch=>String(branch.id)===String(id))?.name||`#${id}`}
function employeeLabel(id,employees=[]){return employees.find(row=>String(row.id)===String(id))?.name||'غير محدد'}
function channelLabel(value){return ({delivery:'دليفري',pickup:'استلام',dinein:'صالة',takeaway:'تيك أواي',other:'أخرى'})[value]||value}
function statusLabel(value){return ({new:'جديد',preparing:'قيد التحضير',ready:'جاهز',out_for_delivery:'خرج للتوصيل',delivered:'تم التسليم',completed:'مكتمل',cancelled:'ملغي'})[value]||value||'غير محدد'}
function cacheKey(table,query,ctx){return `${String(ctx.employee?.id||'anonymous')}|${table}?${query}`}
async function read(table,query,ctx,signal,{maxRows=4000,cache=true}={}){
 if(ctx.online){
  const key=cacheKey(table,query,ctx),cached=runtime.cache.get(key),now=Date.now();
  if(cache&&cached&&now-cached.at<30000)return stateCopy(cached.rows);
  const rows=await host.readAll(table,query,{signal,maxRows});if(cache)runtime.cache.set(key,{at:now,rows:stateCopy(rows)});return rows;
 }
 return host.readLocal(table,query);
}
async function readByIds(table,select,key,ids,ctx,signal){
 const clean=[...new Set(ids.filter(value=>value!==null&&value!==undefined&&String(value)!==''))];
 if(clean.length>300){const error=new Error('التفاصيل تتجاوز حد Dashboard V1 الآمن؛ يلزم Read Model مجمّع.');error.code='DASHBOARD_DETAIL_LIMIT';throw error}
 const rows=[];for(let index=0;index<clean.length;index+=150){const part=clean.slice(index,index+150).join(',');if(part)rows.push(...await read(table,`${select}&${key}=in.(${part})`,ctx,signal,{maxRows:4000}))}return rows;
}
function settledMap(keys,results){const map={};keys.forEach((key,index)=>{map[key]=results[index].status==='fulfilled'?{ok:true,data:results[index].value}:{ok:false,error:results[index].reason}});return map}

function quickActions(ctx){
 const actions=[
  ['pos','🧾','الكاشير'],['orders','📋','الطلبات'],['returns','↩️','المرتجعات'],['customers','👤','العملاء'],['shifts','🕘','الورديات'],
  ['inventory','📦','المخزون'],['purchasing','📥','المشتريات'],['expenses','💸','المصروفات'],['reports','📊','التقارير'],['settings','⚙️','الإعدادات']
 ].filter(([page])=>ctx.permissions.includes(page));
 renderWidget('quick_actions',`<div class="ud-actions">${actions.map(([page,icon,label])=>`<button type="button" data-dashboard-nav="${page}"><span>${icon}</span><b>${esc(label)}</b></button>`).join('')}</div>`);
 widget('quick_actions')?.querySelectorAll('[data-dashboard-nav]').forEach(button=>button.onclick=()=>host.navigate(button.dataset.dashboardNav));
}

function renderCore(metrics,resources,ctx){
 if(!resources.orders?.ok||!resources.returns?.ok)return widgetState('business_kpis','error',resources.orders?.error?.message||resources.returns?.error?.message||'تعذر التحقق من المبيعات والمرتجعات معًا.');
 if(metrics.isEmpty)return widgetState('business_kpis','empty');
 const expense=resources.expenses?.ok?money(metrics.expenseTotal):'غير متاح';
 renderWidget('business_kpis',`<div class="ud-kpi-grid">${[
  card('صافي المبيعات',money(metrics.netSales),'المبيعات المحصلة − المرتجعات','mint'),card('إجمالي المبيعات المحصلة',money(metrics.grossSales),'ليس النقد المحصل فقط','blue'),
  card('الطلبات المحصلة',String(metrics.orderCount),'الملغي وغير المحصل مستبعد','violet'),card('متوسط الطلب',money(metrics.averageOrderValue),'الإجمالي المحصل ÷ عدد الطلبات','amber'),
  card('المرتجعات',money(metrics.returnsTotal),'حسب تاريخ تنفيذ المرتجع','rose'),card('الخصومات',money(metrics.discounts),'المثبتة على الطلبات المحصلة','slate'),
  card('المصروفات',expense,resources.expenses?.ok?'مؤشر منفصل عن المبيعات':'فشل مصدر المصروفات','rose'),card('عملاء مرتبطون',String(metrics.customerCount),'عملاء فريدون في الطلبات المحصلة','green')
 ].join('')}</div>${metrics.uncollectedWebsiteCount?`<p class="ud-note">${metrics.uncollectedWebsiteCount} طلب موقع غير محصل داخل POS لم يدخل في المبيعات.</p>`:''}`);
}
function renderTimeline(metrics){
 if(!metrics.timeline.length)return widgetState('sales_timeline','empty');
 renderWidget('sales_timeline',barRows(metrics.timeline,row=>new Date(`${row.date}T00:00:00`).toLocaleDateString('ar-EG',{day:'numeric',month:'short'}),row=>Math.abs(row.sales),(value,row)=>money(row.sales))+`<div class="ud-peaks">${metrics.peakHours.map(row=>`<span>ذروة ${String(row.hour).padStart(2,'0')}:00 <b>${esc(money(row.sales))}</b></span>`).join('')}</div>`);
}
function renderPayments(metrics,detailError){
 if(detailError)return widgetState('payment_distribution','error',detailError.message);
 if(!metrics.payments.length)return widgetState('payment_distribution','empty');
 renderWidget('payment_distribution',barRows(metrics.payments,row=>row.label,row=>Math.abs(row.total),(value,row)=>money(row.total))+'<p class="ud-note">المدفوعات بعد طرح مبالغ المرتجعات حسب طريقة الدفع.</p>');
}
function renderBest(metrics,detailError){
 if(detailError)return widgetState('best_sellers','error',detailError.message);
 if(!metrics.bestSellers.length)return widgetState('best_sellers','empty');
 renderWidget('best_sellers',`<ol class="ud-ranked">${metrics.bestSellers.map(row=>`<li><span>${esc(row.name)}</span><b>${number(row.quantity).toLocaleString('ar-EG',{maximumFractionDigits:3})}</b><small>${esc(money(row.total))}</small></li>`).join('')}</ol>`);
}
function renderRecent(rows){
 if(!rows?.length)return widgetState('recent_orders','empty');
 renderWidget('recent_orders',`<div class="ud-list">${rows.slice(0,8).map(row=>`<div><span><b>${esc(row.order_number||row.invoice_number||row.offline_reference||`#${row.id}`)}</b><small>${esc(host.formatDate(row.created_at))}</small></span><span><b>${esc(statusLabel(row.status))}</b><small>${esc(channelLabel(row.order_type||'other'))}</small></span></div>`).join('')}</div>`);
}
function renderEmployees(metrics,employees,error){
 if(error)return widgetState('employee_performance','error',error.message);
 if(!metrics.employees.length)return widgetState('employee_performance','empty');
 renderWidget('employee_performance',barRows(metrics.employees,row=>employeeLabel(row.employeeId,employees),row=>Math.abs(row.sales),(value,row)=>`${money(row.sales)} • ${row.orders}`));
}
function renderBranches(metrics,ctx){
 if(!metrics.branches.length)return widgetState('branch_comparison','empty');
 renderWidget('branch_comparison',barRows(metrics.branches,row=>branchLabel(row.branchId,ctx),row=>Math.abs(row.sales),(value,row)=>money(row.sales)));
}
function renderCustomerActivity(metrics){if(!metrics.orderCount)return widgetState('customer_activity','empty');renderWidget('customer_activity',`<div class="ud-kpi-grid compact">${card('عملاء فريدون',String(metrics.customerCount),'طلبات مرتبطة بعميل','violet')}${card('طلبات بدون عميل',String(metrics.unlinkedOrderCount),'عدد الطلبات غير المرتبطة بعميل','slate')}</div>`)}
function renderRestaurant(rows,ctx){
 if(!rows?.length)return widgetState('restaurant_orders','empty');
 const counts={};rows.filter(row=>String(row.status||'').toLowerCase()!=='cancelled').forEach(row=>{const key=String(row.order_type||'other');counts[key]=(counts[key]||0)+1});
 const allowed=new Set(ctx.capabilities);const visible=Object.entries(counts).filter(([key])=>(key!=='delivery'||allowed.has('commerce.delivery'))&&(key!=='pickup'||allowed.has('commerce.pickup'))&&(key!=='dinein'||allowed.has('food.tables')));
 renderWidget('restaurant_orders',`<div class="ud-kpi-grid compact">${visible.map(([key,value])=>card(channelLabel(key),String(value),'طلبات تشغيلية','green')).join('')}</div>`);
}

async function loadInventory(ctx,scope,signal){
 const branches=`branch_id=in.(${scope.branchIds.join(',')})`,profile=ctx.profile;
 if(profile==='restaurant'){
  const [ingredients,stock]=await Promise.all([read('ingredients','select=id,name,minimum_quantity,track_inventory,active&active=eq.true',ctx,signal),read('ingredient_stock',`select=branch_id,ingredient_id,quantity&${branches}`,ctx,signal)]);
  const map=new Map(ingredients.map(row=>[String(row.id),row]));const alerts=stock.filter(row=>{const item=map.get(String(row.ingredient_id));return item&&item.track_inventory!==false&&number(row.quantity)<=number(item.minimum_quantity)});
  return {label:'خامات منخفضة / عند الحد',count:alerts.length,rows:alerts.slice(0,6).map(row=>({name:map.get(String(row.ingredient_id))?.name||row.ingredient_id,value:number(row.quantity)}))};
 }
 if(profile==='pharmacy'){
  const today=new Date().toISOString().slice(0,10),limit=new Date(Date.now()+90*86400000).toISOString().slice(0,10);
  const [products,batches]=await Promise.all([read('products','select=id,name&active=eq.true',ctx,signal),read('pharmacy_batches',`select=id,branch_id,product_id,batch_no,expiry_date,quantity,active&${branches}&active=eq.true`,ctx,signal)]);const names=new Map(products.map(row=>[String(row.id),row.name]));
  const rows=batches.filter(row=>number(row.quantity)>0&&String(row.expiry_date||'')<=limit).sort((a,b)=>String(a.expiry_date).localeCompare(String(b.expiry_date)));
  return {label:'باتشات منتهية/قريبة خلال 90 يوم',count:rows.length,rows:rows.slice(0,6).map(row=>({name:names.get(String(row.product_id))||row.product_id,value:String(row.expiry_date)<today?'منتهي':row.expiry_date}))};
 }
 const [products,balances,settings]=await Promise.all([read('products','select=id,name&active=eq.true',ctx,signal),read('retail_inventory_balances',`select=branch_id,product_id,quantity,low_stock_threshold,track_inventory&${branches}`,ctx,signal),read('retail_inventory_settings',`select=branch_id,default_low_stock_threshold&${branches}`,ctx,signal).catch(()=>[])]);const names=new Map(products.map(row=>[String(row.id),row.name])),defaults=new Map(settings.map(row=>[String(row.branch_id),number(row.default_low_stock_threshold)]));
 const rows=balances.filter(row=>row.track_inventory!==false&&number(row.quantity)<=number(row.low_stock_threshold??defaults.get(String(row.branch_id))??0));
 return {label:'أصناف منخفضة / عند الحد',count:rows.length,rows:rows.slice(0,6).map(row=>({name:names.get(String(row.product_id))||row.product_id,value:number(row.quantity)}))};
}
function renderSimpleSummary(id,result){
 if(!result)return widgetState(id,'empty');
 const rows=result.rows||[];renderWidget(id,`<div class="ud-kpi-grid compact">${card(result.label,String(result.count),result.note||'','amber')}</div>${rows.length?`<div class="ud-list">${rows.map(row=>`<div><b>${esc(row.name)}</b><span>${esc(row.value)}</span></div>`).join('')}</div>`:''}`);
}
async function loadSpecial(id,ctx,scope,period,signal){
 const branch=`branch_id=in.(${scope.branchIds.join(',')})`,date=`created_at=gte.${encodeURIComponent(period.from)}&created_at=lte.${encodeURIComponent(period.to)}`;
 if(id==='inventory_alerts'||id==='warehouse_operations')return loadInventory(ctx,scope,signal);
 if(id==='purchasing_status'){
  const table=ctx.profile==='restaurant'?'purchases':'retail_purchase_orders';const rows=await read(table,`select=id,branch_id,status,created_at&${branch}&${date}`,ctx,signal);
  const open=rows.filter(row=>!['received','cancelled'].includes(String(row.status))).length;return {label:'أوامر شراء مفتوحة',count:open,note:`${rows.length} خلال الفترة`,rows:[]};
 }
 if(id==='restaurant_food_ops'){
  const [production,waste]=await Promise.all([read('food_production_batches',`select=id,branch_id,status,created_at&${branch}&${date}`,ctx,signal),read('food_waste_events',`select=id,branch_id,status,quantity,occurred_at&${branch}&occurred_at=gte.${encodeURIComponent(period.from)}&occurred_at=lte.${encodeURIComponent(period.to)}`,ctx,signal)]);
  return {label:'دفعات إنتاج مكتملة',count:production.filter(row=>row.status==='completed').length,note:`${waste.filter(row=>row.status==='posted').length} حركة هالك مرحّلة`,rows:[]};
 }
 if(id==='pharmacy_expiry')return loadInventory(ctx,scope,signal);
 if(id==='service_operations'){
  const [jobs,appointments]=await Promise.all([read('service_jobs_v1',`select=id,branch_id,status,created_at&${branch}&${date}`,ctx,signal),read('service_appointments_v1',`select=id,branch_id,status,starts_at&${branch}&starts_at=gte.${encodeURIComponent(period.from)}&starts_at=lte.${encodeURIComponent(period.to)}`,ctx,signal)]);
  return {label:'أوامر خدمة نشطة',count:jobs.filter(row=>!['completed','cancelled'].includes(row.status)).length,note:`${appointments.filter(row=>!['completed','cancelled','no_show'].includes(row.status)).length} موعد في الفترة`,rows:[]};
 }
 if(id==='membership_operations'){
  const [subscriptions,checkins]=await Promise.all([read('membership_subscriptions_v1',`select=id,status,starts_on,ends_on&created_at=lte.${encodeURIComponent(period.to)}`,ctx,signal),read('membership_checkins_v1',`select=id,branch_id,checked_in_at&${branch}&checked_in_at=gte.${encodeURIComponent(period.from)}&checked_in_at=lte.${encodeURIComponent(period.to)}`,ctx,signal)]);
  return {label:'اشتراكات نشطة',count:subscriptions.filter(row=>row.status==='active').length,note:`${checkins.length} تسجيل حضور في الفترة`,rows:[]};
 }
 if(id==='logistics_operations'){
  const rows=await read('logistics_shipments_v1',`select=id,branch_id,status,cod_amount,created_at&${branch}&${date}`,ctx,signal);return {label:'شحنات غير منتهية',count:rows.filter(row=>!['delivered','returned','cancelled'].includes(row.status)).length,note:`${rows.filter(row=>row.status==='delivered').length} تم تسليمها`,rows:[]};
 }
 if(id==='central_supply'){
  const ids=scope.branchIds.join(','),rows=await read('inventory_supply_requests',`select=id,source_location_id,destination_branch_id,status,request_type,created_at&or=(source_location_id.in.(${ids}),destination_branch_id.in.(${ids}))&${date}`,ctx,signal);return {label:'طلبات توريد جارية',count:rows.filter(row=>!['received','rejected','cancelled'].includes(row.status)).length,note:`${rows.filter(row=>row.request_type==='emergency').length} عاجل`,rows:[]};
 }
 return null;
}

async function loadDashboard(){
 const ctx=host.getContext(),period=engine.resolvePeriod(runtime.period,new Date(),{from:runtime.from,to:runtime.to});
 const scope=engine.resolveBranchScope({mode:runtime.branchMode,branchId:ctx.branchId,selectedBranchId:runtime.selectedBranchId,allowedBranchIds:ctx.allowedBranchIds,canAllBranches:ctx.canAllBranches});
 if(!scope.ok){runtime.branchMode='current';return render()}
 runtime.controller?.abort();const controller=new AbortController();runtime.controller=controller;const token=runtime.gate.next();
 let actionPermissions=[];
 if(ctx.online&&ctx.capabilities.includes('inventory.multi_warehouse')&&ctx.permissions.includes('inventory')&&await host.hasActionPermission('inventory.supply.view'))actionPermissions.push('inventory.supply.view');
 if(!runtime.gate.isCurrent(token))return;
 const plan=engine.buildReadPlan({...ctx,actionPermissions,branchMode:scope.mode},{includeUnavailable:true}),resolved=plan.widgets;
 for(const item of resolved){if(item.state==='ready')widgetState(item.id,'loading');else if(item.state==='offline_unavailable')widgetState(item.id,'offline_unavailable')}
 quickActions(ctx);
 const ready=resolved.filter(item=>item.state==='ready'),ids=new Set(ready.map(item=>item.id));
 const coreNeeded=plan.datasets.includes('orders')&&plan.datasets.includes('returns');
 const promises=[],keys=[];
 if(coreNeeded){const base=queryScope(scope,period);const coreSources=[['orders','orders','select=id,branch_id,employee_id,customer_id,shift_id,status,source,payment_status,payment_method,order_type,total,discount,created_at,order_number,invoice_number,client_tx_id,offline_reference'],['returns','returns','select=id,branch_id,employee_id,order_id,total,created_at,client_tx_id']];if(ctx.capabilities.includes('core.expenses'))coreSources.push(['expenses','expenses','select=id,branch_id,employee_id,shift_id,amount,created_at,client_tx_id']);for(const [key,table,select] of coreSources){keys.push(key);promises.push(read(table,`${select}&${base}`,ctx,controller.signal))}}
 if(ids.has('recent_orders')||ids.has('restaurant_orders')){keys.push('operations');promises.push(read('orders',`select=id,branch_id,status,order_type,created_at,order_number,invoice_number,offline_reference&${queryScope(scope,period)}&order=created_at.desc`,ctx,controller.signal,{maxRows:1000}))}
 if(ids.has('employee_performance')){keys.push('employees');promises.push(ctx.online?read('employees',`select=id,name,branch_id&branch_id=in.(${scope.branchIds.join(',')})`,ctx,controller.signal,{maxRows:1000}):Promise.reject(Object.assign(new Error('أسماء الموظفين غير متاحة محليًا'),{code:'LOCAL_UNAVAILABLE'})))}
 const results=await Promise.allSettled(promises);if(!runtime.gate.isCurrent(token))return;const resources=settledMap(keys,results);
 let detailError=null,details={orderPayments:[],returnPayments:[],orderItems:[],returnItems:[]};
 if(coreNeeded&&resources.orders?.ok&&resources.returns?.ok&&(ids.has('payment_distribution')||ids.has('best_sellers'))){
  try{const orderIds=resources.orders.data.map(row=>row.id),returnIds=resources.returns.data.map(row=>row.id);const detailResults=await Promise.all([
   ids.has('payment_distribution')?readByIds('order_payments','select=id,order_id,method,amount','order_id',orderIds,ctx,controller.signal):[],
   ids.has('payment_distribution')?readByIds('return_payments','select=id,return_id,method,amount','return_id',returnIds,ctx,controller.signal):[],
   ids.has('best_sellers')?readByIds('order_items','select=id,order_id,product_id,product_name,quantity,total,line_uid','order_id',orderIds,ctx,controller.signal):[],
   ids.has('best_sellers')?readByIds('return_items','select=id,return_id,product_id,product_name,quantity,total,line_uid','return_id',returnIds,ctx,controller.signal):[]
  ]);[details.orderPayments,details.returnPayments,details.orderItems,details.returnItems]=detailResults}catch(error){detailError=error}
 }
 if(!runtime.gate.isCurrent(token))return;
 let metrics=null;
 if(resources.orders?.ok&&resources.returns?.ok)metrics=engine.aggregateDashboard({orders:resources.orders.data,returns:resources.returns.data,expenses:resources.expenses?.ok?resources.expenses.data:[],...details},{branchIds:scope.branchIds,from:period.from,to:period.to});
 if(ids.has('business_kpis'))renderCore(metrics||{},resources,ctx);
 if(!metrics){for(const id of ['sales_timeline','payment_distribution','best_sellers','employee_performance','branch_comparison','customer_activity'])if(ids.has(id))widgetState(id,'error','تعذر التحقق من مصدر الطلبات والمرتجعات.')}
 if(metrics&&ids.has('sales_timeline'))renderTimeline(metrics);
 if(metrics&&ids.has('payment_distribution'))renderPayments(metrics,detailError);
 if(metrics&&ids.has('best_sellers'))renderBest(metrics,detailError);
 if(ids.has('recent_orders'))resources.operations?.ok?renderRecent(resources.operations.data):widgetState('recent_orders','error',resources.operations?.error?.message);
 if(ids.has('restaurant_orders'))resources.operations?.ok?renderRestaurant(resources.operations.data,ctx):widgetState('restaurant_orders','error',resources.operations?.error?.message);
 if(metrics&&ids.has('employee_performance'))renderEmployees(metrics,resources.employees?.data||[],resources.employees?.ok?null:resources.employees?.error);
 if(metrics&&ids.has('branch_comparison'))renderBranches(metrics,ctx);
 if(metrics&&ids.has('customer_activity'))renderCustomerActivity(metrics);
 const special=ready.filter(item=>['inventory_alerts','purchasing_status','restaurant_food_ops','pharmacy_expiry','service_operations','membership_operations','logistics_operations','warehouse_operations','central_supply'].includes(item.id));
 await Promise.all(special.map(async item=>{try{const result=await loadSpecial(item.id,ctx,scope,period,controller.signal);if(runtime.gate.isCurrent(token))renderSimpleSummary(item.id,result)}catch(error){if(runtime.gate.isCurrent(token)&&error.name!=='AbortError')widgetState(item.id,'error',error.message)}}));
 if(runtime.gate.isCurrent(token)){const stamp=document.querySelector('[data-dashboard-freshness]');if(stamp)stamp.textContent=ctx.online?'بيانات Cloud مؤكدة — '+new Date().toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}):'بيانات محلية على هذا الجهاز — ليست تجميعًا مركزيًا'}
}

function filterShell(ctx){
 const selected=runtime.selectedBranchId||ctx.branchId;return `<section class="ud-head"><div><span class="ud-kicker">SHARAWLA UNIVERSAL DASHBOARD V1</span><h1>ملخص الأعمال</h1><p>${esc(ctx.business.name)} • ${esc(ctx.employee.name)}</p></div><div class="ud-authority ${ctx.online?'cloud':'local'}"><b>${ctx.online?'LIVE / CLOUD-CONFIRMED':'LOCAL / OFFLINE'}</b><span data-dashboard-freshness>${ctx.online?'جاري التحديث…':'بيانات محلية — ليست تجميعًا مركزيًا'}</span></div></section>
 <section class="ud-filterbar" aria-label="فلاتر لوحة الملخص">
  <label>الفترة<select data-dashboard-period><option value="today">اليوم</option><option value="yesterday">أمس</option><option value="week">هذا الأسبوع</option><option value="month">هذا الشهر</option><option value="custom">فترة مخصصة</option></select></label>
  <div class="ud-custom ${runtime.period==='custom'?'':'hidden'}"><label>من<input type="date" data-dashboard-from value="${esc(runtime.from)}"></label><label>إلى<input type="date" data-dashboard-to value="${esc(runtime.to)}"></label></div>
  <label>الفرع<select data-dashboard-branch><option value="current">الفرع الحالي — ${esc(branchLabel(ctx.branchId,ctx))}</option>${ctx.branches.filter(branch=>String(branch.id)!==String(ctx.branchId)).map(branch=>`<option value="branch:${branch.id}">${esc(branch.name)}</option>`).join('')}${ctx.canAllBranches&&ctx.online?'<option value="all">كل الفروع المسموح بها</option>':''}</select></label>
  <label>المقارنة<select disabled title="لا يوجد مصدر timezone موحد معتمد لكل الفروع في V1"><option>غير متاحة في V1</option></select></label>
  <button type="button" class="primary" data-dashboard-refresh>تحديث</button>
 </section>`;
}
function sectionFor(item){return `<section class="ud-widget ud-widget-${esc(item.group)}" data-dashboard-widget-shell="${esc(item.id)}"><header><h2>${esc(item.title)}</h2><span>${item.group==='profile'?'خاص بالنشاط':item.group==='capability'?'حسب الإمكانيات':'مشترك'}</span></header><div class="ud-widget-body" data-dashboard-widget="${esc(item.id)}"></div></section>`}
async function render(){
 const page=document.querySelector('#page');if(!page)return;const ctx=host.getContext();
 if(!runtime.from)runtime.from=engine.resolvePeriod('today').fromDate;if(!runtime.to)runtime.to=runtime.from;
 if(!ctx.online){runtime.branchMode='current';runtime.selectedBranchId=ctx.branchId}
 const actionPermissions=[];
 if(ctx.online&&ctx.capabilities.includes('inventory.multi_warehouse')&&ctx.permissions.includes('inventory')&&await host.hasActionPermission('inventory.supply.view'))actionPermissions.push('inventory.supply.view');
 const provisional=engine.buildReadPlan({...ctx,actionPermissions,branchMode:runtime.branchMode},{includeUnavailable:true}).widgets.filter(item=>item.state!=='no_permission'&&item.state!=='capability_unavailable');
 page.innerHTML=`<main class="universal-dashboard" dir="rtl">${filterShell(ctx)}<div class="ud-grid">${provisional.map(sectionFor).join('')}</div><section class="ud-disclosure"><b>حدود الدقة</b><span>لا تعرض هذه الشاشة الربح أو COGS أو قيمة مخزون. «0» يظهر فقط بعد قراءة ناجحة؛ فشل المصدر يظهر كغير متاح.</span></section></main>`;
 const period=document.querySelector('[data-dashboard-period]');period.value=runtime.period;period.onchange=event=>{runtime.period=event.target.value;document.querySelector('.ud-custom')?.classList.toggle('hidden',runtime.period!=='custom');if(runtime.period!=='custom')loadDashboard()};
 const branch=document.querySelector('[data-dashboard-branch]');branch.value=runtime.branchMode==='all'?'all':runtime.branchMode==='specific'?`branch:${runtime.selectedBranchId}`:'current';branch.onchange=event=>{const value=event.target.value;if(value==='all'){runtime.branchMode='all';runtime.selectedBranchId=null}else if(value.startsWith('branch:')){runtime.branchMode='specific';runtime.selectedBranchId=value.slice(7)}else{runtime.branchMode='current';runtime.selectedBranchId=ctx.branchId}loadDashboard()};
 document.querySelector('[data-dashboard-from]').onchange=event=>runtime.from=event.target.value;document.querySelector('[data-dashboard-to]').onchange=event=>runtime.to=event.target.value;
 document.querySelector('[data-dashboard-refresh]').onclick=()=>loadDashboard().catch(error=>{if(error?.name!=='AbortError')global.console.error('[Universal Dashboard V1]',error)});
 try{await loadDashboard()}catch(error){if(error?.name!=='AbortError'){global.console.error('[Universal Dashboard V1]',error);document.querySelectorAll('[data-dashboard-widget][data-state="loading"]').forEach(root=>widgetState(root.dataset.dashboardWidget,'error',error.message))}}
}

global.__SharawlaUniversalDashboardV1=Object.freeze({version:VERSION,mode:'READ_ONLY_CAPABILITY_DRIVEN',render,reload:loadDashboard});
})(window);
