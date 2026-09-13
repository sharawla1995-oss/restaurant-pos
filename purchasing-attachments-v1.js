(function(global){
'use strict';
const VERSION='purchasing-attachments-v1';
const P={view:'purchasing.attachments.view',upload:'purchasing.attachments.upload',del:'purchasing.attachments.delete'};
let perms={view:false,upload:false,del:false},started=false,observer=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const toast=m=>{try{if(typeof global.toast==='function')return global.toast(m)}catch{};alert(m)};
const rpc=(n,p={})=>global.rpc(n,p),rest=(t,q='')=>global.rest(t,q);
const branch=()=>{try{return Number(global.currentBranchId?.()||0)}catch{return 0}};
const fmtSize=n=>{n=Number(n||0);if(n<1024)return `${n} B`;if(n<1048576)return `${(n/1024).toFixed(1)} KB`;return `${(n/1048576).toFixed(1)} MB`};
const today=()=>new Date().toISOString().slice(0,10);
const types={supplier_invoice:'فاتورة مورد',receipt:'سند / إيصال',delivery_note:'إذن تسليم',payment_receipt:'إيصال دفع',credit_note:'إشعار دائن',other:'مستند آخر'};
async function has(code){try{return (await rpc('has_action_permission_v2',{p_action_code:code}))===true}catch{return false}}
async function refreshPerms(){const x=await Promise.all([has(P.view),has(P.upload),has(P.del)]);perms={view:x[0],upload:x[1],del:x[2]};syncNav();injectPurchasingButton()}
function conn(){try{return {url:String(cfg?.url||'').replace(/\/$/,''),key:String(cfg?.key||''),token:String(session?.access_token||'')}}catch{return {url:'',key:'',token:''}}}
function encodedPath(p){return String(p||'').split('/').map(encodeURIComponent).join('/')}
async function uploadObject(bucket,path,file){
 const c=conn();if(!c.url||!c.key||!c.token)throw new Error('جلسة الاتصال غير جاهزة');
 const r=await fetch(`${c.url}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath(path)}`,{method:'POST',headers:{apikey:c.key,Authorization:`Bearer ${c.token}`,'Content-Type':file.type,'x-upsert':'false'},body:file});
 let d=null;try{d=await r.json()}catch{}if(!r.ok)throw new Error(d?.message||d?.error||`فشل رفع الملف (${r.status})`);return d;
}
async function openObject(bucket,path,mime){
 const c=conn();if(!c.url||!c.key||!c.token)throw new Error('جلسة الاتصال غير جاهزة');
 const r=await fetch(`${c.url}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodedPath(path)}`,{headers:{apikey:c.key,Authorization:`Bearer ${c.token}`}});
 if(!r.ok){let d=null;try{d=await r.json()}catch{}throw new Error(d?.message||`تعذر فتح المرفق (${r.status})`)}
 const blob=await r.blob(),url=URL.createObjectURL(blob);const w=window.open(url,'_blank');if(!w)toast('اسمح بفتح النافذة لعرض المرفق');setTimeout(()=>URL.revokeObjectURL(url),120000);
}
function style(){if(document.querySelector('#purchaseAttachmentsStyle'))return;const s=document.createElement('style');s.id='purchaseAttachmentsStyle';s.textContent=`
.pa-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}.pa-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin:10px 0}.pa-filters label{display:grid;gap:5px}.pa-table-wrap{overflow:auto}.pa-table{width:100%;border-collapse:collapse;min-width:920px}.pa-table th,.pa-table td{padding:9px;border-bottom:1px solid rgba(128,128,128,.25);text-align:right;vertical-align:top}.pa-card{border:1px solid rgba(128,128,128,.25);border-radius:12px;padding:12px;margin-bottom:12px}.pa-muted{opacity:.72;font-size:.9em}.pa-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.pa-form label{display:grid;gap:5px}.pa-form .wide{grid-column:1/-1}@media(max-width:700px){.pa-form{grid-template-columns:1fr}.pa-table{min-width:780px}}
`;document.head.appendChild(s)}
function modal(title,body){style();const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card" style="max-width:820px;max-height:92vh;overflow:auto"><div class="section-head"><h2>${esc(title)}</h2><button type="button" class="secondary" data-pa-close>إغلاق</button></div>${body}</div>`;document.body.appendChild(m);m.addEventListener('click',e=>{if(e.target===m||e.target.closest('[data-pa-close]'))m.remove()});return m}
function syncNav(){
 const nav=document.querySelector('#nav');if(!nav)return;let b=nav.querySelector('[data-pa-archive-nav]');
 if(!b){b=document.createElement('button');b.type='button';b.dataset.paArchiveNav='1';b.textContent='🗂️ أرشيف فواتير الموردين';const anchor=nav.querySelector('button[data-page="reports"]')||nav.querySelector('button[data-page="settings"]');if(anchor)nav.insertBefore(b,anchor);else nav.appendChild(b);b.onclick=()=>renderArchive()}
 b.classList.toggle('hidden',!perms.view);
}
function injectPurchasingButton(){
 if(!perms.view)return;const title=String(document.querySelector('#pageTitle')?.textContent||'');if(!/المشتريات|الاستلام/.test(title))return;const page=document.querySelector('#page');if(!page||page.querySelector('[data-pa-purchase-panel]'))return;
 const box=document.createElement('div');box.className='panel';box.dataset.paPurchasePanel='1';box.innerHTML=`<div class="section-head"><div><h2>📎 مستندات المشتريات</h2><p class="muted">احتفظ بصورة الفاتورة أو السند وارجع لها بالتاريخ والمورد ورقم الفاتورة.</p></div><div style="display:flex;gap:8px;flex-wrap:wrap">${perms.upload?'<button class="primary" data-pa-upload>+ رفع فاتورة / سند</button>':''}<button class="secondary" data-pa-open>فتح الأرشيف</button></div></div>`;
 page.insertBefore(box,page.firstElementChild||null);box.querySelector('[data-pa-open]').onclick=()=>renderArchive();box.querySelector('[data-pa-upload]')?.addEventListener('click',()=>openUpload())
}
async function loadSuppliers(){return rest('retail_suppliers','select=id,name,active&active=eq.true&order=name')}
async function loadInvoices(){const b=branch();if(!b)return[];return rest('retail_supplier_invoices',`select=id,supplier_id,invoice_number,invoice_date,total_amount,status&branch_id=eq.${b}&order=invoice_date.desc,id.desc&limit=500`).catch(()=>[])}
async function openUpload(){
 if(!perms.upload)return toast('ليس لديك صلاحية رفع مرفقات المشتريات');if(!navigator.onLine)return toast('رفع الصور يحتاج اتصال بالإنترنت. يمكنك فتح الفاتورة ورفع المستند لاحقًا.');const b=branch();if(!b)return toast('اختر فرعًا أولًا');
 let suppliers,invoices;try{[suppliers,invoices]=await Promise.all([loadSuppliers(),loadInvoices()])}catch(e){return toast(e.message)}if(!suppliers.length)return toast('لا يوجد موردون فعالون');
 const m=modal('رفع فاتورة أو سند شراء',`<div class="pa-form">
 <label>المورد<select data-f="supplier">${suppliers.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
 <label>فاتورة مورد مرتبطة<select data-f="invoice"><option value="">بدون ربط بفاتورة مسجلة</option></select></label>
 <label>نوع المستند<select data-f="type">${Object.entries(types).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
 <label>تاريخ المستند<input data-f="date" type="date" value="${today()}"></label>
 <label>رقم الفاتورة / السند<input data-f="ref" placeholder="مثال INV-4587"></label>
 <label class="wide">ملاحظة<input data-f="note" placeholder="فاتورة أصلية، إيصال تحويل... (اختياري)"></label>
 <label class="wide">الملفات<input data-f="files" type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"><span class="pa-muted">صور أو PDF — حد أقصى 15MB للملف.</span></label>
 </div><div class="modal-actions"><button type="button" class="primary" data-pa-save>رفع وحفظ</button></div><div class="pa-muted" data-pa-progress></div>`);
 const sEl=m.querySelector('[data-f="supplier"]'),iEl=m.querySelector('[data-f="invoice"]'),dEl=m.querySelector('[data-f="date"]'),rEl=m.querySelector('[data-f="ref"]');
 const refill=()=>{const sid=Number(sEl.value);const rows=invoices.filter(x=>Number(x.supplier_id)===sid);iEl.innerHTML='<option value="">بدون ربط بفاتورة مسجلة</option>'+rows.map(x=>`<option value="${x.id}">#${esc(x.invoice_number)} — ${esc(x.invoice_date||'')}</option>`).join('')};
 refill();sEl.onchange=refill;iEl.onchange=()=>{const x=invoices.find(v=>String(v.id)===iEl.value);if(x){dEl.value=x.invoice_date||today();if(!rEl.value)rEl.value=x.invoice_number||''}};
 m.querySelector('[data-pa-save]').onclick=async e=>{const btn=e.currentTarget,files=[...(m.querySelector('[data-f="files"]').files||[])];if(!files.length)return toast('اختر صورة أو PDF');if(files.length>8)return toast('يمكن رفع 8 ملفات كحد أقصى في المرة الواحدة');btn.disabled=true;const progress=m.querySelector('[data-pa-progress]');let ok=0;try{
   for(let idx=0;idx<files.length;idx++){const file=files[idx];progress.textContent=`جاري رفع ${idx+1} من ${files.length}: ${file.name}`;if(file.size>15728640)throw new Error(`${file.name}: أكبر من 15MB`);const prep=await rpc('purchase_attachment_prepare_v1',{p_branch_id:b,p_supplier_id:Number(sEl.value),p_supplier_invoice_id:Number(iEl.value)||null,p_document_type:m.querySelector('[data-f="type"]').value,p_document_date:dEl.value||today(),p_reference_number:rEl.value.trim()||null,p_note:m.querySelector('[data-f="note"]').value.trim()||null,p_original_file_name:file.name,p_mime_type:file.type,p_file_size:file.size});const id=Number(prep?.attachment_id||0);try{await uploadObject(prep.bucket,prep.path,file);await rpc('purchase_attachment_finalize_v1',{p_attachment_id:id});ok++}catch(err){if(id)await rpc('purchase_attachment_abort_v1',{p_attachment_id:id,p_reason:err.message}).catch(()=>{});throw err}}
   toast(`تم حفظ ${ok} مرفق`);m.remove();renderArchive();
 }catch(err){toast(err.message||String(err));btn.disabled=false;progress.textContent='تعذر إكمال الرفع. لم يتم اعتماد الملف غير المكتمل.'}}
}
async function queryArchive(filters={}){const b=branch();if(!b)throw new Error('اختر فرعًا أولًا');return rpc('purchase_attachment_list_v1',{p_branch_id:b,p_supplier_id:filters.supplier?Number(filters.supplier):null,p_from:filters.from||null,p_to:filters.to||null,p_search:filters.search||null})}
async function renderArchive(initial={}){
 if(!perms.view)return toast('ليس لديك صلاحية عرض أرشيف المشتريات');style();const page=document.querySelector('#page'),title=document.querySelector('#pageTitle');if(title)title.textContent='أرشيف فواتير الموردين';document.querySelectorAll('#nav button').forEach(x=>x.classList.remove('active'));document.querySelector('[data-pa-archive-nav]')?.classList.add('active');if(page)page.innerHTML='<div class="pa-muted">جاري تحميل الأرشيف…</div>';
 let suppliers,rows;try{[suppliers,rows]=await Promise.all([loadSuppliers(),queryArchive(initial)])}catch(e){if(page)page.innerHTML=`<div class="panel">${esc(e.message)}</div>`;return}
 const typeLabel=x=>types[x]||x;const table=()=>`<div class="pa-table-wrap"><table class="pa-table"><thead><tr><th>التاريخ</th><th>المورد</th><th>النوع</th><th>رقم الفاتورة/السند</th><th>الملف</th><th>الحجم</th><th>وقت الرفع</th><th></th></tr></thead><tbody>${(rows||[]).map(r=>`<tr><td>${esc(r.document_date||'')}</td><td>${esc(r.supplier_name||'')}</td><td>${esc(typeLabel(r.document_type))}</td><td>${esc(r.reference_number||r.invoice_number||'—')}</td><td><b>${esc(r.original_file_name)}</b>${r.note?`<div class="pa-muted">${esc(r.note)}</div>`:''}</td><td>${fmtSize(r.file_size)}</td><td>${new Date(r.uploaded_at).toLocaleString('ar-EG')}</td><td><button class="secondary" data-pa-view="${r.id}">عرض</button>${perms.del?` <button class="danger" data-pa-del="${r.id}">حذف</button>`:''}</td></tr>`).join('')||'<tr><td colspan="8">لا توجد مرفقات مطابقة.</td></tr>'}</tbody></table></div>`;
 page.innerHTML=`<div class="panel"><div class="section-head"><div><h2>🗂️ أرشيف فواتير الموردين</h2><p class="muted">ابحث بالتاريخ أو المورد أو رقم الفاتورة وافتح الصورة أو الـPDF وقت ما تحتاج.</p></div>${perms.upload?'<button class="primary" data-pa-upload>+ رفع فاتورة / سند</button>':''}</div><div class="pa-filters"><label>المورد<select data-q="supplier"><option value="">كل الموردين</option>${suppliers.map(s=>`<option value="${s.id}" ${String(initial.supplier||'')===String(s.id)?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><label>من<input type="date" data-q="from" value="${esc(initial.from||'')}"></label><label>إلى<input type="date" data-q="to" value="${esc(initial.to||'')}"></label><label>بحث<input data-q="search" value="${esc(initial.search||'')}" placeholder="رقم فاتورة، مورد، اسم ملف"></label></div><div class="pa-toolbar"><button class="secondary" data-pa-filter>بحث</button><button class="secondary" data-pa-clear>مسح الفلاتر</button><span class="pa-muted">عدد المرفقات: ${(rows||[]).length}</span></div><div data-pa-results>${table()}</div></div>`;
 page.querySelector('[data-pa-upload]')?.addEventListener('click',()=>openUpload());page.querySelector('[data-pa-filter]').onclick=()=>renderArchive({supplier:page.querySelector('[data-q="supplier"]').value,from:page.querySelector('[data-q="from"]').value,to:page.querySelector('[data-q="to"]').value,search:page.querySelector('[data-q="search"]').value.trim()});page.querySelector('[data-pa-clear]').onclick=()=>renderArchive({});
 page.querySelectorAll('[data-pa-view]').forEach(b=>b.onclick=async()=>{const r=(rows||[]).find(x=>String(x.id)===b.dataset.paView);if(!r)return;try{await openObject(r.storage_bucket,r.storage_path,r.mime_type)}catch(e){toast(e.message)}});
 page.querySelectorAll('[data-pa-del]').forEach(b=>b.onclick=async()=>{const r=(rows||[]).find(x=>String(x.id)===b.dataset.paDel);if(!r)return;let reason='';try{reason=typeof global.uiPrompt==='function'?await global.uiPrompt('سبب حذف المرفق',''):prompt('سبب حذف المرفق','')}catch{}if(reason===null)return;try{await rpc('purchase_attachment_soft_delete_v1',{p_attachment_id:Number(r.id),p_reason:String(reason||'').trim()||null});toast('تم إخفاء المرفق مع الاحتفاظ بسجل التدقيق');renderArchive(initial)}catch(e){toast(e.message)}})
}
function watch(){if(observer)return;observer=new MutationObserver(()=>{syncNav();injectPurchasingButton()});observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true})}
async function start(){if(started)return;started=true;style();watch();await refreshPerms().catch(()=>{});document.addEventListener('sharawla-permissions-v2-change',()=>refreshPerms().catch(()=>{}));document.addEventListener('sharawla-runtime-ready',()=>refreshPerms().catch(()=>{}))}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
global.__SharawlaPurchasingAttachmentsV1=Object.freeze({version:VERSION,refreshPermissions:refreshPerms,openArchive:renderArchive,openUpload});
})(window);
