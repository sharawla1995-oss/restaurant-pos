(function(global){
'use strict';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2});
const qty=v=>Number(v||0).toLocaleString('ar-EG',{maximumFractionDigits:3});
const today=()=>new Date().toISOString().slice(0,10);
const isPharmacy=()=>{try{return String(global.runtimeConfig?.()?.pos_profile||'').toLowerCase()==='pharmacy'}catch{return false}};
const branch=()=>Number(global.currentBranchId?.()||global.state?.activeBranchId||0);
const products=()=>Array.isArray(global.state?.products)?global.state.products:[];
const productById=id=>products().find(p=>String(p.id)===String(id));
const toast=m=>global.toast?.(m)||console.log(m);
const rest=(t,q='')=>global.rest(t,q);
const rpc=(n,p={})=>global.rpc(n,p);
const page=()=>$('#page');

const PHARMACY_PAGES=[
 ['pharmacyCatalog','💊','دليل الأدوية'],['pharmacyBatches','🧪','الباتشات والتشغيلات'],['pharmacyExpiry','⏳','الصلاحيات والتنبيهات'],
 ['pharmacyPrescriptions','🩺','الروشتات'],['pharmacyInsurance','🛡️','شركات التأمين'],['pharmacyClaims','📑','مطالبات التأمين']
];
let cache={details:[],batches:[],companies:[],plans:[],prescriptions:[],claims:[]};
let cart=[];

function setTitle(t){if($('#pageTitle'))$('#pageTitle').textContent=t}
function activateNav(key){$$('#nav button').forEach(b=>b.classList.remove('active'));$(`#nav [data-pharmacy-page="${key}"]`)?.classList.add('active')}
function setPage(key,title,html){setTitle(title);activateNav(key);page().innerHTML=html}
function addNav(){
 if(!isPharmacy())return;
 const nav=$('#nav');if(!nav||nav.querySelector('[data-pharmacy-page]'))return;
 const anchor=nav.querySelector('button[data-page="customers"]');
 let after=anchor;
 for(const [key,icon,title] of PHARMACY_PAGES){const b=document.createElement('button');b.type='button';b.dataset.pharmacyPage=key;b.textContent=`${icon} ${title}`;after?.after(b);after=b}
}
function hideRetailOnly(){
 if(!isPharmacy())return;
 ['kitchen','marketSettings','retailOffers'].forEach(k=>{const b=$(`#nav button[data-page="${k}"]`);if(b)b.classList.add('hidden')});
 const pos=$('#nav button[data-page="pos"]');if(pos)pos.textContent='💊 كاشير الصيدلية';
 const prod=$('#nav button[data-page="products"]');if(prod)prod.textContent='📦 الأصناف الأساسية';
}
async function loadBase(){
 if(!isPharmacy())return;
 const b=branch();
 const [details,batches,companies,plans,prescriptions,claims]=await Promise.all([
  rest('pharmacy_product_details','select=*'),
  b?rest('pharmacy_batches',`select=*&branch_id=eq.${b}&order=expiry_date.asc,id.asc`):Promise.resolve([]),
  rest('pharmacy_insurance_companies','select=*&order=name.asc'),
  rest('pharmacy_insurance_plans','select=*&order=name.asc'),
  b?rest('pharmacy_prescriptions',`select=*&branch_id=eq.${b}&order=created_at.desc&limit=200`):Promise.resolve([]),
  b?rest('pharmacy_insurance_claims',`select=*&branch_id=eq.${b}&order=created_at.desc&limit=200`):Promise.resolve([])
 ]);
 cache={details:details||[],batches:batches||[],companies:companies||[],plans:plans||[],prescriptions:prescriptions||[],claims:claims||[]};
}
function detailFor(id){return cache.details.find(x=>String(x.product_id)===String(id))||null}
function stockFor(id){return cache.batches.filter(x=>String(x.product_id)===String(id)&&x.active!==false&&Number(x.quantity)>0&&String(x.expiry_date)>=today()).reduce((a,x)=>a+Number(x.quantity||0),0)}

async function renderCatalog(){
 await loadBase();
 setPage('pharmacyCatalog','دليل الأدوية',`<div class="panel"><div class="section-head"><div><h2>💊 دليل الأدوية</h2><p class="muted">الاسم العلمي، المادة الفعالة، التركيز، الشكل الدوائي، الشركة، اشتراط الروشتة والدواء المراقب.</p></div></div><input id="phDrugSearch" placeholder="بحث بالاسم / الباركود / المادة الفعالة / الاسم العلمي / الشركة"><div id="phDrugRows" class="table-wrap"></div></div>`);
 const render=()=>{const q=$('#phDrugSearch').value.trim().toLowerCase();const rows=products().filter(p=>p.active!==false).map(p=>({p,d:detailFor(p.id)})).filter(({p,d})=>!q||[p.name,p.barcode,d?.scientific_name,d?.active_ingredient,d?.manufacturer,d?.strength].some(v=>String(v||'').toLowerCase().includes(q)));$('#phDrugRows').innerHTML=`<table><thead><tr><th>الدواء</th><th>المادة الفعالة</th><th>التركيز/الشكل</th><th>الشركة</th><th>روشتة</th><th>مراقب</th><th>المتاح</th><th>إجراء</th></tr></thead><tbody>${rows.map(({p,d})=>`<tr><td><b>${esc(p.name)}</b><small><br>${esc(p.barcode||'')}</small></td><td>${esc(d?.active_ingredient||d?.scientific_name||'—')}</td><td>${esc([d?.strength,d?.dosage_form].filter(Boolean).join(' · ')||'—')}</td><td>${esc(d?.manufacturer||'—')}</td><td>${d?.prescription_required?'✅':'—'}</td><td>${d?.controlled_drug?'⚠️':'—'}</td><td>${qty(stockFor(p.id))}</td><td><button data-ph-edit="${p.id}">تعديل</button><button class="secondary" data-ph-alt="${p.id}">بديل</button></td></tr>`).join('')||'<tr><td colspan="8">لا توجد نتائج</td></tr>'}</tbody></table>`;$$('[data-ph-edit]').forEach(b=>b.onclick=()=>editDrug(Number(b.dataset.phEdit)));$$('[data-ph-alt]').forEach(b=>b.onclick=()=>addSubstitute(Number(b.dataset.phAlt)))};
 $('#phDrugSearch').oninput=render;render();
}
async function editDrug(id){
 const p=productById(id),d=detailFor(id)||{};if(!p)return;
 const scientific=await global.uiPrompt?.('الاسم العلمي',d.scientific_name||'',{title:p.name});if(scientific===null)return;
 const active=await global.uiPrompt?.('المادة الفعالة',d.active_ingredient||'');if(active===null)return;
 const strength=await global.uiPrompt?.('التركيز',d.strength||'');if(strength===null)return;
 const form=await global.uiPrompt?.('الشكل الدوائي (أقراص/شراب/حقن...)',d.dosage_form||'');if(form===null)return;
 const mfr=await global.uiPrompt?.('الشركة المصنعة',d.manufacturer||'');if(mfr===null)return;
 const reg=await global.uiPrompt?.('رقم التسجيل',d.registration_no||'');if(reg===null)return;
 const rx=await global.uiConfirm?.('هل يحتاج روشتة؟',{title:'اشتراط الروشتة',okText:'نعم'});
 const controlled=await global.uiConfirm?.('هل الدواء مراقب/جدول؟',{title:'دواء مراقب',okText:'نعم'});
 const reorder=await global.uiPrompt?.('حد إعادة الطلب',String(d.reorder_level??0),{type:'number'});if(reorder===null)return;
 try{await rpc('pharmacy_upsert_product_details',{p_product_id:id,p_data:{scientific_name:scientific,active_ingredient:active,strength,dosage_form:form,manufacturer:mfr,registration_no:reg,prescription_required:!!rx,controlled_drug:!!controlled,track_batch:true,reorder_level:Number(reorder)||0,unit_name:d.unit_name||'وحدة',pack_size:Number(d.pack_size||1)}});toast('تم حفظ بيانات الدواء');renderCatalog()}catch(e){toast(e.message||e)}
}
async function addSubstitute(id){
 const options=products().filter(p=>p.active!==false&&p.id!==id).map(p=>`${p.id} - ${p.name}`).join('\n');
 const v=await global.uiPrompt?.(`رقم الدواء البديل:\n${options.slice(0,1800)}`,'',{title:'إضافة بديل'});if(v===null)return;const sub=Number(String(v).split(/\s|-/)[0]);if(!sub)return toast('رقم غير صالح');
 const notes=await global.uiPrompt?.('ملاحظات البديل','');if(notes===null)return;
 try{await rpc('pharmacy_save_substitute',{p_product_id:id,p_substitute_product_id:sub,p_notes:notes,p_active:true});toast('تم حفظ البديل')}catch(e){toast(e.message||e)}
}

async function renderBatches(mode='all'){
 await loadBase();
 setPage('pharmacyBatches','الباتشات والتشغيلات',`<div class="panel"><div class="section-head"><div><h2>🧪 الباتشات والتشغيلات</h2><p class="muted">استلام باتشات، FEFO، كمية، تكلفة، سعر بيع وصلاحية.</p></div><button id="phReceive" class="primary">➕ استلام باتش</button></div><div class="filter-row"><input id="phBatchSearch" placeholder="بحث بالدواء أو رقم الباتش"><select id="phBatchFilter"><option value="all">الكل</option><option value="valid">ساري</option><option value="expiring">ينتهي خلال 90 يوم</option><option value="expired">منتهي</option></select></div><div id="phBatchRows" class="table-wrap"></div></div>`);
 const render=()=>{const q=$('#phBatchSearch').value.trim().toLowerCase(),f=$('#phBatchFilter').value,now=new Date(),d90=new Date(Date.now()+90*86400000);let rows=cache.batches.filter(x=>{const p=productById(x.product_id),ex=new Date(x.expiry_date);if(q&&!String(p?.name||'').toLowerCase().includes(q)&&!String(x.batch_no||'').toLowerCase().includes(q))return false;if(f==='valid'&&ex<now)return false;if(f==='expired'&&ex>=now)return false;if(f==='expiring'&&(ex<now||ex>d90))return false;return true});$('#phBatchRows').innerHTML=`<table><thead><tr><th>الدواء</th><th>Batch</th><th>الصلاحية</th><th>الكمية</th><th>التكلفة</th><th>سعر البيع</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>${rows.map(x=>{const ex=new Date(x.expiry_date),expired=ex<now,soon=!expired&&ex<=d90;return `<tr><td>${esc(productById(x.product_id)?.name||x.product_id)}</td><td>${esc(x.batch_no)}</td><td>${esc(x.expiry_date)}</td><td>${qty(x.quantity)}</td><td>${money(x.cost)}</td><td>${x.sale_price==null?'—':money(x.sale_price)}</td><td>${expired?'⛔ منتهي':soon?'⚠️ قريب':'✅ ساري'}</td><td><button data-ph-adjust="${x.id}">تسوية</button><button class="danger" data-ph-waste="${x.id}">هالك</button></td></tr>`}).join('')||'<tr><td colspan="8">لا توجد باتشات</td></tr>'}</tbody></table>`;$$('[data-ph-adjust]').forEach(b=>b.onclick=()=>adjustBatch(Number(b.dataset.phAdjust),'adjustment'));$$('[data-ph-waste]').forEach(b=>b.onclick=()=>adjustBatch(Number(b.dataset.phWaste),'waste'))};
 $('#phBatchSearch').oninput=render;$('#phBatchFilter').onchange=render;$('#phBatchFilter').value=mode;$('#phReceive').onclick=receiveBatch;render();
}
async function receiveBatch(){
 const list=products().filter(p=>p.active!==false).map(p=>`${p.id} - ${p.name}`).join('\n');const pv=await global.uiPrompt?.(`رقم الصنف:\n${list.slice(0,1800)}`,'',{title:'استلام باتش'});if(pv===null)return;const productId=Number(String(pv).split(/\s|-/)[0]);if(!productId)return toast('الصنف غير صالح');
 const batchNo=await global.uiPrompt?.('رقم الباتش / التشغيلة','');if(!batchNo)return;const expiry=await global.uiPrompt?.('تاريخ الصلاحية YYYY-MM-DD','',{title:'الصلاحية'});if(!expiry)return;const q=await global.uiPrompt?.('الكمية','1',{type:'number'});if(q===null)return;const cost=await global.uiPrompt?.('تكلفة الوحدة','0',{type:'number'});if(cost===null)return;const price=await global.uiPrompt?.('سعر البيع (اختياري)','',{type:'number'});if(price===null)return;
 try{await rpc('pharmacy_receive_batch',{p_branch_id:branch(),p_product_id:productId,p_batch_no:batchNo,p_expiry_date:expiry,p_quantity:Number(q),p_cost:Number(cost)||0,p_sale_price:price===''?null:Number(price),p_supplier_id:null,p_notes:'Pharmacy UI receive'});toast('تم استلام الباتش');renderBatches()}catch(e){toast(e.message||e)}
}
async function adjustBatch(id,type){const delta=await global.uiPrompt?.(type==='waste'?'اكتب كمية الهالك بالسالب مثال -2':'فرق الكمية (+ أو -)','0',{type:'number'});if(delta===null)return;const reason=await global.uiPrompt?.('السبب','');if(reason===null)return;try{await rpc('pharmacy_adjust_batch',{p_batch_id:id,p_quantity_delta:Number(delta),p_reason:reason,p_movement_type:type});toast('تم تحديث الباتش');renderBatches()}catch(e){toast(e.message||e)}}

async function renderExpiry(){
 await loadBase();const now=new Date(),d30=new Date(Date.now()+30*86400000),d90=new Date(Date.now()+90*86400000);const rows=cache.batches.filter(x=>x.active!==false&&Number(x.quantity)>0).sort((a,b)=>String(a.expiry_date).localeCompare(String(b.expiry_date)));
 const expired=rows.filter(x=>new Date(x.expiry_date)<now),soon30=rows.filter(x=>new Date(x.expiry_date)>=now&&new Date(x.expiry_date)<=d30),soon90=rows.filter(x=>new Date(x.expiry_date)>d30&&new Date(x.expiry_date)<=d90);
 setPage('pharmacyExpiry','الصلاحيات والتنبيهات',`<div class="grid report-kpis"><div class="card kpi"><small>منتهي</small><strong>${expired.length}</strong></div><div class="card kpi"><small>خلال 30 يوم</small><strong>${soon30.length}</strong></div><div class="card kpi"><small>31-90 يوم</small><strong>${soon90.length}</strong></div></div><div class="panel"><h2>⏳ متابعة الصلاحية FEFO</h2><div class="table-wrap"><table><thead><tr><th>الدواء</th><th>الباتش</th><th>الصلاحية</th><th>الكمية</th><th>تنبيه</th></tr></thead><tbody>${[...expired,...soon30,...soon90].map(x=>`<tr><td>${esc(productById(x.product_id)?.name||x.product_id)}</td><td>${esc(x.batch_no)}</td><td>${esc(x.expiry_date)}</td><td>${qty(x.quantity)}</td><td>${new Date(x.expiry_date)<now?'⛔ منتهي':new Date(x.expiry_date)<=d30?'🔴 عاجل':'🟠 قريب'}</td></tr>`).join('')||'<tr><td colspan="5">لا توجد صلاحيات قريبة</td></tr>'}</tbody></table></div></div>`);
}

async function renderPrescriptions(){
 await loadBase();let web=[];try{web=await rest('pharmacy_web_prescription_requests',`select=*&branch_id=eq.${branch()}&order=created_at.desc&limit=100`)}catch{}
 setPage('pharmacyPrescriptions','الروشتات',`<div class="panel"><div class="section-head"><div><h2>🩺 الروشتات</h2><p class="muted">روشتات الفرع وطلبات الروشتة القادمة من الموقع.</p></div><button id="phAddRx" class="primary">➕ روشتة جديدة</button></div><div class="table-wrap"><table><thead><tr><th>#</th><th>العميل</th><th>الطبيب</th><th>التاريخ</th><th>الحالة</th><th>فاتورة</th></tr></thead><tbody>${cache.prescriptions.map(r=>`<tr><td>${r.id}</td><td>${esc(r.customer_name||r.customer_phone||'—')}</td><td>${esc(r.doctor_name||'—')}</td><td>${esc(r.prescription_date||'—')}</td><td>${esc(r.status)}</td><td>${r.order_id||'—'}</td></tr>`).join('')||'<tr><td colspan="6">لا توجد روشتات</td></tr>'}</tbody></table></div></div><div class="panel"><h2>🌐 طلبات روشتات الموقع</h2><div class="table-wrap"><table><thead><tr><th>#</th><th>العميل</th><th>الهاتف</th><th>النوع</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>${(web||[]).map(r=>`<tr><td>${r.id}</td><td>${esc(r.customer_name)}</td><td dir="ltr">${esc(r.customer_phone)}</td><td>${r.order_type==='delivery'?'توصيل':'استلام'}</td><td>${esc(r.status)}</td><td><button data-rx-review="${r.id}">قيد المراجعة</button><button class="danger" data-rx-reject="${r.id}">رفض</button></td></tr>`).join('')||'<tr><td colspan="6">لا توجد طلبات موقع</td></tr>'}</tbody></table></div></div>`);
 $('#phAddRx').onclick=createPrescription;$$('[data-rx-review]').forEach(b=>b.onclick=()=>updateWebRx(Number(b.dataset.rxReview),'reviewing'));$$('[data-rx-reject]').forEach(b=>b.onclick=()=>updateWebRx(Number(b.dataset.rxReject),'rejected'));
}
async function createPrescription(){
 const name=await global.uiPrompt?.('اسم المريض','');if(name===null)return;const phone=await global.uiPrompt?.('رقم الهاتف','');if(phone===null)return;const doctor=await global.uiPrompt?.('اسم الطبيب','');if(doctor===null)return;const drug=await global.uiPrompt?.('اسم الدواء المكتوب','');if(drug===null)return;const dose=await global.uiPrompt?.('الجرعة','');if(dose===null)return;const q=await global.uiPrompt?.('الكمية','1',{type:'number'});if(q===null)return;
 try{await rpc('pharmacy_create_prescription',{p_branch_id:branch(),p_customer_id:null,p_customer_name:name,p_customer_phone:phone,p_doctor_name:doctor,p_doctor_license:null,p_prescription_date:today(),p_image_url:null,p_notes:null,p_items:[{requested_name:drug,dose,quantity:Number(q)||1}]});toast('تم حفظ الروشتة');renderPrescriptions()}catch(e){toast(e.message||e)}
}
async function updateWebRx(id,status){try{await rpc('pharmacy_update_web_rx_status',{p_request_id:id,p_status:status,p_prescription_id:null});toast('تم تحديث الطلب');renderPrescriptions()}catch(e){toast(e.message||e)}}

async function renderInsurance(){
 await loadBase();setPage('pharmacyInsurance','شركات التأمين',`<div class="panel"><div class="section-head"><div><h2>🛡️ شركات التأمين</h2><p class="muted">الشركات، الخطط، نسبة تحمل المريض وحد التغطية والموافقة المسبقة.</p></div><div><button id="phAddCompany" class="primary">➕ شركة</button><button id="phAddPlan">➕ خطة</button></div></div><div class="table-wrap"><table><thead><tr><th>الشركة</th><th>الكود</th><th>الهاتف</th><th>التسوية</th><th>الحالة</th></tr></thead><tbody>${cache.companies.map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.code||'—')}</td><td>${esc(c.phone||'—')}</td><td>${c.settlement_days} يوم</td><td>${c.active?'✅':'⛔'}</td></tr>`).join('')||'<tr><td colspan="5">لا توجد شركات</td></tr>'}</tbody></table></div></div><div class="panel"><h2>📋 خطط التأمين</h2><div class="table-wrap"><table><thead><tr><th>الشركة</th><th>الخطة</th><th>تحمل المريض</th><th>حد التغطية</th><th>موافقة</th></tr></thead><tbody>${cache.plans.map(p=>`<tr><td>${esc(cache.companies.find(c=>String(c.id)===String(p.company_id))?.name||p.company_id)}</td><td>${esc(p.name)}</td><td>${Number(p.patient_copay_percent||0)}%</td><td>${p.max_coverage==null?'—':money(p.max_coverage)}</td><td>${p.requires_approval?'مطلوبة':'—'}</td></tr>`).join('')||'<tr><td colspan="5">لا توجد خطط</td></tr>'}</tbody></table></div></div>`);$('#phAddCompany').onclick=addCompany;$('#phAddPlan').onclick=addPlan;
}
async function addCompany(){const name=await global.uiPrompt?.('اسم شركة التأمين','');if(!name)return;const code=await global.uiPrompt?.('الكود','');if(code===null)return;const days=await global.uiPrompt?.('مدة التسوية بالأيام','30',{type:'number'});if(days===null)return;try{await rpc('pharmacy_save_insurance_company',{p_id:null,p_name:name,p_code:code,p_phone:null,p_email:null,p_settlement_days:Number(days)||30,p_active:true,p_notes:null});toast('تمت إضافة الشركة');renderInsurance()}catch(e){toast(e.message||e)}}
async function addPlan(){await loadBase();if(!cache.companies.length)return toast('أضف شركة تأمين أولًا');const cid=await global.uiPrompt?.('رقم الشركة\n'+cache.companies.map(c=>`${c.id} - ${c.name}`).join('\n'),String(cache.companies[0].id));if(cid===null)return;const name=await global.uiPrompt?.('اسم الخطة','');if(!name)return;const copay=await global.uiPrompt?.('نسبة تحمل المريض %','20',{type:'number'});if(copay===null)return;const max=await global.uiPrompt?.('حد التغطية (اترك فارغًا بدون حد)','',{type:'number'});if(max===null)return;const approval=await global.uiConfirm?.('هل تحتاج موافقة مسبقة؟',{okText:'نعم'});try{await rpc('pharmacy_save_insurance_plan',{p_id:null,p_company_id:Number(cid),p_name:name,p_code:null,p_patient_copay_percent:Number(copay)||0,p_max_coverage:max===''?null:Number(max),p_requires_approval:!!approval,p_active:true});toast('تمت إضافة الخطة');renderInsurance()}catch(e){toast(e.message||e)}}

async function renderClaims(){
 await loadBase();setPage('pharmacyClaims','مطالبات التأمين',`<div class="panel"><div class="section-head"><div><h2>📑 مطالبات التأمين</h2><p class="muted">Draft → Submitted → Approved / Rejected → Settled.</p></div></div><div class="table-wrap"><table><thead><tr><th>#</th><th>الفاتورة</th><th>الشركة</th><th>الإجمالي</th><th>المريض</th><th>التأمين</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>${cache.claims.map(c=>`<tr><td>${c.id}</td><td>#${c.order_id}</td><td>${esc(cache.companies.find(x=>String(x.id)===String(c.company_id))?.name||c.company_id)}</td><td>${money(c.gross_amount)}</td><td>${money(c.patient_amount)}</td><td>${money(c.insurer_amount)}</td><td>${esc(c.status)}</td><td><select data-claim-status="${c.id}"><option value="draft">مسودة</option><option value="submitted">مرسلة</option><option value="approved">مقبولة</option><option value="partially_approved">مقبولة جزئيًا</option><option value="rejected">مرفوضة</option><option value="settled">تمت التسوية</option><option value="cancelled">ملغاة</option></select></td></tr>`).join('')||'<tr><td colspan="8">لا توجد مطالبات</td></tr>'}</tbody></table></div></div>`);$$('[data-claim-status]').forEach(s=>{s.value=cache.claims.find(c=>String(c.id)===String(s.dataset.claimStatus))?.status||'draft';s.onchange=()=>updateClaim(Number(s.dataset.claimStatus),s.value)});
}
async function updateClaim(id,status){try{await rpc('pharmacy_update_claim_status',{p_claim_id:id,p_status:status,p_notes:null});toast('تم تحديث المطالبة');renderClaims()}catch(e){toast(e.message||e)}}

async function renderPharmacyPOS(){
 if(!isPharmacy())return;
 await loadBase();cart=[];
 setTitle('كاشير الصيدلية');$$('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page==='pos'));
 page().innerHTML=`<div class="retail-checkout-shell"><section class="retail-catalog catalog"><div class="retail-scan-row"><input id="phPosSearch" class="retail-scan-input" placeholder="اسم الدواء / باركود / مادة فعالة"><button id="phPosRefresh">↻</button></div><div id="phPosGrid" class="product-grid"></div></section><section class="retail-cart cart"><h2>فاتورة الصيدلية</h2><div id="phCart"></div><div class="settings-list compact"><div class="setting-switch"><span>الإجمالي</span><b id="phTotal">0.00</b></div></div><label>الروشتة<select id="phRx"><option value="">بدون روشتة</option>${cache.prescriptions.filter(r=>r.status==='open'||r.status==='partially_dispensed').map(r=>`<option value="${r.id}">#${r.id} ${esc(r.customer_name||r.customer_phone||'')}</option>`).join('')}</select></label><label>شركة التأمين<select id="phInsCompany"><option value="">بدون تأمين</option>${cache.companies.filter(c=>c.active).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label><label>الخطة<select id="phInsPlan"><option value="">—</option></select></label><input id="phMember" placeholder="رقم العضوية"><input id="phApproval" placeholder="رقم الموافقة"><label>طريقة دفع المريض<select id="phPay"><option value="cash">كاش</option><option value="wallet">محفظة</option><option value="instapay">إنستا باي</option></select></label><button id="phCheckout" class="primary">💳 إتمام البيع</button></section></div>`;
 const renderGrid=()=>{const q=$('#phPosSearch').value.trim().toLowerCase();const rows=products().filter(p=>p.active!==false).filter(p=>{const d=detailFor(p.id);return !q||[p.name,p.barcode,d?.active_ingredient,d?.scientific_name,d?.manufacturer].some(v=>String(v||'').toLowerCase().includes(q))}).slice(0,120);$('#phPosGrid').innerHTML=rows.map(p=>{const d=detailFor(p.id),st=stockFor(p.id);return `<button class="product" data-ph-add="${p.id}"><b>${esc(p.name)}</b><span>${money(p.price)}</span><small>${esc(d?.active_ingredient||'')} ${d?.strength?`· ${esc(d.strength)}`:''}</small><small>متاح: ${qty(st)}</small>${d?.prescription_required?'<small>🩺 روشتة</small>':''}${d?.controlled_drug?'<small>⚠️ مراقب</small>':''}</button>`}).join('')||'<div class="empty">لا توجد نتائج</div>';$$('[data-ph-add]').forEach(b=>b.onclick=()=>addCart(Number(b.dataset.phAdd)))};
 $('#phPosSearch').oninput=renderGrid;$('#phPosRefresh').onclick=()=>renderPharmacyPOS();$('#phInsCompany').onchange=fillPlans;$('#phCheckout').onclick=checkout;renderGrid();renderCart();
}
function addCart(id){const p=productById(id);if(!p)return;const d=detailFor(id);if(d?.track_batch!==false&&stockFor(id)<=0)return toast('لا يوجد مخزون صالح غير منتهي لهذا الدواء');let row=cart.find(x=>x.product_id===id);if(row)row.qty+=1;else cart.push({product_id:id,name:p.name,price:Number(p.price||0),cost:Number(p.cost||0),qty:1});renderCart()}
function renderCart(){const box=$('#phCart');if(!box)return;box.innerHTML=cart.map((x,i)=>`<div class="cart-row"><div><b>${esc(x.name)}</b><small>${money(x.price)} × ${qty(x.qty)}</small></div><div><button data-qm="${i}">−</button><b>${qty(x.qty)}</b><button data-qp="${i}">+</button><button class="danger" data-qr="${i}">×</button></div></div>`).join('')||'<div class="empty">السلة فارغة</div>';$$('[data-qm]').forEach(b=>b.onclick=()=>{const x=cart[Number(b.dataset.qm)];x.qty=Math.max(0,x.qty-1);cart=cart.filter(x=>x.qty>0);renderCart()});$$('[data-qp]').forEach(b=>b.onclick=()=>{cart[Number(b.dataset.qp)].qty+=1;renderCart()});$$('[data-qr]').forEach(b=>b.onclick=()=>{cart.splice(Number(b.dataset.qr),1);renderCart()});if($('#phTotal'))$('#phTotal').textContent=money(cart.reduce((a,x)=>a+x.price*x.qty,0))}
function fillPlans(){const cid=Number($('#phInsCompany').value||0),sel=$('#phInsPlan');const rows=cache.plans.filter(p=>p.active&&Number(p.company_id)===cid);sel.innerHTML='<option value="">—</option>'+rows.map(p=>`<option value="${p.id}">${esc(p.name)} · تحمل ${Number(p.patient_copay_percent||0)}%</option>`).join('')}
function allocateBatches(){const allocations=[];for(const item of cart){const d=detailFor(item.product_id);if(d?.track_batch===false)continue;let remaining=Number(item.qty),rows=cache.batches.filter(b=>b.active!==false&&Number(b.product_id)===item.product_id&&Number(b.quantity)>0&&String(b.expiry_date)>=today()).sort((a,b)=>String(a.expiry_date).localeCompare(String(b.expiry_date)));for(const b of rows){if(remaining<=0)break;const take=Math.min(remaining,Number(b.quantity));if(take>0){allocations.push({product_id:item.product_id,batch_id:Number(b.id),quantity:take});remaining-=take}}if(remaining>0.0005)throw new Error(`المخزون الصالح غير كافٍ: ${item.name}`)}return allocations}
async function checkout(){
 if(!cart.length)return toast('السلة فارغة');if(!navigator.onLine)return toast('بيع الباتشات والتأمين يحتاج اتصال إنترنت في Beta30');
 try{
  const rxId=Number($('#phRx').value||0)||null;for(const item of cart){const d=detailFor(item.product_id);if(d?.prescription_required&&!rxId)throw new Error(`الدواء ${item.name} يحتاج روشتة`)}
  const shifts=await rest('shifts',`select=id&branch_id=eq.${branch()}&closed_at=is.null&order=id.desc&limit=1`);if(!shifts?.[0])throw new Error('يجب فتح وردية أولًا');const employee=Number(await rpc('current_employee_id',{}));if(!employee)throw new Error('تعذر تحديد الموظف');
  const subtotal=cart.reduce((a,x)=>a+x.price*x.qty,0),companyId=Number($('#phInsCompany').value||0)||null,planId=Number($('#phInsPlan').value||0)||null,plan=cache.plans.find(p=>Number(p.id)===planId),copay=companyId?(plan?Number(plan.patient_copay_percent||0):0):100,patient=Math.round(subtotal*copay)/100,insurer=Math.max(0,Math.round((subtotal-patient)*100)/100);if(companyId&&plan?.requires_approval&&!$('#phApproval').value.trim())throw new Error('الخطة تحتاج رقم موافقة مسبقة');
  const payments=companyId?[{method:$('#phPay').value,amount:patient},{method:'insurance',amount:insurer}]:[{method:$('#phPay').value,amount:subtotal}];
  const tx=`PH-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;const order={branch_id:branch(),employee_id:employee,customer_id:null,shift_id:Number(shifts[0].id),order_type:'takeaway',payment_method:companyId?'mixed':$('#phPay').value,subtotal,discount:0,discount_type:'amount',discount_value:0,tax_amount:0,service_amount:0,delivery_fee:0,total:subtotal,status:'completed',source:'pos',customer_phone:null,customer_name:null,delivery_address:null,delivery_area:null,delivery_zone_id:null,driver_id:null,assigned_at:null,notes:rxId?`Prescription #${rxId}`:null,client_tx_id:tx};const items=cart.map(x=>({product_id:x.product_id,product_name:x.name,quantity:x.qty,unit_price:x.price,cost:x.cost,total:Math.round(x.price*x.qty*100)/100,notes:null,modifiers:[]}));const insurance=companyId?{company_id:companyId,plan_id:planId,member_no:$('#phMember').value.trim(),approval_no:$('#phApproval').value.trim(),gross_amount:subtotal,patient_amount:patient,insurer_amount:insurer}:null;
  const result=await rpc('create_pharmacy_pos_order_atomic',{p_order:order,p_items:items,p_payments:payments,p_batch_allocations:allocateBatches(),p_prescription_id:rxId,p_insurance:insurance});toast(`تمت الفاتورة #${result?.order?.id||''}${result?.insurance_claim_id?` · مطالبة #${result.insurance_claim_id}`:''}`);renderPharmacyPOS();
 }catch(e){toast(e.message||e)}
}

const renderers={pharmacyCatalog:renderCatalog,pharmacyBatches:renderBatches,pharmacyExpiry:renderExpiry,pharmacyPrescriptions:renderPrescriptions,pharmacyInsurance:renderInsurance,pharmacyClaims:renderClaims};
function open(key){if(!isPharmacy())return;const fn=renderers[key];if(fn)fn().catch(e=>toast(e.message||e))}
function injectHome(){if(!isPharmacy())return;const grid=$('.home-grid');if(!grid||grid.querySelector('[data-pharmacy-home]'))return;for(const [key,icon,title] of PHARMACY_PAGES){const c=document.createElement('button');c.type='button';c.className='home-card';c.dataset.pharmacyHome=key;c.innerHTML=`<span class="home-icon">${icon}</span><span class="home-copy"><b>${title}</b><small>فتح ${title}</small></span>`;grid.appendChild(c)}}

document.addEventListener('click',e=>{if(!isPharmacy())return;const p=e.target.closest('[data-pharmacy-page]');if(p){e.preventDefault();e.stopImmediatePropagation();open(p.dataset.pharmacyPage);return}const h=e.target.closest('[data-pharmacy-home]');if(h){e.preventDefault();e.stopImmediatePropagation();open(h.dataset.pharmacyHome);return}const pos=e.target.closest('#nav button[data-page="pos"],.home-card[data-home-page="pos"]');if(pos){e.preventDefault();e.stopImmediatePropagation();renderPharmacyPOS().catch(x=>toast(x.message||x))}},true);
const observer=new MutationObserver(()=>{if(!isPharmacy())return;addNav();hideRetailOnly();injectHome()});observer.observe(document.body,{childList:true,subtree:true});
setInterval(()=>{if(isPharmacy()){addNav();hideRetailOnly();injectHome()}},1500);
global.SharawlaPharmacyUI=Object.freeze({version:'10.5.4-beta.30',renderCatalog,renderBatches,renderExpiry,renderPrescriptions,renderInsurance,renderClaims,renderPOS:renderPharmacyPOS,loadBase});
})(window);
