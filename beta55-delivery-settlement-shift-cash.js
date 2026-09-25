(function(global){
'use strict';
const VERSION='10.5.4-beta.55';
const KEY_PREFIX='sharawlaShiftCashV2:';
let lastDeliveryDetailId=null;

const num=v=>Number(v||0);
const escLocal=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tx=prefix=>`${prefix}-${(global.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`)}`;
const moneyLocal=v=>typeof global.money==='function'?global.money(v):`${num(v).toFixed(2)}`;
const toastLocal=v=>typeof global.toast==='function'?global.toast(v):console.log(v);
const branchId=()=>Number(global.currentBranchId?.()||global.state?.activeBranchId||0);
const isOnline=()=>typeof navigator==='undefined'||navigator.onLine!==false;

async function paymentOptions(order){
 const bid=Number(order?.branch_id||branchId());
 // Delivery completion is Online-only. Resolve payment eligibility from the
 // server at the action boundary instead of trusting bootstrap-time caches.
 const [methods,links]=await Promise.all([
  global.rest('payment_methods','select=id,code,name,active,sort_order&active=eq.true&order=sort_order,id'),
  global.rest('branch_payment_methods',`select=branch_id,payment_method_id,active,is_default&branch_id=eq.${bid}&active=eq.true`)
 ]);
 const activeIds=new Set((links||[]).map(x=>String(x.payment_method_id)));
 return (methods||[])
  .filter(x=>x.active!==false&&String(x.code||'').toLowerCase()!=='mixed'&&activeIds.has(String(x.id)))
  .sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0)||Number(a.id)-Number(b.id));
}

async function changeDeliveryPaymentInteractive(orderId,hostModal=null){
 if(!isOnline()){toastLocal('تعديل طريقة الدفع متاح Online فقط');return false}
 const rows=await global.rest('orders',`select=*&id=eq.${Number(orderId)}&limit=1`);
 const order=rows?.[0];
 if(!order){toastLocal('الأوردر غير موجود');return true}
 if(order.order_type!=='delivery'){toastLocal('تعديل طريقة الدفع من هذه الشاشة متاح للدليفري فقط');return true}
 if(!['out_for_delivery','delivered','completed'].includes(String(order.status||''))){toastLocal('يمكن تعديل طريقة الدفع بعد خروج الطلب مع المندوب');return true}
 if(order.driver_settled_at!=null){toastLocal('لا يمكن تغيير طريقة الدفع بعد تسوية عهدة هذا الطلب');return true}
 const methods=await paymentOptions(order);
 if(!methods.length){toastLocal('لا توجد طريقة دفع متاحة لهذا الفرع');return true}
 const wrap=document.createElement('div');wrap.className='modal';
 wrap.innerHTML=`<div class="modal-card"><h2>💳 تعديل طريقة الدفع</h2><p>بون <b>${escLocal(global.bonDisplay?.(order)||order.bon_number||order.id)}</b> • ${moneyLocal(order.total)}</p><p class="muted">اختر طريقة الدفع الفعلية. لو الطلب لم يُسلّم بعد، تأكيد التغيير سيؤكد التسليم أيضًا لأن طريقة الدفع النهائية تُثبت عند التسليم.</p><label>طريقة الدفع<select data-change-payment>${methods.map(m=>`<option value="${escLocal(m.code)}" ${String(m.code)===String(order.payment_method)?'selected':''}>${escLocal(m.name||m.code)}</option>`).join('')}</select></label><div class="modal-actions"><button class="secondary" data-cancel>إلغاء</button><button class="primary" data-confirm>حفظ طريقة الدفع</button></div></div>`;
 document.body.appendChild(wrap);
 return new Promise(resolve=>{
  wrap.onclick=async e=>{
   if(e.target===wrap||e.target.closest('[data-cancel]')){wrap.remove();resolve(true);return}
   const ok=e.target.closest('[data-confirm]');if(!ok)return;
   const method=wrap.querySelector('[data-change-payment]')?.value||order.payment_method;
   if(String(method)===String(order.payment_method)){toastLocal('طريقة الدفع لم تتغير');wrap.remove();resolve(true);return}
   ok.disabled=true;
   try{
    const out=await global.rpc('delivery_mark_delivered_v2',{p_order_id:Number(order.id),p_payment_method:method,p_client_tx_id:tx('B55-PAYMENT-CHANGE')});
    wrap.remove();hostModal?.remove?.();
    const custody=num(out?.custody_amount);
    toastLocal(custody>0?`تم تغيير طريقة الدفع — ${moneyLocal(custody)} عهدة على المندوب`:'تم تغيير طريقة الدفع — لا توجد عهدة كاش على المندوب');
    if(typeof global.renderDeliveryOrders==='function')await global.renderDeliveryOrders();
    resolve(true);
   }catch(err){ok.disabled=false;toastLocal(err?.message||String(err));resolve(true)}
  };
 });
}

async function markDeliveredInteractive(orderId,hostModal=null){
 if(!isOnline())return false;
 const rows=await global.rest('orders',`select=*&id=eq.${Number(orderId)}&limit=1`);
 const order=rows?.[0];
 if(!order){toastLocal('الأوردر غير موجود');return true}
 const methods=await paymentOptions(order);
 if(!methods.length){toastLocal('لا توجد طريقة دفع متاحة لهذا الفرع');return true}
 const wrap=document.createElement('div');wrap.className='modal';
 wrap.innerHTML=`<div class="modal-card"><h2>✅ تأكيد تسليم الدليفري</h2><p>بون <b>${escLocal(global.bonDisplay?.(order)||order.bon_number||order.id)}</b> • ${moneyLocal(order.total)}</p><p class="muted">اختر طريقة الدفع الفعلية التي استلمها المندوب من العميل.</p><label>طريقة الدفع<select data-final-payment>${methods.map(m=>`<option value="${escLocal(m.code)}" ${String(m.code)===String(order.payment_method)?'selected':''}>${escLocal(m.name||m.code)}</option>`).join('')}</select></label><div class="modal-actions"><button class="secondary" data-cancel>إلغاء</button><button class="primary" data-confirm>تأكيد التسليم</button></div></div>`;
 document.body.appendChild(wrap);
 return new Promise(resolve=>{
  wrap.onclick=async e=>{
   if(e.target===wrap||e.target.closest('[data-cancel]')){wrap.remove();resolve(true);return}
   const ok=e.target.closest('[data-confirm]');if(!ok)return;
   const method=wrap.querySelector('[data-final-payment]')?.value||order.payment_method;
   ok.disabled=true;
   try{
    const out=await global.rpc('delivery_mark_delivered_v2',{p_order_id:Number(order.id),p_payment_method:method,p_client_tx_id:tx('B55-DELIVER')});
    wrap.remove();hostModal?.remove?.();
    const custody=num(out?.custody_amount);
    toastLocal(custody>0?`تم التسليم — ${moneyLocal(custody)} عهدة على المندوب`:'تم التسليم — لا توجد عهدة كاش على المندوب');
    if(typeof global.renderDeliveryOrders==='function')await global.renderDeliveryOrders();
    resolve(true);
   }catch(err){ok.disabled=false;toastLocal(err?.message||String(err));resolve(true)}
  };
 });
}

document.addEventListener('click',e=>{
 const btn=e.target.closest?.('[data-change-delivery-payment]');if(!btn)return;
 if(!isOnline())return;
 const id=Number(btn.dataset.changeDeliveryPayment||lastDeliveryDetailId||0);if(!id)return;
 e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
 changeDeliveryPaymentInteractive(id,btn.closest('.modal')).catch(err=>toastLocal(err?.message||String(err)));
},true);

// Capture the order id before the legacy detail modal is opened. The modal's
// delivered button has no id attribute, so this keeps the interception additive.
document.addEventListener('click',e=>{
 const detail=e.target.closest?.('[data-order-detail]');
 if(detail?.dataset?.orderDetail)lastDeliveryDetailId=Number(detail.dataset.orderDetail);
},true);

document.addEventListener('click',e=>{
 const btn=e.target.closest?.('[data-delivered]');if(!btn)return;
 const raw=btn.dataset.delivered||lastDeliveryDetailId||'';
 if(!isOnline()){
  if(!raw)return;
  const ov2=global.SharawlaOfflineV2Takeover;
  if(typeof ov2?.saveOrderStatus!=='function')return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  ov2.saveOrderStatus(raw,'delivered').then(()=>{
   btn.closest('.modal')?.remove?.();
   toastLocal('تم حفظ التسليم للمزامنة — طريقة الدفع الحالية ستُستخدم عند المزامنة');
   if(typeof global.renderDeliveryOrders==='function')return global.renderDeliveryOrders();
  }).catch(err=>toastLocal(err?.message||String(err)));
  return;
 }
 const id=Number(raw);if(!id)return;
 e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
 markDeliveredInteractive(id,btn.closest('.modal')).catch(err=>toastLocal(err?.message||String(err)));
},true);

// ---------------------------------------------------------------------------
// Shift cash metrics V2. Online values are server-derived; the offline fallback
// preserves the same cash-presence formula and never creates settlements offline.
// ---------------------------------------------------------------------------
const baseShiftMetrics=typeof global.shiftMetrics==='function'?global.shiftMetrics:null;
if(baseShiftMetrics){
 global.shiftMetrics=async function(shift){
  const base=await baseShiftMetrics.call(this,shift);
  let m=null;
  if(isOnline()){
   try{
    m=await global.rpc('shift_cash_metrics_v2',{p_shift_id:Number(shift.id)});
    try{localStorage.setItem(KEY_PREFIX+shift.id,JSON.stringify(m))}catch{}
   }catch(err){console.warn('shift_cash_metrics_v2',err)}
  }
  if(!m){
   let cached=null;try{cached=JSON.parse(localStorage.getItem(KEY_PREFIX+shift.id)||'null')}catch{}
   let deliveryOriginated=0,unsettled=0;
   try{
    const orders=await global.rest('orders',`select=id,total,status,order_type,payment_method,source,payment_status,driver_id,driver_settled_at,delivery_cash_custody_amount&shift_id=eq.${Number(shift.id)}`);
    for(const o of (orders||[])){
     if(o.status==='cancelled'||o.order_type!=='delivery'||String(o.payment_method||'').toLowerCase()!=='cash')continue;
     const website=String(o.source||'')==='website';
     if(website&&o.payment_status!=='confirmed'&&!['delivered','completed'].includes(String(o.status||'')))continue;
     const cash=num(o.total);
     if(num(o.delivery_cash_custody_amount)>0||o.driver_settled_at==null)deliveryOriginated+=cash;
     if(['delivered','completed'].includes(String(o.status||''))&&o.driver_id!=null&&o.driver_settled_at==null){
      unsettled+=num(o.delivery_cash_custody_amount)>0?num(o.delivery_cash_custody_amount):cash;
     }
    }
   }catch(err){console.warn('offline delivery cash fallback',err)}
   const cashReturns=num(base.returnCash);
   const cashGross=num(base.cash)+cashReturns;
   const received=num(cached?.driver_settlements_received);
   m={
    shift_id:Number(shift.id),opening_cash:num(shift.opening_cash),cash_sales_gross:cashGross,
    cash_returns:cashReturns,cash_sales_net:num(base.cash),delivery_cash_originated:deliveryOriginated,
    driver_custody_unsettled:unsettled,driver_settlements_received:received,expenses:num(base.exp),
    expected_drawer_cash:num(shift.opening_cash)+cashGross-deliveryOriginated+received-cashReturns-num(base.exp),offline_fallback:true
   };
  }
  base.cash=num(m.cash_sales_net);
  base.exp=num(m.expenses);
  base.expected=num(m.expected_drawer_cash);
  base.cashSalesGross=num(m.cash_sales_gross);
  base.cashReturns=num(m.cash_returns);
  base.deliveryCashOriginated=num(m.delivery_cash_originated);
  base.driverCustodyUnsettled=num(m.driver_custody_unsettled);
  base.driverSettlementsReceived=num(m.driver_settlements_received);
  base.driverCashV2=m;
  return base;
 };
}

function shiftCashCards(metrics){
 return `<div class="grid kpis driver-shift-cash-v2" data-driver-shift-cash-v2>
  <div class="card kpi"><small>إجمالي كاش المبيعات</small><strong>${moneyLocal(metrics.cashSalesGross)}</strong></div>
  <div class="card kpi"><small>عهدة المناديب غير المسواة</small><strong>${moneyLocal(metrics.driverCustodyUnsettled)}</strong></div>
  <div class="card kpi"><small>تسويات المناديب المستلمة</small><strong>${moneyLocal(metrics.driverSettlementsReceived)}</strong></div>
  <div class="card kpi"><small>الكاش المتوقع فعليًا بالدرج</small><strong>${moneyLocal(metrics.expected)}</strong></div>
 </div>`;
}

const baseRenderShifts=typeof global.renderShifts==='function'?global.renderShifts:null;
if(baseRenderShifts){
 global.renderShifts=async function(){
  await baseRenderShifts.apply(this,arguments);
  try{
   const bid=branchId();
   const open=typeof global.getOpenShift==='function'?await global.getOpenShift():null;
   if(!open)return;
   const metrics=await global.shiftMetrics(open);
   const root=document.querySelector('.shift-current');if(!root)return;
   root.querySelector('[data-driver-shift-cash-v2]')?.remove();
   const closeBar=root.querySelector('.close-shift-bar');
   closeBar?.insertAdjacentHTML('beforebegin',shiftCashCards(metrics));
   const cashKpi=[...root.querySelectorAll('.kpi small')].find(x=>x.textContent.trim()==='كاش');if(cashKpi)cashKpi.textContent='صافي كاش بعد المرتجعات';
   const oldExpected=[...root.querySelectorAll('.shift-pay-grid > div')].find(x=>x.textContent.includes('الكاش المتوقع بالدرج'));
   if(oldExpected)oldExpected.innerHTML=`الكاش المتوقع فعليًا بالدرج <b>${moneyLocal(metrics.expected)}</b>`;

   const closeBtn=root.querySelector('#closeShift');
   if(closeBtn){
    const legacyClose=closeBtn.onclick;
    closeBtn.onclick=async()=>{
     try{
      const actual=Number(document.querySelector('#closingCash')?.value);
      if(!Number.isFinite(actual)||actual<0){toastLocal('اكتب الكاش الفعلي عند القفل بقيمة صفر أو أكبر');return}
      const fresh=await global.shiftMetrics(open);
      const pending=(fresh.orders||[]).filter(o=>(o.order_type==='delivery'&&!['delivered','cancelled','completed'].includes(o.status))||(String(o.source||'')==='website'&&o.order_type!=='delivery'&&!['completed','cancelled'].includes(o.status)));
      if(pending.length){toastLocal(`فيه ${pending.length} أوردر معلق — خلصه أو الغيه قبل القفل`);return}
      const unsettled=num(fresh.driverCustodyUnsettled);
      if(unsettled>0.005){toastLocal(`يوجد عهدة مناديب غير مسواة بقيمة ${moneyLocal(unsettled)} — سوّي العهدة قبل قفل الوردية`);return}
      if(!isOnline())return await legacyClose?.();
      closeBtn.disabled=true;
      const closed=await global.rpc('close_pos_shift_v2',{p_shift_id:Number(open.id),p_closing_cash:actual,p_metrics:{sales_total:fresh.sales,wallet_sales:fresh.wallet,instapay_sales:fresh.instapay,orders_count:fresh.count},p_client_tx_id:tx('B55-SHIFT-CLOSE')});
      try{await global.odbSet?.(`openShift:${open.employee_id}:${bid}`,null)}catch{}
      const diff=num(closed?.cash_difference);
      toastLocal(diff===0?'تم قفل الوردية — الخزنة مظبوطة':`تم القفل — ${diff>0?'زيادة':'عجز'} ${moneyLocal(Math.abs(diff))}`);
      try{if(global.topBurgerDesktop?.backup?.create)await global.topBurgerDesktop.backup.create('shift-close')}catch{}
      if(isOnline()&&global.topBurgerDesktop?.isDesktop&&typeof global.createDesktopFullBackup==='function')global.createDesktopFullBackup('shift-close-full').catch(()=>{});
      await global.renderShifts();
      if(typeof global.openShiftReport==='function'){
       try{const employees=await global.rest('employees','select=id,name,branch_id,role,active&order=name');await global.openShiftReport(closed,employees||[])}catch{}
      }
     }catch(err){
      closeBtn.disabled=false;
      toastLocal(err?.message||String(err));
     }
    };
   }
  }catch(err){console.warn('Beta55 shift cash UI enhancement',err)}
 };
}

// Printed/open shift reports also carry the four separated driver-cash facts.
const baseShiftReportHTML=typeof global.shiftReportHTML==='function'?global.shiftReportHTML:null;
if(baseShiftReportHTML){
 global.shiftReportHTML=function(sh,employees,mtr,data){
  let html=baseShiftReportHTML.apply(this,arguments);
  const closed=!!sh?.closed_at;
  const gross=closed?num(sh.cash_sales_gross):num(mtr?.cashSalesGross);
  const custody=closed?num(sh.driver_custody_unsettled):num(mtr?.driverCustodyUnsettled);
  const received=closed?num(sh.driver_settlements_received):num(mtr?.driverSettlementsReceived);
  const expected=closed?num(sh.expected_cash):num(mtr?.expected);
  const extra=`<hr><div class="r-totals"><div><span>إجمالي كاش المبيعات</span><b>${moneyLocal(gross)}</b></div><div><span>عهدة المناديب غير المسواة</span><b>${moneyLocal(custody)}</b></div><div><span>تسويات المناديب المستلمة</span><b>${moneyLocal(received)}</b></div><div><span>الكاش المتوقع فعليًا بالدرج</span><b>${moneyLocal(expected)}</b></div></div>`;
  return html.replace('<hr><div class="r-footer">',`${extra}<hr><div class="r-footer">`);
 };
}

// ---------------------------------------------------------------------------
// Delivery Orders: operational driver-custody settlement belongs with delivered
// orders. The server RPC remains the sole accounting authority.
// ---------------------------------------------------------------------------
async function enhanceDeliveryOrdersSettlement(){
 if(!isOnline())return;
 const bid=branchId();if(!bid)return;
 const page=document.querySelector('#page');if(!page||!page.querySelector('#deliveryRows'))return;
 let pending=[];try{pending=await global.rpc('delivery_driver_pending_v2',{p_branch_id:bid})||[]}catch(err){console.warn('delivery_driver_pending_v2',err);return}
 const rows=(pending||[]).filter(o=>num(o.custody_amount)>0);
 const byDriver=new Map();for(const o of rows){const did=Number(o.driver_id);if(!byDriver.has(did))byDriver.set(did,[]);byDriver.get(did).push(o)}
 const drivers=global.state?.drivers||[];
 const cards=[...byDriver].map(([did,items])=>{const d=drivers.find(x=>Number(x.id)===did);const amount=items.reduce((a,x)=>a+num(x.custody_amount),0);return `<div class="driver-custody-card panel"><div class="section-head"><div><h3>🛵 ${escLocal(d?.name||`مندوب #${did}`)}</h3><p>عهدة كاش غير مسواة: <b>${moneyLocal(amount)}</b> • ${items.length} طلب</p></div><button class="primary" data-delivery-settle-all-v2="${did}">تسوية كل العهدة</button></div><div class="table-wrap"><table><thead><tr><th>البون</th><th>العهدة</th><th>التسليم</th><th></th></tr></thead><tbody>${items.map(o=>`<tr><td>${escLocal(o.bon_number||o.invoice_number||o.order_id)}</td><td>${moneyLocal(o.custody_amount)}</td><td>${escLocal(global.fmtDate?.(o.delivered_at)||o.delivered_at||'-')}</td><td><button class="secondary" data-delivery-settle-order-v2="${o.order_id}" data-driver-v2="${did}">تسوية العهدة</button></td></tr>`).join('')}</tbody></table></div></div>`}).join('');
 const host=document.createElement('div');host.className='panel delivery-custody-v2';host.setAttribute('data-delivery-custody-v2','');host.innerHTML=`<div class="section-head"><div><h2>💰 عهد المناديب</h2><p>تظهر هنا طلبات الدليفري المسلمة التي ما زال عليها كاش فعلي مع المندوب.</p></div></div>${cards||'<div class="empty">لا توجد عهدة كاش غير مسواة</div>'}`;
 const queue=page.querySelector('.delivery-queue-panel');queue?.insertAdjacentElement('beforebegin',host);
 host.querySelectorAll('[data-delivery-settle-order-v2]').forEach(btn=>btn.onclick=async e=>{
  e.preventDefault();e.stopPropagation();
  const did=Number(btn.dataset.driverV2),oid=Number(btn.dataset.deliverySettleOrderV2);const row=rows.find(x=>Number(x.order_id)===oid);if(!row)return;
  if(global.uiConfirm&&!(await global.uiConfirm(`استلام ${moneyLocal(row.custody_amount)} من المندوب وتسوية عهدة هذا الطلب؟`)))return;
  btn.disabled=true;try{await global.rpc('delivery_driver_settle_v2',{p_driver_id:did,p_order_ids:[oid],p_client_tx_id:tx('B55-DELIVERY-SETTLE-ONE')});toastLocal('تمت تسوية العهدة ودخل المبلغ في كاش الوردية الحالية');await global.renderDeliveryOrders()}catch(err){btn.disabled=false;toastLocal(err?.message||String(err))}
 });
 host.querySelectorAll('[data-delivery-settle-all-v2]').forEach(btn=>btn.onclick=async e=>{
  e.preventDefault();e.stopPropagation();
  const did=Number(btn.dataset.deliverySettleAllV2),items=byDriver.get(did)||[],amount=items.reduce((a,x)=>a+num(x.custody_amount),0);
  if(global.uiConfirm&&!(await global.uiConfirm(`استلام وتسوية كل عهدة المندوب: ${items.length} طلب بإجمالي ${moneyLocal(amount)}؟`)))return;
  btn.disabled=true;try{await global.rpc('delivery_driver_settle_v2',{p_driver_id:did,p_order_ids:null,p_client_tx_id:tx('B55-DELIVERY-SETTLE-ALL')});toastLocal('تمت تسوية كل عهدة المندوب ودخل المبلغ في كاش الوردية الحالية');await global.renderDeliveryOrders()}catch(err){btn.disabled=false;toastLocal(err?.message||String(err))}
 });
}
const baseRenderDeliveryOrdersSettlement=typeof global.renderDeliveryOrders==='function'?global.renderDeliveryOrders:null;
if(baseRenderDeliveryOrdersSettlement){
 global.renderDeliveryOrders=async function(){await baseRenderDeliveryOrdersSettlement.apply(this,arguments);try{await enhanceDeliveryOrdersSettlement()}catch(err){console.warn('Beta55 delivery orders settlement UI',err)}};
}

// ---------------------------------------------------------------------------
// Delivery settings: keep existing driver/zone CRUD, replace only settlement UI.
// ---------------------------------------------------------------------------
async function enhanceDeliverySettings(){
 const bid=branchId();if(!bid)return;
 const page=document.querySelector('#page');if(!page)return;
 const panels=[...page.querySelectorAll('.panel')];
 const panel=panels.find(p=>p.querySelector('h2')?.textContent?.includes('تسويات المناديب'));
 if(!panel)return;
 // Fail closed before the first await. app.js initially renders the legacy
 // settlement controls, whose handler settles by payment_method + order total.
 // A user could click that stale owner while the V2 pending RPC was loading.
 panel.innerHTML='<h2>💰 عهد وتسويات المناديب</h2><p class="muted" data-settlement-v2-loading>جاري تحميل العهد النقدية الفعلية...</p>';
 let pending=[];try{pending=await global.rpc('delivery_driver_pending_v2',{p_branch_id:bid})||[]}catch(err){panel.innerHTML=`<h2>💰 عهد وتسويات المناديب</h2><p class="negative">${escLocal(err?.message||String(err))}</p>`;return}
 const settlements=await global.rest('driver_settlements',`select=id,driver_id,branch_id,employee_id,orders_count,amount,created_at,receiving_shift_id,status&branch_id=eq.${bid}&status=eq.posted&order=created_at.desc&limit=50`).catch(()=>[]);
 const byDriver=new Map();
 for(const o of pending){const k=Number(o.driver_id);if(!byDriver.has(k))byDriver.set(k,[]);byDriver.get(k).push(o)}
 const drivers=(global.state?.drivers||[]).filter(d=>Number(d.branch_id)===bid);
 const allDriverIds=new Set([...drivers.map(d=>Number(d.id)),...byDriver.keys()]);
 const driverBlock=[...allDriverIds].map(did=>{
  const d=drivers.find(x=>Number(x.id)===did);const rows=byDriver.get(did)||[];const amount=rows.reduce((a,x)=>a+num(x.custody_amount),0);
  return `<div class="panel driver-custody-card"><div class="section-head"><div><h3>🛵 ${escLocal(d?.name||`مندوب #${did}`)}</h3><p>عهدة غير مسواة: <b>${moneyLocal(amount)}</b> • ${rows.length} أوردر</p></div>${rows.length?`<button class="primary" data-settle-all-v2="${did}">تسوية الكل</button>`:''}</div>${rows.length?`<div class="table-wrap"><table><thead><tr><th>البون</th><th>وردية البيع</th><th>التسليم</th><th>العهدة</th><th></th></tr></thead><tbody>${rows.map(o=>`<tr><td>${escLocal(o.bon_number||o.invoice_number||o.order_id)}</td><td>#${escLocal(o.source_shift_id||'-')}</td><td>${escLocal(global.fmtDate?.(o.delivered_at)||o.delivered_at||'-')}</td><td>${moneyLocal(o.custody_amount)}</td><td><button class="secondary" data-settle-order-v2="${o.order_id}" data-driver-v2="${did}">تسوية الأوردر</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">لا توجد عهدة كاش معلقة</div>'}</div>`;
 }).join('');
 panel.innerHTML=`<h2>💰 عهد وتسويات المناديب</h2><p>الكاش يظل عهدة على المندوب حتى يتم استلامه داخل وردية مفتوحة. التسوية المالية Online فقط.</p><div class="driver-settle-v2-list">${driverBlock||'<div class="empty">لا يوجد مناديب في هذا الفرع</div>'}</div>${settlements.length?`<h3>آخر التسويات المستلمة</h3><div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>المندوب</th><th>وردية الاستلام</th><th>الطلبات</th><th>المبلغ</th></tr></thead><tbody>${settlements.map(s=>`<tr><td>${escLocal(global.fmtDate?.(s.created_at)||s.created_at)}</td><td>${escLocal(global.driverName?.(s.driver_id)||`#${s.driver_id}`)}</td><td>${s.receiving_shift_id?`#${s.receiving_shift_id}`:'Legacy'}</td><td>${s.orders_count}</td><td>${moneyLocal(s.amount)}</td></tr>`).join('')}</tbody></table></div>`:''}`;

 panel.querySelectorAll('[data-settle-order-v2]').forEach(btn=>btn.onclick=async()=>{
  if(!isOnline())return toastLocal('تسوية عهدة المناديب متاحة Online فقط');
  const did=Number(btn.dataset.driverV2),oid=Number(btn.dataset.settleOrderV2);const row=pending.find(x=>Number(x.order_id)===oid);
  if(global.uiConfirm&&!(await global.uiConfirm(`استلام ${moneyLocal(row?.custody_amount)} من المندوب وتسوية هذا الأوردر؟`)))return;
  btn.disabled=true;try{await global.rpc('delivery_driver_settle_v2',{p_driver_id:did,p_order_ids:[oid],p_client_tx_id:tx('B55-SETTLE-ONE')});toastLocal('تمت تسوية الأوردر ودخل المبلغ في كاش الوردية الحالية');await global.renderDeliverySettings()}catch(err){btn.disabled=false;toastLocal(err?.message||String(err))}
 });
 panel.querySelectorAll('[data-settle-all-v2]').forEach(btn=>btn.onclick=async()=>{
  if(!isOnline())return toastLocal('تسوية عهدة المناديب متاحة Online فقط');
  const did=Number(btn.dataset.settleAllV2),rows=byDriver.get(did)||[],amount=rows.reduce((a,x)=>a+num(x.custody_amount),0);
  if(global.uiConfirm&&!(await global.uiConfirm(`تسوية كل عهدة المندوب: ${rows.length} أوردر بإجمالي ${moneyLocal(amount)}؟`)))return;
  btn.disabled=true;try{await global.rpc('delivery_driver_settle_v2',{p_driver_id:did,p_order_ids:null,p_client_tx_id:tx('B55-SETTLE-ALL')});toastLocal('تمت تسوية كل العهدة ودخل المبلغ في كاش الوردية الحالية');await global.renderDeliverySettings()}catch(err){btn.disabled=false;toastLocal(err?.message||String(err))}
 });
}

const baseRenderDeliverySettings=typeof global.renderDeliverySettings==='function'?global.renderDeliverySettings:null;
if(baseRenderDeliverySettings){
 global.renderDeliverySettings=async function(){await baseRenderDeliverySettings.apply(this,arguments);try{await enhanceDeliverySettings()}catch(err){console.warn('Beta55 delivery settlement UI',err)}};
}

global.__SharawlaDeliverySettlementShiftCashV55=Object.freeze({version:VERSION,markDeliveredInteractive,changeDeliveryPaymentInteractive,enhanceDeliverySettings,onlineSettlementOnly:true,shiftCashV2:true});
global.dispatchEvent(new CustomEvent('sharawla-beta55-delivery-settlement-ready',{detail:{version:VERSION}}));
})(window);
