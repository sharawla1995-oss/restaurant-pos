(function(global){
'use strict';
const VERSION='10.5.4-beta.58.33';
let observer=null,queued=false,poOpening=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const qfmt=v=>Number(v||0).toLocaleString('ar-EG',{maximumFractionDigits:3});
const money=v=>Number(v||0).toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2});
const rest=(t,q='',o={})=>global.rest(t,q,o);
const rpc=(n,p={})=>global.rpc(n,p);
const toast=m=>{try{if(typeof global.toast==='function')return global.toast(m)}catch{};console.log(m)};
const txid=()=>global.crypto?.randomUUID?.()||`b55-po-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const branch=()=>{try{return Number(global.currentBranchId?.()||0)}catch{return 0}};
function cfg(){try{return JSON.parse(localStorage.getItem('sharawlaRuntimeConfigV1')||'{}')||{}}catch{return {}}}
function hasFeature(code){return (Array.isArray(cfg().enabled_features)?cfg().enabled_features:[]).map(x=>String(x||'').toLowerCase()).includes(String(code||'').toLowerCase())}
function profile(){return String(cfg().pos_profile||'').toLowerCase()}
function style(){if(document.querySelector('#beta55UiWorkflowStyle'))return;const s=document.createElement('style');s.id='beta55UiWorkflowStyle';s.textContent=`
.beta55-hr-group{display:grid;gap:4px;width:100%}.beta55-hr-parent{display:flex!important;justify-content:space-between;align-items:center}.beta55-hr-parent .beta55-caret{opacity:.7;font-size:.82em}.beta55-hr-children{display:grid;gap:3px;padding-inline-start:12px}.beta55-hr-children.collapsed{display:none}.beta55-hr-children>button{font-size:.92em;padding-inline-start:18px!important}.beta55-hr-group.hidden{display:none!important}.beta55-hr-parent.active{font-weight:800}
.beta55-po-modal{position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.64);display:grid;place-items:center;padding:18px}.beta55-po-shell{width:min(1280px,98vw);max-height:94vh;overflow:auto;background:var(--card,#171a21);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:16px;box-shadow:0 20px 70px rgba(0,0,0,.45)}.beta55-po-head{display:flex;justify-content:space-between;gap:10px;align-items:center;position:sticky;top:-16px;background:var(--card,#171a21);padding:8px 0 12px;z-index:3}.beta55-po-head h2{margin:0}.beta55-po-meta{display:grid;grid-template-columns:repeat(4,minmax(160px,1fr));gap:10px}.beta55-po-meta label,.beta55-po-note{display:grid;gap:5px}.beta55-po-supplier{margin:12px 0;padding:12px;border:1px solid rgba(255,255,255,.09);border-radius:12px;display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:8px}.beta55-po-supplier small{opacity:.7;display:block}.beta55-po-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0}.beta55-po-toolbar input{min-width:min(360px,100%);flex:1}.beta55-po-table-wrap{overflow:auto;border:1px solid rgba(255,255,255,.08);border-radius:12px;max-height:48vh}.beta55-po-table{width:100%;border-collapse:collapse;min-width:980px}.beta55-po-table th,.beta55-po-table td{padding:9px;border-bottom:1px solid rgba(255,255,255,.07);text-align:right;vertical-align:middle}.beta55-po-table thead th{position:sticky;top:0;background:var(--card,#171a21);z-index:2}.beta55-po-table input[type=number]{width:115px}.beta55-po-row-off{display:none}.beta55-po-footer{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:end;margin-top:12px}.beta55-po-summary{min-width:250px;padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:12px}.beta55-po-summary b{font-size:1.25rem}.beta55-po-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap}
@media(max-width:820px){.beta55-po-modal{padding:5px}.beta55-po-shell{width:100vw;max-height:100vh;border-radius:0}.beta55-po-meta{grid-template-columns:1fr 1fr}.beta55-po-supplier{grid-template-columns:1fr 1fr}.beta55-po-footer{grid-template-columns:1fr}.beta55-po-actions button{flex:1}.beta55-hr-children{padding-inline-start:6px}}
`;document.head.appendChild(s)}
function dedupeAdvancedPurchasing(){const panels=[...document.querySelectorAll('[data-advanced-purchasing]')];if(panels.length<=1)return;panels.slice(1).forEach(x=>x.remove())}
function ensureHrGroup(){
 const nav=document.querySelector('#nav');if(!nav)return;
 const keys=['employees','advances','adjustments','payroll'];
 const buttons=keys.map(k=>nav.querySelector(`button[data-beta54-page="${k}"]`)).filter(Boolean);
 let group=nav.querySelector('[data-beta55-hr-group]');
 if(!buttons.length){if(group)group.classList.add('hidden');return}
 if(!group){
   group=document.createElement('div');group.className='beta55-hr-group';group.dataset.beta55HrGroup='1';
   const parent=document.createElement('button');parent.type='button';parent.className='beta55-hr-parent';parent.dataset.beta55HrToggle='1';parent.innerHTML='<span>👨‍💼 الموظفون</span><span class="beta55-caret">▼</span>';
   const children=document.createElement('div');children.className='beta55-hr-children';children.dataset.beta55HrChildren='1';
   group.append(parent,children);
   const first=buttons[0];first.parentNode.insertBefore(group,first);
   parent.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();children.classList.toggle('collapsed');parent.querySelector('.beta55-caret').textContent=children.classList.contains('collapsed')?'◀':'▼'});
 }
 const children=group.querySelector('[data-beta55-hr-children]');
 buttons.forEach(b=>{if(b.parentNode!==children)children.appendChild(b)});
 const visible=buttons.filter(b=>!b.classList.contains('hidden'));
 group.classList.toggle('hidden',visible.length===0);
 const active=visible.some(b=>b.classList.contains('active'));
 group.querySelector('[data-beta55-hr-toggle]')?.classList.toggle('active',active);
 if(active)children.classList.remove('collapsed');
}
async function loadCatalog(){
 const useVariants=hasFeature('commerce.variants');
 const [products,variants,balances,vBalances]=await Promise.all([
   rest('products','select=id,name,barcode,cost,price,active&active=eq.true&order=name'),
   useVariants?rest('product_variants','select=id,product_id,name,sku,barcode,cost,price,active,is_stock_unit&active=eq.true&is_stock_unit=eq.true&order=product_id,id').catch(()=>[]):Promise.resolve([]),
   rest('retail_inventory_balances',`select=product_id,quantity,average_unit_cost,last_purchase_cost&branch_id=eq.${branch()}`).catch(()=>[]),
   useVariants?rest('retail_variant_inventory_balances',`select=variant_id,quantity,average_unit_cost,last_purchase_cost&branch_id=eq.${branch()}`).catch(()=>[]):Promise.resolve([])
 ]);
 const bMap=new Map((balances||[]).map(x=>[String(x.product_id),x])),vbMap=new Map((vBalances||[]).map(x=>[String(x.variant_id),x]));
 const rows=[];
 for(const p of products||[]){
   const pv=(variants||[]).filter(v=>String(v.product_id)===String(p.id));
   if(pv.length){
     for(const v of pv){const b=vbMap.get(String(v.id));rows.push({product_id:Number(p.id),variant_id:Number(v.id),name:`${p.name} — ${v.name}`,sku:v.sku||'',barcode:v.barcode||p.barcode||'',stock:Number(b?.quantity||0),cost:Number(b?.last_purchase_cost??b?.average_unit_cost??v.cost??p.cost??0)})}
   }else{const b=bMap.get(String(p.id));rows.push({product_id:Number(p.id),variant_id:null,name:p.name,sku:'',barcode:p.barcode||'',stock:Number(b?.quantity||0),cost:Number(b?.last_purchase_cost??b?.average_unit_cost??p.cost??0)})}
 }
 return rows;
}
function supplierInfo(m,suppliers){const s=suppliers.find(x=>String(x.id)===String(m.querySelector('[data-b55-supplier]')?.value));const box=m.querySelector('[data-b55-supplier-info]');if(!box)return;box.innerHTML=s?`<div><small>المورد</small><b>${esc(s.name)}</b></div><div><small>الهاتف</small><b>${esc(s.phone||'—')}</b></div><div><small>شروط الدفع</small><b>${Number(s.payment_terms_days||0)} يوم</b></div><div><small>حد الائتمان</small><b>${money(s.credit_limit||0)}</b></div>`:''}
function recalcPo(m){let subtotal=0,count=0;m.querySelectorAll('[data-b55-item-row]').forEach(tr=>{const q=Number(tr.querySelector('[data-b55-q]').value||0),c=Number(tr.querySelector('[data-b55-c]').value||0),total=Math.max(0,q)*Math.max(0,c);tr.querySelector('[data-b55-line-total]').textContent=money(total);if(q>0){subtotal+=total;count++}});m.querySelector('[data-b55-count]').textContent=String(count);m.querySelector('[data-b55-subtotal]').textContent=money(subtotal)}
function filterPo(m){const q=String(m.querySelector('[data-b55-search]').value||'').trim().toLowerCase();m.querySelectorAll('[data-b55-item-row]').forEach(tr=>{const hay=String(tr.dataset.search||'').toLowerCase();tr.classList.toggle('beta55-po-row-off',q&&!hay.includes(q))})}
async function openPurchaseOrderWorkspace(){
 if(poOpening)return;poOpening=true;style();
 try{
   const [suppliers,items]=await Promise.all([
     rest('retail_suppliers','select=id,name,phone,email,address,payment_terms_days,credit_limit,default_lead_time_days,active&active=eq.true&order=name'),
     loadCatalog()
   ]);
   if(!suppliers?.length)return toast('أضف موردًا أولًا');
   if(!items?.length)return toast('لا توجد أصناف متاحة لأمر الشراء');
   const m=document.createElement('div');m.className='beta55-po-modal';m.dataset.beta55Po='1';
   m.innerHTML=`<section class="beta55-po-shell" role="dialog" aria-modal="true" aria-label="أمر شراء جديد">
   <div class="beta55-po-head"><div><h2>📥 أمر شراء جديد</h2><div class="muted">اختر المورد والأصناف والكميات من شاشة واحدة</div></div><button type="button" class="secondary" data-b55-close>✕ إغلاق</button></div>
   <div class="beta55-po-meta">
     <label>المورد<select data-b55-supplier>${suppliers.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
     <label>رقم أمر الشراء<input data-b55-po-number placeholder="تلقائي / اختياري"></label>
     <label>تاريخ التوريد المتوقع<input data-b55-expected type="datetime-local"></label>
     <label>الفرع<input value="${esc(document.querySelector('#branchName')?.textContent||String(branch()))}" disabled></label>
   </div>
   <div class="beta55-po-supplier" data-b55-supplier-info></div>
   <div class="beta55-po-toolbar"><input data-b55-search placeholder="🔎 ابحث بالاسم أو SKU أو الباركود"><span class="muted">حدد الكمية فقط للأصناف المطلوبة</span></div>
   <div class="beta55-po-table-wrap"><table class="beta55-po-table"><thead><tr><th>الصنف</th><th>SKU / باركود</th><th>المخزون الحالي</th><th>الكمية المطلوبة</th><th>تكلفة الوحدة</th><th>إجمالي السطر</th></tr></thead><tbody>${items.map((x,i)=>`<tr data-b55-item-row data-i="${i}" data-search="${esc(`${x.name} ${x.sku} ${x.barcode}`)}"><td><b>${esc(x.name)}</b></td><td>${esc(x.sku||x.barcode||'—')}</td><td>${qfmt(x.stock)}</td><td><input data-b55-q type="number" min="0" step="0.001" value="0"></td><td><input data-b55-c type="number" min="0" step="0.0001" value="${Number(x.cost||0)}"></td><td data-b55-line-total>${money(0)}</td></tr>`).join('')}</tbody></table></div>
   <div class="beta55-po-footer"><label class="beta55-po-note">ملاحظات<textarea data-b55-notes rows="3" placeholder="ملاحظات عامة على أمر الشراء"></textarea></label><div class="beta55-po-summary"><div>عدد الأصناف: <b data-b55-count>0</b></div><div>إجمالي تقديري: <b data-b55-subtotal>${money(0)}</b></div></div></div>
   <div class="beta55-po-actions"><button type="button" class="secondary" data-b55-close>إلغاء</button><button type="button" class="primary" data-b55-save>إنشاء أمر الشراء</button></div>
   </section>`;
   document.body.appendChild(m);supplierInfo(m,suppliers);recalcPo(m);
   m.querySelector('[data-b55-supplier]').addEventListener('change',()=>supplierInfo(m,suppliers));
   m.querySelector('[data-b55-search]').addEventListener('input',()=>filterPo(m));
   m.querySelectorAll('[data-b55-q],[data-b55-c]').forEach(i=>i.addEventListener('input',()=>recalcPo(m)));
   m.addEventListener('click',e=>{if(e.target===m||e.target.closest('[data-b55-close]'))m.remove()});
   m.querySelector('[data-b55-save]').addEventListener('click',async e=>{
     const btn=e.currentTarget,lines=[];
     m.querySelectorAll('[data-b55-item-row]').forEach(tr=>{const i=Number(tr.dataset.i),x=items[i],quantity=Math.round(Number(tr.querySelector('[data-b55-q]').value||0)*1000)/1000,unit_cost=Math.round(Number(tr.querySelector('[data-b55-c]').value||0)*10000)/10000;if(quantity>0)lines.push({product_id:x.product_id,variant_id:x.variant_id,quantity,unit_cost})});
     if(!lines.length)return toast('أدخل كمية لصنف واحد على الأقل');
     if(lines.some(x=>!Number.isFinite(x.quantity)||x.quantity<=0||!Number.isFinite(x.unit_cost)||x.unit_cost<0))return toast('راجع الكميات والتكاليف');
     btn.disabled=true;
     try{
       const payload={p_branch_id:branch(),p_supplier_id:Number(m.querySelector('[data-b55-supplier]').value),p_notes:m.querySelector('[data-b55-notes]').value.trim()||null,p_items:lines,p_client_tx_id:txid()};
       let id;
       if(hasFeature('inventory.purchase_orders')){
         id=await rpc('retail_purchase_order_create_v2',{...payload,p_po_number:m.querySelector('[data-b55-po-number]').value.trim()||null,p_expected_at:m.querySelector('[data-b55-expected]').value?new Date(m.querySelector('[data-b55-expected]').value).toISOString():null});
       }else{
         id=await rpc('retail_purchase_order_create',{...payload,p_items:lines.map(({product_id,quantity,unit_cost})=>({product_id,quantity,unit_cost}))});
       }
       m.remove();toast(`تم إنشاء أمر الشراء${id?` #${id}`:''}`);if(typeof global.showPage==='function')global.showPage('purchasing');
     }catch(err){toast(err?.message||String(err));btn.disabled=false}
   });
 }catch(err){toast(err?.message||String(err))}finally{poOpening=false}
}
function purchaseCapture(e){const b=e.target.closest?.('#newRetailPO,[data-ap-po]');if(!b)return;if(!['retail','restaurant'].includes(profile()))return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openPurchaseOrderWorkspace()}
function reconcile(){dedupeAdvancedPurchasing();ensureHrGroup()}
function start(){style();document.addEventListener('click',purchaseCapture,true);reconcile();observer=new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;reconcile()})});observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});global.__SharawlaBeta55UiWorkflow=Object.freeze({version:VERSION,reconcile,openPurchaseOrderWorkspace})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
