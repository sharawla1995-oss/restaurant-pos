(function(){
  'use strict';

  const C=window.SHARAWLA_RETAIL_SITE||{};
  const qs=s=>document.querySelector(s);
  const qsa=s=>[...document.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const n=v=>Number(v||0);
  const money=v=>n(v).toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+(C.currency||'EGP');
  const qtyFmt=v=>n(v).toLocaleString('ar-EG',{maximumFractionDigits:3});
  const key='sharawlaRetailCartV1';

  let bootstrap=null;
  let branchId=Number(C.defaultBranchId||0);
  let catalog=[];
  let category='all';
  let cart=[];
  let quote=null;

  function toast(msg){const el=qs('#toast');el.textContent=String(msg||'');el.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.add('hidden'),3500)}
  function apiReady(){return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(String(C.supabaseUrl||'').replace(/\/$/,''))&&String(C.publishableKey||'').startsWith('sb_publishable_')}
  async function rpc(name,payload={}){
    if(!apiReady())throw new Error('إعداد الموقع غير مكتمل: Supabase URL / Publishable Key');
    const url=String(C.supabaseUrl).replace(/\/$/,'')+'/rest/v1/rpc/'+name;
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','apikey':C.publishableKey,'Authorization':'Bearer '+C.publishableKey},body:JSON.stringify(payload)});
    let d=null;try{d=await r.json()}catch{}
    if(!r.ok)throw new Error(d?.message||d?.hint||('خطأ '+r.status));
    return d;
  }
  function cartStorageKey(){return key+':'+String(branchId||0)}
  function loadCart(){try{cart=JSON.parse(localStorage.getItem(cartStorageKey())||'[]');if(!Array.isArray(cart))cart=[]}catch{cart=[]}}
  function saveCart(){localStorage.setItem(cartStorageKey(),JSON.stringify(cart));updateCartCount()}
  function updateCartCount(){qs('#cartCount').textContent=cart.length?String(cart.reduce((s,x)=>s+n(x.quantity),0).toFixed(3).replace(/\.000$/,'')):'0'}
  function branch(){return (bootstrap?.branches||[]).find(b=>Number(b.id)===Number(branchId))||null}
  function branchPayments(){return (bootstrap?.payment_methods||[]).filter(x=>Number(x.branch_id)===Number(branchId))}
  function branchZones(){return (bootstrap?.delivery_zones||[]).filter(x=>Number(x.branch_id)===Number(branchId))}
  function product(id){return catalog.find(x=>Number(x.product_id)===Number(id))}
  function cartPayload(){return cart.map(x=>({product_id:Number(x.product_id),quantity:Number(x.quantity)}))}

  function applyTheme(){
    const s=bootstrap?.site||{};
    if(s.page_background)document.documentElement.style.setProperty('--bg',s.page_background);
    if(s.surface_color)document.documentElement.style.setProperty('--surface',s.surface_color);
    if(s.text_color)document.documentElement.style.setProperty('--text',s.text_color);
    if(Number.isFinite(Number(s.card_radius)))document.documentElement.style.setProperty('--radius',Number(s.card_radius)+'px');
  }

  async function init(){
    qs('#brandName').textContent=C.displayName||'Sharawla Retail';
    qs('#heroTitle').textContent=C.heroTitle||'اختار احتياجاتك وإحنا نجهزها';
    if(C.logoUrl){qs('#brandLogo').src=C.logoUrl;qs('#brandLogo').classList.remove('hidden')}
    wireStatic();
    if(!apiReady()){
      qs('#catalogGrid').innerHTML='<div class="empty">انسخ config.example.js إلى config.js وضع Supabase URL وPublishable Key الخاصين ببيئة الاختبار.</div>';
      return;
    }
    try{
      bootstrap=await rpc('retail_website_bootstrap');
      if(!bootstrap?.ok)throw new Error('تعذر تحميل إعدادات الموقع');
      applyTheme();
      renderBranches();
      if(!branchId)branchId=Number(bootstrap.branches?.[0]?.id||0);
      qs('#branchSelect').value=String(branchId||'');
      loadCart();updateCartCount();
      await loadCatalog();
      renderCheckoutOptions();
    }catch(e){qs('#catalogGrid').innerHTML='<div class="empty">'+esc(e.message)+'</div>';toast(e.message)}
  }

  function wireStatic(){
    qs('#cartBtn').onclick=openCart;
    qs('#closeCart').onclick=()=>qs('#cartDrawer').classList.add('hidden');
    qs('#checkoutBtn').onclick=openCheckout;
    qs('#closeCheckout').onclick=()=>qs('#checkoutModal').classList.add('hidden');
    qs('#checkoutForm').onsubmit=submitOrder;
    qs('#orderType').onchange=()=>{renderDeliveryFields();refreshQuote(true)};
    qs('#deliveryZone').onchange=()=>refreshQuote(true);
    qs('#paymentMethod').onchange=renderPaymentReference;
    qs('#trackBtn').onclick=()=>qs('#trackingModal').classList.remove('hidden');
    qs('#closeTracking').onclick=()=>qs('#trackingModal').classList.add('hidden');
    qs('#trackingForm').onsubmit=trackOrder;
    qs('#branchSelect').onchange=async()=>{
      branchId=Number(qs('#branchSelect').value||0);loadCart();updateCartCount();quote=null;
      await loadCatalog();renderCheckoutOptions();
    };
    qs('#cartDrawer').onclick=e=>{if(e.target===qs('#cartDrawer'))qs('#cartDrawer').classList.add('hidden')};
    qs('#checkoutModal').onclick=e=>{if(e.target===qs('#checkoutModal'))qs('#checkoutModal').classList.add('hidden')};
    qs('#trackingModal').onclick=e=>{if(e.target===qs('#trackingModal'))qs('#trackingModal').classList.add('hidden')};
  }

  function renderBranches(){
    const sel=qs('#branchSelect');
    const rows=bootstrap?.branches||[];
    sel.innerHTML=rows.map(b=>`<option value="${Number(b.id)}">${esc(b.name)}${b.orders_open?'':' — مغلق'}</option>`).join('');
    if(branchId&&!rows.some(b=>Number(b.id)===branchId))branchId=0;
    if(!branchId)branchId=Number(rows[0]?.id||0);
  }

  async function loadCatalog(){
    const b=branch();
    qs('#branchStatus').textContent=b?(b.orders_open?`مفتوح للطلبات · تجهيز ${b.prep_min||30}–${b.prep_max||45} دقيقة`:'مغلق للطلبات'):'—';
    qs('#closedBanner').classList.toggle('hidden',!!b?.orders_open);
    if(!branchId){catalog=[];renderCatalog();return}
    qs('#catalogGrid').innerHTML='<div class="loading">جاري تحميل الأصناف…</div>';
    try{catalog=await rpc('retail_website_catalog',{p_branch_id:branchId})||[];category='all';renderCategories();renderCatalog()}catch(e){catalog=[];qs('#catalogGrid').innerHTML='<div class="empty">'+esc(e.message)+'</div>'}
  }

  function renderCategories(){
    const cats=[];const seen=new Set();
    catalog.forEach(p=>{const id=String(p.category_id??'none');if(!seen.has(id)){seen.add(id);cats.push({id,name:p.category_name||'أخرى'})}});
    qs('#categoryBar').innerHTML=`<button class="${category==='all'?'active':''}" data-cat="all">الكل</button>`+cats.map(c=>`<button class="${category===c.id?'active':''}" data-cat="${esc(c.id)}">${esc(c.name)}</button>`).join('');
    qsa('#categoryBar button').forEach(b=>b.onclick=()=>{category=b.dataset.cat;renderCategories();renderCatalog()});
  }

  function renderCatalog(){
    const rows=catalog.filter(p=>category==='all'||String(p.category_id??'none')===category);
    qs('#catalogGrid').innerHTML=rows.length?rows.map(p=>{
      const available=n(p.available_qty);const disabled=available<=0||!branch()?.orders_open;
      return `<article class="product-card">
        <div class="product-image">${p.image_url?`<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy">`:'🛍️'}</div>
        <div class="product-body"><h3>${esc(p.name)}</h3><div class="product-meta"><span>${esc(p.category_name||'')}</span><span>متاح ${qtyFmt(available)} ${esc(p.unit_type||'')}</span></div><div class="price">${money(p.price)}</div><button class="primary" data-add="${Number(p.product_id)}" ${disabled?'disabled':''}>${disabled?'غير متاح':'أضف للسلة'}</button></div>
      </article>`
    }).join(''):'<div class="empty">لا توجد أصناف متاحة.</div>';
    qsa('[data-add]').forEach(b=>b.onclick=()=>addToCart(Number(b.dataset.add)));
  }

  function normalizedQty(p,value){
    const step=Math.max(.001,n(p.qty_step)||1);const min=Math.max(.001,n(p.min_qty)||step);let v=Math.max(min,n(value)||min);
    v=Math.round(v/step)*step;if(!p.allow_decimal)v=Math.round(v);return Number(v.toFixed(3));
  }
  function addToCart(id){
    const p=product(id);if(!p)return;
    const existing=cart.find(x=>Number(x.product_id)===id);
    const step=Math.max(.001,n(p.qty_step)||1);
    if(existing)existing.quantity=normalizedQty(p,n(existing.quantity)+step);else cart.push({product_id:id,quantity:normalizedQty(p,p.min_qty||step)});
    saveCart();toast('تمت الإضافة للسلة');
  }

  function openCart(){qs('#cartDrawer').classList.remove('hidden');renderCart();refreshQuote(false)}
  function renderCart(){
    const wrap=qs('#cartItems');
    if(!cart.length){wrap.innerHTML='<div class="empty">السلة فارغة.</div>';qs('#quoteBox').innerHTML='';qs('#checkoutBtn').disabled=true;return}
    qs('#checkoutBtn').disabled=false;
    wrap.innerHTML=cart.map(x=>{const p=product(x.product_id);if(!p)return'';return `<div class="cart-line" data-cart="${Number(x.product_id)}"><div><h4>${esc(p.name)}</h4><small>${money(p.price)} · ${esc(p.unit_type||'')}</small></div><div class="qty-controls"><button data-dec="${Number(x.product_id)}">−</button><input data-qty="${Number(x.product_id)}" type="number" min="${n(p.min_qty)||.001}" step="${n(p.qty_step)||1}" value="${n(x.quantity)}"><button data-inc="${Number(x.product_id)}">+</button><button class="danger-btn" data-remove="${Number(x.product_id)}">🗑</button></div></div>`}).join('');
    qsa('[data-inc]').forEach(b=>b.onclick=()=>changeQty(Number(b.dataset.inc),1));
    qsa('[data-dec]').forEach(b=>b.onclick=()=>changeQty(Number(b.dataset.dec),-1));
    qsa('[data-remove]').forEach(b=>b.onclick=()=>removeItem(Number(b.dataset.remove)));
    qsa('[data-qty]').forEach(inp=>inp.onchange=()=>setQty(Number(inp.dataset.qty),inp.value));
  }
  function changeQty(id,dir){const x=cart.find(i=>Number(i.product_id)===id),p=product(id);if(!x||!p)return;const step=Math.max(.001,n(p.qty_step)||1);const next=n(x.quantity)+dir*step;if(next<Math.max(.001,n(p.min_qty)||step))return removeItem(id);x.quantity=normalizedQty(p,next);saveCart();renderCart();refreshQuote(false)}
  function setQty(id,value){const x=cart.find(i=>Number(i.product_id)===id),p=product(id);if(!x||!p)return;x.quantity=normalizedQty(p,value);saveCart();renderCart();refreshQuote(false)}
  function removeItem(id){cart=cart.filter(x=>Number(x.product_id)!==id);saveCart();renderCart();refreshQuote(false)}

  function quoteHtml(q){if(!q)return'<span>سيتم التحقق من السعر والمخزون من السيرفر.</span>';return `<div class="summary-row"><span>قبل الخصم</span><b>${money(q.subtotal)}</b></div><div class="summary-row"><span>خصم العروض</span><b>− ${money(q.offer_discount)}</b></div><div class="summary-row"><span>التوصيل</span><b>${money(q.delivery_fee)}</b></div><div class="summary-row total"><span>الإجمالي</span><b>${money(q.total)}</b></div>`}
  async function refreshQuote(checkout){
    const target=checkout?qs('#checkoutQuote'):qs('#quoteBox');if(!cart.length){quote=null;target.innerHTML='';return}
    const type=checkout?qs('#orderType').value:'pickup';const zone=checkout&&type==='delivery'?Number(qs('#deliveryZone').value||0):null;
    if(type==='delivery'&&!zone){quote=null;target.innerHTML='<span>اختر منطقة التوصيل لحساب الإجمالي.</span>';return}
    target.innerHTML='<span>جاري حساب السعر النهائي…</span>';
    try{quote=await rpc('retail_website_quote',{p_branch_id:branchId,p_order_type:type,p_delivery_zone_id:zone||null,p_items:cartPayload()});target.innerHTML=quoteHtml(quote)}catch(e){quote=null;target.innerHTML='<span>'+esc(e.message)+'</span>'}
  }

  function renderCheckoutOptions(){
    const pays=branchPayments();qs('#paymentMethod').innerHTML=pays.map(p=>`<option value="${esc(p.code)}">${esc(p.name)}</option>`).join('');
    const zones=branchZones();qs('#deliveryZone').innerHTML='<option value="">اختر المنطقة</option>'+zones.map(z=>`<option value="${Number(z.id)}">${esc(z.name)} — ${money(z.delivery_fee)}</option>`).join('');
    if(!zones.length){qs('#orderType').value='pickup';qs('#orderType').querySelector('option[value="delivery"]').disabled=true}else qs('#orderType').querySelector('option[value="delivery"]').disabled=false;
    renderDeliveryFields();renderPaymentReference();
  }
  function renderDeliveryFields(){const delivery=qs('#orderType').value==='delivery';qs('#deliveryFields').classList.toggle('hidden',!delivery);qs('#customerAddress').required=delivery;qs('#deliveryZone').required=delivery}
  function renderPaymentReference(){const p=branchPayments().find(x=>x.code===qs('#paymentMethod').value);const show=!!p?.allow_reference&&p.code!=='cash';qs('#paymentReferenceWrap').classList.toggle('hidden',!show);qs('#paymentReference').required=false}
  function openCheckout(){if(!cart.length)return;qs('#cartDrawer').classList.add('hidden');renderCheckoutOptions();qs('#checkoutModal').classList.remove('hidden');refreshQuote(true)}

  async function submitOrder(e){
    e.preventDefault();if(!cart.length)return toast('السلة فارغة');
    const b=branch();if(!b?.orders_open)return toast('الفرع لا يستقبل الطلبات حاليًا');
    const type=qs('#orderType').value;const zone=type==='delivery'?Number(qs('#deliveryZone').value||0):null;if(type==='delivery'&&!zone)return toast('اختر منطقة التوصيل');
    const idem=crypto.randomUUID?.()||('web-'+Date.now()+'-'+Math.random());const reservation=crypto.randomUUID?.()||('res-'+Date.now()+'-'+Math.random());
    const btn=qs('#submitOrderBtn');btn.disabled=true;btn.textContent='جاري إرسال الطلب…';
    try{
      await refreshQuote(true);if(!quote)throw new Error('تعذر تأكيد السعر النهائي');
      const d=await rpc('retail_create_website_order',{
        p_branch_id:branchId,p_idempotency_key:idem,p_reservation_key:reservation,
        p_customer_name:qs('#customerName').value.trim(),p_customer_phone:qs('#customerPhone').value.trim(),
        p_order_type:type,p_delivery_zone_id:zone,p_customer_address:type==='delivery'?qs('#customerAddress').value.trim():null,
        p_customer_notes:qs('#customerNotes').value.trim()||null,p_payment_method_code:qs('#paymentMethod').value||'cash',
        p_payment_reference:qs('#paymentReference').value.trim()||null,p_items:cartPayload()
      });
      localStorage.setItem('sharawlaRetailLastOrder',JSON.stringify({code:d.order_code,phone:qs('#customerPhone').value.trim()}));
      cart=[];saveCart();quote=null;renderCart();qs('#checkoutModal').classList.add('hidden');
      qs('#trackCode').value=d.order_code||'';qs('#trackPhone').value=qs('#customerPhone').value.trim();
      toast(`تم إرسال الطلب ${d.order_code} — الإجمالي ${money(d.total)}`);qs('#trackingModal').classList.remove('hidden');
      await doTrack();
    }catch(err){toast(err.message||String(err))}finally{btn.disabled=false;btn.textContent='تأكيد الطلب'}
  }

  async function trackOrder(e){if(e)e.preventDefault();await doTrack()}
  async function doTrack(){
    const code=qs('#trackCode').value.trim().toUpperCase(),phone=qs('#trackPhone').value.trim();if(!code||!phone)return;
    const out=qs('#trackingResult');out.innerHTML='<div class="track-card">جاري المتابعة…</div>';
    try{
      const d=await rpc('track_retail_website_order',{p_order_code:code,p_customer_phone:phone});
      const status=d.status||'—';const labels={pending:'جديد — في انتظار قبول الفرع',accepted:'تم قبول الطلب',rejected:'تم رفض الطلب',cancelled:'تم إلغاء الطلب',expired:'انتهت مدة الحجز',new:'جديد',preparing:'قيد التجهيز',out_for_delivery:'خرج مع المندوب',delivered:'تم التسليم',completed:'مكتمل'};
      const canCancel=String(status)==='pending';
      out.innerHTML=`<div class="track-card"><h3>${esc(code)}</h3><p><b>${esc(labels[status]||status)}</b></p>${d.total!=null?`<p>الإجمالي: ${money(d.total)}</p>`:''}${canCancel?'<button id="cancelTrackedOrder" class="danger-btn wide" type="button">إلغاء الطلب</button>':''}</div>`;
      if(canCancel)qs('#cancelTrackedOrder').onclick=cancelTrackedOrder;
    }catch(err){out.innerHTML='<div class="track-card">'+esc(err.message)+'</div>'}
  }
  async function cancelTrackedOrder(){
    const code=qs('#trackCode').value.trim().toUpperCase(),phone=qs('#trackPhone').value.trim();
    if(!confirm('تأكيد إلغاء الطلب؟'))return;
    try{await rpc('cancel_retail_website_order_customer',{p_order_code:code,p_customer_phone:phone});toast('تم إلغاء الطلب وفك حجز المخزون');await doTrack()}catch(e){toast(e.message)}
  }

  window.addEventListener('DOMContentLoaded',()=>{
    try{const last=JSON.parse(localStorage.getItem('sharawlaRetailLastOrder')||'null');if(last){qs('#trackCode').value=last.code||'';qs('#trackPhone').value=last.phone||''}}catch{}
    init();
  });
})();
