(function(global){
  'use strict';

  const qs=(s,r=document)=>r.querySelector(s);
  const qsa=(s,r=document)=>[...r.querySelectorAll(s)];
  const escHtml=v=>String(v??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const money=v=>Number(v||0).toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2});
  const qty=v=>Number(v||0).toLocaleString('ar-EG',{maximumFractionDigits:3});
  const dt=v=>v?new Date(v).toLocaleString('ar-EG',{dateStyle:'short',timeStyle:'short'}):'—';
  const statusLabel=s=>({pending:'جديد',accepted:'تم القبول',rejected:'مرفوض',cancelled:'ألغاه العميل',expired:'انتهى الحجز'}[s]||s||'—');
  const statusClass=s=>({pending:'warning',accepted:'success',rejected:'danger',cancelled:'muted',expired:'muted'}[s]||'muted');

  let currentStatus='pending';
  let notificationBusy=false;
  let notificationsPrimed=false;
  let pendingCount=0;
  const seenPending=new Set();
  const SEEN_KEY='sharawlaRetailWebsiteSeenPendingV1';

  function isRetailRuntime(){
    try{return typeof global.runtimeAllPages==='function' && global.runtimeAllPages().includes('marketSettings')}catch{return false}
  }

  function canShow(){
    if(!isRetailRuntime())return false;
    try{return typeof global.canAccessPage!=='function'||global.canAccessPage('websiteManagement')}catch{return false}
  }

  function toastMsg(msg){
    try{if(typeof global.toast==='function')return global.toast(msg)}catch{}
    console.log('[Retail Website]',msg);
  }

  function activeBranch(){
    try{return Number(global.currentBranchId?.()||0)}catch{return 0}
  }

  function loadSeen(){
    try{for(const id of JSON.parse(localStorage.getItem(SEEN_KEY)||'[]'))seenPending.add(String(id))}catch{}
  }

  function saveSeen(){
    try{localStorage.setItem(SEEN_KEY,JSON.stringify([...seenPending].slice(-300)))}catch{}
  }

  async function loadOrders(status=currentStatus){
    const branchId=activeBranch();
    if(!branchId)throw new Error('اختر الفرع أولًا');
    const statusFilter=status==='all'?'':`&status=eq.${encodeURIComponent(status)}`;
    const activeReservationFilter=status==='pending'?`&reservation_expires_at=gt.${encodeURIComponent(new Date().toISOString())}`:'';
    return global.rest('retail_website_orders',`select=id,public_order_code,branch_id,customer_name,customer_phone,order_type,payment_method_code,payment_status,subtotal,offer_discount,delivery_fee,total,status,reservation_expires_at,accepted_order_id,created_at&branch_id=eq.${branchId}${statusFilter}${activeReservationFilter}&order=created_at.desc&limit=100`);
  }

  function updateBadge(rows,status){
    if(status==='pending')pendingCount=Array.isArray(rows)?rows.length:0;
    const b=qs('#retailWebsiteOrdersNav');if(!b)return;
    b.innerHTML=`🛒 طلبات الموقع${pendingCount?` <span class="nav-count">${pendingCount}</span>`:''}`;
  }

  function playOrderSound(){
    try{
      const Ctx=global.AudioContext||global.webkitAudioContext;
      if(!Ctx)return;
      const ctx=new Ctx(),osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.connect(gain);gain.connect(ctx.destination);osc.frequency.value=880;gain.gain.value=.08;osc.start();
      setTimeout(()=>{try{osc.stop();ctx.close()}catch{}},260);
    }catch{}
  }

  function showOrderAlert(o){
    playOrderSound();
    const old=qs('#retailWebsiteOrderAlert');if(old)old.remove();
    const box=document.createElement('div');
    box.id='retailWebsiteOrderAlert';box.className='modal';
    box.innerHTML=`<div class="modal-card"><h2>🔔 طلب موقع جديد</h2><p><b>${escHtml(o.public_order_code||('#'+o.id))}</b></p><p>${escHtml(o.customer_name||'عميل')} · <span dir="ltr">${escHtml(o.customer_phone||'')}</span></p><p>الإجمالي: <b>${money(o.total)}</b></p><div class="modal-actions"><button class="secondary" data-rw-dismiss>لاحقًا</button><button class="primary" data-rw-open>فتح الطلب</button></div></div>`;
    document.body.appendChild(box);
    box.onclick=e=>{
      if(e.target===box||e.target.closest('[data-rw-dismiss]'))box.remove();
      if(e.target.closest('[data-rw-open]')){box.remove();currentStatus='pending';render()}
    };
    toastMsg(`طلب موقع جديد ${o.public_order_code||('#'+o.id)}`);
  }

  async function pollPending(){
    if(notificationBusy||!navigator.onLine||!canShow())return;
    notificationBusy=true;
    try{
      const rows=await loadOrders('pending');
      updateBadge(rows,'pending');

      // First successful poll only seeds the current pending set. Old requests
      // must not ring as new after install/restart.
      if(!notificationsPrimed){
        for(const o of rows||[])seenPending.add(String(o.id));
        saveSeen();
        notificationsPrimed=true;
        return;
      }

      const fresh=[];
      for(const o of [...(rows||[])].reverse()){
        const key=String(o.id);
        if(!seenPending.has(key)){seenPending.add(key);fresh.push(o)}
      }
      if(fresh.length){saveSeen();showOrderAlert(fresh[fresh.length-1])}
    }catch(e){
      console.warn('[Retail Website] notification poll',e?.message||e);
    }finally{
      notificationBusy=false;
    }
  }

  function renderShell(){
    const page=qs('#page');
    if(!page)return;
    const title=qs('#pageTitle');
    if(title)title.textContent='طلبات الموقع Retail';
    qsa('#nav button').forEach(b=>b.classList.remove('active'));
    qs('#retailWebsiteOrdersNav')?.classList.add('active');
    page.innerHTML=`
      <div class="panel retail-web-orders-panel">
        <div class="section-head">
          <div>
            <h2>🛒 طلبات الموقع Retail</h2>
            <p class="muted">طلبات الموقع قبل تحويلها لفاتورة Retail. القبول يعيد التحقق من الحجز والمخزون ويتطلب وردية مفتوحة.</p>
          </div>
          <div class="inline-actions">
            <button id="retailWebRefresh" type="button">🔄 تحديث</button>
            <button id="retailWebBack" type="button">🌐 إدارة الموقع</button>
          </div>
        </div>
        <div class="filter-row retail-web-filters">
          <button data-rw-status="pending" class="primary">جديد</button>
          <button data-rw-status="accepted">تم القبول</button>
          <button data-rw-status="rejected">مرفوض</button>
          <button data-rw-status="cancelled">ملغي</button>
          <button data-rw-status="expired">منتهي</button>
          <button data-rw-status="all">الكل</button>
        </div>
        <div id="retailWebOrdersBody"><p class="muted">جاري تحميل الطلبات…</p></div>
      </div>`;
    qs('#retailWebRefresh').onclick=refresh;
    qs('#retailWebBack').onclick=()=>global.showPage?.('websiteManagement');
    qsa('[data-rw-status]').forEach(b=>b.onclick=()=>{currentStatus=b.dataset.rwStatus;qsa('[data-rw-status]').forEach(x=>x.classList.toggle('primary',x===b));refresh()});
  }

  function orderCard(o){
    const exp=o.status==='pending'&&o.reservation_expires_at?`<small>الحجز حتى: ${escHtml(dt(o.reservation_expires_at))}</small>`:'';
    return `<article class="panel retail-web-order-card" data-rw-id="${Number(o.id)}">
      <div class="section-head">
        <div><h3>${escHtml(o.public_order_code||('#'+o.id))}</h3><p class="muted">${escHtml(o.customer_name)} · <span dir="ltr">${escHtml(o.customer_phone)}</span></p></div>
        <div><span class="status ${statusClass(o.status)}">${escHtml(statusLabel(o.status))}</span></div>
      </div>
      <div class="settings-list compact">
        <div class="setting-switch"><span>نوع الطلب</span><b>${o.order_type==='delivery'?'توصيل':'استلام فرع'}</b></div>
        <div class="setting-switch"><span>الدفع</span><b>${escHtml(o.payment_method_code||'cash')} · ${escHtml(o.payment_status||'unpaid')}</b></div>
        <div class="setting-switch"><span>الإجمالي</span><b>${money(o.total)}</b></div>
        <div class="setting-switch"><span>الوقت</span><b>${escHtml(dt(o.created_at))}</b></div>
      </div>
      ${exp}
      <div class="inline-actions">
        <button data-rw-action="details" data-id="${Number(o.id)}">📋 التفاصيل</button>
        ${o.status==='pending'?`<button class="primary" data-rw-action="accept" data-id="${Number(o.id)}">✅ قبول وتحويل لفاتورة</button><button class="danger" data-rw-action="reject" data-id="${Number(o.id)}">❌ رفض</button>`:''}
      </div>
    </article>`;
  }

  async function refresh(){
    const body=qs('#retailWebOrdersBody');
    if(!body)return;
    if(!navigator.onLine){body.innerHTML='<div class="empty-state">طلبات الموقع تحتاج اتصال إنترنت. البيع الأوفلاين داخل الكاشير يظل مستقلًا.</div>';return}
    body.innerHTML='<p class="muted">جاري تحميل الطلبات…</p>';
    try{
      const rows=await loadOrders();
      body.innerHTML=rows?.length?`<div class="retail-web-order-list">${rows.map(orderCard).join('')}</div>`:'<div class="empty-state">لا توجد طلبات في هذه الحالة.</div>';
      qsa('[data-rw-action="details"]',body).forEach(b=>b.onclick=()=>openDetails(Number(b.dataset.id)));
      qsa('[data-rw-action="accept"]',body).forEach(b=>b.onclick=()=>acceptOrder(Number(b.dataset.id),b));
      qsa('[data-rw-action="reject"]',body).forEach(b=>b.onclick=()=>openRejectModal(Number(b.dataset.id),b));
      updateBadge(rows,currentStatus);
    }catch(e){body.innerHTML=`<div class="empty-state">${escHtml(e.message||e)}</div>`}
  }

  async function openDetails(id){
    try{
      const d=await global.rpc('retail_website_order_details',{p_retail_website_order_id:id});
      const o=d?.order||{};const items=Array.isArray(d?.items)?d.items:[];
      const page=qs('#page'); if(!page)return;
      page.innerHTML=`<div class="panel">
        <div class="section-head"><div><h2>📋 ${escHtml(o.public_order_code||('#'+id))}</h2><p class="muted">${escHtml(o.customer_name||'')} · <span dir="ltr">${escHtml(o.customer_phone||'')}</span></p></div><button id="rwDetailsBack">رجوع</button></div>
        <div class="settings-list">
          <div class="setting-switch"><span>الحالة</span><b>${escHtml(statusLabel(o.status))}</b></div>
          <div class="setting-switch"><span>نوع الطلب</span><b>${o.order_type==='delivery'?'توصيل':'استلام فرع'}</b></div>
          <div class="setting-switch"><span>العنوان</span><b>${escHtml(o.customer_address||'—')}</b></div>
          <div class="setting-switch"><span>ملاحظات العميل</span><b>${escHtml(o.customer_notes||'—')}</b></div>
          <div class="setting-switch"><span>طريقة الدفع</span><b>${escHtml(o.payment_method_code||'—')}</b></div>
          <div class="setting-switch"><span>مرجع الدفع</span><b>${escHtml(o.payment_reference||'—')}</b></div>
        </div>
        <div class="table-wrap"><table><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>خصم العرض</th><th>الإجمالي</th></tr></thead><tbody>${items.map(i=>`<tr><td>${escHtml(i.product_name)}</td><td>${qty(i.quantity)} ${escHtml(i.unit_type||'')}</td><td>${money(i.unit_price)}</td><td>${money(i.offer_discount)}</td><td>${money(i.line_total)}</td></tr>`).join('')}</tbody></table></div>
        <div class="settings-list">
          <div class="setting-switch"><span>الإجمالي قبل الخصم</span><b>${money(o.subtotal)}</b></div>
          <div class="setting-switch"><span>خصم العروض</span><b>${money(o.offer_discount)}</b></div>
          <div class="setting-switch"><span>التوصيل</span><b>${money(o.delivery_fee)}</b></div>
          <div class="setting-switch"><span>الإجمالي النهائي</span><b>${money(o.total)}</b></div>
        </div>
        ${o.status==='pending'?`<div class="inline-actions"><button id="rwAcceptDetails" class="primary">✅ قبول وتحويل لفاتورة</button><button id="rwRejectDetails" class="danger">❌ رفض الطلب</button></div>`:''}
      </div>`;
      qs('#rwDetailsBack').onclick=render;
      if(qs('#rwAcceptDetails'))qs('#rwAcceptDetails').onclick=()=>acceptOrder(id,qs('#rwAcceptDetails'));
      if(qs('#rwRejectDetails'))qs('#rwRejectDetails').onclick=()=>openRejectModal(id,qs('#rwRejectDetails'));
    }catch(e){toastMsg(e.message||String(e))}
  }

  async function acceptOrder(id,btn){
    if(!navigator.onLine)return toastMsg('قبول طلب الموقع يحتاج اتصال إنترنت');
    if(btn)btn.disabled=true;
    try{
      const orderId=await global.rpc('accept_retail_website_order',{p_retail_website_order_id:id});
      seenPending.add(String(id));saveSeen();
      toastMsg(`تم قبول طلب الموقع وتحويله لفاتورة #${orderId}`);
      currentStatus='pending';
      render();
      pollPending();
    }catch(e){toastMsg(e.message||String(e));if(btn)btn.disabled=false}
  }

  function openRejectModal(id,sourceBtn){
    const old=qs('#retailRejectOrderModal');if(old)old.remove();
    const m=document.createElement('div');
    m.id='retailRejectOrderModal';m.className='modal';
    m.innerHTML=`<div class="modal-card"><h2>❌ رفض طلب الموقع</h2><p>سيتم رفض الطلب وفك حجز المخزون المرتبط به.</p><label>سبب الرفض (اختياري)<textarea id="retailRejectReason" rows="3" maxlength="300" placeholder="مثال: الصنف غير متاح"></textarea></label><div class="modal-actions"><button class="secondary" data-rw-cancel-reject>إلغاء</button><button class="danger" data-rw-confirm-reject>تأكيد الرفض</button></div></div>`;
    document.body.appendChild(m);
    const close=()=>m.remove();
    m.onclick=e=>{if(e.target===m||e.target.closest('[data-rw-cancel-reject]'))close()};
    qs('[data-rw-confirm-reject]',m).onclick=async()=>{
      const btn=qs('[data-rw-confirm-reject]',m),reason=String(qs('#retailRejectReason',m)?.value||'').trim();
      btn.disabled=true;
      try{
        await global.rpc('reject_retail_website_order',{p_retail_website_order_id:id,p_reason:reason});
        seenPending.add(String(id));saveSeen();
        close();
        toastMsg('تم رفض الطلب وفك حجز المخزون');
        currentStatus='pending';
        render();
        pollPending();
      }catch(e){
        toastMsg(e.message||String(e));
        btn.disabled=false;
        if(sourceBtn)sourceBtn.disabled=false;
      }
    };
  }

  function render(){
    if(!canShow())return global.showPage?.('home');
    renderShell();
    refresh();
  }

  function ensureNav(){
    const nav=qs('#nav');if(!nav)return;
    let b=qs('#retailWebsiteOrdersNav');
    if(!b){
      b=document.createElement('button');
      b.id='retailWebsiteOrdersNav';b.type='button';b.textContent='🛒 طلبات الموقع';
      const websiteBtn=nav.querySelector('button[data-page="websiteManagement"]');
      nav.insertBefore(b,websiteBtn||nav.querySelector('#logoutMenuBtn'));
      b.onclick=render;
    }
    b.classList.toggle('hidden',!canShow());
    updateBadge(null,'keep');
  }

  loadSeen();
  setInterval(ensureNav,1200);
  setInterval(()=>pollPending(),10000);
  setTimeout(()=>pollPending(),1800);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){ensureNav();pollPending()}});
  global.renderRetailWebsiteOrders=render;
})(window);
