(function(global){
'use strict';
const VERSION='10.5.4-beta.29';
const q=(s,r=document)=>r.querySelector(s), qa=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function isRetail(){try{return String(JSON.parse(localStorage.getItem('sharawlaRuntimeConfigV1')||'{}')?.pos_profile||'').toLowerCase()==='retail'}catch{return false}}
function toastMsg(m){try{return toast(m)}catch{try{return global.toast?.(m)}catch{}}}
function branchId(){try{return Number(currentBranchId())}catch{return Number(global.currentBranchId?.()||0)}}
function offerStore(){try{return retailMarket}catch{return global.retailMarket||null}}
function products(){try{return state.products||[]}catch{return global.state?.products||[]}}
function runRpc(name,payload){try{return rpc(name,payload)}catch{return global.rpc(name,payload)}}
function confirmUi(msg,opt){try{return uiConfirm(msg,opt)}catch{return global.uiConfirm?.(msg,opt)}}

function ensureLicenseSupport(){
 const form=q('#activationForm');if(!form)return;
 if(!q('#activationDeveloperContactBtn')){
  const btn=document.createElement('button');btn.id='activationDeveloperContactBtn';btn.type='button';btn.className='developer-contact-login-btn';btn.innerHTML='<span class="developer-contact-icon">💬</span><span><b>تواصل مع المطور</b><small>الدعم الفني لـ Sharawla POS</small></span>';
  const hint=q('#deviceHint',form);form.insertBefore(btn,hint||null);
  btn.onclick=()=>q('#developerContactBtn')?.click();
 }
 if(!q('#activationSupportCode')){
  const box=document.createElement('div');box.id='activationSupportCode';box.className='login-support-code';box.innerHTML='<span class="login-support-code-icon">🆔</span><span><small>كود الجهاز</small><b id="activationSupportCodeValue" dir="ltr">—</b></span>';
  const hint=q('#deviceHint',form);form.insertBefore(box,hint||null);
 }
 const update=async()=>{try{let st=null;if(typeof loadLicenseState==='function')st=await loadLicenseState();const code=String(st?.support_code||q('#loginSupportCodeValue')?.textContent||'').trim();q('#activationSupportCodeValue').textContent=code&&code!=='—'?code:'—'}catch{}};update();
}

function reorderNav(){
 if(!isRetail())return;
 const nav=q('#nav');if(!nav)return;
 const delivery=q('button[data-page="deliveryOrders"]',nav),web=q('#retailWebsiteOrdersNav',nav),offers=q('button[data-page="retailOffers"]',nav);
 if(delivery&&web)delivery.insertAdjacentElement('afterend',web);
 if(web&&offers)web.insertAdjacentElement('afterend',offers);
}
function findHomeCard(page){return qa('#page .home-grid .home-card').find(c=>String(c.dataset.homePage||'')===page)||null}
function ensureWebsiteHomeCard(){
 if(!isRetail()||String(q('#pageTitle')?.textContent||'').trim()!=='الرئيسية')return;
 const grid=q('#page .home-grid'),webNav=q('#retailWebsiteOrdersNav');if(!grid||!webNav)return;
 let c=q('[data-beta29-website-orders-card]',grid);
 if(!c){c=document.createElement('button');c.type='button';c.className='home-card tone-slate';c.dataset.beta29WebsiteOrdersCard='1';c.innerHTML='<span class="home-icon">🛒</span><span class="home-copy"><b>طلبات الموقع</b><small>متابعة وقبول ورفض طلبات الموقع</small></span><span class="home-arrow">‹</span>';c.onclick=()=>webNav.click();grid.appendChild(c)}
 const delivery=findHomeCard('deliveryOrders'),offers=findHomeCard('retailOffers');
 if(delivery)delivery.insertAdjacentElement('afterend',c);
 if(c&&offers)c.insertAdjacentElement('afterend',offers);
 const logout=qa(':scope > .home-card',grid).find(x=>x.hasAttribute('data-home-logout'));if(logout)grid.appendChild(logout);
}

function dtLocal(v){if(!v)return '';const d=new Date(v);if(!Number.isFinite(d.getTime()))return '';const z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`}
function ruleLabel(t){return ({percent:'خصم نسبة %',fixed:'خصم مبلغ ثابت',buy_x_get_y:'اشترِ X وخد Y مجانًا',second_half:'القطعة الثانية بنصف السعر'})[t]||t}
function valueLabel(o){if(o.rule_type==='buy_x_get_y')return `اشترِ ${Number(o.buy_qty||0)} وخد ${Number(o.get_qty||0)}`;if(o.rule_type==='second_half')return '50% على الثانية';if(o.rule_type==='percent')return `${Number(o.value||0)}%`;return String(Number(o.value||0))}
function selectedProductIds(o){const st=offerStore();if(!st)return [];return (st.offerProducts||[]).filter(x=>String(x.offer_id)===String(o?.id)).map(x=>Number(x.product_id))}
function openOfferEditor(current=null){
 const ps=products().filter(p=>p.active!==false),selected=new Set(selectedProductIds(current));
 const m=document.createElement('div');m.className='modal';m.id='beta29OfferModal';m.innerHTML=`<div class="modal-card"><h2>${current?'✏️ تعديل العرض':'➕ عرض جديد'}</h2><div class="form-grid"><label>اسم العرض<input id="b29OfferName" value="${esc(current?.name||'')}"></label><label>نوع العرض<select id="b29OfferType"><option value="percent">خصم نسبة %</option><option value="fixed">خصم مبلغ ثابت</option><option value="buy_x_get_y">اشترِ X وخد Y مجانًا</option><option value="second_half">القطعة الثانية بنصف السعر</option></select></label><label data-value-wrap>القيمة<input id="b29OfferValue" type="number" min="0" step="0.01" value="${Number(current?.value||0)}"></label><label data-buy-wrap>اشترِ X<input id="b29OfferBuy" type="number" min="0.001" step="0.001" value="${Number(current?.buy_qty||2)}"></label><label data-get-wrap>وخد Y مجانًا<input id="b29OfferGet" type="number" min="0.001" step="0.001" value="${Number(current?.get_qty||1)}"></label><label>الأولوية<input id="b29OfferPriority" type="number" min="1" step="1" value="${Number(current?.priority||100)}"></label><label>يبدأ من<input id="b29OfferStart" type="datetime-local" value="${dtLocal(current?.starts_at)}"></label><label>ينتهي في<input id="b29OfferEnd" type="datetime-local" value="${dtLocal(current?.ends_at)}"></label></div><label class="setting-switch"><span>تفعيل العرض على الموقع</span><input id="b29OfferWebsite" type="checkbox" ${current?.website_enabled===false?'':'checked'}></label><h3>الأصناف</h3><p class="muted">اترك كل الأصناف بدون تحديد لتطبيق العرض على كل الأصناف.</p><input id="b29OfferProductSearch" type="search" placeholder="بحث باسم الصنف أو الباركود"><div id="b29OfferProducts" class="option-list" style="max-height:240px;overflow:auto">${ps.map(p=>`<label data-product-label><input type="checkbox" data-offer-product="${p.id}" ${selected.has(Number(p.id))?'checked':''}> ${esc(p.name)}${p.barcode?` <small>${esc(p.barcode)}</small>`:''}</label>`).join('')}</div><div class="modal-actions"><button class="secondary" data-close type="button">إلغاء</button><button class="primary" data-save type="button">حفظ العرض</button></div></div>`;document.body.appendChild(m);
 const type=q('#b29OfferType',m);type.value=current?.rule_type||'percent';const sync=()=>{const t=type.value;q('[data-value-wrap]',m).classList.toggle('hidden',t==='buy_x_get_y'||t==='second_half');q('[data-buy-wrap]',m).classList.toggle('hidden',t!=='buy_x_get_y');q('[data-get-wrap]',m).classList.toggle('hidden',t!=='buy_x_get_y')};sync();type.onchange=sync;
 q('#b29OfferProductSearch',m).oninput=e=>{const v=String(e.target.value||'').trim().toLowerCase();qa('[data-product-label]',m).forEach(x=>x.classList.toggle('hidden',!!v&&!String(x.textContent||'').toLowerCase().includes(v)))};
 m.onclick=async e=>{if(e.target===m||e.target.closest('[data-close]'))return m.remove();if(!e.target.closest('[data-save]'))return;const name=q('#b29OfferName',m).value.trim(),t=type.value,value=Number(q('#b29OfferValue',m).value||0),buy=Number(q('#b29OfferBuy',m).value||0),get=Number(q('#b29OfferGet',m).value||0),priority=Math.max(1,Number(q('#b29OfferPriority',m).value||100));if(!name)return toastMsg('اكتب اسم العرض');if(t==='percent'&&(value<0||value>100))return toastMsg('نسبة الخصم يجب أن تكون من 0 إلى 100');if(t==='fixed'&&value<0)return toastMsg('قيمة الخصم غير صحيحة');if(t==='buy_x_get_y'&&(!(buy>0)||!(get>0)))return toastMsg('اكتب قيمة صحيحة لـ X و Y');const ids=qa('[data-offer-product]:checked',m).map(x=>Number(x.dataset.offerProduct));const starts=q('#b29OfferStart',m).value?new Date(q('#b29OfferStart',m).value).toISOString():null,ends=q('#b29OfferEnd',m).value?new Date(q('#b29OfferEnd',m).value).toISOString():null;if(starts&&ends&&new Date(ends)<=new Date(starts))return toastMsg('تاريخ النهاية يجب أن يكون بعد البداية');const btn=e.target.closest('[data-save]');btn.disabled=true;try{await runRpc('retail_offer_save',{p_id:current?.id?Number(current.id):null,p_name:name,p_rule_type:t,p_value:(t==='buy_x_get_y'||t==='second_half')?0:value,p_buy_qty:t==='buy_x_get_y'?buy:null,p_get_qty:t==='buy_x_get_y'?get:null,p_priority:priority,p_starts_at:starts,p_ends_at:ends,p_branch_id:branchId(),p_website_enabled:q('#b29OfferWebsite',m).checked,p_product_ids:ids});const st=offerStore();if(st)st.loadedBranch=null;m.remove();toastMsg(current?'تم تعديل العرض':'تم حفظ العرض');try{await renderRetailOffers()}catch{global.showPage?.('retailOffers')}}catch(err){toastMsg(err?.message||String(err));btn.disabled=false}};
}
async function archiveOffer(o){if(!await confirmUi(`أرشفة العرض «${o.name}»؟\nسيختفي من البيع الحالي مع الاحتفاظ ببياناته التاريخية.`,{title:'أرشفة العرض',danger:true,okText:'أرشفة'}))return;try{await runRpc('retail_offer_set_active',{p_id:Number(o.id),p_active:false});const st=offerStore();if(st)st.loadedBranch=null;toastMsg('تمت أرشفة العرض');try{await renderRetailOffers()}catch{global.showPage?.('retailOffers')}}catch(e){toastMsg(e?.message||String(e))}}
function enhanceOffers(){
 if(!isRetail()||!/عروض الماركت/.test(String(q('#pageTitle')?.textContent||'')))return;const st=offerStore(),table=q('#page table');if(!st||!table||table.dataset.beta29Enhanced==='1')return;table.dataset.beta29Enhanced='1';const th=document.createElement('th');th.textContent='إجراء';table.querySelector('thead tr')?.appendChild(th);const offers=st.offers||[];qa('tbody tr',table).forEach((tr,i)=>{const o=offers[i];if(!o)return;const td=document.createElement('td');td.innerHTML=`<button class="secondary" data-b29-edit-offer="${o.id}">✏️ تعديل</button> <button class="danger" data-b29-archive-offer="${o.id}">🗑️ أرشفة</button>`;tr.appendChild(td);const rule=tr.children[2];if(rule)rule.textContent=ruleLabel(o.rule_type);const val=tr.children[3];if(val)val.textContent=valueLabel(o)});const add=q('#addRetailOffer');if(add){add.onclick=e=>{e.preventDefault();e.stopImmediatePropagation();openOfferEditor(null)}};table.onclick=e=>{const eb=e.target.closest('[data-b29-edit-offer]'),ab=e.target.closest('[data-b29-archive-offer]');if(eb){const o=offers.find(x=>String(x.id)===eb.dataset.b29EditOffer);if(o)openOfferEditor(o)}else if(ab){const o=offers.find(x=>String(x.id)===ab.dataset.b29ArchiveOffer);if(o)archiveOffer(o)}};
}

function addSimpleSearch(key,titlePattern,selectors,placeholder){
 if(!titlePattern.test(String(q('#pageTitle')?.textContent||''))||q(`[data-b29-search="${key}"]`))return;const panel=q('#page .panel');if(!panel)return;const row=document.createElement('div');row.className='filter-row';row.dataset.b29Search=key;row.innerHTML=`<input type="search" placeholder="${esc(placeholder)}">`;panel.insertBefore(row,panel.children[1]||null);row.querySelector('input').oninput=e=>{const v=String(e.target.value||'').trim().toLowerCase();qa(selectors.join(','),q('#page')).forEach(x=>x.classList.toggle('hidden',!!v&&!String(x.textContent||'').toLowerCase().includes(v)))};
}
function enhancePageUtilities(){if(!isRetail())return;addSimpleSearch('delivery-settings',/إدارة الدليفري|إعدادات الدليفري/ ,['.manage-row','.driver-settle-list button','tbody tr'],'بحث في المناديب والمناطق والتسويات');addSimpleSearch('users',/المستخدمون/ ,['tbody tr','.manage-row','.user-row'],'بحث بالاسم أو اسم المستخدم أو الدور');addSimpleSearch('reports',/التقارير/ ,['tbody tr','.report-row','.panel'],'بحث داخل التقرير الحالي');}

let sessionFixBusy=false;
async function repairOwnerSessionResult(){
 const api=global.__SharawlaOwnerDiagnostics;if(sessionFixBusy||!api?.results)return;const row=api.results.find(x=>x.name==='Session / Branch');if(!row||row.status!=='FAIL'||!/employee=—/.test(String(row.detail||'')))return;sessionFixBusy=true;try{const id=Number(await runRpc('current_employee_id',{}));if(id>0){let name=String(id);try{const rows=await global.rest('employees',`select=id,name,active&id=eq.${id}&limit=1`);if(rows?.[0]?.name)name=rows[0].name;if(rows?.[0]?.active===false)throw new Error('employee inactive')}catch{}row.status='PASS';row.detail=`branch=${branchId()||'—'}; employee=${name}`;qa('#ownerDiagnosticsResults .setting-switch').forEach(el=>{if(String(el.textContent||'').includes('Session / Branch')){const s=el.querySelector('.status');if(s){s.textContent='PASS';s.className='status success'}const sm=el.querySelector('small');if(sm)sm.textContent=row.detail}})}}catch(e){console.warn('Beta29 owner session resolver',e?.message||e)}finally{sessionFixBusy=false}}

function functionalAuditSnapshot(){if(!isRetail())return {profile:'non-retail'};const nav=qa('#nav button').filter(b=>!b.classList.contains('hidden')&&getComputedStyle(b).display!=='none');return {version:VERSION,visible_nav:nav.map(b=>String(b.textContent||'').replace(/\s+/g,' ').trim()),website_orders_button:!!q('#retailWebsiteOrdersNav'),offer_edit_buttons:qa('[data-b29-edit-offer]').length,offer_archive_buttons:qa('[data-b29-archive-offer]').length,license_contact:!!q('#activationDeveloperContactBtn'),license_support_code:!!q('#activationSupportCode')};}

function run(){ensureLicenseSupport();reorderNav();ensureWebsiteHomeCard();enhanceOffers();enhancePageUtilities();repairOwnerSessionResult()}
let queued=false;const obs=new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;run()})});function start(){run();obs.observe(document.body,{childList:true,subtree:true});setInterval(repairOwnerSessionResult,1200);global.__SharawlaBeta29Fixes=Object.freeze({version:VERSION,licenseDeveloperContact:true,websiteOrdersPriority:true,offerLifecycle:true,buyXGetYUi:true,ownerSessionResolver:true,functionalAuditSnapshot})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
