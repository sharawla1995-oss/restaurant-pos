(function(global){
'use strict';
const VERSION='variants-v1-runtime-ui.1';
const FEATURE='commerce.variants';
let observer=null;
let queued=false;

const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money=v=>Number(v||0).toFixed(2);
const toast=m=>{try{if(typeof global.toast==='function')return global.toast(m)}catch{};alert(m)};
const call=(name,payload)=>global.rpc(name,payload);
const rows=(table,query)=>global.rest(table,query);

function runtimeConfig(){
 try{return JSON.parse(localStorage.getItem('sharawlaRuntimeConfigV1')||'{}')||{}}catch{return {}}
}
function retailProfile(){
 const c=runtimeConfig();
 return String(c.pos_profile||'').toLowerCase()==='retail'&&global.SharawlaRuntimeCore?.hasEngine?.('retail')===true;
}
function capabilityEnabled(){
 const c=runtimeConfig();
 const list=Array.isArray(c.enabled_features)?c.enabled_features:[];
 return list.map(x=>String(x||'').trim().toLowerCase()).includes(FEATURE);
}
function operational(){return retailProfile()&&capabilityEnabled()}
function onProductsPage(){return String(document.querySelector('#pageTitle')?.textContent||'').trim()==='الأصناف'}
function currentBranch(){try{return Number(global.currentBranchId?.()||0)}catch{return 0}}

function ensureStyle(){
 if(document.querySelector('#retailVariantsV1Style'))return;
 const s=document.createElement('style');s.id='retailVariantsV1Style';s.textContent=`
 .variant-matrix-modal{width:min(1080px,96vw);max-height:92vh;overflow:auto}
 .variant-v1-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}
 .variant-axis-card,.variant-combo-card{border:1px solid rgba(128,128,128,.32);border-radius:12px;padding:12px}
 .variant-axis-values{display:flex;flex-wrap:wrap;gap:7px;margin-top:8px}
 .variant-axis-value{border:1px solid rgba(128,128,128,.28);border-radius:999px;padding:5px 9px;font-size:13px}
 .variant-combo-card small{display:block;margin-top:4px;opacity:.75}
 .variant-v1-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}
 .variant-v1-section{margin-top:18px;padding-top:14px;border-top:1px solid rgba(128,128,128,.25)}
 .variant-v1-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px;align-items:end}
 .variant-v1-form label{display:grid;gap:5px}
 .variant-v1-banner{padding:10px 12px;border:1px solid rgba(128,128,128,.32);border-radius:10px;margin-bottom:12px}
 `;document.head.appendChild(s);
}

async function confirmAction(message){
 try{if(typeof global.uiConfirm==='function')return await global.uiConfirm(message)}catch{}
 return confirm(message);
}
async function promptValue(message,def=''){
 try{if(typeof global.uiPrompt==='function')return await global.uiPrompt(message,def)}catch{}
 return prompt(message,def);
}

function injectButtons(){
 if(!operational()||!onProductsPage())return;
 ensureStyle();
 for(const edit of document.querySelectorAll('#page [data-edit-product]')){
  const id=Number(edit.dataset.editProduct||0);if(!id)continue;
  const cell=edit.closest('td');if(!cell||cell.querySelector(`[data-retail-variant-product="${id}"]`))continue;
  const b=document.createElement('button');b.type='button';b.className='secondary';b.dataset.retailVariantProduct=String(id);b.textContent='🎛️ المقاسات / الألوان';
  const cfg=cell.querySelector('[data-config]');
  if(cfg)cfg.insertAdjacentElement('afterend',b);else cell.appendChild(b);
 }
}

function axisOptions(matrix,selected={}){
 return (matrix.axes||[]).filter(a=>a.active!==false).map(a=>{
  const vals=(a.values||[]).filter(v=>v.active!==false);
  return `<label>${esc(a.name)}<select data-combo-axis="${a.id}"><option value="">اختر</option>${vals.map(v=>`<option value="${v.id}" ${String(selected[a.id]||'')===String(v.id)?'selected':''}>${esc(v.value)}</option>`).join('')}</select></label>`;
 }).join('');
}
function selectedMap(variant){
 const out={};for(const s of variant?.selections||[])out[String(s.axis_id)]=Number(s.value_id);return out;
}
function selectionsFromForm(root){
 return [...root.querySelectorAll('[data-combo-axis]')].map(x=>({axis_id:Number(x.dataset.comboAxis),axis_value_id:Number(x.value||0)})).filter(x=>x.axis_id&&x.axis_value_id);
}
function comboLabel(variant){
 const vals=(variant.selections||[]).map(x=>x.value).filter(Boolean);
 return vals.length?vals.join(' / '):variant.name;
}
function matrixSignature(selections){return [...selections].sort((a,b)=>a.axis_id-b.axis_id).map(x=>`${x.axis_id}=${x.axis_value_id}`).join('|')}

async function loadProduct(productId){
 const r=await rows('products',`select=id,name,price,cost,active&id=eq.${productId}&limit=1`);
 if(!r?.[0])throw new Error('الصنف غير موجود');return r[0];
}
async function loadMatrix(productId){return await call('retail_variant_matrix_get_v1',{p_product_id:Number(productId)})}

async function openMatrix(productId){
 if(!operational())return toast('ميزة Variants غير مفعلة لهذا النشاط');
 let product,matrix;
 try{[product,matrix]=await Promise.all([loadProduct(productId),loadMatrix(productId)])}catch(e){return toast(e.message||'تعذر تحميل Variants')}
 ensureStyle();
 const m=document.createElement('div');m.className='modal';
 const render=()=>{
  const activeAxes=(matrix.axes||[]).filter(a=>a.active!==false);
  m.innerHTML=`<div class="modal-card variant-matrix-modal">
   <div class="section-head"><div><h2>🎛️ Variants — ${esc(product.name)}</h2><p class="muted">مقاس × لون × Shade × سعة. كل تركيبة Stock Unit مستقلة.</p></div><button class="secondary" data-v-close>إغلاق</button></div>
   <div class="variant-v1-banner"><b>التوافق محفوظ:</b> اختيارات المطاعم القديمة Single / Double لا تتحول تلقائيًا إلى Stock Variants.</div>

   <div class="variant-v1-section"><h3>1) الخصائص والقيم</h3>
    <div class="variant-v1-grid">${(matrix.axes||[]).map(a=>`<div class="variant-axis-card"><div class="section-head"><b>${esc(a.name)}</b><span class="tag">${esc(a.code)}</span></div><div class="variant-axis-values">${(a.values||[]).map(v=>`<span class="variant-axis-value">${esc(v.value)}${v.active===false?' — موقوف':''}</span>`).join('')||'<span class="muted">لا توجد قيم</span>'}</div><div class="variant-v1-actions"><button class="secondary" data-v-add-value="${a.id}">+ قيمة</button><button class="secondary" data-v-edit-axis="${a.id}">✏️ الخاصية</button></div></div>`).join('')||'<div class="empty">أضف خاصية مثل المقاس أو اللون.</div>'}</div>
    <div class="variant-v1-actions"><button class="primary" data-v-add-axis>+ خاصية جديدة</button></div>
   </div>

   <div class="variant-v1-section"><div class="section-head"><div><h3>2) التركيبات</h3><p class="muted">SKU وBarcode مستقلان لكل تركيبة، والمخزون مستقل لكل فرع.</p></div>${activeAxes.length?'<button class="secondary" data-v-generate>⚡ توليد كل التركيبات</button>':''}</div>
    ${activeAxes.length?`<form data-v-combo-form class="variant-v1-form">${axisOptions(matrix)}<label>اسم التركيبة<input data-v-name placeholder="مثال: M / أسود"></label><label>SKU<input data-v-sku placeholder="اختياري"></label><label>Barcode<input data-v-barcode placeholder="اختياري"></label><label>سعر البيع<input data-v-price type="number" min="0" step="0.01" value="${Number(product.price||0)}"></label><label>التكلفة<input data-v-cost type="number" min="0" step="0.0001" value="${Number(product.cost||0)}"></label><button class="primary" type="submit">+ إضافة تركيبة</button></form>`:'<div class="empty">أضف خاصية وقيمة واحدة على الأقل أولًا.</div>'}
    <div class="variant-v1-grid" style="margin-top:12px">${(matrix.variants||[]).map(v=>`<div class="variant-combo-card"><div class="section-head"><b>${esc(v.name)}</b><span class="tag">${v.active===false?'موقوف':'فعال'}</span></div><div>${esc(comboLabel(v))}</div><small>SKU: ${esc(v.sku||'-')} • Barcode: ${esc(v.barcode||'-')}</small><small>بيع ${money(v.price)} • تكلفة ${money(v.cost)}</small><div class="variant-v1-actions"><button class="secondary" data-v-edit-combo="${v.variant_id}">✏️ تعديل</button><button class="secondary" data-v-stock="${v.variant_id}">📦 المخزون</button><button class="${v.active===false?'primary':'danger'}" data-v-toggle="${v.variant_id}">${v.active===false?'تشغيل':'إيقاف'}</button></div></div>`).join('')||'<div class="empty">لا توجد تركيبات بعد.</div>'}</div>
   </div>
  </div>`;
  bind();
 };
 const reload=async()=>{matrix=await loadMatrix(productId);render()};

 const saveAxis=async(axis=null)=>{
  const name=await promptValue('اسم الخاصية',axis?.name||'');if(name===null||!String(name).trim())return;
  const code=await promptValue('كود الخاصية بالإنجليزي',axis?.code||String(name).trim().toLowerCase().replace(/\s+/g,'_'));if(code===null||!String(code).trim())return;
  try{await call('retail_variant_axis_save_v1',{p_product_id:Number(productId),p_axis_id:axis?.id||null,p_code:String(code).trim(),p_name:String(name).trim(),p_sort_order:Number(axis?.sort_order||((matrix.axes||[]).length+1)*10),p_active:axis?.active!==false});await reload();toast('تم حفظ الخاصية')}catch(e){toast(e.message)}
 };
 const saveValue=async(axis)=>{
  const value=await promptValue(`قيمة ${axis.name}`,'');if(value===null||!String(value).trim())return;
  const code=await promptValue('كود القيمة',String(value).trim().toLowerCase().replace(/\s+/g,'_'));if(code===null||!String(code).trim())return;
  try{await call('retail_variant_axis_value_save_v1',{p_axis_id:Number(axis.id),p_value_id:null,p_code:String(code).trim(),p_value:String(value).trim(),p_sort_order:Number(((axis.values||[]).length+1)*10),p_active:true,p_metadata:{}});await reload();toast('تمت إضافة القيمة')}catch(e){toast(e.message)}
 };
 const saveCombo=async(form,variant=null)=>{
  const sels=selectionsFromForm(form),axes=(matrix.axes||[]).filter(a=>a.active!==false);
  if(sels.length!==axes.length)return toast('اختر قيمة لكل خاصية');
  let name=String(form.querySelector('[data-v-name]')?.value||'').trim();
  if(!name){const map=new Map;for(const a of axes)for(const v of a.values||[])map.set(`${a.id}:${v.id}`,v.value);name=sels.map(s=>map.get(`${s.axis_id}:${s.axis_value_id}`)).filter(Boolean).join(' / ')}
  try{await call('retail_variant_combination_save_v1',{p_product_id:Number(productId),p_variant_id:variant?.variant_id||null,p_name:name,p_sku:String(form.querySelector('[data-v-sku]')?.value||'').trim()||null,p_barcode:String(form.querySelector('[data-v-barcode]')?.value||'').trim()||null,p_price:Number(form.querySelector('[data-v-price]')?.value||0),p_cost:Number(form.querySelector('[data-v-cost]')?.value||0),p_active:variant?.active!==false,p_selections:sels});await reload();toast('تم حفظ التركيبة')}catch(e){toast(e.message)}
 };
 const editCombo=variant=>{
  render();const card=m.querySelector(`[data-v-edit-combo="${variant.variant_id}"]`)?.closest('.variant-combo-card');if(!card)return;
  const box=document.createElement('div');box.className='variant-v1-section';box.innerHTML=`<h3>تعديل ${esc(variant.name)}</h3><form data-v-edit-form class="variant-v1-form">${axisOptions(matrix,selectedMap(variant))}<label>الاسم<input data-v-name value="${esc(variant.name)}"></label><label>SKU<input data-v-sku value="${esc(variant.sku||'')}"></label><label>Barcode<input data-v-barcode value="${esc(variant.barcode||'')}"></label><label>سعر البيع<input data-v-price type="number" min="0" step="0.01" value="${Number(variant.price||0)}"></label><label>التكلفة<input data-v-cost type="number" min="0" step="0.0001" value="${Number(variant.cost||0)}"></label><button class="primary" type="submit">حفظ</button><button class="secondary" type="button" data-v-cancel-edit>إلغاء</button></form>`;card.insertAdjacentElement('afterend',box);box.querySelector('[data-v-cancel-edit]').onclick=()=>box.remove();box.querySelector('form').onsubmit=e=>{e.preventDefault();saveCombo(e.currentTarget,variant)};
 };
 const generateAll=async()=>{
  const axes=(matrix.axes||[]).filter(a=>a.active!==false),lists=axes.map(a=>(a.values||[]).filter(v=>v.active!==false).map(v=>({axis_id:Number(a.id),axis_value_id:Number(v.id),value:v.value,code:v.code})));
  if(!axes.length||lists.some(x=>!x.length))return toast('كل خاصية لازم يكون لها قيمة واحدة على الأقل');
  let combos=[[]];for(const list of lists)combos=combos.flatMap(c=>list.map(v=>[...c,v]));
  if(combos.length>200)return toast(`عدد التركيبات ${combos.length} كبير جدًا. قلل القيم أولًا.`);
  const existing=new Set((matrix.variants||[]).map(v=>matrixSignature((v.selections||[]).map(s=>({axis_id:Number(s.axis_id),axis_value_id:Number(s.value_id)})))));
  const missing=combos.filter(c=>!existing.has(matrixSignature(c)));
  if(!missing.length)return toast('كل التركيبات موجودة بالفعل');
  if(!await confirmAction(`سيتم إنشاء ${missing.length} تركيبة جديدة. متابعة؟`))return;
  let made=0;
  try{
   for(const c of missing){
    const label=c.map(x=>x.value).join(' / '),sku=`P${productId}-${c.map(x=>String(x.code||x.axis_value_id).replace(/[^A-Za-z0-9_-]/g,'')).join('-')}`.toUpperCase();
    await call('retail_variant_combination_save_v1',{p_product_id:Number(productId),p_variant_id:null,p_name:label,p_sku:sku,p_barcode:null,p_price:Number(product.price||0),p_cost:Number(product.cost||0),p_active:true,p_selections:c.map(x=>({axis_id:x.axis_id,axis_value_id:x.axis_value_id}))});made++;
   }
   await reload();toast(`تم إنشاء ${made} تركيبة`);
  }catch(e){await reload();toast(`${made} تم إنشاؤها — ${e.message}`)}
 };
 const stockAdjust=async variant=>{
  const branch=currentBranch();if(!branch)return toast('حدد الفرع أولًا');
  let bal=[];try{bal=await rows('retail_variant_inventory_balances',`select=quantity,track_inventory&branch_id=eq.${branch}&variant_id=eq.${variant.variant_id}&limit=1`)}catch{}
  const cur=Number(bal?.[0]?.quantity||0);const raw=await promptValue(`الرصيد الحالي ${cur}. اكتب فرق التسوية (+ إضافة / - خصم)`,'0');if(raw===null)return;const delta=Number(raw);if(!Number.isFinite(delta)||delta===0)return toast('اكتب فرق كمية صحيح غير صفر');
  try{await call('retail_variant_inventory_adjust_v1',{p_branch_id:branch,p_variant_id:Number(variant.variant_id),p_quantity_delta:delta,p_movement_type:'adjustment',p_notes:'Variant Matrix V1 UI',p_client_tx_id:(global.crypto?.randomUUID?.()||`variant-${Date.now()}-${Math.random()}`)});toast('تمت تسوية مخزون التركيبة')}catch(e){toast(e.message)}
 };

 function bind(){
  m.onclick=async e=>{
   if(e.target===m||e.target.closest('[data-v-close]')){m.remove();return}
   if(e.target.closest('[data-v-add-axis]'))return saveAxis();
   const ea=e.target.closest('[data-v-edit-axis]');if(ea)return saveAxis((matrix.axes||[]).find(x=>String(x.id)===ea.dataset.vEditAxis));
   const av=e.target.closest('[data-v-add-value]');if(av)return saveValue((matrix.axes||[]).find(x=>String(x.id)===av.dataset.vAddValue));
   if(e.target.closest('[data-v-generate]'))return generateAll();
   const ec=e.target.closest('[data-v-edit-combo]');if(ec){const v=(matrix.variants||[]).find(x=>String(x.variant_id)===ec.dataset.vEditCombo);if(v)return editCombo(v)}
   const st=e.target.closest('[data-v-stock]');if(st){const v=(matrix.variants||[]).find(x=>String(x.variant_id)===st.dataset.vStock);if(v)return stockAdjust(v)}
   const tg=e.target.closest('[data-v-toggle]');if(tg){const v=(matrix.variants||[]).find(x=>String(x.variant_id)===tg.dataset.vToggle);if(!v)return;if(!await confirmAction(`${v.active===false?'تشغيل':'إيقاف'} ${v.name}؟`))return;try{await call('retail_variant_combination_set_active_v1',{p_variant_id:Number(v.variant_id),p_active:v.active===false});await reload();toast('تم تحديث التركيبة')}catch(err){toast(err.message)}return}
  };
  const form=m.querySelector('[data-v-combo-form]');if(form)form.onsubmit=e=>{e.preventDefault();saveCombo(e.currentTarget)};
 }
 render();document.body.appendChild(m);
}

function wire(){
 if(!operational())return;
 injectButtons();
 if(!document.body.dataset.retailVariantsV1Click){
  document.body.dataset.retailVariantsV1Click='1';
  document.body.addEventListener('click',e=>{const b=e.target.closest('[data-retail-variant-product]');if(!b)return;e.preventDefault();openMatrix(Number(b.dataset.retailVariantProduct))});
 }
}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;wire()})}
function start(){
 if(!retailProfile())return;
 observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});wire();
 global.__SharawlaRetailVariantsV1=Object.freeze({version:VERSION,feature:FEATURE,operational,openMatrix});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
