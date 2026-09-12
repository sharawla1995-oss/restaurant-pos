(function(global){
'use strict';
const VERSION='orders-v2-ui.1';
const FEATURES={quotation:'commerce.quotations',sales_order:'commerce.b2b_orders',custom_order:'commerce.custom_orders',reservation:'commerce.custom_orders'};
const RUNTIME_KEY='sharawlaRuntimeConfigV1';
let observer=null,wrapped=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money=v=>Number(v||0).toFixed(2);
const toast=m=>{try{return global.toast?.(m)}catch{};console.warn(m)};
const rpc=(n,p)=>global.rpc(n,p);
const rest=(t,q)=>global.rest(t,q);
const uuid=()=>global.uuid?.()||crypto.randomUUID();
function cfg(){try{return JSON.parse(localStorage.getItem(RUNTIME_KEY)||'{}')||{}}catch{return {}}}
function enabled(code){const f=Array.isArray(cfg().enabled_features)?cfg().enabled_features:[];return f.map(x=>String(x).toLowerCase()).includes(String(code).toLowerCase())}
function anyEnabled(){return Object.values(FEATURES).some(enabled)}
function branch(){try{return Number(global.currentBranchId?.()||0)}catch{return 0}}
function pageIsOrders(){const t=String(document.querySelector('#pageTitle')?.textContent||'');return /الطلبات|الفواتير/.test(t)}
function allowedTypes(){return Object.entries(FEATURES).filter(([,f])=>enabled(f)).map(([type])=>type)}
const typeLabel=t=>({quotation:'عرض سعر',sales_order:'أمر بيع',custom_order:'طلب خاص',reservation:'حجز طلب'})[t]||t;
const statusLabel=s=>({draft:'مسودة',submitted:'مرسل',approved:'معتمد',confirmed:'مؤكد',converted:'تم التحويل لفاتورة',completed:'مكتمل',cancelled:'ملغي',expired:'منتهي',rejected:'مرفوض'})[s]||s;

function inject(){
 if(!anyEnabled()||!pageIsOrders())return;
 if(document.querySelector('[data-orders-v2-open]'))return;
 const page=document.querySelector('#page');if(!page)return;
 const host=page.querySelector('.section-head')||page.firstElementChild||page;
 const b=document.createElement('button');b.type='button';b.className='primary';b.dataset.ordersV2Open='1';b.textContent='📑 عروض الأسعار وأوامر البيع';b.onclick=openCenter;
 host.appendChild(b);
}
async function promptValue(msg,def='',opts={}){try{return await global.uiPrompt?.(msg,def,opts)??null}catch{return prompt(msg,def)}}
async function chooseProduct(){
 const products=(global.state?.products||[]).filter(p=>p.active!==false);
 if(!products.length){toast('لا توجد أصناف');return null}
 const text=products.slice(0,120).map(p=>`${p.id} - ${p.name} - ${money(p.price)}`).join('\n');
 const id=await promptValue(`رقم الصنف:\n${text}`,String(products[0].id),{title:'اختيار صنف',type:'number'});if(id===null)return null;
 const p=products.find(x=>String(x.id)===String(id));if(!p){toast('الصنف غير موجود');return null}
 let variants=[];try{variants=(global.state?.productVariants||[]).filter(v=>String(v.product_id)===String(p.id)&&v.active!==false&&v.is_stock_unit===true)}catch{}
 let variant=null;
 if(variants.length){
  const vid=await promptValue(`Variant (0 بدون):\n${variants.map(v=>`${v.id} - ${v.name} - ${money(v.price)}`).join('\n')}`,'0',{title:'Variant',type:'number'});if(vid===null)return null;
  variant=variants.find(v=>String(v.id)===String(vid))||null;
 }
 const qty=await promptValue('الكمية','1',{title:'الكمية',type:'number'});if(qty===null)return null;
 const unit=await promptValue('سعر الوحدة',String(Number(variant?.price??p.price??0)),{title:'سعر الوحدة',type:'number'});if(unit===null)return null;
 const discount=await promptValue('خصم السطر','0',{title:'خصم السطر',type:'number'});if(discount===null)return null;
 return {product_id:Number(p.id),variant_id:variant?Number(variant.id):null,quantity:Number(qty),unit_price:Number(unit),discount_amount:Number(discount||0),tax_amount:0,notes:null,metadata:{}};
}
async function createDocument(){
 const types=allowedTypes();if(!types.length)return;
 const type=types.length===1?types[0]:await promptValue(`النوع:\n${types.map((t,i)=>`${i+1} - ${typeLabel(t)}`).join('\n')}`,'1',{title:'نوع المستند',type:'number'}).then(v=>types[Math.max(0,Number(v||1)-1)]||null);if(!type)return;
 const name=await promptValue('اسم العميل','',{title:typeLabel(type)});if(name===null)return;
 const phone=await promptValue('هاتف العميل','',{title:typeLabel(type)});if(phone===null)return;
 const due=await promptValue(type==='quotation'?'تاريخ انتهاء العرض YYYY-MM-DD (اختياري)':'تاريخ الاستحقاق/التسليم YYYY-MM-DD (اختياري)','',{title:'التاريخ'});if(due===null)return;
 const deposit=await promptValue('المقدم المطلوب','0',{title:'المقدم',type:'number'});if(deposit===null)return;
 const notes=await promptValue('ملاحظات','',{title:'ملاحظات'});if(notes===null)return;
 const items=[];
 while(true){const line=await chooseProduct();if(line)items.push(line);if(!line||!confirm('إضافة صنف آخر؟'))break}
 if(!items.length)return toast('أضف صنفًا واحدًا على الأقل');
 let dueAt=null,deliveryAt=null,expiresAt=null;if(due){const iso=new Date(`${due}T12:00:00`).toISOString();if(type==='quotation')expiresAt=iso;else deliveryAt=iso}
 try{
  const id=await rpc('commerce_order_document_create_v2',{p_branch_id:branch(),p_document_type:type,p_customer_id:null,p_customer_name:String(name||'').trim()||null,p_customer_phone:String(phone||'').trim()||null,p_due_at:dueAt,p_delivery_at:deliveryAt,p_expires_at:expiresAt,p_deposit_required:Number(deposit||0),p_notes:String(notes||'').trim()||null,p_metadata:{},p_items:items,p_client_tx_id:uuid()});
  toast(`تم إنشاء ${typeLabel(type)} #${id}`);return id;
 }catch(e){toast(e.message);return null}
}
async function loadDocs(){return await rest('commerce_order_documents',`select=*&branch_id=eq.${branch()}&order=created_at.desc&limit=100`)}
async function openCenter(){
 const m=document.createElement('div');m.className='modal';document.body.appendChild(m);
 async function render(){
  let docs=[];try{docs=await loadDocs()}catch(e){m.remove();return toast(e.message)}
  m.innerHTML=`<div class="modal-card" style="width:min(1100px,96vw);max-height:92vh;overflow:auto"><div class="section-head"><div><h2>📑 مركز الطلبات المتقدمة</h2><p class="muted">عرض سعر → أمر بيع/طلب خاص → اعتماد → مقدم → تحويل للكاشير.</p></div><div><button class="primary" data-doc-new>+ مستند</button> <button class="secondary" data-doc-close>إغلاق</button></div></div><div class="table-wrap"><table><thead><tr><th>الرقم</th><th>النوع</th><th>العميل</th><th>الإجمالي</th><th>المقدم</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>${docs.map(d=>`<tr><td><b>${esc(d.document_number||d.id)}</b></td><td>${typeLabel(d.document_type)}</td><td>${esc(d.customer_name||d.customer_phone||'-')}</td><td>${money(d.total_amount)}</td><td>${money(d.deposit_paid)} / ${money(d.deposit_required)}</td><td>${statusLabel(d.status)}</td><td>${d.status==='draft'?`<button class="secondary" data-doc-submit="${d.id}">إرسال</button>`:''}${d.status==='submitted'?`<button class="primary" data-doc-approve="${d.id}">اعتماد</button> <button class="danger" data-doc-reject="${d.id}">رفض</button>`:''}${['draft','submitted','approved','confirmed'].includes(d.status)?` <button class="secondary" data-doc-pay="${d.id}">مقدم</button>`:''}${['approved','confirmed'].includes(d.status)?` <button class="primary" data-doc-checkout="${d.id}">للكاشير</button>`:''}${!['converted','completed','cancelled'].includes(d.status)?` <button class="danger" data-doc-cancel="${d.id}">إلغاء</button>`:''}</td></tr>`).join('')||'<tr><td colspan="7">لا توجد مستندات بعد</td></tr>'}</tbody></table></div></div>`;
 }
 m.onclick=async e=>{
  if(e.target===m||e.target.closest('[data-doc-close]'))return m.remove();
  if(e.target.closest('[data-doc-new]')){if(await createDocument())await render();return}
  let b=e.target.closest('[data-doc-submit]');if(b){try{await rpc('commerce_order_document_submit_v2',{p_document_id:Number(b.dataset.docSubmit)});toast('تم إرسال المستند');await render()}catch(x){toast(x.message)}return}
  b=e.target.closest('[data-doc-approve]');if(b){try{await rpc('commerce_order_document_decide_v2',{p_document_id:Number(b.dataset.docApprove),p_approve:true,p_note:null});toast('تم الاعتماد');await render()}catch(x){toast(x.message)}return}
  b=e.target.closest('[data-doc-reject]');if(b){const note=await promptValue('سبب الرفض','',{title:'رفض'});if(note===null)return;try{await rpc('commerce_order_document_decide_v2',{p_document_id:Number(b.dataset.docReject),p_approve:false,p_note:note});toast('تم الرفض');await render()}catch(x){toast(x.message)}return}
  b=e.target.closest('[data-doc-pay]');if(b){const amt=await promptValue('قيمة المقدم','0',{title:'تسجيل مقدم',type:'number'});if(amt===null)return;const method=await promptValue('طريقة الدفع','cash',{title:'طريقة الدفع'});if(method===null)return;try{await rpc('commerce_order_document_record_payment_v2',{p_document_id:Number(b.dataset.docPay),p_method:method,p_amount:Number(amt),p_reference:null,p_client_tx_id:uuid()});toast('تم تسجيل المقدم');await render()}catch(x){toast(x.message)}return}
  b=e.target.closest('[data-doc-cancel]');if(b){const reason=await promptValue('سبب الإلغاء','',{title:'إلغاء'});if(reason===null)return;try{await rpc('commerce_order_document_cancel_v2',{p_document_id:Number(b.dataset.docCancel),p_reason:reason});toast('تم الإلغاء');await render()}catch(x){toast(x.message)}return}
  b=e.target.closest('[data-doc-checkout]');if(b){try{const p=await rpc('commerce_order_document_checkout_payload_v2',{p_document_id:Number(b.dataset.docCheckout)});const items=p?.items||[];global.state.cart=items.map(i=>({product_id:i.product_id,name:[i.product_name,i.variant_name].filter(Boolean).join(' - '),price:Number(i.unit_price||0),base_price:Number(i.unit_price||0),cost:Number(i.cost||0),qty:Number(i.quantity||0),modifiers:[],removed:[],notes:i.notes||'',variant_id:i.variant_id||null,variant_name:i.variant_name||null}));sessionStorage.setItem('sharawlaOrdersV2PendingDocument',String(b.dataset.docCheckout));m.remove();document.querySelector('#nav [data-page="pos"]')?.click();toast('تم تحميل المستند في الكاشير — أكمل الدفع لإصدار الفاتورة')}catch(x){toast(x.message)}return}
 };
 await render();
}
function wrapCheckoutRpc(){
 if(wrapped||typeof global.rpc!=='function')return;wrapped=true;const base=global.rpc.bind(global);global.rpc=async function(name,payload={}){const result=await base(name,payload);if(/^create_(retail_variant_|retail_|food_)?pos_order_atomic/.test(name)||name==='create_pos_order_atomic'){
   const pending=Number(sessionStorage.getItem('sharawlaOrdersV2PendingDocument')||0);const oid=Number(result?.order?.id||0);if(pending&&oid){try{await base('commerce_order_document_mark_converted_v2',{p_document_id:pending,p_order_id:oid});sessionStorage.removeItem('sharawlaOrdersV2PendingDocument')}catch(e){console.warn('Orders V2 mark converted',e)}}
  }return result};
}
function start(){wrapCheckoutRpc();inject();observer=new MutationObserver(()=>{inject();wrapCheckoutRpc()});observer.observe(document.body,{childList:true,subtree:true});global.__SharawlaOrdersV2=Object.freeze({version:VERSION,enabled:anyEnabled,openCenter});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
