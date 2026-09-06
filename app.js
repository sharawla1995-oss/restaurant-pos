const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const cfg={url:localStorage.getItem('sbUrl')||'',key:localStorage.getItem('sbKey')||''};
let session=JSON.parse(localStorage.getItem('sbSession')||'null');
let state={employee:null,branches:[],categories:[],products:[],cart:[],cat:'all',
settings:{
  enable_extras:true,enable_removals:true,enable_item_notes:true,
  enable_kitchen:false,enable_receipt_print:true,enable_prep_receipt:true,
  enable_inventory:false,enable_delivery:true,enable_customer_search:true,
  enable_delivery_drivers:true,enable_mixed_payment:true
},
modifiers:[],productModifiers:[],deliveryZones:[],drivers:[],selectedCustomer:null};
const money=n=>`${Number(n||0).toFixed(2)} ج.م`;
const fmtDate=s=>new Date(s).toLocaleString('ar-EG');
function toast(m){const e=$('#toast');e.textContent=m;e.style.display='block';setTimeout(()=>e.style.display='none',2600)}
function show(id){['setupView','loginView','appView'].forEach(x=>$('#'+x).classList.add('hidden'));$('#'+id).classList.remove('hidden')}
function headers(auth=true){return {'Content-Type':'application/json','apikey':cfg.key,...(auth&&session?.access_token?{Authorization:`Bearer ${session.access_token}`}:{})}}
async function req(path,opt={}){const r=await fetch(cfg.url+path,{...opt,headers:{...headers(opt.auth!==false),...(opt.headers||{})}});let d=null;try{d=await r.json()}catch{}if(!r.ok)throw new Error(d?.message||d?.error_description||d?.hint||`خطأ ${r.status}`);return d}
async function rest(table,query='',opt={}){return req(`/rest/v1/${table}${query?`?${query}`:''}`,opt)}
async function signIn(email,password){const d=await req('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:JSON.stringify({email,password})});session=d;localStorage.setItem('sbSession',JSON.stringify(d));return d}
async function logout(){try{await req('/auth/v1/logout',{method:'POST'})}catch{}session=null;localStorage.removeItem('sbSession');show('loginView')}
function branchName(id){return state.branches.find(b=>String(b.id)===String(id))?.name||''}

async function bootstrap(){
  const [emps,branches,cats,products,settingsRows,modifiers,productModifiers,zones,drivers]=await Promise.all([
    rest('employees','select=*&auth_user_id=eq.'+session.user.id),
    rest('branches','select=*&active=eq.true&order=id'),
    rest('categories','select=*&active=eq.true&order=sort_order'),
    rest('products','select=*&active=eq.true&order=id'),
    rest('app_settings','select=key,value'),
    rest('modifiers','select=*&active=eq.true&order=id'),
    rest('product_modifiers','select=*'),
    rest('delivery_zones','select=*&active=eq.true&order=name'),
    rest('delivery_drivers','select=*&active=eq.true&order=name')
  ]);
  if(!emps?.length)throw new Error('الحساب غير مربوط بموظف في النظام');
  state.employee=emps[0];state.branches=branches||[];state.categories=cats||[];state.products=products||[];state.modifiers=modifiers||[];state.productModifiers=productModifiers||[];state.deliveryZones=zones||[];state.drivers=drivers||[];for(const r of (settingsRows||[])){if(r.key in state.settings)state.settings[r.key]=String(r.value)==='true';}
  $('#who').textContent=`${state.employee.name} • ${state.employee.role}`;
  $('#branchName').textContent=branchName(state.employee.branch_id);
  $$('#nav [data-page="users"],#nav [data-page="settings"]').forEach(b=>b.classList.toggle('hidden',state.employee.role!=='admin'));
  const k=$('#nav [data-page="kitchen"]'), inv=$('#nav [data-page="inventory"]'); if(k)k.classList.toggle('hidden',!state.settings.enable_kitchen); if(inv)inv.classList.toggle('hidden',!state.settings.enable_inventory); const del=$('#nav [data-page="delivery"]'); if(del)del.classList.toggle('hidden',!state.settings.enable_delivery);
  show('appView');showPage('pos');
}

$('#setupForm').addEventListener('submit',async e=>{e.preventDefault();const url=$('#supabaseUrl').value.trim().replace(/\/$/,'');const key=$('#publishableKey').value.trim();if(!/^https:\/\/.+\.supabase\.co$/.test(url))return toast('راجع Project URL');if(!key.startsWith('sb_'))return toast('راجع Publishable key');localStorage.setItem('sbUrl',url);localStorage.setItem('sbKey',key);location.reload()});
$('#changeConnection').onclick=()=>{localStorage.removeItem('sbUrl');localStorage.removeItem('sbKey');localStorage.removeItem('sbSession');location.reload()};
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();try{await signIn($('#email').value.trim(),$('#password').value);await bootstrap()}catch(err){toast(err.message)}});
$('#logoutBtn').onclick=logout;$('#menuBtn').onclick=()=>$('.sidebar').classList.toggle('open');
$('#nav').onclick=e=>{const b=e.target.closest('button[data-page]');if(b)showPage(b.dataset.page)};
setInterval(()=>{if($('#clock'))$('#clock').textContent=new Date().toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})},1000);
const titles={pos:'الكاشير',orders:'الطلبات',customers:'العملاء',delivery:'الدليفري',kitchen:'المطبخ',shifts:'الشيفت',inventory:'المخزون',expenses:'المصروفات',products:'الأصناف',reports:'التقارير',users:'المستخدمون',settings:'الإعدادات'};
function navActive(p){$$('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===p));$('.sidebar').classList.remove('open')}
async function showPage(p){try{navActive(p);$('#pageTitle').textContent=titles[p]||p;await ({pos:renderPOS,orders:renderOrders,customers:renderCustomers,delivery:renderDelivery,kitchen:renderKitchen,shifts:renderShifts,inventory:renderInventory,expenses:renderExpenses,products:renderProducts,reports:renderReports,users:renderUsers,settings:renderSettings}[p]||renderPOS)()}catch(e){toast(e.message)}}

function renderPOS(){
 $('#page').innerHTML=`<div class="pos-layout"><section class="catalog">
 <div class="catalog-tools"><input id="productSearch" placeholder="🔎 بحث سريع عن صنف"></div>
 <div class="cat-tabs" id="catTabs"><button data-cat="all" class="active">الكل</button>${state.categories.map(c=>`<button data-cat="${c.id}">${c.name}</button>`).join('')}</div>
 <div class="products-grid" id="productsGrid"></div></section>
 <aside class="cart">
  <div class="cart-head sales-head">
   <select id="orderType"><option value="takeaway">تيك أواي</option>${state.settings.enable_delivery?`<option value="delivery">دليفري</option>`:''}<option value="dinein">صالة</option></select>
   <input id="customerPhone" inputmode="tel" placeholder="رقم العميل">
   <input id="customerName" placeholder="اسم العميل">
  </div>
  <div id="deliveryFields" class="delivery-fields hidden">
   <select id="deliveryBranch">${state.branches.map(b=>`<option value="${b.id}" ${String(b.id)===String(state.employee.branch_id)?'selected':''}>${b.name}</option>`).join('')}</select>
   <select id="deliveryZone"><option value="">اختر المنطقة</option>${state.deliveryZones.map(z=>`<option value="${z.id}" data-fee="${z.delivery_fee}" data-branch="${z.branch_id||''}">${z.name} — ${money(z.delivery_fee)}</option>`).join('')}</select>
   <textarea id="deliveryAddress" rows="2" placeholder="عنوان التوصيل"></textarea>
  </div>
  <div id="customerHint" class="customer-hint"></div>
  <div class="cart-items" id="cartItems"></div>
  <div class="cart-foot">
   <div class="totline"><span>الإجمالي الفرعي</span><b id="subtotal">0</b></div>
   <div class="totline"><span>خصم</span><input id="discount" type="number" min="0" value="0" style="width:110px;padding:5px"></div>
   <div class="totline delivery-total hidden" id="deliveryFeeLine"><span>الدليفري</span><b id="deliveryFee">0</b></div>
   <div class="totline grand"><span>المطلوب</span><span id="grand">0</span></div>
   <div class="pay-actions">
    <button class="primary" data-pay="cash">💵 كاش</button>
    <button class="secondary" data-pay="wallet">📱 محفظة</button>
    <button class="secondary" data-pay="instapay">🟣 InstaPay</button>
   </div>
  </div>
 </aside></div>`;
 $('#catTabs').onclick=e=>{const b=e.target.closest('button');if(!b)return;state.cat=b.dataset.cat;$$('#catTabs button').forEach(x=>x.classList.toggle('active',x===b));drawProducts()};
 $('#productSearch').oninput=drawProducts;
 $('#discount').oninput=drawCart;
 $('#orderType').onchange=()=>{toggleDeliveryFields();drawCart()};
 $('#deliveryZone')?.addEventListener('change',e=>{
   const opt=e.target.selectedOptions[0];
   if(opt?.dataset.branch) $('#deliveryBranch').value=opt.dataset.branch;
   drawCart();
 });
 $('#customerPhone').addEventListener('blur',lookupCustomerByPhone);
 $('.pay-actions').onclick=e=>{const b=e.target.closest('[data-pay]');if(b)checkout(b.dataset.pay)};
 toggleDeliveryFields();drawProducts();drawCart();
}
function toggleDeliveryFields(){
 const delivery=$('#orderType')?.value==='delivery';
 $('#deliveryFields')?.classList.toggle('hidden',!delivery);
 $('#deliveryFeeLine')?.classList.toggle('hidden',!delivery);
}
async function lookupCustomerByPhone(){
 if(!state.settings.enable_customer_search)return;
 const phone=($('#customerPhone')?.value||'').trim();
 if(phone.length<7)return;
 try{
   const rows=await rest('customers',`select=*&phone=eq.${encodeURIComponent(phone)}&limit=1`);
   if(rows?.length){
     state.selectedCustomer=rows[0];
     $('#customerName').value=rows[0].name||'';
     const adds=await rest('customer_addresses',`select=*&customer_id=eq.${rows[0].id}&order=is_default.desc,id.desc&limit=5`);
     if(adds?.length && $('#deliveryAddress')) $('#deliveryAddress').value=adds[0].address||'';
     $('#customerHint').innerHTML=`✅ عميل مسجل: <b>${rows[0].name||phone}</b>`;
   }else{
     state.selectedCustomer=null;
     $('#customerHint').textContent='عميل جديد — سيتم حفظه مع الأوردر';
   }
 }catch(e){ $('#customerHint').textContent=''; }
}

function drawProducts(){const q=($('#productSearch')?.value||'').trim().toLowerCase();const list=state.products.filter(p=>(state.cat==='all'||String(p.category_id)===String(state.cat))&&(!q||String(p.name).toLowerCase().includes(q)));$('#productsGrid').innerHTML=list.map(p=>`<button class="product" data-id="${p.id}"><b>${p.name}</b><span>${money(p.price)}</span></button>`).join('')||'<div class="empty">أضف أصناف من صفحة الأصناف</div>';$('#productsGrid').onclick=e=>{const b=e.target.closest('.product');if(b){const p=state.products.find(x=>String(x.id)===String(b.dataset.id));addProductToCart(p)}}}
function productModifierList(p){const ids=state.productModifiers.filter(x=>String(x.product_id)===String(p.id)).map(x=>String(x.modifier_id));return state.modifiers.filter(m=>ids.includes(String(m.id)))}
function addProductToCart(p){const canExtras=state.settings.enable_extras&&p.allow_extras!==false&&productModifierList(p).length;const canRemovals=state.settings.enable_removals&&p.allow_removals!==false&&Array.isArray(p.removable_components)&&p.removable_components.length;const canNotes=state.settings.enable_item_notes&&p.allow_item_notes!==false;if(canExtras||canRemovals||canNotes)return openItemOptions(p);pushCartItem({product_id:p.id,name:p.name,price:Number(p.price),base_price:Number(p.price),cost:Number(p.cost||0),qty:1,modifiers:[],removed:[],notes:''})}
function pushCartItem(item){state.cart.push(item);drawCart()}
function openItemOptions(p){const mods=productModifierList(p);const removals=Array.isArray(p.removable_components)?p.removable_components:[];const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card"><h2>${p.name}</h2><h3>العدد</h3><div class="item-qty-picker"><button type="button" data-q="minus">−</button><input id="itemQty" type="number" min="1" value="1" inputmode="numeric"><button type="button" data-q="plus">+</button></div>${state.settings.enable_extras&&p.allow_extras!==false&&mods.length?`<h3>إضافات</h3><div class="option-list">${mods.map(x=>`<label><input type="checkbox" data-mod="${x.id}"> ${x.name} (+${money(x.price)})</label>`).join('')}</div>`:''}${state.settings.enable_removals&&p.allow_removals!==false&&removals.length?`<h3>بدون</h3><div class="option-list">${removals.map((x,i)=>`<label><input type="checkbox" data-rem="${i}"> بدون ${x}</label>`).join('')}</div>`:''}${state.settings.enable_item_notes&&p.allow_item_notes!==false?`<h3>تعليق الصنف</h3><textarea id="itemNote" rows="3" placeholder="مثال: 2 ببصل، 1 من غير بصل"></textarea><small>تعليق واحد على كل كمية الصنف</small>`:''}<div class="modal-actions"><button class="secondary" data-close>إلغاء</button><button class="primary" data-add>إضافة للأوردر</button></div></div>`;document.body.appendChild(m);m.onclick=e=>{const qb=e.target.closest('[data-q]');if(qb){const q=m.querySelector('#itemQty');let v=Math.max(1,Number(q.value||1));q.value=qb.dataset.q==='plus'?v+1:Math.max(1,v-1);return;}if(e.target.closest('[data-close]')||e.target===m)m.remove();if(e.target.closest('[data-add]')){const selected=[...m.querySelectorAll('[data-mod]:checked')].map(c=>mods.find(x=>String(x.id)===String(c.dataset.mod))).filter(Boolean);const removed=[...m.querySelectorAll('[data-rem]:checked')].map(c=>removals[Number(c.dataset.rem)]);const extra=selected.reduce((a,x)=>a+Number(x.price||0),0);const qty=Math.max(1,Math.floor(Number(m.querySelector('#itemQty')?.value||1)));const item={product_id:p.id,name:p.name,base_price:Number(p.price),price:Number(p.price)+extra,cost:Number(p.cost||0),qty,modifiers:selected.map(x=>({id:x.id,name:x.name,price:Number(x.price||0)})),removed,notes:m.querySelector('#itemNote')?.value.trim()||''};const same=state.cart.find(x=>String(x.product_id)===String(item.product_id)&&JSON.stringify(x.modifiers||[])===JSON.stringify(item.modifiers||[])&&JSON.stringify(x.removed||[])===JSON.stringify(item.removed||[]));if(same){same.qty+=item.qty;if(item.notes)same.notes=item.notes;drawCart()}else pushCartItem(item);m.remove()}}}
function cartCalc(){const subtotal=state.cart.reduce((s,i)=>s+(i.price*i.qty),0);const discount=Number($('#discount')?.value||0);let deliveryFee=0;if($('#orderType')?.value==='delivery'){deliveryFee=Number($('#deliveryZone')?.selectedOptions?.[0]?.dataset?.fee||0)}return{subtotal,discount,deliveryFee,total:Math.max(0,subtotal-discount+deliveryFee)}}
function drawCart(){if(!$('#cartItems'))return;$('#cartItems').innerHTML=state.cart.length?state.cart.map((i,n)=>`<div class="cart-item"><div class="cart-row"><b>${i.name}</b><b>${money(i.price*i.qty)}</b></div>${i.modifiers?.length?`<small>+ ${i.modifiers.map(x=>x.name).join('، ')}</small>`:''}${i.removed?.length?`<small>بدون: ${i.removed.join('، ')}</small>`:''}${i.notes?`<small>ملاحظة: ${i.notes}</small>`:''}<div class="qty"><button data-a="plus" data-i="${n}">+</button><b>${i.qty}</b><button data-a="minus" data-i="${n}">−</button><button data-a="del" data-i="${n}">🗑</button></div></div>`).join(''):'<div class="empty">أضف أصناف للأوردر</div>';$('#cartItems').onclick=e=>{const b=e.target.closest('button[data-a]');if(!b)return;const i=state.cart[+b.dataset.i];if(b.dataset.a==='plus')i.qty++;if(b.dataset.a==='minus'){i.qty--;if(i.qty<=0)state.cart.splice(+b.dataset.i,1)}if(b.dataset.a==='del')state.cart.splice(+b.dataset.i,1);drawCart()};const c=cartCalc();$('#subtotal').textContent=money(c.subtotal);if($('#deliveryFee'))$('#deliveryFee').textContent=money(c.deliveryFee);$('#grand').textContent=money(c.total)}
async function checkout(payment){
 if(!state.cart.length)return toast('الأوردر فارغ');
 const c=cartCalc(), orderType=$('#orderType').value;
 const phone=($('#customerPhone')?.value||'').trim(), name=($('#customerName')?.value||'').trim();
 let customerId=state.selectedCustomer?.id||null;
 if(phone && !customerId){
   try{
     const createdCustomer=await rest('customers','select=*',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{name:name||phone,phone,address:orderType==='delivery'?($('#deliveryAddress')?.value||null):null}])});
     customerId=createdCustomer?.[0]?.id||null;
     if(customerId && orderType==='delivery' && $('#deliveryAddress')?.value){
       await rest('customer_addresses','',{method:'POST',body:JSON.stringify([{customer_id:customerId,label:'العنوان الأساسي',address:$('#deliveryAddress').value,area:$('#deliveryZone')?.selectedOptions?.[0]?.textContent?.split('—')[0]?.trim()||null,is_default:true}])});
     }
   }catch(e){}
 }
 const branchId=orderType==='delivery' ? Number($('#deliveryBranch')?.value||state.employee.branch_id) : state.employee.branch_id;
 const source=(state.employee.role==='delivery'||state.employee.role==='callcenter')?'callcenter':'pos';
 const order=[{
   branch_id:branchId,employee_id:state.employee.id,customer_id:customerId,order_type:orderType,
   payment_method:payment,subtotal:c.subtotal,discount:c.discount,delivery_fee:c.deliveryFee,total:c.total,
   status:'new',source,customer_phone:phone||null,
   delivery_address:orderType==='delivery'?($('#deliveryAddress')?.value||null):null,
   delivery_zone_id:orderType==='delivery'&&$('#deliveryZone')?.value?Number($('#deliveryZone').value):null,
   notes:name?`العميل: ${name}`:null
 }];
 const created=await rest('orders','select=*',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(order)});
 const o=created[0];
 const orderNo=`${branchId}-${String(o.id).padStart(5,'0')}`;
 try{await rest('orders',`id=eq.${o.id}`,{method:'PATCH',body:JSON.stringify({order_number:orderNo})});o.order_number=orderNo}catch(e){}
 const items=state.cart.map(i=>({order_id:o.id,product_id:i.product_id,product_name:i.name,quantity:i.qty,unit_price:i.price,cost:i.cost,total:i.price*i.qty,notes:[i.removed?.length?`بدون: ${i.removed.join('، ')}`:'',i.notes||''].filter(Boolean).join(' | ')||null,_mods:i.modifiers||[]}));
 const clean=items.map(({_mods,...x})=>x);
 const savedItems=await rest('order_items','select=*',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(clean)});
 const modifierRows=[];savedItems.forEach((saved,idx)=>{for(const md of(items[idx]._mods||[]))modifierRows.push({order_item_id:saved.id,modifier_id:md.id,modifier_name:md.name,price:md.price})});
 if(modifierRows.length)await rest('order_item_modifiers','',{method:'POST',body:JSON.stringify(modifierRows)});
 try{await rest('order_payments','',{method:'POST',body:JSON.stringify([{order_id:o.id,method:payment,amount:c.total}])})}catch(e){}
 state.cart=[];state.selectedCustomer=null;toast(`تم حفظ أوردر ${o.order_number||'#'+o.id}`);showReceipt(o,clean);renderPOS();
}
const orderTypeLabel=v=>({takeaway:'تيك أواي',delivery:'دليفري',dinein:'صالة'}[v]||v||'');
const paymentLabel=v=>({cash:'كاش',wallet:'محفظة',instapay:'InstaPay',mixed:'دفع مختلط'}[v]||v||'');
const statusLabel=v=>({new:'جديد',preparing:'قيد التحضير',ready:'جاهز',out_for_delivery:'خرج مع المندوب',delivered:'تم التسليم',completed:'مكتمل',cancelled:'ملغي'}[v]||v||'');

function receiptHTML(o,items){return `<div class="receipt"><h2>Restaurant POS</h2><div class="r-meta">أوردر #${o.id}<br>${fmtDate(o.created_at||new Date().toISOString())}<br>${branchName(o.branch_id)}</div><hr><div class="r-items">${items.map(i=>`<div><span>${i.product_name} × ${i.quantity}${i.notes?`<small>${i.notes}</small>`:''}</span><b>${money(i.total)}</b></div>`).join('')}</div><hr><div class="r-totals"><div><span>الإجمالي</span><b>${money(o.subtotal)}</b></div>${Number(o.discount||0)?`<div><span>خصم</span><b>${money(o.discount)}</b></div>`:''}<div><span>المطلوب</span><b>${money(o.total)}</b></div></div><hr><div class="r-footer">${orderTypeLabel(o.order_type)} • ${paymentLabel(o.payment_method)}<br>شكرًا لزيارتكم</div></div>`}
function printReceipt(o,items){let z=document.querySelector('.print-zone');if(!z){z=document.createElement('div');z.className='print-zone';document.body.appendChild(z)}z.innerHTML=receiptHTML(o,items);window.print()}

function prepReceiptHTML(o,items){
 return `<div class="receipt print-zone"><div class="receipt-head"><h2>ريسيت تحضير</h2><h1>${o.order_number||'#'+o.id}</h1><p>${branchName(o.branch_id)} • ${fmtDate(o.created_at)}</p><p>${orderTypeLabel(o.order_type)}</p></div><hr>${items.map(i=>`<div class="receipt-row prep-item"><b>${i.quantity} × ${i.product_name}</b></div>${i.notes?`<div class="prep-note">📝 ${i.notes}</div>`:''}`).join('')}<hr>${o.delivery_address?`<p><b>العنوان:</b> ${o.delivery_address}</p>`:''}</div>`;
}
function printPrepReceipt(o,items){
 const z=document.createElement('div');z.className='print-zone';z.innerHTML=prepReceiptHTML(o,items);document.body.appendChild(z);window.print();z.remove();
}
function showReceipt(o,items){const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card"><h2>تم حفظ أوردر ${o.order_number||'#'+o.id}</h2>${receiptHTML(o,items)}<div class="modal-actions"><button class="secondary" data-close>إغلاق</button>${state.settings.enable_prep_receipt?'<button class="secondary" data-prep>ريسيت التحضير</button>':''}${state.settings.enable_receipt_print?'<button class="primary" data-print>فاتورة العميل</button>':''}</div></div>`;document.body.appendChild(m);m.onclick=e=>{if(e.target.closest('[data-close]')||e.target===m)m.remove();if(e.target.closest('[data-print]'))printReceipt(o,items);if(e.target.closest('[data-prep]'))printPrepReceipt(o,items)}}
async function openOrderDetails(id){const [orders,items]=await Promise.all([rest('orders',`select=*&id=eq.${id}`),rest('order_items',`select=*&order_id=eq.${id}&order=id`)]);const o=orders[0];if(!o)return toast('الأوردر غير موجود');const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card"><h2>تفاصيل أوردر #${o.id}</h2><p>${fmtDate(o.created_at)} — ${branchName(o.branch_id)}</p><p><b>${orderTypeLabel(o.order_type)}</b> • ${paymentLabel(o.payment_method)} • <span class="tag">${statusLabel(o.status)}</span></p>${o.notes?`<p>${o.notes}</p>`:''}<div class="table-wrap"><table style="min-width:0"><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${items.map(i=>`<tr><td>${i.product_name}${i.notes?`<small style=\"display:block;margin-top:4px\">📝 ${i.notes}</small>`:''}</td><td>${i.quantity}</td><td>${money(i.unit_price)}</td><td>${money(i.total)}</td></tr>`).join('')}</tbody></table></div><h3>الإجمالي: ${money(o.total)}</h3><div class="modal-actions"><button class="secondary" data-close>إغلاق</button><button class="primary" data-print>طباعة</button></div></div>`;document.body.appendChild(m);m.onclick=e=>{if(e.target.closest('[data-close]')||e.target===m)m.remove();if(e.target.closest('[data-print]'))printReceipt(o,items)}}

async function renderOrders(){const rows=await rest('orders','select=*&order=created_at.desc&limit=100');$('#page').innerHTML=`<div class="panel"><h2>آخر الطلبات</h2><div class="table-wrap"><table><thead><tr><th>#</th><th>التاريخ</th><th>الفرع</th><th>النوع</th><th>الدفع</th><th>الحالة</th><th>الإجمالي</th><th></th></tr></thead><tbody>${rows.map(o=>`<tr><td>${o.id}</td><td>${fmtDate(o.created_at)}</td><td>${branchName(o.branch_id)}</td><td>${orderTypeLabel(o.order_type)}</td><td>${paymentLabel(o.payment_method)}</td><td><span class="tag">${statusLabel(o.status)}</span></td><td>${money(o.total)}</td><td><button class="secondary" data-order="${o.id}">تفاصيل</button></td></tr>`).join('')}</tbody></table></div></div>`;$('#page').onclick=e=>{const b=e.target.closest('[data-order]');if(b)openOrderDetails(b.dataset.order)}}


async function renderCustomers(){
 const q=($('#customerSearch')?.value||'').trim();
 const rows=await rest('customers','select=*&order=created_at.desc&limit=300');
 $('#page').innerHTML=`<div class="panel"><div class="toolbar"><h2>العملاء</h2><input id="customerSearch" placeholder="بحث بالاسم أو رقم الموبايل" value="${q}"></div>
 <div class="table-wrap"><table><thead><tr><th>الاسم</th><th>الموبايل</th><th>المنطقة</th><th>العنوان</th><th>آخر تحديث</th></tr></thead><tbody id="customersBody"></tbody></table></div></div>`;
 const draw=()=>{const v=$('#customerSearch').value.trim().toLowerCase();$('#customersBody').innerHTML=rows.filter(c=>!v||String(c.name||'').toLowerCase().includes(v)||String(c.phone||'').includes(v)).map(c=>`<tr><td>${c.name||''}</td><td>${c.phone||''}</td><td>${c.area||''}</td><td>${c.address||''}</td><td>${c.updated_at?fmtDate(c.updated_at):''}</td></tr>`).join('')||'<tr><td colspan="5">لا توجد نتائج</td></tr>'};$('#customerSearch').oninput=draw;draw();
}

async function renderDelivery(){
 const [drivers,zones,outOrders]=await Promise.all([
   rest('delivery_drivers','select=*&order=active.desc,name'),
   rest('delivery_zones','select=*&order=active.desc,name'),
   rest('orders','select=*&order_type=eq.delivery&status=in.(new,ready,out_for_delivery)&order=created_at.desc&limit=100')
 ]);
 $('#page').innerHTML=`<div class="grid delivery-admin-grid">
 <div class="panel"><h2>مناديب التوصيل</h2><div class="form-grid"><label>الاسم<input id="driverName"></label><label>الموبايل<input id="driverPhone"></label><label>الفرع<select id="driverBranch">${state.branches.map(b=>`<option value="${b.id}">${b.name}</option>`).join('')}</select></label></div><button id="addDriver" class="primary">إضافة مندوب</button><div class="chips">${drivers.map(d=>`<span class="chip">${d.name} • ${branchName(d.branch_id)}</span>`).join('')||'لا يوجد مناديب'}</div></div>
 <div class="panel"><h2>مناطق الدليفري</h2><div class="form-grid"><label>المنطقة<input id="zoneName"></label><label>رسوم التوصيل<input id="zoneFee" type="number" value="0"></label><label>الفرع<select id="zoneBranch">${state.branches.map(b=>`<option value="${b.id}">${b.name}</option>`).join('')}</select></label></div><button id="addZone" class="primary">إضافة منطقة</button><div class="chips">${zones.map(z=>`<span class="chip">${z.name} • ${money(z.delivery_fee)} • ${branchName(z.branch_id)}</span>`).join('')||'لا توجد مناطق'}</div></div></div>
 <div class="panel"><h2>طلبات الدليفري الحالية</h2><div class="table-wrap"><table><thead><tr><th>الأوردر</th><th>الفرع</th><th>العميل</th><th>العنوان</th><th>الحالة</th><th>المندوب</th><th></th></tr></thead><tbody>${outOrders.map(o=>`<tr><td>${o.order_number||'#'+o.id}</td><td>${branchName(o.branch_id)}</td><td>${o.customer_phone||''}</td><td>${o.delivery_address||''}</td><td>${statusLabel(o.status)}</td><td>${drivers.find(d=>String(d.id)===String(o.driver_id))?.name||'-'}</td><td>${o.status!=='out_for_delivery'?`<button class="secondary" data-assign="${o.id}">تسليم لمندوب</button>`:`<button class="primary" data-delivered="${o.id}">تم التسليم</button>`}</td></tr>`).join('')}</tbody></table></div></div>`;
 $('#addDriver').onclick=async()=>{if(!$('#driverName').value)return toast('اكتب اسم المندوب');await rest('delivery_drivers','',{method:'POST',body:JSON.stringify([{name:$('#driverName').value,phone:$('#driverPhone').value||null,branch_id:Number($('#driverBranch').value),active:true}])});toast('تمت إضافة المندوب');renderDelivery()};
 $('#addZone').onclick=async()=>{if(!$('#zoneName').value)return toast('اكتب اسم المنطقة');await rest('delivery_zones','',{method:'POST',body:JSON.stringify([{name:$('#zoneName').value,delivery_fee:Number($('#zoneFee').value||0),branch_id:Number($('#zoneBranch').value),active:true}])});toast('تمت إضافة المنطقة');renderDelivery()};
 $('#page').onclick=async e=>{
   const a=e.target.closest('[data-assign]'); if(a){
     const available=drivers.filter(d=>d.active);
     if(!available.length)return toast('أضف مندوب أولاً');
     const names=available.map((d,i)=>`${i+1}) ${d.name}`).join('\n');
     const pick=prompt(`اختر رقم المندوب:\n${names}`,'1'); const d=available[Number(pick)-1]; if(!d)return;
     await rest('orders',`id=eq.${a.dataset.assign}`,{method:'PATCH',body:JSON.stringify({driver_id:d.id,status:'out_for_delivery',assigned_at:new Date().toISOString()})});
     toast(`الأوردر خرج مع ${d.name}`);renderDelivery();return;
   }
   const done=e.target.closest('[data-delivered]');if(done){await rest('orders',`id=eq.${done.dataset.delivered}`,{method:'PATCH',body:JSON.stringify({status:'delivered',delivered_at:new Date().toISOString()})});toast('تم تسجيل التسليم');renderDelivery()}
 };
}
async function renderKitchen(){if(!state.settings.enable_kitchen){$('#page').innerHTML='<div class="empty">شاشة المطبخ غير مفعلة من الإعدادات</div>';return;}const rows=await rest('orders','select=*&status=in.(new,preparing,ready)&order=created_at.asc&limit=100');const cards=await Promise.all(rows.map(async o=>{const items=await rest('order_items',`select=product_name,quantity,notes&order_id=eq.${o.id}&order=id`);return `<div class="panel kitchen-card"><div class="kitchen-head"><div><h2>أوردر #${o.id}</h2><small>${fmtDate(o.created_at)} • ${orderTypeLabel(o.order_type)}</small></div><span class="tag">${statusLabel(o.status)}</span></div><div class="kitchen-items">${items.map(i=>`<div><b>${i.quantity} ×</b> ${i.product_name}${i.notes?`<small class=\"kitchen-note\">📝 ${i.notes}</small>`:''}</div>`).join('')}</div><div class="modal-actions">${o.status==='new'?`<button class="primary" data-status="preparing" data-id="${o.id}">بدء التحضير</button>`:''}${o.status==='preparing'?`<button class="primary" data-status="ready" data-id="${o.id}">جاهز</button>`:''}${o.status==='ready'?`<button class="primary" data-status="completed" data-id="${o.id}">تم التسليم</button>`:''}</div></div>`}));$('#page').innerHTML=`<div class="kitchen-grid">${cards.join('')||'<div class="empty">لا توجد طلبات بالمطبخ حاليًا</div>'}</div>`;$('#page').onclick=async e=>{const b=e.target.closest('[data-status]');if(!b)return;await rest('orders',`id=eq.${b.dataset.id}`,{method:'PATCH',body:JSON.stringify({status:b.dataset.status})});toast('تم تحديث حالة الطلب');renderKitchen()}}

async function renderShifts(){const rows=await rest('shifts',`select=*&employee_id=eq.${state.employee.id}&order=opened_at.desc&limit=30`),open=rows.find(s=>s.status==='open'&&!s.closed_at);$('#page').innerHTML=`<div class="panel"><h2>${open?'الشيفت الحالي مفتوح':'فتح شيفت جديد'}</h2>${open?`<p>بدأ: ${fmtDate(open.opened_at)} — افتتاحية: ${money(open.opening_cash)}</p><div class="toolbar"><label>النقدية الفعلية<input id="closingCash" type="number" value="0"></label><button id="closeShift" class="danger">إغلاق الشيفت</button></div>`:`<div class="toolbar"><label>عهدة بداية الشيفت<input id="openingCash" type="number" value="0"></label><button id="openShift" class="primary">فتح الشيفت</button></div>`}</div>`;if(open)$('#closeShift').onclick=async()=>{await rest('shifts',`id=eq.${open.id}`,{method:'PATCH',body:JSON.stringify({closing_cash:Number($('#closingCash').value||0),closed_at:new Date().toISOString(),status:'closed'})});toast('تم إغلاق الشيفت');renderShifts()};else $('#openShift').onclick=async()=>{await rest('shifts','',{method:'POST',body:JSON.stringify([{branch_id:state.employee.branch_id,employee_id:state.employee.id,opening_cash:Number($('#openingCash').value||0),status:'open'}])});toast('تم فتح الشيفت');renderShifts()}}

async function renderExpenses(){const rows=await rest('expenses','select=*&order=created_at.desc&limit=100');$('#page').innerHTML=`<div class="panel"><h2>إضافة مصروف</h2><div class="form-grid"><label>البيان<input id="exTitle"></label><label>المبلغ<input id="exAmount" type="number"></label></div><button id="addExpense" class="primary">حفظ المصروف</button></div><div class="panel"><div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>البيان</th><th>المبلغ</th><th>الفرع</th></tr></thead><tbody>${rows.map(e=>`<tr><td>${fmtDate(e.created_at)}</td><td>${e.description}</td><td>${money(e.amount)}</td><td>${branchName(e.branch_id)}</td></tr>`).join('')}</tbody></table></div></div>`;$('#addExpense').onclick=async()=>{if(!$('#exTitle').value||!$('#exAmount').value)return toast('أدخل البيان والمبلغ');await rest('expenses','',{method:'POST',body:JSON.stringify([{branch_id:state.employee.branch_id,employee_id:state.employee.id,description:$('#exTitle').value,amount:Number($('#exAmount').value)}])});toast('تم حفظ المصروف');renderExpenses()}}

async function renderProducts(){
 state.products=await rest('products','select=*&order=id'); state.modifiers=await rest('modifiers','select=*&order=id'); state.productModifiers=await rest('product_modifiers','select=*');
 $('#page').innerHTML=`<div class="panel"><h2>إضافة صنف</h2><div class="form-grid"><label>الاسم<input id="pName"></label><label>القسم<select id="pCat">${state.categories.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}</select></label><label>سعر البيع<input id="pPrice" type="number"></label><label>التكلفة<input id="pCost" type="number"></label><label>باركود<input id="pBarcode"></label><label>مكونات يمكن حذفها<input id="pRemovals" placeholder="بصل، مخلل، صوص"></label></div><div class="toggle-row"><label><input id="pExtras" type="checkbox" checked> يسمح بإضافات</label><label><input id="pRemove" type="checkbox" checked> يسمح بحذف مكونات</label><label><input id="pNotes" type="checkbox" checked> يسمح بملاحظة</label></div><button id="addProduct" class="primary">إضافة الصنف</button></div>
 <div class="panel"><h2>الإضافات (Extras)</h2><div class="form-grid"><label>اسم الإضافة<input id="mName" placeholder="Extra Cheese"></label><label>السعر<input id="mPrice" type="number" value="0"></label></div><button id="addModifier" class="primary">إضافة</button><div class="chips">${state.modifiers.map(m=>`<span class="chip">${m.name} • ${money(m.price)}</span>`).join('')||'لا توجد إضافات'}</div></div>
 <div class="panel"><h2>الأصناف</h2><div class="table-wrap"><table><thead><tr><th>الصنف</th><th>السعر</th><th>الإضافات المتاحة</th><th>إعداد</th></tr></thead><tbody>${state.products.map(p=>`<tr><td>${p.name}</td><td>${money(p.price)}</td><td>${productModifierList(p).map(x=>x.name).join('، ')||'-'}</td><td><button class="secondary" data-config="${p.id}">تعديل الخيارات</button></td></tr>`).join('')}</tbody></table></div></div>`;
 $('#addProduct').onclick=async()=>{if(!$('#pName').value)return toast('اكتب اسم الصنف');const removable=$('#pRemovals').value.split(/[،,]/).map(x=>x.trim()).filter(Boolean);await rest('products','',{method:'POST',body:JSON.stringify([{name:$('#pName').value,category_id:Number($('#pCat').value),price:Number($('#pPrice').value||0),cost:Number($('#pCost').value||0),barcode:$('#pBarcode').value||null,active:true,allow_extras:$('#pExtras').checked,allow_removals:$('#pRemove').checked,allow_item_notes:$('#pNotes').checked,removable_components:removable}])});toast('تمت إضافة الصنف');renderProducts()};
 $('#addModifier').onclick=async()=>{if(!$('#mName').value)return toast('اكتب اسم الإضافة');await rest('modifiers','',{method:'POST',body:JSON.stringify([{name:$('#mName').value,price:Number($('#mPrice').value||0),active:true}])});toast('تمت إضافة الإضافة');renderProducts()};
 $('#page').onclick=e=>{const b=e.target.closest('[data-config]');if(b)openProductConfig(state.products.find(p=>String(p.id)===String(b.dataset.config)))};
}
function openProductConfig(p){const selected=new Set(state.productModifiers.filter(x=>String(x.product_id)===String(p.id)).map(x=>String(x.modifier_id)));const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card"><h2>خيارات ${p.name}</h2><div class="toggle-row"><label><input id="cfgExtras" type="checkbox" ${p.allow_extras!==false?'checked':''}> إضافات</label><label><input id="cfgRem" type="checkbox" ${p.allow_removals!==false?'checked':''}> حذف مكونات</label><label><input id="cfgNotes" type="checkbox" ${p.allow_item_notes!==false?'checked':''}> ملاحظات</label></div><label>مكونات قابلة للحذف<input id="cfgComponents" value="${(p.removable_components||[]).join('، ')}"></label><h3>الإضافات المسموحة</h3><div class="option-list">${state.modifiers.map(x=>`<label><input type="checkbox" data-pm="${x.id}" ${selected.has(String(x.id))?'checked':''}> ${x.name} (+${money(x.price)})</label>`).join('')||'أضف Extras أولًا'}</div><div class="modal-actions"><button class="secondary" data-close>إلغاء</button><button class="primary" data-save>حفظ</button></div></div>`;document.body.appendChild(m);m.onclick=async e=>{if(e.target.closest('[data-close]')||e.target===m)m.remove();if(e.target.closest('[data-save]')){const comps=m.querySelector('#cfgComponents').value.split(/[،,]/).map(x=>x.trim()).filter(Boolean);await rest('products',`id=eq.${p.id}`,{method:'PATCH',body:JSON.stringify({allow_extras:m.querySelector('#cfgExtras').checked,allow_removals:m.querySelector('#cfgRem').checked,allow_item_notes:m.querySelector('#cfgNotes').checked,removable_components:comps})});await rest('product_modifiers',`product_id=eq.${p.id}`,{method:'DELETE'});const ids=[...m.querySelectorAll('[data-pm]:checked')].map(x=>Number(x.dataset.pm));if(ids.length)await rest('product_modifiers','',{method:'POST',body:JSON.stringify(ids.map(id=>({product_id:p.id,modifier_id:id})))});m.remove();toast('تم حفظ خيارات الصنف');renderProducts()}}}

async function renderInventory(){if(!state.settings.enable_inventory){$('#page').innerHTML='<div class="empty">المخزون غير مفعّل من الإعدادات</div>';return;}const rows=await rest('ingredient_stock','select=id,branch_id,quantity,ingredients(name,unit)&order=id');$('#page').innerHTML=`<div class="panel"><h2>مخزون الخامات</h2><div class="table-wrap"><table><thead><tr><th>الخامة</th><th>الوحدة</th><th>الفرع</th><th>الرصيد</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.ingredients?.name||''}</td><td>${r.ingredients?.unit||''}</td><td>${branchName(r.branch_id)}</td><td>${r.quantity}</td></tr>`).join('')}</tbody></table></div></div>`}

async function renderReports(){const [orders,expenses]=await Promise.all([rest('orders','select=total,payment_method,created_at'),rest('expenses','select=amount,created_at')]);const today=new Date().toISOString().slice(0,10),todOrd=orders.filter(x=>x.created_at.slice(0,10)===today),todExp=expenses.filter(x=>x.created_at.slice(0,10)===today),sales=todOrd.reduce((s,x)=>s+Number(x.total||0),0),ex=todExp.reduce((s,x)=>s+Number(x.amount||0),0);$('#page').innerHTML=`<div class="grid kpis"><div class="card kpi"><small>مبيعات اليوم</small><strong>${money(sales)}</strong></div><div class="card kpi"><small>طلبات اليوم</small><strong>${todOrd.length}</strong></div><div class="card kpi"><small>مصروفات اليوم</small><strong>${money(ex)}</strong></div><div class="card kpi"><small>صافي قبل تكلفة الخامات</small><strong>${money(sales-ex)}</strong></div></div>`}

async function renderUsers(){const rows=await rest('employees','select=id,name,username,role,branch_id,active&order=id');$('#page').innerHTML=`<div class="panel"><h2>المستخدمون</h2><p>إنشاء حسابات تسجيل الدخول الجديدة يتم حاليًا من Supabase Authentication ثم ربطها بجدول employees.</p><div class="table-wrap"><table><thead><tr><th>الاسم</th><th>المستخدم</th><th>الدور</th><th>الفرع</th><th>الحالة</th></tr></thead><tbody>${rows.map(u=>`<tr><td>${u.name}</td><td>${u.username||''}</td><td>${u.role}</td><td>${branchName(u.branch_id)}</td><td>${u.active?'فعال':'موقوف'}</td></tr>`).join('')}</tbody></table></div></div>`}

async function renderSettings(){
 if(state.employee.role!=='admin'){ $('#page').innerHTML='<div class="empty">الإعدادات متاحة للمدير فقط</div>'; return; }
 $('#page').innerHTML=`<div class="panel"><h2>تشغيل وإيقاف المميزات</h2><p>الإعدادات دي بتتزامن على كل الأجهزة.</p><div class="settings-list">${[['enable_extras','الإضافات Extras'],['enable_removals','حذف مكونات'],['enable_item_notes','ملاحظات على الصنف'],['enable_kitchen','شاشة المطبخ'],['enable_prep_receipt','ريسيت التحضير'],['enable_receipt_print','فاتورة العميل'],['enable_inventory','المخزون'],['enable_delivery','الدليفري'],['enable_customer_search','بحث العملاء بالهاتف'],['enable_delivery_drivers','مناديب التوصيل'],['enable_mixed_payment','الدفع المختلط']].map(([k,l])=>`<label class="setting-switch"><span>${l}</span><input type="checkbox" data-setting="${k}" ${state.settings[k]?'checked':''}></label>`).join('')}</div><button id="saveSettings" class="primary">حفظ الإعدادات</button></div><div class="panel"><h2>إعداد الاتصال</h2><p>البرنامج متصل حاليًا بـ Supabase.</p><button id="resetConn" class="danger">تغيير بيانات Supabase</button></div>`;
 $('#saveSettings').onclick=async()=>{const rows=[...document.querySelectorAll('[data-setting]')].map(x=>({key:x.dataset.setting,value:String(x.checked)}));for(const r of rows)await rest('app_settings',`key=eq.${encodeURIComponent(r.key)}`,{method:'PATCH',body:JSON.stringify({value:r.value})});Object.assign(state.settings,Object.fromEntries(rows.map(r=>[r.key,r.value==='true'])));toast('تم حفظ الإعدادات');const k=$('#nav [data-page="kitchen"]'),inv=$('#nav [data-page="inventory"]');if(k)k.classList.toggle('hidden',!state.settings.enable_kitchen);if(inv)inv.classList.toggle('hidden',!state.settings.enable_inventory)};
 $('#resetConn').onclick=()=>{if(confirm('سيتم تسجيل الخروج ومسح بيانات الاتصال من هذا الجهاز فقط.')){$('#changeConnection').click()}};
}

async function init(){if(!cfg.url||!cfg.key)return show('setupView');if(!session?.access_token)return show('loginView');try{await bootstrap()}catch(e){localStorage.removeItem('sbSession');session=null;show('loginView');toast(e.message)}}
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
init();
