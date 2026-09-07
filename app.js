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
modifiers:[],productModifiers:[],productVariants:[],deliveryZones:[],drivers:[],employeeBranches:[],userPermissions:null,selectedCustomer:null,activeBranchId:null,homeBranchId:null,customerAddresses:[]};
let websiteOrderWatchTimer=null;
let knownWebsiteOrderIds=new Set();
let websiteOrderWatchPrimed=false;
let websiteAudioCtx=null;
function websiteOrderBeep(){
  try{
    websiteAudioCtx=websiteAudioCtx||new (window.AudioContext||window.webkitAudioContext)();
    if(websiteAudioCtx.state==='suspended') websiteAudioCtx.resume();
    const o=websiteAudioCtx.createOscillator(),g=websiteAudioCtx.createGain();
    o.type='sine';o.frequency.value=880;g.gain.value=.0001;o.connect(g);g.connect(websiteAudioCtx.destination);
    const t=websiteAudioCtx.currentTime;g.gain.exponentialRampToValueAtTime(.18,t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+.45);o.start(t);o.stop(t+.48);
    setTimeout(()=>{try{const o2=websiteAudioCtx.createOscillator(),g2=websiteAudioCtx.createGain();o2.frequency.value=1040;g2.gain.value=.0001;o2.connect(g2);g2.connect(websiteAudioCtx.destination);const x=websiteAudioCtx.currentTime;g2.gain.exponentialRampToValueAtTime(.16,x+.02);g2.gain.exponentialRampToValueAtTime(.0001,x+.38);o2.start(x);o2.stop(x+.4)}catch{}},180);
  }catch{}
}
function showWebsiteOrderAlert(w){
  document.querySelectorAll('.website-global-alert').forEach(x=>x.remove());
  const el=document.createElement('div');el.className='website-global-alert';
  el.innerHTML=`<div class="website-alert-icon">🌐</div><div class="website-alert-copy"><b>طلب جديد من الموقع</b><span>WEB-${String(w.id).padStart(5,'0')} • ${esc(w.customer_name||'عميل')} • ${money(w.total)}</span></div><button class="website-alert-open" type="button">عرض الطلب</button><button class="website-alert-close" type="button" aria-label="إغلاق">×</button>`;
  document.body.appendChild(el);requestAnimationFrame(()=>el.classList.add('show'));websiteOrderBeep();
  el.querySelector('.website-alert-open').onclick=()=>{el.remove();showPage('deliveryOrders')};
  el.querySelector('.website-alert-close').onclick=()=>el.remove();
}
async function checkWebsiteOrders(){
  if(!session?.access_token||!state.employee||!state.activeBranchId||!canAccessPage('deliveryOrders'))return;
  try{
    const rows=await rest('website_orders',`select=id,customer_name,total,created_at&branch_id=eq.${currentBranchId()}&status=eq.pending&order=created_at.asc&limit=100`);
    const list=rows||[];
    const ids=new Set(list.map(x=>String(x.id)));

    // أول فحص بعد الدخول/اختيار الفرع: لو فيه طلبات معلقة، ننبّه بأحدث طلب بدل ما نعتبرها كلها "مقروءة".
    if(!websiteOrderWatchPrimed){
      knownWebsiteOrderIds=ids;
      websiteOrderWatchPrimed=true;
      if(list.length) showWebsiteOrderAlert(list[list.length-1]);
      return;
    }

    const fresh=list.filter(x=>!knownWebsiteOrderIds.has(String(x.id)));
    knownWebsiteOrderIds=ids;
    if(fresh.length) showWebsiteOrderAlert(fresh[fresh.length-1]);
  }catch(e){console.warn('website order watch',e)}
}
function startWebsiteOrderWatch(){
  clearInterval(websiteOrderWatchTimer);
  websiteOrderWatchPrimed=false;
  knownWebsiteOrderIds=new Set();
  checkWebsiteOrders();
  websiteOrderWatchTimer=setInterval(checkWebsiteOrders,5000);
}

// لو رجع للشاشة أو فتح التبويب بعد ما كان بالخلفية، افحص فورًا بدل انتظار المؤقت.
window.addEventListener('focus',()=>{if(state.activeBranchId)checkWebsiteOrders()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.activeBranchId)checkWebsiteOrders()});
const money=n=>`${Number(n||0).toFixed(2)} ج.م`;
const fmtDate=s=>new Date(s).toLocaleString('ar-EG');
function toast(m){const e=$('#toast');e.textContent=m;e.style.display='block';setTimeout(()=>e.style.display='none',2600)}
function uiPrompt(message,defaultValue='',opts={}){return new Promise(resolve=>{const m=document.createElement('div');m.className='modal app-dialog';const type=opts.type||'text';const danger=opts.danger?' dialog-danger':'';m.innerHTML=`<div class="modal-card app-dialog-card${danger}"><div class="dialog-icon">${opts.icon||'✏️'}</div><h2>${esc(opts.title||'إدخال البيانات')}</h2><p class="dialog-message">${esc(message)}</p><input class="dialog-input" type="${esc(type)}" value="${esc(defaultValue)}" ${opts.placeholder?`placeholder="${esc(opts.placeholder)}"`:''} autocomplete="off"><div class="modal-actions"><button class="secondary" data-dialog-cancel>إلغاء</button><button class="primary" data-dialog-ok>${esc(opts.okText||'حفظ')}</button></div></div>`;document.body.appendChild(m);const input=m.querySelector('.dialog-input');setTimeout(()=>{input.focus();if(type!=='password')input.select()},30);let done=false;const finish=v=>{if(done)return;done=true;m.remove();resolve(v)};m.addEventListener('click',e=>{if(e.target===m||e.target.closest('[data-dialog-cancel]'))finish(null);if(e.target.closest('[data-dialog-ok]'))finish(input.value)});input.addEventListener('keydown',e=>{if(e.key==='Enter')finish(input.value);if(e.key==='Escape')finish(null)})})}
function uiConfirm(message,opts={}){return new Promise(resolve=>{const m=document.createElement('div');m.className='modal app-dialog';const danger=opts.danger?' dialog-danger':'';m.innerHTML=`<div class="modal-card app-dialog-card${danger}"><div class="dialog-icon">${opts.icon||(opts.danger?'⚠️':'✓')}</div><h2>${esc(opts.title||'تأكيد العملية')}</h2><p class="dialog-message">${esc(message)}</p><div class="modal-actions"><button class="secondary" data-dialog-no>${esc(opts.cancelText||'إلغاء')}</button><button class="${opts.danger?'danger':'primary'}" data-dialog-yes>${esc(opts.okText||'تأكيد')}</button></div></div>`;document.body.appendChild(m);let done=false;const finish=v=>{if(done)return;done=true;m.remove();resolve(v)};m.addEventListener('click',e=>{if(e.target===m||e.target.closest('[data-dialog-no]'))finish(false);if(e.target.closest('[data-dialog-yes]'))finish(true)});document.addEventListener('keydown',function key(e){if(done)return document.removeEventListener('keydown',key);if(e.key==='Escape'){document.removeEventListener('keydown',key);finish(false)}})})}
function show(id){['setupView','loginView','appView'].forEach(x=>$('#'+x).classList.add('hidden'));$('#'+id).classList.remove('hidden')}
function headers(auth=true){return {'Content-Type':'application/json','apikey':cfg.key,...(auth&&session?.access_token?{Authorization:`Bearer ${session.access_token}`}:{})}}
async function req(path,opt={}){const r=await fetch(cfg.url+path,{...opt,headers:{...headers(opt.auth!==false),...(opt.headers||{})}});let d=null;try{d=await r.json()}catch{}if(!r.ok)throw new Error(d?.message||d?.error_description||d?.hint||`خطأ ${r.status}`);return d}
async function rest(table,query='',opt={}){return req(`/rest/v1/${table}${query?`?${query}`:''}`,opt)}
async function callFunction(name,payload={}){return req(`/functions/v1/${name}`,{method:'POST',body:JSON.stringify(payload)})}
async function rpc(name,payload={}){return req(`/rest/v1/rpc/${name}`,{method:'POST',body:JSON.stringify(payload)})}
async function signIn(email,password){const d=await req('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:JSON.stringify({email,password})});session=d;localStorage.setItem('sbSession',JSON.stringify(d));return d}
async function logout(){clearInterval(websiteOrderWatchTimer);websiteOrderWatchTimer=null;try{await req('/auth/v1/logout',{method:'POST'})}catch{}session=null;localStorage.removeItem('sbSession');show('loginView')}
function branchName(id){return state.branches.find(b=>String(b.id)===String(id))?.name||''}
function driverName(id){return state.drivers.find(d=>String(d.id)===String(id))?.name||''}
function zoneName(id){return state.deliveryZones.find(z=>String(z.id)===String(id))?.name||''}
function employeeName(id,employees=[]){return employees.find(e=>String(e.id)===String(id))?.name||''}
function isAdmin(){return state.employee?.role==='admin'}
function isCallCenter(){return ['callcenter','delivery'].includes(state.employee?.role)}
const ALL_PAGES=['home','pos','orders','customers','deliveryOrders','deliverySettings','delivery','kitchen','shifts','inventory','expenses','products','branchProductAvailability','reports','users','settings'];
const ROLE_PAGES={
  admin:new Set(ALL_PAGES),
  cashier:new Set(['home','pos','orders','customers','deliveryOrders','delivery','shifts']),
  callcenter:new Set(['home','pos','orders','customers','deliveryOrders','delivery']),
  delivery:new Set(['home','pos','orders','customers','deliveryOrders','delivery'])
};
const PERMISSION_DEFS=[
  ['pos','الكاشير'],['orders','الطلبات'],['customers','العملاء'],['deliveryOrders','طلبات الدليفري'],['shifts','الشيفت'],
  ['expenses','المصروفات'],['reports','التقارير'],['products','الأصناف'],['deliverySettings','إعدادات الدليفري'],
  ['kitchen','المطبخ'],['inventory','المخزون'],['settings','الإعدادات'],
  ['branchProductAvailability','🌐 إدارة توافر أصناف الموقع'],
  ['websiteBranchSettings','🔥 إدارة استقبال طلبات الموقع ومدة التجهيز'],
  ['branchManagement','🏪 إدارة الفروع']
];
function effectivePermissionSet(){
  if(isAdmin())return new Set(ALL_PAGES);
  if(Array.isArray(state.userPermissions)&&state.userPermissions.length){
    return new Set(['home',...state.userPermissions.filter(x=>x.allowed!==false).map(x=>x.permission_key)]);
  }
  return ROLE_PAGES[state.employee?.role]||new Set(['home']);
}
function hasFeaturePermission(key){
  if(isAdmin())return true;
  if(Array.isArray(state.userPermissions)&&state.userPermissions.length){
    return state.userPermissions.some(x=>x.permission_key===key&&x.allowed!==false);
  }
  return false;
}
function canAccessPage(page){
  const allowed=effectivePermissionSet();
  if(page==='websiteManagement')return isAdmin()||allowed.has('branchProductAvailability')||allowed.has('websiteBranchSettings');
  if(page==='websiteBranchSettings')return isAdmin()||allowed.has('websiteBranchSettings');
  if(!allowed.has(page))return false;
  if(page==='deliveryOrders'||page==='delivery')return !!state.settings.enable_delivery;
  if(page==='kitchen')return !!state.settings.enable_kitchen;
  if(page==='inventory')return !!state.settings.enable_inventory;
  if(page==='users')return isAdmin();
  return true;
}
function applyRoleNavigation(){
  $$('#nav button[data-page]').forEach(b=>b.classList.toggle('hidden',!canAccessPage(b.dataset.page)));
}
function allowedBranchIds(){if(isAdmin())return state.branches.map(b=>Number(b.id));const ids=(state.employeeBranches||[]).map(x=>Number(x.branch_id));if(!ids.length&&state.employee?.branch_id)ids.push(Number(state.employee.branch_id));return [...new Set(ids)]}
function allowedBranches(){const ids=new Set(allowedBranchIds().map(String));return state.branches.filter(b=>ids.has(String(b.id)))}
function canSeeAllBranches(){return isAdmin()||allowedBranchIds().length>1}
function currentBranchId(){return Number(state.activeBranchId||state.homeBranchId||state.employee?.branch_id||0)}
function currentBranch(){return state.branches.find(b=>Number(b.id)===currentBranchId())||null}
function refreshBranchChrome(){
  const id=currentBranchId();
  if($('#branchName')) $('#branchName').textContent=id?`فرع ${branchName(id)}`:'اختر الفرع';
  const btn=$('#changeBranchBtn');
  if(btn){const multi=allowedBranches().length>1;btn.classList.toggle('hidden',!multi||!id);btn.textContent=id?`تغيير الفرع • ${branchName(id)}`:'تغيير الفرع';}
  const add=$('#addBranchBtn');
  if(add)add.classList.toggle('hidden',!hasFeaturePermission('branchManagement'));
}
function selectBranch(id){
  const bid=Number(id);
  if(!allowedBranchIds().includes(bid)) return toast('ليس لديك صلاحية لهذا الفرع');
  state.activeBranchId=bid;
  refreshBranchChrome();
  startWebsiteOrderWatch();
  showPage('home');
}
function renderBranchPicker(){
  state.activeBranchId=null;
  refreshBranchChrome();
  if($('#branchName')) $('#branchName').textContent='اختر الفرع';
  if($('#changeBranchBtn')) $('#changeBranchBtn').classList.add('hidden');
  $('#pageTitle').textContent='اختيار الفرع';
  $('#page').innerHTML=`<section class="branch-picker"><div class="branch-picker-head"><span>TOP BURGER • POS</span><h1>اختار الفرع</h1><p>كل الطلبات والورديات والمصروفات والتقارير بعد الاختيار هتكون للفرع ده فقط.</p></div><div class="branch-picker-grid">${allowedBranches().map((b,i)=>`<button class="branch-pick-card ${i%2?'alt':''}" data-branch-pick="${b.id}"><span class="branch-pick-icon">🏪</span><div><b>${esc(b.name)}</b><small>الدخول إلى نظام الفرع</small></div><span>‹</span></button>`).join('')}</div></section>`;
  $('#page').onclick=e=>{const b=e.target.closest('[data-branch-pick]');if(b)selectBranch(b.dataset.branchPick)};
}

async function openCreateBranch(){
  if(!hasFeaturePermission('branchManagement'))return toast('ليس لديك صلاحية إدارة الفروع');
  const templates=state.branches.filter(b=>b.active!==false);
  const m=document.createElement('div');m.className='modal';
  m.innerHTML=`<div class="modal-card branch-create-modal"><div class="section-head"><div><h2>🏪 إضافة فرع جديد</h2><p class="muted">الفرع الجديد يتجهز تلقائيًا بنفس بنية النظام الحالية.</p></div></div>
  <form id="createBranchForm">
    <div class="form-grid">
      <label>اسم الفرع<input id="newBranchName" required placeholder="مثال: مدينة نصر"></label>
      <label>رقم الهاتف<input id="newBranchPhone" inputmode="tel" placeholder="اختياري"></label>
      <label>العنوان<input id="newBranchAddress" placeholder="اختياري"></label>
    </div>
    <label>استخدم فرع كنموذج
      <select id="newBranchTemplate"><option value="">الأسعار الأساسية + كل الأصناف متاحة</option>${templates.map(b=>`<option value="${b.id}" ${Number(b.id)===currentBranchId()?'selected':''}>نسخ إعدادات فرع ${esc(b.name)}</option>`).join('')}</select>
    </label>
    <div class="branch-create-summary">
      <b>سيتم تلقائيًا:</b>
      <span>✓ إضافة كل الأصناف للفرع</span>
      <span>✓ نسخ أسعار الفرع النموذج وحالات التوافر</span>
      <span>✓ إنشاء إعدادات الموقع ومدة التجهيز</span>
      <span>✓ إظهاره في اختيار الفروع والموقع</span>
      <small>الإيقافات المؤقتة الحالية لا تُنسخ للفرع الجديد، ومناطق الدليفري والموظفون يضافوا للفرع بعد الإنشاء لأنهم بيانات خاصة بالموقع الجديد.</small>
    </div>
    <label class="inline-check"><input id="newBranchWebsite" type="checkbox" checked> يظهر على الموقع</label>
    <div class="modal-actions"><button type="button" class="secondary" data-close>إلغاء</button><button type="submit" class="primary">➕ إنشاء الفرع كاملًا</button></div>
  </form></div>`;
  document.body.appendChild(m);
  m.onclick=e=>{if(e.target.closest('[data-close]')||e.target===m)m.remove()};
  m.querySelector('#createBranchForm').onsubmit=async e=>{
    e.preventDefault();
    const name=m.querySelector('#newBranchName').value.trim();if(!name)return toast('اكتب اسم الفرع');
    const submit=e.submitter; if(submit)submit.disabled=true;
    try{
      const id=Number(await rpc('create_branch_full',{
        p_name:name,
        p_phone:m.querySelector('#newBranchPhone').value.trim()||null,
        p_address:m.querySelector('#newBranchAddress').value.trim()||null,
        p_source_branch_id:m.querySelector('#newBranchTemplate').value?Number(m.querySelector('#newBranchTemplate').value):null,
        p_website_visible:m.querySelector('#newBranchWebsite').checked
      }));
      const fresh=await rest('branches','select=*&active=eq.true&order=sort_order,id');
      state.branches=fresh||state.branches;
      try{state.employeeBranches=await rest('employee_branches',`select=branch_id&employee_id=eq.${state.employee.id}`)}catch(_){ }
      m.remove();toast(`تم إنشاء فرع ${name} وتجهيزه بالكامل`);refreshBranchChrome();
      if(allowedBranchIds().includes(id))selectBranch(id);else renderBranchPicker();
    }catch(err){toast(err.message||'تعذر إنشاء الفرع')}finally{if(submit)submit.disabled=false}
  };
}
function esc(v){return String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}
function localDateInput(d=new Date()){const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,10)}
function rangeISO(from,to){return {from:new Date(`${from}T00:00:00`).toISOString(),to:new Date(`${to}T23:59:59.999`).toISOString()}}
async function fetchAll(table,query='',pageSize=1000){let out=[],offset=0;while(true){const join=query?`${query}&`:'';const rows=await rest(table,`${join}limit=${pageSize}&offset=${offset}`);out.push(...(rows||[]));if(!rows||rows.length<pageSize)break;offset+=pageSize}return out}
async function getOpenShift(employeeId=state.employee.id,branchId=currentBranchId()){const rows=await rest('shifts',`select=*&employee_id=eq.${employeeId}&branch_id=eq.${branchId}&status=eq.open&closed_at=is.null&order=opened_at.desc&limit=1`);return rows?.[0]||null}
async function audit(action,entityType,entityId,details={}){try{await rest('audit_logs','',{method:'POST',body:JSON.stringify([{employee_id:state.employee.id,branch_id:currentBranchId(),action,entity_type:entityType,entity_id:entityId||null,details}])})}catch(e){}}

async function bootstrap(){
  const [emps,branches,cats,products,settingsRows,modifiers,productModifiers,productVariants,zones,drivers]=await Promise.all([
    rest('employees','select=*&auth_user_id=eq.'+session.user.id+'&active=eq.true'),
    rest('branches','select=*&active=eq.true&order=sort_order,id'),
    rest('categories','select=*&active=eq.true&order=sort_order'),
    rest('products','select=*&active=eq.true&order=id'),
    rest('app_settings','select=key,value'),
    rest('modifiers','select=*&active=eq.true&order=id'),
    rest('product_modifiers','select=*'),
    rest('product_variants','select=*&active=eq.true&order=sort_order,id'),
    rest('delivery_zones','select=*&active=eq.true&order=name'),
    rest('delivery_drivers','select=*&active=eq.true&order=name')
  ]);
  if(!emps?.length)throw new Error('الحساب غير مربوط بموظف في النظام');
  state.employee=emps[0];state.homeBranchId=Number(emps[0].branch_id||0);state.branches=branches||[];state.categories=cats||[];state.products=products||[];state.modifiers=modifiers||[];state.productModifiers=productModifiers||[];state.productVariants=productVariants||[];state.deliveryZones=zones||[];state.drivers=drivers||[];try{state.employeeBranches=await rest('employee_branches',`select=branch_id&employee_id=eq.${state.employee.id}`)}catch(e){state.employeeBranches=[]}try{state.userPermissions=await rest('employee_permissions',`select=permission_key,allowed&employee_id=eq.${state.employee.id}`)}catch(e){state.userPermissions=null}for(const r of (settingsRows||[])){if(r.key in state.settings)state.settings[r.key]=String(r.value)==='true';}
  $('#who').textContent=`${state.employee.name} • ${state.employee.role}`;
  const allowed=allowedBranches();
  const allowedIds=allowedBranchIds();
  // مستخدم الفرع الواحد يدخل فرعه مباشرة حتى لو قائمة branches تأخرت/كانت مقيدة بـRLS.
  state.activeBranchId=allowed.length===1?Number(allowed[0].id):((!isAdmin()&&allowedIds.length===1)?Number(allowedIds[0]):null);
  if(!state.activeBranchId && !isAdmin() && state.homeBranchId && allowedIds.includes(Number(state.homeBranchId))) state.activeBranchId=Number(state.homeBranchId);
  refreshBranchChrome();
  applyRoleNavigation();
  show('appView');if(state.activeBranchId){startWebsiteOrderWatch();showPage('home')}else renderBranchPicker();
}

$('#setupForm').addEventListener('submit',async e=>{e.preventDefault();const url=$('#supabaseUrl').value.trim().replace(/\/$/,'');const key=$('#publishableKey').value.trim();if(!/^https:\/\/.+\.supabase\.co$/.test(url))return toast('راجع Project URL');if(!key.startsWith('sb_'))return toast('راجع Publishable key');localStorage.setItem('sbUrl',url);localStorage.setItem('sbKey',key);location.reload()});

$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();try{await signIn($('#email').value.trim(),$('#password').value);await bootstrap()}catch(err){toast(err.message)}});
if($('#logoutBtn'))$('#logoutBtn').onclick=logout;if($('#logoutMenuBtn'))$('#logoutMenuBtn').onclick=logout;$('#menuBtn').onclick=()=>$('.sidebar').classList.toggle('open');$('#changeBranchBtn').onclick=()=>renderBranchPicker();if($('#addBranchBtn'))$('#addBranchBtn').onclick=openCreateBranch;
$('#nav').onclick=e=>{const b=e.target.closest('button[data-page]');if(b)showPage(b.dataset.page)};
setInterval(()=>{if($('#clock'))$('#clock').textContent=new Date().toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})},1000);
const titles={home:'الرئيسية',pos:'الكاشير',orders:'الطلبات',customers:'العملاء',deliveryOrders:'طلبات الدليفري',deliverySettings:'إعدادات الدليفري',delivery:'الدليفري',kitchen:'المطبخ',shifts:'الشيفت',inventory:'المخزون',expenses:'المصروفات',products:'الأصناف',branchProductAvailability:'توافر أصناف الموقع',websiteManagement:'إدارة الموقع',websiteBranchSettings:'استقبال الطلبات ومدة التجهيز',reports:'التقارير',users:'المستخدمون',settings:'الإعدادات'};
function navActive(p){$$('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===p));$('.sidebar').classList.remove('open')}
async function showPage(p){try{if(!state.activeBranchId){renderBranchPicker();return;}if(!canAccessPage(p)){toast('ليس لديك صلاحية لفتح هذا القسم');return showPage('home');}navActive(p);$('#pageTitle').textContent=titles[p]||p;await ({home:renderHome,pos:renderPOS,orders:renderOrders,customers:renderCustomers,deliveryOrders:renderDeliveryOrders,deliverySettings:renderDeliverySettings,delivery:renderDeliveryOrders,kitchen:renderKitchen,shifts:renderShifts,inventory:renderInventory,expenses:renderExpenses,products:renderProducts,branchProductAvailability:renderWebsiteAvailability,websiteManagement:renderWebsiteManagement,websiteBranchSettings:renderWebsiteBranchSettings,reports:renderReports,users:renderUsers,settings:renderSettings}[p]||renderPOS)()}catch(e){toast(e.message)}}


async function renderHome(){
  const ids=[currentBranchId()];
  let activeDelivery=[], openShift=null;
  try{activeDelivery=await rest('orders','select=id,status,branch_id&order_type=eq.delivery&status=in.(new,ready,out_for_delivery)&order=created_at.desc&limit=200')}catch(e){}
  try{openShift=await getOpenShift()}catch(e){}
  activeDelivery=(activeDelivery||[]).filter(o=>ids.includes(Number(o.branch_id)));
  const cards=[
    ['pos','🧾','الكاشير','بيع وإنشاء أوردر جديد','mint'],
    ['deliveryOrders','🛵','طلبات الدليفري',`${activeDelivery.length} طلب نشط`,'amber'],
    ['orders','📋','الطلبات','متابعة وطباعة الطلبات','blue'],
    ['customers','👤','العملاء','بحث وبيانات العملاء','violet'],
    ['shifts','🕘','الورديات',openShift?'الوردية مفتوحة 🟢':'لا توجد وردية مفتوحة','green'],
    ['reports','📊','التقارير','المبيعات والورديات والتحليلات','blue'],
    ['expenses','💸','المصروفات','تسجيل ومراجعة المصروفات','rose'],
    ['products','🍔','الأصناف','الأصناف والأسعار','amber'],
    ['websiteManagement','🌐','إدارة الموقع','التحكم في الموقع وتوافر الأصناف','green'],
    ['deliverySettings','📍','إعدادات الدليفري','المناطق والمناديب والتسويات','violet'],
    ['users','👥','المستخدمون والصلاحيات','الفروع وصلاحيات الموظفين','blue'],
    ['settings','⚙️','الإعدادات','تشغيل وإيقاف المميزات','slate']
  ];
  const visible=cards.filter(c=>canAccessPage(c[0]));
  $('#page').innerHTML=`<section class="home-hero"><div><span class="home-kicker">TOP BURGER • POS</span><h1>أهلاً ${esc(state.employee.name)}</h1><p>فرع ${esc(branchName(currentBranchId()))}</p></div><div class="home-shift ${openShift?'is-open':''}"><span>${openShift?'● الوردية مفتوحة':'○ الوردية مغلقة'}</span>${openShift?`<small>من ${fmtDate(openShift.opened_at)}</small>`:''}</div></section><section class="home-grid">${visible.map(c=>`<button class="home-card tone-${c[4]}" data-home-page="${c[0]}"><span class="home-icon">${c[1]}</span><span class="home-copy"><b>${c[2]}</b><small>${c[3]}</small></span><span class="home-arrow">‹</span></button>`).join('')}<button class="home-card tone-rose" data-home-logout><span class="home-icon">🚪</span><span class="home-copy"><b>تسجيل الخروج</b><small>الخروج من حساب المستخدم الحالي</small></span><span class="home-arrow">‹</span></button></section>`;
  $('#page').onclick=e=>{const b=e.target.closest('[data-home-page]');if(b)return showPage(b.dataset.homePage);if(e.target.closest('[data-home-logout]'))logout()};
}

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
   <select id="deliveryBranch" disabled><option value="${currentBranchId()}" selected>${branchName(currentBranchId())}</option></select>
   <select id="deliveryZone"><option value="">اختر المنطقة</option>${state.deliveryZones.filter(z=>String(z.branch_id)===String(currentBranchId())).map(z=>`<option value="${z.id}" data-fee="${z.delivery_fee}" data-branch="${z.branch_id||''}">${z.name} — ${money(z.delivery_fee)}</option>`).join('')}</select>
   <div class="delivery-fee-control">
    <label class="delivery-fee-manual">رسوم التوصيل<input id="manualDeliveryFee" type="number" min="0" step="0.01" inputmode="decimal" placeholder="اكتب رسوم التوصيل"></label>
   </div>
   <select id="savedCustomerAddress" class="hidden"><option value="">اختر عنوان محفوظ</option></select>
   <textarea id="deliveryAddress" rows="2" placeholder="عنوان التوصيل"></textarea>
   <select id="deliveryDriver"><option value="">المندوب — يحدد لاحقًا</option></select>
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
   if($('#deliveryBranch')) $('#deliveryBranch').value=currentBranchId();
   refreshDeliveryDrivers();drawCart();
 });
 $('#manualDeliveryFee')?.addEventListener('input',drawCart);
 $('#deliveryBranch')?.addEventListener('change',refreshDeliveryDrivers);
 $('#savedCustomerAddress')?.addEventListener('change',applySavedCustomerAddress);
 let customerLookupTimer; $('#customerPhone').addEventListener('input',()=>{clearTimeout(customerLookupTimer);customerLookupTimer=setTimeout(lookupCustomerByPhone,350)}); $('#customerPhone').addEventListener('blur',lookupCustomerByPhone);
 $('.pay-actions').onclick=e=>{const b=e.target.closest('[data-pay]');if(b)checkout(b.dataset.pay)};
 toggleDeliveryFields();refreshDeliveryDrivers();drawProducts();drawCart();
}
function refreshDeliveryDrivers(){const el=$('#deliveryDriver');if(!el)return;const branch=currentBranchId();const current=el.value;const list=state.drivers.filter(d=>d.active!==false&&(!branch||String(d.branch_id)===String(branch)));el.innerHTML='<option value="">المندوب — يحدد لاحقًا</option>'+list.map(d=>`<option value="${d.id}">${d.name}${d.phone?` — ${d.phone}`:''}</option>`).join('');if(list.some(d=>String(d.id)===String(current)))el.value=current;}

function toggleDeliveryFields(){
 const delivery=$('#orderType')?.value==='delivery';
 $('#deliveryFields')?.classList.toggle('hidden',!delivery);
 $('#deliveryFeeLine')?.classList.toggle('hidden',!delivery);
}
function normalizePhone(v){
 const ar='٠١٢٣٤٥٦٧٨٩', fa='۰۱۲۳۴۵۶۷۸۹';
 let x=String(v||'').replace(/[٠-٩]/g,c=>String(ar.indexOf(c))).replace(/[۰-۹]/g,c=>String(fa.indexOf(c))).replace(/\D/g,'');
 if(x.startsWith('0020'))x=x.slice(4); else if(x.startsWith('20')&&x.length>=12)x=x.slice(2);
 if(x.length===10&&x.startsWith('1'))x='0'+x;
 return x;
}
function phoneCandidates(v){
 const n=normalizePhone(v); if(!n)return [];
 const out=[n]; if(n.startsWith('0')){out.push('20'+n.slice(1),'+20'+n.slice(1),'0020'+n.slice(1));}
 return [...new Set(out)];
}
function findZoneByArea(area){
 const a=String(area||'').trim(); if(!a)return null;
 return state.deliveryZones.find(x=>String(x.name||'').trim()===a)||state.deliveryZones.find(x=>String(x.name||'').trim().includes(a)||a.includes(String(x.name||'').trim()))||null;
}
function applyCustomerAddress(addr, fallback={}){
 if(!addr&&!fallback)return;
 const address=(addr?.address||fallback.address||'').trim();
 const area=(addr?.area||fallback.area||'').trim();
 const directZoneId=addr?.delivery_zone_id||fallback.delivery_zone_id||null;
 if($('#deliveryAddress'))$('#deliveryAddress').value=address;
 let z=null;
 if(directZoneId)z=state.deliveryZones.find(x=>String(x.id)===String(directZoneId))||null;
 if(!z&&area)z=findZoneByArea(area);
 if(z&&$('#deliveryZone')){
   $('#deliveryZone').value=z.id;
   if($('#deliveryBranch'))$('#deliveryBranch').value=currentBranchId();
   refreshDeliveryDrivers();
 }
 drawCart();
}
function applySavedCustomerAddress(){
 const el=$('#savedCustomerAddress'); if(!el||!state.customerAddresses)return;
 const a=state.customerAddresses.find(x=>String(x.id)===String(el.value));
 if(a)applyCustomerAddress(a,state.selectedCustomer||{});
}
async function recentDeliveryForPhone(raw){
 const normalized=normalizePhone(raw); if(!normalized)return null;
 let rows=[];
 for(const cand of phoneCandidates(raw)){
   try{
     rows=await rest('orders',`select=id,customer_phone,customer_name,delivery_address,delivery_area,delivery_zone_id,branch_id,created_at&order_type=eq.delivery&customer_phone=eq.${encodeURIComponent(cand)}&order=created_at.desc&limit=10`);
     if(rows?.length)break;
   }catch(e){}
 }
 if(!rows?.length){
   try{
     const tail=normalized.slice(-8);
     const possible=await rest('orders',`select=id,customer_phone,customer_name,delivery_address,delivery_area,delivery_zone_id,branch_id,created_at&order_type=eq.delivery&customer_phone=ilike.*${encodeURIComponent(tail)}*&order=created_at.desc&limit=30`);
     rows=(possible||[]).filter(o=>normalizePhone(o.customer_phone).slice(-10)===normalized.slice(-10));
   }catch(e){}
 }
 return (rows||[]).find(o=>o.delivery_address||o.delivery_area||o.delivery_zone_id)||rows?.[0]||null;
}
async function lookupCustomerByPhone(){
 if(!state.settings.enable_customer_search)return;
 const input=$('#customerPhone'); if(!input)return;
 const raw=input.value.trim(), normalized=normalizePhone(raw);
 if(normalized.length<10)return;
 try{
   let rows=[];
   for(const cand of phoneCandidates(raw)){
     rows=await rest('customers',`select=*&phone=eq.${encodeURIComponent(cand)}&limit=1`);
     if(rows?.length)break;
   }
   if(!rows?.length){
     const tail=normalized.slice(-10);
     const possible=await rest('customers',`select=*&phone=ilike.*${encodeURIComponent(tail.slice(-8))}*&limit=25`);
     rows=(possible||[]).filter(c=>normalizePhone(c.phone).slice(-10)===tail).slice(0,1);
   }
   if(rows?.length){
     const c=rows[0]; state.selectedCustomer=c;
     if($('#customerName'))$('#customerName').value=c.name||'';

     let adds=[];
     try{adds=await rest('customer_addresses',`select=*&customer_id=eq.${c.id}&order=is_default.desc,id.desc&limit=20`)}catch(e){}
     const lastOrder=await recentDeliveryForPhone(raw);

     // Complete old/incomplete address rows from the customer record or the last delivery order.
     const fallbackArea=(c.area||lastOrder?.delivery_area||zoneName(lastOrder?.delivery_zone_id)||'').trim();
     const fallbackAddress=(c.address||lastOrder?.delivery_address||'').trim();
     const fallbackZone=lastOrder?.delivery_zone_id||null;
     adds=(adds||[]).map(a=>({
       ...a,
       address:(a.address||fallbackAddress||'').trim(),
       area:(a.area||fallbackArea||'').trim(),
       delivery_zone_id:a.delivery_zone_id||fallbackZone||null
     }));
     if(!adds.length&&(fallbackAddress||fallbackArea||fallbackZone)){
       adds=[{id:'customer',label:'العنوان الأساسي',address:fallbackAddress,area:fallbackArea,is_default:true,delivery_zone_id:fallbackZone}];
     }

     state.customerAddresses=adds;
     const sel=$('#savedCustomerAddress');
     if(sel){
       sel.classList.toggle('hidden',adds.length<=1);
       sel.innerHTML='<option value="">اختر عنوان محفوظ</option>'+adds.map((a,i)=>`<option value="${esc(a.id)}" ${i===0?'selected':''}>${esc(a.label||a.area||`عنوان ${i+1}`)}${a.address?` — ${esc(a.address)}`:''}</option>`).join('');
     }

     const preferred=adds[0]||{
       address:fallbackAddress,
       area:fallbackArea,
       delivery_zone_id:fallbackZone
     };
     applyCustomerAddress(preferred,{address:fallbackAddress,area:fallbackArea,delivery_zone_id:fallbackZone});

     const finalArea=preferred.area||fallbackArea||'';
     const finalAddress=preferred.address||fallbackAddress||'';
     $('#customerHint').innerHTML=`✅ عميل مسجل: <b>${esc(c.name||raw)}</b>${finalArea?` • ${esc(finalArea)}`:''}${finalAddress?` • ${esc(finalAddress)}`:''}`;
   }else{
     state.selectedCustomer=null; state.customerAddresses=[];
     if($('#customerName'))$('#customerName').value='';
     if($('#deliveryAddress'))$('#deliveryAddress').value='';
     if($('#deliveryZone'))$('#deliveryZone').value='';

     if($('#manualDeliveryFee')){$('#manualDeliveryFee').value='';$('#manualDeliveryFee').classList.add('hidden');}
     const sel=$('#savedCustomerAddress');if(sel){sel.classList.add('hidden');sel.innerHTML='<option value="">اختر عنوان محفوظ</option>'}
     drawCart();
     $('#customerHint').textContent='عميل جديد — سيتم حفظه مع الأوردر';
   }
 }catch(e){console.error('customer lookup',e);$('#customerHint').textContent='تعذر تحميل بيانات العميل';}
}

function drawProducts(){
 const q=($('#productSearch')?.value||'').trim().toLowerCase();
 const grid=$('#productsGrid'); if(!grid)return;
 // شاشة «الكل» = التصنيفات الرئيسية. البحث فقط يعرض الأصناف المطابقة مباشرة.
 if(state.cat==='all'&&!q){
   const cats=state.categories.filter(c=>c.active!==false).sort((a,b)=>Number(a.website_sort_order||a.sort_order||0)-Number(b.website_sort_order||b.sort_order||0)||Number(a.id)-Number(b.id));
   grid.classList.add('category-grid');
   grid.innerHTML=cats.map(c=>{
     const count=state.products.filter(p=>p.active!==false&&String(p.category_id)===String(c.id)).length;
     const first=state.products.find(p=>p.active!==false&&String(p.category_id)===String(c.id)&&p.image_url);
     return `<button class="category-card" data-open-cat="${c.id}">${first?.image_url?`<img class="category-card-img" src="${esc(first.image_url)}" alt="${esc(c.name)}" loading="lazy">`:`<div class="category-card-img category-placeholder">🍔</div>`}<span class="category-card-copy"><b>${esc(c.name)}</b><small>${count} صنف</small></span><span class="category-arrow">‹</span></button>`;
   }).join('')||'<div class="empty">لا توجد تصنيفات</div>';
   grid.onclick=e=>{const b=e.target.closest('[data-open-cat]');if(!b)return;state.cat=b.dataset.openCat;const tab=$(`#catTabs button[data-cat="${state.cat}"]`);$$('#catTabs button').forEach(x=>x.classList.toggle('active',x===tab));drawProducts()};
   return;
 }
 grid.classList.remove('category-grid');
 const list=state.products.filter(p=>p.active!==false&&(state.cat==='all'||String(p.category_id)===String(state.cat))&&(!q||String(p.name).toLowerCase().includes(q))).slice().sort((a,b)=>{const ca=state.categories.find(c=>String(c.id)===String(a.category_id)),cb=state.categories.find(c=>String(c.id)===String(b.category_id));return catalogOrderValue(ca)-catalogOrderValue(cb)||catalogOrderValue(a)-catalogOrderValue(b)||Number(a.id)-Number(b.id)});
 grid.innerHTML=list.map(p=>`<button class="product" data-id="${p.id}">${p.image_url?`<img class="product-img" src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy">`:`<div class="product-img product-placeholder">🍔</div>`}<b>${esc(p.name)}</b><span>${money(p.price)}</span></button>`).join('')||'<div class="empty">لا توجد أصناف في هذا التصنيف</div>';
 grid.onclick=e=>{const b=e.target.closest('.product');if(!b)return;$('.sidebar')?.classList.remove('open');const p=state.products.find(x=>String(x.id)===String(b.dataset.id));if(p)addProductToCart(p)};
}
function productModifierList(p){const ids=state.productModifiers.filter(x=>String(x.product_id)===String(p.id)).map(x=>String(x.modifier_id));return state.modifiers.filter(m=>ids.includes(String(m.id)))}
function productVariantList(p){return (state.productVariants||[]).filter(x=>String(x.product_id)===String(p.id)&&x.active!==false).sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0)||Number(a.id)-Number(b.id))}
function isOfferProduct(p){return ['عرض السنجل','عرض الدبل','عرض الملوك'].includes(String(p.name||'').trim())}
function addProductToCart(p){const canExtras=state.settings.enable_extras&&p.allow_extras!==false&&productModifierList(p).length;const canRemovals=state.settings.enable_removals&&p.allow_removals!==false&&Array.isArray(p.removable_components)&&p.removable_components.length;const canNotes=state.settings.enable_item_notes&&p.allow_item_notes!==false;const hasVariants=productVariantList(p).length>0;if(isOfferProduct(p))return openOfferOptions(p);if(hasVariants||canExtras||canRemovals||canNotes)return openItemOptions(p);pushCartItem({product_id:p.id,name:p.name,price:Number(p.price),base_price:Number(p.price),cost:Number(p.cost||0),qty:1,modifiers:[],removed:[],notes:''})}
function openOfferOptions(p){let groups=[],fixed='';if(p.name==='عرض السنجل'){groups=Array.from({length:2},(_,i)=>({label:`الساندوتش ${i+1}`,opts:['أوريجنال لحم','أوريجنال تشيكن']}));fixed='بدون بطاطس'}else if(p.name==='عرض الدبل'){groups=Array.from({length:2},(_,i)=>({label:`الساندوتش الدبل ${i+1}`,opts:['أوريجنال لحم دبل','أوريجنال تشيكن دبل','برجر ميكس دبل']}));fixed='يشمل 2 ماكس كولا'}else{groups=Array.from({length:4},(_,i)=>({label:`الساندوتش ${i+1}`,opts:['أوريجنال لحم','أوريجنال تشيكن']}));fixed='يشمل 2 طبق بطاطس + ماكس كولا لتر'}const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card"><h2>${esc(p.name)}</h2><p>${esc(fixed)}</p>${groups.map((g,gi)=>`<h3>${g.label}</h3><div class="option-list">${g.opts.map((o,oi)=>`<label><input type="radio" name="offer${gi}" value="${esc(o)}" ${oi===0?'checked':''}> ${esc(o)}</label>`).join('')}</div>`).join('')}<h3>العدد</h3><div class="item-qty-picker"><button type="button" data-q="minus">−</button><input id="itemQty" type="number" min="1" value="1"><button type="button" data-q="plus">+</button></div><h3>ملاحظة</h3><textarea id="itemNote" rows="2"></textarea><div class="modal-actions"><button class="secondary" data-close>إلغاء</button><button class="primary" data-add>إضافة للأوردر</button></div></div>`;document.body.appendChild(m);m.onclick=e=>{const qb=e.target.closest('[data-q]');if(qb){const q=m.querySelector('#itemQty');let v=Math.max(1,Number(q.value||1));q.value=qb.dataset.q==='plus'?v+1:Math.max(1,v-1);return}if(e.target.closest('[data-close]')||e.target===m)return m.remove();if(e.target.closest('[data-add]')){const choices=groups.map((g,gi)=>m.querySelector(`input[name="offer${gi}"]:checked`)?.value).filter(Boolean);const note=[choices.length?'الاختيارات: '+choices.join(' | '):'',fixed,m.querySelector('#itemNote').value.trim()].filter(Boolean).join(' | ');const qty=Math.max(1,Math.floor(Number(m.querySelector('#itemQty').value||1)));pushCartItem({product_id:p.id,name:p.name,price:Number(p.price),base_price:Number(p.price),cost:Number(p.cost||0),qty,modifiers:[],removed:[],notes:note});m.remove()}}}

function pushCartItem(item){state.cart.push(item);drawCart()}
function openItemOptions(p){const mods=productModifierList(p);const variants=productVariantList(p);const removals=Array.isArray(p.removable_components)?p.removable_components:[];const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card"><h2>${p.name}</h2>${variants.length?`<h3>اختار الحجم</h3><div class="option-list variant-list">${variants.map((v,i)=>`<label><input type="radio" name="variant" data-variant="${v.id}" ${i===0?'checked':''}> ${esc(v.name)} — ${money(v.price)}</label>`).join('')}</div>`:''}<h3>العدد</h3><div class="item-qty-picker"><button type="button" data-q="minus">−</button><input id="itemQty" type="number" min="1" value="1" inputmode="numeric"><button type="button" data-q="plus">+</button></div>${state.settings.enable_extras&&p.allow_extras!==false&&mods.length?`<h3>إضافات</h3><div class="option-list">${mods.map(x=>`<label><input type="checkbox" data-mod="${x.id}"> ${x.name} (+${money(x.price)})</label>`).join('')}</div>`:''}${state.settings.enable_removals&&p.allow_removals!==false&&removals.length?`<h3>بدون</h3><div class="option-list">${removals.map((x,i)=>`<label><input type="checkbox" data-rem="${i}"> بدون ${x}</label>`).join('')}</div>`:''}${state.settings.enable_item_notes&&p.allow_item_notes!==false?`<h3>تعليق الصنف</h3><textarea id="itemNote" rows="3" placeholder="مثال: من غير بصل"></textarea>`:''}<div class="modal-actions"><button class="secondary" data-close>إلغاء</button><button class="primary" data-add>إضافة للأوردر</button></div></div>`;document.body.appendChild(m);m.onclick=e=>{const qb=e.target.closest('[data-q]');if(qb){const q=m.querySelector('#itemQty');let v=Math.max(1,Number(q.value||1));q.value=qb.dataset.q==='plus'?v+1:Math.max(1,v-1);return;}if(e.target.closest('[data-close]')||e.target===m)return m.remove();if(e.target.closest('[data-add]')){const variant=variants.length?variants.find(v=>String(v.id)===String(m.querySelector('[name="variant"]:checked')?.dataset.variant)):null;if(variants.length&&!variant)return toast('اختار الحجم');const selected=[...m.querySelectorAll('[data-mod]:checked')].map(c=>mods.find(x=>String(x.id)===String(c.dataset.mod))).filter(Boolean);const removed=[...m.querySelectorAll('[data-rem]:checked')].map(c=>removals[Number(c.dataset.rem)]);const extra=selected.reduce((a,x)=>a+Number(x.price||0),0);const base=variant?Number(variant.price):Number(p.price);const qty=Math.max(1,Math.floor(Number(m.querySelector('#itemQty')?.value||1)));const item={product_id:p.id,name:variant?`${p.name} - ${variant.name}`:p.name,base_price:base,price:base+extra,cost:Number(p.cost||0),qty,modifiers:selected.map(x=>({id:x.id,name:x.name,price:Number(x.price||0)})),removed,notes:m.querySelector('#itemNote')?.value.trim()||'',variant_id:variant?.id||null,variant_name:variant?.name||null};const same=state.cart.find(x=>String(x.product_id)===String(item.product_id)&&String(x.variant_id||'')===String(item.variant_id||'')&&JSON.stringify(x.modifiers||[])===JSON.stringify(item.modifiers||[])&&JSON.stringify(x.removed||[])===JSON.stringify(item.removed||[]));if(same){same.qty+=item.qty;if(item.notes)same.notes=item.notes;drawCart()}else pushCartItem(item);m.remove()}}}
function cartCalc(){const subtotal=state.cart.reduce((s,i)=>s+(Number(i.price||0)*Number(i.qty||0)),0);const discount=Number($('#discount')?.value||0);let deliveryFee=0;if($('#orderType')?.value==='delivery')deliveryFee=Number($('#manualDeliveryFee')?.value||0);return{subtotal,discount,deliveryFee,total:Math.max(0,subtotal-discount+deliveryFee)}}
function drawCart(){if(!$('#cartItems'))return;$('#cartItems').innerHTML=state.cart.length?state.cart.map((i,n)=>`<div class="cart-item"><div class="cart-row"><b>${i.name}</b><b>${money(i.price*i.qty)}</b></div>${i.modifiers?.length?`<small>+ ${i.modifiers.map(x=>x.name).join('، ')}</small>`:''}${i.removed?.length?`<small>بدون: ${i.removed.join('، ')}</small>`:''}${i.notes?`<small>ملاحظة: ${i.notes}</small>`:''}<div class="qty"><button data-a="plus" data-i="${n}">+</button><b>${i.qty}</b><button data-a="minus" data-i="${n}">−</button><button data-a="del" data-i="${n}">🗑</button></div></div>`).join(''):'<div class="empty">أضف أصناف للأوردر</div>';$('#cartItems').onclick=e=>{const b=e.target.closest('button[data-a]');if(!b)return;const i=state.cart[+b.dataset.i];if(b.dataset.a==='plus')i.qty++;if(b.dataset.a==='minus'){i.qty--;if(i.qty<=0)state.cart.splice(+b.dataset.i,1)}if(b.dataset.a==='del')state.cart.splice(+b.dataset.i,1);drawCart()};const c=cartCalc();$('#subtotal').textContent=money(c.subtotal);if($('#deliveryFee'))$('#deliveryFee').textContent=money(c.deliveryFee);$('#grand').textContent=money(c.total)}
async function checkout(payment){
 if(!state.cart.length)return toast('الأوردر فارغ');
 const c=cartCalc(), orderType=$('#orderType').value;

 const requiresShift=!['callcenter','delivery'].includes(state.employee.role);
 let openShift=null;
 if(requiresShift){openShift=await getOpenShift();if(!openShift){toast('لازم تفتح وردية قبل تسجيل البيع');setTimeout(()=>showPage('shifts'),700);return;}}
 const phone=($('#customerPhone')?.value||'').trim(), name=($('#customerName')?.value||'').trim();
 let customerId=state.selectedCustomer?.id||null;
 const area=orderType==='delivery'?($('#deliveryZone')?.selectedOptions?.[0]?.textContent?.split('—')[0]?.trim()||null):null;
 if(phone && !customerId){
   try{
     const createdCustomer=await rest('customers','select=*',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{name:name||phone,phone,address:orderType==='delivery'?($('#deliveryAddress')?.value||null):null,area}])});
     customerId=createdCustomer?.[0]?.id||null;
     if(customerId && orderType==='delivery' && $('#deliveryAddress')?.value){
       await rest('customer_addresses','',{method:'POST',body:JSON.stringify([{customer_id:customerId,label:'العنوان الأساسي',address:$('#deliveryAddress').value,area,is_default:true}])});
     }
   }catch(e){}
 }
 const branchId=currentBranchId();
 const source=(state.employee.role==='delivery'||state.employee.role==='callcenter')?'callcenter':'pos';
 const selectedDriver=orderType==='delivery'&&$('#deliveryDriver')?.value?Number($('#deliveryDriver').value):null;
 const order=[{
   branch_id:branchId,employee_id:state.employee.id,customer_id:customerId,shift_id:openShift?.id||null,order_type:orderType,
   payment_method:payment,subtotal:c.subtotal,discount:c.discount,delivery_fee:c.deliveryFee,total:c.total,
   status:orderType==='delivery'?'new':'completed',source,customer_phone:phone||null,customer_name:name||state.selectedCustomer?.name||null,
   delivery_address:orderType==='delivery'?($('#deliveryAddress')?.value||null):null,delivery_area:area,
   delivery_zone_id:orderType==='delivery'&&$('#deliveryZone')?.value?Number($('#deliveryZone').value):null,
   driver_id:selectedDriver,assigned_at:selectedDriver?new Date().toISOString():null,notes:null
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
 await audit('create_order','order',o.id,{order_number:orderNo,total:c.total,payment,order_type:orderType,shift_id:openShift?.id||null});
 state.cart=[];state.selectedCustomer=null;document.getElementById('receiptPrintFrame')?.remove();toast(`تم حفظ أوردر ${o.order_number||'#'+o.id}`);renderPOS();showReceipt(o,savedItems);
}
const orderTypeLabel=v=>({takeaway:'تيك أواي',delivery:'دليفري',dinein:'صالة'}[v]||v||'');
const paymentLabel=v=>({cash:'كاش',wallet:'محفظة',instapay:'InstaPay',card:'InstaPay',visa:'InstaPay',mixed:'دفع مختلط'}[v]||v||'');
const statusLabel=v=>({new:'جديد',preparing:'قيد التحضير',ready:'جاهز',out_for_delivery:'خرج مع المندوب',delivered:'تم التسليم',completed:'مكتمل',cancelled:'ملغي'}[v]||v||'');

function customerInfoHTML(o){if(o.order_type!=='delivery')return '';const n=o.customer_name||'';const ph=o.customer_phone||'';const area=o.delivery_area||zoneName(o.delivery_zone_id)||'';const addr=o.delivery_address||'';const drv=o._driver_name||driverName(o.driver_id)||'';return `<div class="r-customer">${n?`<div><b>العميل:</b> ${esc(n)}</div>`:''}${ph?`<div><b>الموبايل:</b> ${esc(ph)}</div>`:''}${area?`<div><b>المنطقة:</b> ${esc(area)}</div>`:''}${addr?`<div><b>العنوان:</b> ${esc(addr)}</div>`:''}${drv?`<div><b>المندوب:</b> ${esc(drv)}</div>`:''}</div><hr>`}
function receiptHTML(o,items){return `<div class="receipt"><h2>Top Burger</h2><div class="r-meta"><b>${o.order_number||'#'+o.id}</b><br>${fmtDate(o.created_at||new Date().toISOString())}<br>${branchName(o.branch_id)}</div><hr>${customerInfoHTML(o)}<div class="r-items">${items.map(i=>`<div><span>${esc(i.product_name)} × ${i.quantity}${i.notes?`<small>${esc(i.notes)}</small>`:''}</span><b>${money(i.total)}</b></div>`).join('')}</div><hr><div class="r-totals"><div><span>إجمالي الأصناف</span><b>${money(o.subtotal)}</b></div>${Number(o.discount||0)?`<div><span>خصم</span><b>-${money(o.discount)}</b></div>`:''}${Number(o.delivery_fee||0)?`<div><span>الدليفري</span><b>${money(o.delivery_fee)}</b></div>`:''}<div class="grand-print"><span>المطلوب</span><b>${money(o.total)}</b></div></div><hr><div class="r-footer">${orderTypeLabel(o.order_type)} • ${paymentLabel(o.payment_method)}<br>شكرًا لزيارتكم</div></div>`}
function printIsolated(html){const old=document.getElementById('receiptPrintFrame');if(old)old.remove();const f=document.createElement('iframe');f.id='receiptPrintFrame';f.setAttribute('aria-hidden','true');f.style.cssText='position:fixed;width:1px;height:1px;right:-9999px;bottom:-9999px;border:0;opacity:0;pointer-events:none';document.body.appendChild(f);const d=f.contentDocument;d.open();d.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>@page{size:80mm auto;margin:2mm}body{margin:0;font-family:Arial,sans-serif;color:#000;direction:rtl}.receipt{width:76mm;font-size:12px;line-height:1.45}.receipt h2{text-align:center;font-size:19px;margin:3px 0}.receipt h1{text-align:center}.receipt hr{border:0;border-top:1px dashed #000;margin:6px 0}.r-meta,.r-footer{text-align:center}.r-customer{line-height:1.7}.r-items>div,.r-totals>div{display:flex;justify-content:space-between;gap:8px;margin:5px 0}.r-items small{display:block}.grand-print{font-size:15px;font-weight:900;border-top:1px dashed #000;padding-top:6px}.shift-print{width:76mm;font-size:11px}.shift-print h2,.shift-print h3{text-align:center;margin:5px 0}.shift-report-table{width:100%;border-collapse:collapse;font-size:10px}.shift-report-table th,.shift-report-table td{border-bottom:1px dashed #777;padding:4px 2px;text-align:right}.shift-report-table th:nth-child(n+2),.shift-report-table td:nth-child(n+2){text-align:left}.shift-report-table small{display:block;font-size:8px}</style></head><body>${html}</body></html>`);d.close();setTimeout(()=>{try{f.contentWindow.focus();f.contentWindow.print()}finally{setTimeout(()=>f.remove(),1200)}},150)}
function printReceipt(o,items){printIsolated(receiptHTML(o,items))}
function prepReceiptHTML(o,items){return `<div class="receipt"><div class="receipt-head"><h2>ريسيت التحضير</h2><h1>${o.order_number||'#'+o.id}</h1><p>${branchName(o.branch_id)} • ${fmtDate(o.created_at)}</p><p>${orderTypeLabel(o.order_type)}</p></div><hr>${customerInfoHTML(o)}<div class="r-items">${items.map(i=>`<div class="prep-item"><span><b>${i.quantity} × ${esc(i.product_name)}</b>${i.notes?`<small class="prep-note">📝 ${esc(i.notes)}</small>`:''}</span><b>${money(i.total)}</b></div>`).join('')}</div><hr><div class="r-totals"><div><span>إجمالي الأصناف</span><b>${money(o.subtotal)}</b></div></div><div class="prep-service-note">بدون رسوم خدمة/دليفري</div></div>`}
function printPrepReceipt(o,items){printIsolated(prepReceiptHTML(o,items))}
function showReceipt(o,items){const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card"><h2>تم حفظ أوردر ${o.order_number||'#'+o.id}</h2>${receiptHTML(o,items)}<div class="modal-actions"><button class="secondary" data-close>إغلاق</button>${state.settings.enable_prep_receipt?'<button class="secondary" data-prep>ريسيت التحضير</button>':''}${state.settings.enable_receipt_print?'<button class="primary" data-print>فاتورة العميل</button>':''}</div></div>`;document.body.appendChild(m);m.onclick=e=>{if(e.target.closest('[data-close]')||e.target===m)m.remove();if(e.target.closest('[data-print]'))printReceipt(o,items);if(e.target.closest('[data-prep]'))printPrepReceipt(o,items)}}
async function openOrderDetails(id){const [orders,items]=await Promise.all([rest('orders',`select=*&id=eq.${id}`),rest('order_items',`select=*&order_id=eq.${id}&order=id`)]);const o=orders[0];if(!o)return toast('الأوردر غير موجود');o._driver_name=driverName(o.driver_id);const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card"><h2>تفاصيل أوردر ${o.order_number||'#'+o.id}</h2><p>${fmtDate(o.created_at)} — ${branchName(o.branch_id)}</p><p><b>${orderTypeLabel(o.order_type)}</b> • ${paymentLabel(o.payment_method)} • <span class="tag">${statusLabel(o.status)}</span></p>${o.order_type==='delivery'?customerInfoHTML(o):''}<div class="table-wrap"><table style="min-width:0"><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${items.map(i=>`<tr><td>${esc(i.product_name)}${i.notes?`<small style="display:block;margin-top:4px">📝 ${esc(i.notes)}</small>`:''}</td><td>${i.quantity}</td><td>${money(i.unit_price)}</td><td>${money(i.total)}</td></tr>`).join('')}</tbody></table></div><h3>المطلوب: ${money(o.total)}</h3><div class="modal-actions"><button class="secondary" data-close>إغلاق</button><button class="secondary" data-prep>ريسيت التحضير</button><button class="primary" data-print>فاتورة العميل</button></div></div>`;document.body.appendChild(m);m.onclick=e=>{if(e.target.closest('[data-close]')||e.target===m)m.remove();if(e.target.closest('[data-print]'))printReceipt(o,items);if(e.target.closest('[data-prep]'))printPrepReceipt(o,items)}}

async function renderOrders(){const rows=await rest('orders',`select=*&branch_id=eq.${currentBranchId()}&order=created_at.desc&limit=200`);$('#page').innerHTML=`<div class="panel"><h2>آخر الطلبات</h2><div class="table-wrap"><table><thead><tr><th>الأوردر</th><th>التاريخ</th><th>الفرع</th><th>العميل</th><th>النوع</th><th>الدفع</th><th>الحالة</th><th>الإجمالي</th><th></th></tr></thead><tbody>${rows.map(o=>`<tr><td>${o.order_number||'#'+o.id}</td><td>${fmtDate(o.created_at)}</td><td>${branchName(o.branch_id)}</td><td>${o.customer_name||o.customer_phone||'-'}</td><td>${orderTypeLabel(o.order_type)}</td><td>${paymentLabel(o.payment_method)}</td><td><span class="tag">${statusLabel(o.status)}</span></td><td>${money(o.total)}</td><td><button class="secondary" data-order="${o.id}">تفاصيل</button></td></tr>`).join('')}</tbody></table></div></div>`;$('#page').onclick=e=>{const b=e.target.closest('[data-order]');if(b)openOrderDetails(b.dataset.order)}}


async function renderCustomers(){
 const rows=await rest('customers','select=*&order=created_at.desc&limit=300');
 $('#page').innerHTML=`<div class="panel"><div class="toolbar"><h2>العملاء</h2><input id="customerSearch" placeholder="بحث بالاسم أو رقم الموبايل"></div><div class="table-wrap"><table><thead><tr><th>الاسم</th><th>الموبايل</th><th>المنطقة</th><th>العنوان</th><th>إجراء</th></tr></thead><tbody id="customersBody"></tbody></table></div></div>`;
 const draw=()=>{const v=$('#customerSearch').value.trim().toLowerCase();$('#customersBody').innerHTML=rows.filter(c=>!v||String(c.name||'').toLowerCase().includes(v)||String(c.phone||'').includes(v)).map(c=>`<tr><td>${esc(c.name||'')}</td><td>${esc(c.phone||'')}</td><td>${esc(c.area||'')}</td><td>${esc(c.address||'')}</td><td><button class="secondary" data-edit-customer="${c.id}">✏️ تعديل</button> <button class="secondary" data-addresses="${c.id}">📍 العناوين</button></td></tr>`).join('')||'<tr><td colspan="5">لا توجد نتائج</td></tr>'};$('#customerSearch').oninput=draw;draw();
 $('#customersBody').onclick=async e=>{const eb=e.target.closest('[data-edit-customer]'),ab=e.target.closest('[data-addresses]');if(eb){const c=rows.find(x=>String(x.id)===eb.dataset.editCustomer);const name=await uiPrompt('اسم العميل',c.name||'');if(name===null)return;const phone=await uiPrompt('رقم الموبايل',c.phone||'');if(phone===null)return;const area=await uiPrompt('المنطقة',c.area||'');if(area===null)return;const address=await uiPrompt('العنوان',c.address||'');if(address===null)return;const dup=rows.find(x=>x.id!==c.id&&normalizePhone(x.phone)===normalizePhone(phone));if(dup)return toast('رقم الموبايل مسجل لعميل آخر');await rest('customers',`id=eq.${c.id}`,{method:'PATCH',body:JSON.stringify({name:name.trim(),phone:phone.trim(),area:area.trim()||null,address:address.trim()||null,updated_at:new Date().toISOString()})});toast('تم تعديل العميل');renderCustomers();return;}if(ab){openCustomerAddresses(Number(ab.dataset.addresses));}};
}
async function openCustomerAddresses(customerId){const rows=await rest('customer_addresses',`select=*&customer_id=eq.${customerId}&order=is_default.desc,id.desc`);const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card"><h2>عناوين العميل</h2><div class="option-list">${rows.map(a=>`<div class="manage-row"><span>${esc(a.label||a.area||'عنوان')} — ${esc(a.address||'')}</span><span><button class="secondary" data-edit-address="${a.id}">✏️</button><button class="danger" data-delete-address="${a.id}">🗑️</button></span></div>`).join('')||'<div class="empty">لا توجد عناوين</div>'}</div><button class="secondary" data-add-address>+ إضافة عنوان</button><div class="modal-actions"><button class="primary" data-close>إغلاق</button></div></div>`;document.body.appendChild(m);m.onclick=async e=>{if(e.target.closest('[data-close]')||e.target===m){m.remove();return}const add=e.target.closest('[data-add-address]');if(add){const label=await uiPrompt('اسم العنوان','المنزل');if(label===null)return;const area=await uiPrompt('المنطقة','');if(area===null)return;const address=await uiPrompt('العنوان بالتفصيل','');if(address===null||!address.trim())return;await rest('customer_addresses','',{method:'POST',body:JSON.stringify([{customer_id:customerId,label,area,address,is_default:rows.length===0}])});m.remove();openCustomerAddresses(customerId);return}const ed=e.target.closest('[data-edit-address]');if(ed){const a=rows.find(x=>String(x.id)===ed.dataset.editAddress);const label=await uiPrompt('اسم العنوان',a.label||'');if(label===null)return;const area=await uiPrompt('المنطقة',a.area||'');if(area===null)return;const address=await uiPrompt('العنوان',a.address||'');if(address===null)return;await rest('customer_addresses',`id=eq.${a.id}`,{method:'PATCH',body:JSON.stringify({label,area,address})});m.remove();openCustomerAddresses(customerId);return}const del=e.target.closest('[data-delete-address]');if(del&&await uiConfirm('حذف هذا العنوان؟')){await rest('customer_addresses',`id=eq.${del.dataset.deleteAddress}`,{method:'DELETE'});m.remove();openCustomerAddresses(customerId)}}}

async function renderDelivery(){
 $('#page').innerHTML=`<div class="panel"><h2>تحميل شاشة الدليفري...</h2></div>`;
 let drivers=[],zones=[],outOrders=[];
 try{drivers=await rest('delivery_drivers','select=*&order=active.desc,name')}catch(e){console.error('drivers',e)}
 try{zones=await rest('delivery_zones','select=*&order=active.desc,name')}catch(e){console.error('zones',e)}
 try{outOrders=await rest('orders','select=*&order_type=eq.delivery&status=in.(new,ready,out_for_delivery)&order=created_at.desc&limit=100')}catch(e){console.error('delivery orders',e)}
 state.drivers=drivers||[]; state.deliveryZones=zones||[];
 $('#page').innerHTML=`<div class="grid delivery-admin-grid">
 <div class="panel"><h2>🛵 مناديب التوصيل</h2><div class="form-grid"><label>الاسم<input id="driverName" placeholder="اسم المندوب"></label><label>الموبايل<input id="driverPhone" inputmode="tel" placeholder="رقم الموبايل"></label><label>الفرع<select id="driverBranch" disabled><option value="${currentBranchId()}">${branchName(currentBranchId())}</option></select></label></div><button id="addDriver" class="primary">إضافة مندوب</button><div class="chips">${drivers.map(d=>`<span class="chip">${d.name} • ${branchName(d.branch_id)}</span>`).join('')||'لا يوجد مناديب حتى الآن'}</div></div>
 <div class="panel"><h2>📍 مناطق الدليفري</h2><div class="form-grid"><label>المنطقة<input id="zoneName" placeholder="اسم المنطقة"></label><label>الفرع المسؤول<select id="zoneBranch" disabled><option value="${currentBranchId()}">${branchName(currentBranchId())}</option></select></label></div><button id="addZone" class="primary">إضافة منطقة</button><div class="chips">${zones.map(z=>`<span class="chip">${z.name} • ${money(z.delivery_fee)} • ${branchName(z.branch_id)}</span>`).join('')||'لا توجد مناطق حتى الآن'}</div></div></div>
 <div class="panel"><h2>طلبات الدليفري الحالية</h2><div class="table-wrap"><table><thead><tr><th>الأوردر</th><th>الفرع</th><th>العميل</th><th>العنوان</th><th>الحالة</th><th>المندوب</th><th>إجراء</th></tr></thead><tbody>${outOrders.length?outOrders.map(o=>`<tr><td>${o.order_number||'#'+o.id}</td><td>${branchName(o.branch_id)}</td><td>${o.customer_phone||'-'}</td><td>${o.delivery_address||'-'}</td><td>${statusLabel(o.status)}</td><td>${drivers.find(d=>String(d.id)===String(o.driver_id))?.name||'-'}</td><td>${o.status!=='out_for_delivery'?`<button class="secondary" data-assign="${o.id}">تسليم لمندوب</button>`:`<button class="primary" data-delivered="${o.id}">تم التسليم</button>`}</td></tr>`).join(''):'<tr><td colspan="7">لا توجد طلبات دليفري حالية</td></tr>'}</tbody></table></div></div>`;
 $('#addDriver').onclick=async()=>{if(!$('#driverName').value.trim())return toast('اكتب اسم المندوب');await rest('delivery_drivers','',{method:'POST',body:JSON.stringify([{name:$('#driverName').value.trim(),phone:$('#driverPhone').value.trim()||null,branch_id:currentBranchId(),active:true}])});toast('تمت إضافة المندوب');renderDelivery()};
 $('#addZone').onclick=async()=>{if(!$('#zoneName').value.trim())return toast('اكتب اسم المنطقة');await rest('delivery_zones','',{method:'POST',body:JSON.stringify([{name:$('#zoneName').value.trim(),delivery_fee:0,branch_id:currentBranchId(),active:true}])});toast('تمت إضافة المنطقة');renderDelivery()};
 $('#page').onclick=async e=>{
   const a=e.target.closest('[data-assign]'); if(a){
     openDriverPicker(Number(a.dataset.assign),drivers,()=>renderDelivery());return;
   }
   const done=e.target.closest('[data-delivered]');
   if(done){
     await rest('orders',`id=eq.${done.dataset.delivered}`,{method:'PATCH',body:JSON.stringify({status:'delivered',delivered_at:new Date().toISOString()})});
     toast('تم تسجيل التسليم');renderDelivery()
   }
 };
}

async function renderKitchen(){if(!state.settings.enable_kitchen){$('#page').innerHTML='<div class="empty">شاشة المطبخ غير مفعلة من الإعدادات</div>';return;}const rows=await rest('orders',`select=*&branch_id=eq.${currentBranchId()}&status=in.(new,preparing,ready)&order=created_at.asc&limit=100`);const cards=await Promise.all(rows.map(async o=>{const items=await rest('order_items',`select=product_name,quantity,notes&order_id=eq.${o.id}&order=id`);return `<div class="panel kitchen-card"><div class="kitchen-head"><div><h2>أوردر #${o.id}</h2><small>${fmtDate(o.created_at)} • ${orderTypeLabel(o.order_type)}</small></div><span class="tag">${statusLabel(o.status)}</span></div><div class="kitchen-items">${items.map(i=>`<div><b>${i.quantity} ×</b> ${i.product_name}${i.notes?`<small class=\"kitchen-note\">📝 ${i.notes}</small>`:''}</div>`).join('')}</div><div class="modal-actions">${o.status==='new'?`<button class="primary" data-status="preparing" data-id="${o.id}">بدء التحضير</button>`:''}${o.status==='preparing'?`<button class="primary" data-status="ready" data-id="${o.id}">جاهز</button>`:''}${o.status==='ready'?`<button class="primary" data-status="completed" data-id="${o.id}">تم التسليم</button>`:''}</div></div>`}));$('#page').innerHTML=`<div class="kitchen-grid">${cards.join('')||'<div class="empty">لا توجد طلبات بالمطبخ حاليًا</div>'}</div>`;$('#page').onclick=async e=>{const b=e.target.closest('[data-status]');if(!b)return;await rest('orders',`id=eq.${b.dataset.id}`,{method:'PATCH',body:JSON.stringify({status:b.dataset.status})});toast('تم تحديث حالة الطلب');renderKitchen()}}

async function shiftMetrics(shift){const [orders,payments,expenses]=await Promise.all([rest('orders',`select=id,total,subtotal,discount,delivery_fee,status,order_type,payment_method&shift_id=eq.${shift.id}`),rest('order_payments',`select=order_id,method,amount&order_id=in.(${(await rest('orders',`select=id&shift_id=eq.${shift.id}`)).map(x=>x.id).join(',')||0})`),rest('expenses',`select=amount&shift_id=eq.${shift.id}`)]);const valid=orders.filter(o=>o.status!=='cancelled');const ids=new Set(valid.map(o=>o.id));let cash=0,wallet=0,instapay=0;for(const p of payments){if(!ids.has(p.order_id))continue;if(p.method==='cash')cash+=Number(p.amount||0);if(p.method==='wallet')wallet+=Number(p.amount||0);if(p.method==='instapay')instapay+=Number(p.amount||0)}for(const o of valid){if(payments.some(p=>p.order_id===o.id))continue;const v=Number(o.total||0);if(o.payment_method==='cash')cash+=v;else if(o.payment_method==='wallet')wallet+=v;else if(o.payment_method==='instapay')instapay+=v}const sales=valid.reduce((a,o)=>a+Number(o.total||0),0),exp=expenses.reduce((a,e)=>a+Number(e.amount||0),0),expected=Number(shift.opening_cash||0)+cash-exp;return{orders,valid,sales,cash,wallet,instapay,exp,expected,count:valid.length,cancelled:orders.filter(o=>o.status==='cancelled').length}}
async function shiftReportData(shift){
 const orders=await rest('orders',`select=id,order_number,total,subtotal,discount,delivery_fee,status,order_type,payment_method,created_at&shift_id=eq.${shift.id}&order=created_at.asc`);
 const ids=(orders||[]).map(o=>o.id);
 const [items,expenses]=await Promise.all([
   ids.length?rest('order_items',`select=order_id,product_name,quantity,unit_price,total&order_id=in.(${ids.join(',')})`):Promise.resolve([]),
   rest('expenses',`select=id,description,amount,created_at,employee_id&shift_id=eq.${shift.id}&order=created_at.asc`)
 ]);
 const valid=(orders||[]).filter(o=>o.status!=='cancelled');
 const validIds=new Set(valid.map(o=>String(o.id)));
 const products=new Map();
 for(const i of (items||[])){if(!validIds.has(String(i.order_id)))continue;const k=i.product_name||'صنف';const x=products.get(k)||{name:k,qty:0,total:0};x.qty+=Number(i.quantity||0);x.total+=Number(i.total||0);products.set(k,x)}
 return {orders:orders||[],valid,items:items||[],expenses:expenses||[],products:[...products.values()].sort((a,b)=>b.qty-a.qty),deliveryCount:valid.filter(o=>o.order_type==='delivery').length,deliveryFees:valid.reduce((a,o)=>a+Number(o.delivery_fee||0),0),cancelled:(orders||[]).filter(o=>o.status==='cancelled'),cancelledValue:(orders||[]).filter(o=>o.status==='cancelled').reduce((a,o)=>a+Number(o.total||0),0)};
}
function shiftReportHTML(sh,employees,mtr,data){
 const sales=sh.closed_at?Number(sh.sales_total||mtr.sales):mtr.sales,cash=sh.closed_at?Number(sh.cash_sales||mtr.cash):mtr.cash,wallet=sh.closed_at?Number(sh.wallet_sales||mtr.wallet):mtr.wallet,instapay=sh.closed_at?Number(sh.instapay_sales||mtr.instapay):mtr.instapay,exp=sh.closed_at?Number(sh.expenses_total||mtr.exp):mtr.exp,expected=sh.closed_at?Number(sh.expected_cash||mtr.expected):mtr.expected;
 return `<div class="shift-print"><h2>Top Burger</h2><h3>تقرير وردية #${sh.id}</h3><div class="r-meta">${esc(branchName(sh.branch_id))}<br>${esc(employeeName(sh.employee_id,employees)||'موظف')}<br>فتح: ${fmtDate(sh.opened_at)}<br>قفل: ${sh.closed_at?fmtDate(sh.closed_at):'مفتوحة الآن'}</div><hr>
 <div class="r-totals"><div><span>إجمالي المبيعات</span><b>${money(sales)}</b></div><div><span>عدد الأوردرات</span><b>${data.valid.length}</b></div><div><span>كاش</span><b>${money(cash)}</b></div><div><span>محفظة</span><b>${money(wallet)}</b></div><div><span>InstaPay</span><b>${money(instapay)}</b></div><div><span>أوردرات دليفري</span><b>${data.deliveryCount}</b></div><div><span>رسوم التوصيل</span><b>${money(data.deliveryFees)}</b></div><div><span>أوردرات ملغية</span><b>${data.cancelled.length} (${money(data.cancelledValue)})</b></div></div><hr>
 <h3>مبيعات الأصناف</h3><table class="shift-report-table"><thead><tr><th>الصنف</th><th>الكمية</th><th>الإجمالي</th></tr></thead><tbody>${data.products.map(x=>`<tr><td>${esc(x.name)}</td><td>${x.qty}</td><td>${money(x.total)}</td></tr>`).join('')||'<tr><td colspan="3">لا توجد مبيعات</td></tr>'}</tbody></table><hr>
 <h3>المصروفات</h3><table class="shift-report-table"><thead><tr><th>البيان</th><th>المبلغ</th></tr></thead><tbody>${data.expenses.map(x=>`<tr><td>${esc(x.description||'مصروف')}<small>${fmtDate(x.created_at)}</small></td><td>${money(x.amount)}</td></tr>`).join('')||'<tr><td colspan="2">لا توجد مصروفات</td></tr>'}</tbody></table><div class="r-totals"><div><span>إجمالي المصروفات</span><b>${money(exp)}</b></div></div><hr>
 <div class="r-totals"><div><span>افتتاحية الخزنة</span><b>${money(sh.opening_cash)}</b></div><div><span>الكاش المتوقع</span><b>${money(expected)}</b></div>${sh.closed_at?`<div><span>الكاش الفعلي</span><b>${money(sh.closing_cash)}</b></div><div class="grand-print"><span>العجز / الزيادة</span><b>${money(sh.cash_difference||0)}</b></div>`:''}</div><hr><div class="r-footer">تقرير الوردية • ${new Date().toLocaleString('ar-EG')}</div></div>`;
}
async function openShiftReport(sh,employees){const [mtr,data]=await Promise.all([shiftMetrics(sh),shiftReportData(sh)]);const html=shiftReportHTML(sh,employees,mtr,data);const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card shift-detail"><h2>تقرير وردية #${sh.id}</h2><div class="report-summary-list"><div>المبيعات <b>${money(sh.closed_at?sh.sales_total:mtr.sales)}</b></div><div>الأوردرات <b>${data.valid.length}</b></div><div>المصروفات <b>${money(sh.closed_at?sh.expenses_total:mtr.exp)}</b></div><div>أصناف مباعة <b>${data.products.length}</b></div><div>رسوم التوصيل <b>${money(data.deliveryFees)}</b></div><div>ملغي <b>${data.cancelled.length}</b></div></div><div class="modal-actions"><button class="secondary" data-close>إغلاق</button><button class="primary" data-print-shift>🖨️ طباعة تقرير الوردية</button></div></div>`;document.body.appendChild(m);m.onclick=e=>{if(e.target.closest('[data-close]')||e.target===m)m.remove();if(e.target.closest('[data-print-shift]'))printIsolated(html)}}
async function renderShifts(){const employees=await rest('employees','select=id,name,branch_id,role,active&order=name');const isAdmin=state.employee.role==='admin';const rows=await rest('shifts',`select=*&branch_id=eq.${currentBranchId()}&order=opened_at.desc&limit=100`);const open=rows.find(s=>String(s.employee_id)===String(state.employee.id)&&s.status==='open'&&!s.closed_at);let metrics=open?await shiftMetrics(open):null;$('#page').innerHTML=`${open?`<div class="panel shift-current"><div class="shift-title"><div><h2>🟢 الوردية الحالية</h2><p>${branchName(open.branch_id)} • بدأت ${fmtDate(open.opened_at)} • ${employeeName(open.employee_id,employees)}</p></div><span class="shift-duration">${Math.max(0,Math.floor((Date.now()-new Date(open.opened_at))/60000))} دقيقة</span></div><div class="grid kpis"><div class="card kpi"><small>إجمالي المبيعات</small><strong>${money(metrics.sales)}</strong></div><div class="card kpi"><small>عدد الأوردرات</small><strong>${metrics.count}</strong></div><div class="card kpi"><small>كاش</small><strong>${money(metrics.cash)}</strong></div><div class="card kpi"><small>مصروفات</small><strong>${money(metrics.exp)}</strong></div></div><div class="shift-pay-grid"><div>افتتاحية الخزنة <b>${money(open.opening_cash)}</b></div><div>محفظة <b>${money(metrics.wallet)}</b></div><div>InstaPay <b>${money(metrics.instapay)}</b></div><div>الكاش المتوقع بالدرج <b>${money(metrics.expected)}</b></div></div><div class="toolbar close-shift-bar"><label>الكاش الفعلي عند القفل<input id="closingCash" type="number" min="0" step="0.01" placeholder="عدّ الدرج واكتب الرقم"></label><button id="closeShift" class="danger">إغلاق الوردية وعمل التسوية</button></div></div>`:`<div class="panel"><h2>فتح وردية جديدة</h2><p>أي مبيعات ومصروفات بعد الفتح هتتربط بالوردية دي تلقائيًا.</p><div class="toolbar"><label>عهدة بداية الوردية<input id="openingCash" type="number" min="0" step="0.01" value="0"></label><button id="openShift" class="primary">فتح الوردية</button></div></div>`}<div class="panel"><div class="shift-title"><h2>سجل الورديات</h2></div><div class="table-wrap"><table><thead><tr><th>#</th><th>الفرع</th><th>الموظف</th><th>الفتح</th><th>القفل</th><th>المبيعات</th><th>كاش</th><th>مصروفات</th><th>العجز/الزيادة</th><th>الحالة</th><th></th></tr></thead><tbody id="shiftRows"></tbody></table></div></div>`;
 const drawHistory=()=>{const list=rows;$('#shiftRows').innerHTML=list.map(x=>`<tr><td>${x.id}</td><td>${branchName(x.branch_id)}</td><td>${employeeName(x.employee_id,employees)}</td><td>${fmtDate(x.opened_at)}</td><td>${x.closed_at?fmtDate(x.closed_at):'-'}</td><td>${money(x.sales_total||0)}</td><td>${money(x.cash_sales||0)}</td><td>${money(x.expenses_total||0)}</td><td class="${Number(x.cash_difference||0)<0?'negative':'positive'}">${x.closed_at?money(x.cash_difference||0):'-'}</td><td><span class="tag">${x.status==='open'?'مفتوحة':'مقفولة'}</span></td><td><button class="secondary" data-shift="${x.id}">التفاصيل</button></td></tr>`).join('')||'<tr><td colspan="11">لا توجد ورديات</td></tr>'};drawHistory();
 if(open)$('#closeShift').onclick=async()=>{const actual=Number($('#closingCash').value);if(!Number.isFinite(actual))return toast('اكتب الكاش الفعلي عند القفل');const pending=metrics.orders.filter(o=>o.order_type==='delivery'&&!['delivered','cancelled','completed'].includes(o.status));if(pending.length)return toast(`فيه ${pending.length} أوردر دليفري معلق — خلصه أو الغيه قبل القفل`);const diff=actual-metrics.expected;await rest('shifts',`id=eq.${open.id}`,{method:'PATCH',body:JSON.stringify({closing_cash:actual,closed_at:new Date().toISOString(),status:'closed',closed_by_employee_id:state.employee.id,sales_total:metrics.sales,cash_sales:metrics.cash,wallet_sales:metrics.wallet,instapay_sales:metrics.instapay,expenses_total:metrics.exp,expected_cash:metrics.expected,cash_difference:diff,orders_count:metrics.count})});await audit('close_shift','shift',open.id,{sales:metrics.sales,expected_cash:metrics.expected,actual_cash:actual,difference:diff});toast(diff===0?'تم قفل الوردية — الخزنة مظبوطة':`تم القفل — ${diff>0?'زيادة':'عجز'} ${money(Math.abs(diff))}`);const closedShift={...open,closing_cash:actual,closed_at:new Date().toISOString(),status:'closed',closed_by_employee_id:state.employee.id,sales_total:metrics.sales,cash_sales:metrics.cash,wallet_sales:metrics.wallet,instapay_sales:metrics.instapay,expenses_total:metrics.exp,expected_cash:metrics.expected,cash_difference:diff,orders_count:metrics.count};await renderShifts();await openShiftReport(closedShift,employees)};
 else $('#openShift').onclick=async()=>{const opening=Number($('#openingCash').value||0);const created=await rest('shifts','select=*',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{branch_id:currentBranchId(),employee_id:state.employee.id,opening_cash:opening,status:'open'}])});await audit('open_shift','shift',created?.[0]?.id,{opening_cash:opening});toast('تم فتح الوردية');renderShifts()};
 $('#page').addEventListener('click',async e=>{const b=e.target.closest('[data-shift]');if(!b)return;const sh=rows.find(x=>String(x.id)===String(b.dataset.shift));if(!sh)return;await openShiftReport(sh,employees)});
}

async function renderExpenses(){
 const today=localDateInput();
 $('#page').innerHTML=`<div class="panel"><h2>إضافة مصروف</h2><div class="form-grid"><label>البيان<input id="exTitle"></label><label>المبلغ<input id="exAmount" type="number" min="0" step="0.01"></label></div><button id="addExpense" class="primary">حفظ المصروف</button></div>
 <div class="panel"><div class="toolbar expense-toolbar"><button class="secondary" data-period="today">اليوم</button><button class="secondary" data-period="yesterday">أمس</button><button class="secondary" data-period="week">الأسبوع</button><button class="secondary" data-period="month">الشهر</button><label>من<input id="exFrom" type="date" value="${today}"></label><label>إلى<input id="exTo" type="date" value="${today}"></label><button id="loadExpenses" class="primary">عرض</button></div><div class="kpi-line">إجمالي مصروفات الفترة: <strong id="expenseTotal">0</strong></div><div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>البيان</th><th>المبلغ</th><th>الوردية</th><th>إجراء</th></tr></thead><tbody id="expenseRows"></tbody></table></div></div>`;
 const load=async()=>{const from=$('#exFrom').value,to=$('#exTo').value;const a=new Date(from+'T00:00:00').toISOString(),b=new Date(to+'T23:59:59.999').toISOString();const rows=await rest('expenses',`select=*&branch_id=eq.${currentBranchId()}&created_at=gte.${encodeURIComponent(a)}&created_at=lte.${encodeURIComponent(b)}&order=created_at.desc&limit=500`);$('#expenseTotal').textContent=money(rows.reduce((x,e)=>x+Number(e.amount||0),0));$('#expenseRows').innerHTML=rows.map(e=>`<tr><td>${fmtDate(e.created_at)}</td><td>${esc(e.description)}</td><td>${money(e.amount)}</td><td>${e.shift_id?'#'+e.shift_id:'-'}</td><td><button class="secondary" data-edit-exp="${e.id}">✏️ تعديل</button></td></tr>`).join('')||'<tr><td colspan="5">لا توجد مصروفات في الفترة</td></tr>';$('#expenseRows').onclick=async ev=>{const btn=ev.target.closest('[data-edit-exp]');if(!btn)return;const e=rows.find(x=>String(x.id)===btn.dataset.editExp);if(!e)return;const desc=await uiPrompt('بيان المصروف',e.description);if(desc===null)return;const amount=await uiPrompt('المبلغ',e.amount);if(amount===null||!Number.isFinite(Number(amount)))return;await rest('expenses',`id=eq.${e.id}`,{method:'PATCH',body:JSON.stringify({description:desc.trim(),amount:Number(amount)})});await audit('edit_expense','expense',e.id,{amount:Number(amount)});toast('تم تعديل المصروف');load()};};
 $('#loadExpenses').onclick=load;$('#page').onclick=e=>{const b=e.target.closest('[data-period]');if(!b)return;const d=new Date(),fmt=x=>{const z=new Date(x.getTime()-x.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)};let from=new Date(d),to=new Date(d);if(b.dataset.period==='yesterday'){from.setDate(d.getDate()-1);to=new Date(from)}if(b.dataset.period==='week')from.setDate(d.getDate()-6);if(b.dataset.period==='month')from=new Date(d.getFullYear(),d.getMonth(),1);$('#exFrom').value=fmt(from);$('#exTo').value=fmt(to);load()};
 $('#addExpense').onclick=async()=>{if(!$('#exTitle').value||!$('#exAmount').value)return toast('أدخل البيان والمبلغ');const shift=await getOpenShift();if(!shift)return toast('افتح وردية أولًا قبل تسجيل المصروف');const created=await rest('expenses','select=*',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{branch_id:currentBranchId(),employee_id:state.employee.id,shift_id:shift.id,description:$('#exTitle').value,amount:Number($('#exAmount').value)}])});await audit('create_expense','expense',created?.[0]?.id,{amount:Number($('#exAmount').value),shift_id:shift.id});toast('تم حفظ المصروف وربطه بالوردية');load()};load();
}

function catalogOrderValue(x){const w=Number(x?.website_sort_order);if(Number.isFinite(w)&&w>0)return w;const s=Number(x?.sort_order);if(Number.isFinite(s)&&s>0)return s;return 1000000+Number(x?.id||0)}
function sortedActiveCategories(){return state.categories.filter(c=>c.active!==false).slice().sort((a,b)=>catalogOrderValue(a)-catalogOrderValue(b)||Number(a.id)-Number(b.id))}
function sortedActiveProducts(categoryId=null){return state.products.filter(p=>p.active!==false&&(categoryId===null||String(p.category_id)===String(categoryId))).slice().sort((a,b)=>catalogOrderValue(a)-catalogOrderValue(b)||Number(a.id)-Number(b.id))}
async function moveCategoryOrder(id,dir){const items=sortedActiveCategories();const i=items.findIndex(x=>String(x.id)===String(id));const j=i+dir;if(i<0||j<0||j>=items.length)return;[items[i],items[j]]=[items[j],items[i]];await Promise.all(items.map((x,k)=>rest('categories',`id=eq.${x.id}`,{method:'PATCH',body:JSON.stringify({sort_order:(k+1)*10,website_sort_order:(k+1)*10})})));await reloadCatalog();toast('تم حفظ ترتيب التصنيفات');renderProducts()}
async function moveProductOrder(id,dir){const p=state.products.find(x=>String(x.id)===String(id));if(!p)return;const items=sortedActiveProducts(p.category_id);const i=items.findIndex(x=>String(x.id)===String(id));const j=i+dir;if(i<0||j<0||j>=items.length)return;[items[i],items[j]]=[items[j],items[i]];await Promise.all(items.map((x,k)=>rest('products',`id=eq.${x.id}`,{method:'PATCH',body:JSON.stringify({website_sort_order:(k+1)*10})})));await reloadCatalog();toast('تم حفظ ترتيب الأصناف');renderProducts()}
async function reloadCatalog(){state.categories=await rest('categories','select=*&order=id');state.products=await rest('products','select=*&order=id');}
function variantBuilderHTML(rows=[]){
 const data=rows.length?rows:[{name:'سينجل',price:'',sort_order:10},{name:'دبل',price:'',sort_order:20}];
 return `<div class="variant-builder-list">${data.map((v,i)=>`<div class="variant-builder-row" data-variant-row ${v.id?`data-existing-id="${v.id}"`:''}><input data-variant-name placeholder="اسم الاختيار مثل سينجل" value="${esc(v.name||'')}"><input data-variant-price type="number" min="0" step="0.01" placeholder="السعر" value="${v.price??''}"><button type="button" class="danger variant-remove" data-remove-variant title="حذف الاختيار">×</button></div>`).join('')}</div>`;
}
function bindVariantBuilder(root,toggleSel,boxSel,addSel){
 const toggle=root.querySelector(toggleSel),box=root.querySelector(boxSel),add=root.querySelector(addSel);
 const sync=()=>{if(box)box.classList.toggle('hidden',!toggle?.checked)};
 toggle?.addEventListener('change',sync);sync();
 add?.addEventListener('click',()=>{const list=box.querySelector('.variant-builder-list');const row=document.createElement('div');row.className='variant-builder-row';row.setAttribute('data-variant-row','');row.innerHTML='<input data-variant-name placeholder="اسم الاختيار"><input data-variant-price type="number" min="0" step="0.01" placeholder="السعر"><button type="button" class="danger variant-remove" data-remove-variant title="حذف الاختيار">×</button>';list.appendChild(row)});
 root.addEventListener('click',e=>{const b=e.target.closest('[data-remove-variant]');if(!b)return;const row=b.closest('[data-variant-row]');if(row)row.remove()});
}
function collectVariantRows(root,scope){
 const rows=[...root.querySelectorAll(`${scope} [data-variant-row]`)];
 const out=[];
 for(let i=0;i<rows.length;i++){
  const name=rows[i].querySelector('[data-variant-name]')?.value.trim()||'';
  const raw=rows[i].querySelector('[data-variant-price]')?.value;
  if(!name && (raw===''||raw==null))continue;
  const price=Number(raw);
  if(!name)throw new Error('اكتب اسم كل اختيار');
  if(!Number.isFinite(price)||price<0)throw new Error(`راجع سعر ${name}`);
  out.push({id:rows[i].dataset.existingId?Number(rows[i].dataset.existingId):null,name,price,sort_order:(i+1)*10,active:true});
 }
 return out;
}

function activeModifiers(){return state.modifiers.filter(x=>x.active!==false)}
function modifierPickerHTML(prefix,selectedIds=[],defaultAll=false){
 const mods=activeModifiers();const selected=new Set(selectedIds.map(String));const all=mods.length>0&&(defaultAll||mods.every(x=>selected.has(String(x.id))));
 return `<div class="extras-picker" data-extras-picker="${prefix}"><label class="setting-switch extras-all"><span>كل الإضافات</span><input id="${prefix}AllExtras" type="checkbox" ${all?'checked':''}></label><div class="option-list extras-admin-list">${mods.map(x=>`<label><input type="checkbox" data-extra-choice="${x.id}" ${(all||selected.has(String(x.id)))?'checked':''} ${all?'disabled':''}> ${esc(x.name)} (+${money(x.price)})</label>`).join('')||'<span class="muted">أضف إضافات أولًا</span>'}</div></div>`;
}
function bindModifierPicker(root,allowSelector,boxSelector,prefix){
 const allow=root.querySelector(allowSelector),box=root.querySelector(boxSelector),all=box?.querySelector(`#${prefix}AllExtras`);if(!allow||!box)return;
 const syncAllow=()=>box.classList.toggle('hidden',!allow.checked);allow.addEventListener('change',syncAllow);syncAllow();
 if(all){all.addEventListener('change',()=>{const checks=[...box.querySelectorAll('[data-extra-choice]')];if(all.checked){checks.forEach(c=>{c.checked=true;c.disabled=true})}else checks.forEach(c=>c.disabled=false)})}
}
function collectModifierChoices(root,boxSelector){return [...root.querySelectorAll(`${boxSelector} [data-extra-choice]:checked`)].map(x=>Number(x.dataset.extraChoice)).filter(Number.isFinite)}

async function renderProducts(){
 state.products=await rest('products','select=*&order=id'); state.branchProducts=await rest('branch_products','select=*'); state.modifiers=await rest('modifiers','select=*&order=id'); state.productModifiers=await rest('product_modifiers','select=*'); state.productVariants=await rest('product_variants','select=*&order=sort_order,id');
 $('#page').innerHTML=`<div class="panel"><h2>التصنيفات</h2><div class="toolbar"><input id="newCategory" placeholder="اسم التصنيف"><button id="addCategory" class="primary">إضافة تصنيف</button></div><div class="chips">${sortedActiveCategories().map((c,i,a)=>`<span class="chip sort-chip"><b>${esc(c.name)}</b> <button class="secondary sort-arrow" data-cat-up="${c.id}" ${i===0?'disabled':''} title="تحريك لأعلى">↑</button> <button class="secondary sort-arrow" data-cat-down="${c.id}" ${i===a.length-1?'disabled':''} title="تحريك لأسفل">↓</button> <button class="secondary" data-edit-cat="${c.id}">✏️</button> <button class="danger" data-delete-cat="${c.id}">🗑️ حذف</button></span>`).join('')}</div></div>
 <div class="panel"><h2>إضافة صنف</h2><div class="form-grid"><label>الاسم<input id="pName"></label><label>القسم<select id="pCat">${sortedActiveCategories().map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}</select></label><label>سعر البيع الأساسي<input id="pPrice" type="number"></label><label>التكلفة<input id="pCost" type="number"></label><label>باركود<input id="pBarcode"></label><label>مكونات يمكن حذفها<input id="pRemovals" placeholder="بصل، مخلل، صوص"></label></div>
 <div class="toggle-row"><label><input id="pHasVariants" type="checkbox"> للصنف اختيارات / أحجام</label><label><input id="pExtras" type="checkbox" checked> يسمح بإضافات</label><label><input id="pRemove" type="checkbox" checked> يسمح بحذف مكونات</label><label><input id="pNotes" type="checkbox" checked> يسمح بملاحظة</label></div>
 <div id="pExtrasBox"><h3>الإضافات المتاحة لهذا الصنف</h3><p class="muted">اختر كل الإضافات أو حدد الإضافات التي تريد ظهورها مع الصنف.</p>${modifierPickerHTML('p',[],true)}</div>
 <div id="pVariantsBox" class="variant-builder hidden"><div class="variant-builder-head"><div><h3>اختيارات الصنف</h3><p class="muted">أضف أي اختيارات تريدها: سينجل، دبل، تريبل أو أي اسم آخر.</p></div><button type="button" id="addNewVariant" class="secondary">+ إضافة اختيار</button></div>${variantBuilderHTML()}</div>
 <button id="addProduct" class="primary">إضافة الصنف</button></div>
 <div class="panel"><h2>الإضافات (Extras)</h2><div class="form-grid"><label>اسم الإضافة<input id="mName" placeholder="Extra Cheese"></label><label>السعر<input id="mPrice" type="number" value="0"></label></div><button id="addModifier" class="primary">إضافة</button><div class="chips">${state.modifiers.map(m=>`<span class="chip">${m.name} • ${money(m.price)}</span>`).join('')||'لا توجد إضافات'}</div></div>
 <div class="panel"><div class="section-head"><h2>الأصناف</h2></div><div class="table-wrap"><table><thead><tr><th>ترتيب</th><th>الصورة</th><th>الصنف</th><th>السعر</th><th>الاختيارات / الأحجام</th><th>الإضافات المتاحة</th><th>إجراء</th></tr></thead><tbody>${sortedActiveCategories().flatMap(c=>sortedActiveProducts(c.id)).map((p,idx,all)=>{const same=all.filter(x=>String(x.category_id)===String(p.category_id));const pos=same.findIndex(x=>String(x.id)===String(p.id));return `<tr><td class="sort-cell"><button class="secondary sort-arrow" data-product-up="${p.id}" ${pos===0?'disabled':''}>↑</button><button class="secondary sort-arrow" data-product-down="${p.id}" ${pos===same.length-1?'disabled':''}>↓</button></td><td>${p.image_url?`<img class="admin-product-img" src="${esc(p.image_url)}">`:'🍔'}</td><td>${p.name}</td><td>${money(p.price)}</td><td>${productVariantList(p).map(x=>`${esc(x.name)} ${money(x.price)}`).join('، ')||'-'}</td><td>${productModifierList(p).map(x=>x.name).join('، ')||'-'}</td><td><button class="secondary" data-image-product="${p.id}">🖼️ صورة</button> <button class="secondary" data-edit-product="${p.id}">✏️ تعديل</button> <button class="secondary" data-config="${p.id}">خيارات</button> <button class="danger" data-delete-product="${p.id}">🗑️ حذف</button></td></tr>`}).join('')}</tbody></table></div></div>`;
 bindVariantBuilder($('#page'),'#pHasVariants','#pVariantsBox','#addNewVariant');
 bindModifierPicker($('#page'),'#pExtras','#pExtrasBox','p');
 $('#addProduct').onclick=async()=>{
  if(!$('#pName').value.trim())return toast('اكتب اسم الصنف');
  const removable=$('#pRemovals').value.split(/[،,]/).map(x=>x.trim()).filter(Boolean);
  let variants=[];try{if($('#pHasVariants').checked){variants=collectVariantRows($('#page'),'#pVariantsBox');if(!variants.length)return toast('أضف اختيار واحد على الأقل')}}catch(err){return toast(err.message)}
  let basePrice=Number($('#pPrice').value||0);if(variants.length)basePrice=variants[0].price;
  const body={name:$('#pName').value.trim(),category_id:Number($('#pCat').value),price:basePrice,cost:Number($('#pCost').value||0),barcode:$('#pBarcode').value||null,active:true,website_visible:true,website_sort_order:(sortedActiveProducts(Number($('#pCat').value)).length+1)*10,allow_extras:$('#pExtras').checked,allow_removals:$('#pRemove').checked,allow_item_notes:$('#pNotes').checked,removable_components:removable};
  try{
   const created=await rest('products','select=*',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([body])});const pid=created?.[0]?.id;if(!pid)throw new Error('تعذر الحصول على رقم الصنف');
   if(variants.length)await rest('product_variants','',{method:'POST',body:JSON.stringify(variants.map(v=>({product_id:pid,name:v.name,price:v.price,sort_order:v.sort_order,active:true})))});
   if($('#pExtras').checked){const modifierIds=collectModifierChoices($('#page'),'#pExtrasBox');if(modifierIds.length)await rest('product_modifiers','',{method:'POST',body:JSON.stringify(modifierIds.map(id=>({product_id:pid,modifier_id:id})))})}
   // إتاحة الصنف تلقائيًا في كل الفروع الحالية، مع تجاهل أي تكرار قائم
   for(const b of state.branches){try{await rest('branch_products','',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify([{branch_id:b.id,product_id:pid,active:true}])})}catch(e){}}
   toast('تمت إضافة الصنف');renderProducts();
  }catch(err){toast(err.message||'تعذر إضافة الصنف')}
 };
 $('#addModifier').onclick=async()=>{if(!$('#mName').value)return toast('اكتب اسم الإضافة');await rest('modifiers','',{method:'POST',body:JSON.stringify([{name:$('#mName').value,price:Number($('#mPrice').value||0),active:true}])});toast('تمت إضافة الإضافة');renderProducts()};
 $('#addCategory').onclick=async()=>{const name=$('#newCategory').value.trim();if(!name)return toast('اكتب اسم التصنيف');await rest('categories','',{method:'POST',body:JSON.stringify([{name,active:true,website_visible:true,sort_order:(sortedActiveCategories().length+1)*10,website_sort_order:(sortedActiveCategories().length+1)*10}])});toast('تمت إضافة التصنيف');await reloadCatalog();renderProducts()};
 $('#page').onclick=async e=>{const cu=e.target.closest('[data-cat-up]');if(cu)return moveCategoryOrder(cu.dataset.catUp,-1);const cd=e.target.closest('[data-cat-down]');if(cd)return moveCategoryOrder(cd.dataset.catDown,1);const pu=e.target.closest('[data-product-up]');if(pu)return moveProductOrder(pu.dataset.productUp,-1);const pd=e.target.closest('[data-product-down]');if(pd)return moveProductOrder(pd.dataset.productDown,1);const ip=e.target.closest('[data-image-product]');if(ip){const p=state.products.find(x=>String(x.id)===ip.dataset.imageProduct);if(p)return openProductImage(p)}const cfg=e.target.closest('[data-config]');if(cfg)return openProductConfig(state.products.find(p=>String(p.id)===String(cfg.dataset.config)));const ep=e.target.closest('[data-edit-product]');if(ep){const p=state.products.find(x=>String(x.id)===ep.dataset.editProduct);if(p)return openEditProductModal(p)}const tp=e.target.closest('[data-delete-product]');if(tp){const p=state.products.find(x=>String(x.id)===tp.dataset.deleteProduct);if(!p)return;if(!await uiConfirm(`حذف الصنف ${p.name}؟\nسيختفي من الكاشير والإدارة مع الاحتفاظ به داخل الفواتير القديمة.`))return;await rest('products',`id=eq.${p.id}`,{method:'PATCH',body:JSON.stringify({active:false,website_visible:false})});toast('تم حذف الصنف');return renderProducts()}const ec=e.target.closest('[data-edit-cat]');if(ec){const c=state.categories.find(x=>String(x.id)===ec.dataset.editCat);const name=await uiPrompt('اسم التصنيف',c.name);if(name===null)return;await rest('categories',`id=eq.${c.id}`,{method:'PATCH',body:JSON.stringify({name:name.trim()})});await reloadCatalog();return renderProducts()}const tc=e.target.closest('[data-delete-cat]');if(tc){const c=state.categories.find(x=>String(x.id)===tc.dataset.deleteCat);if(!c)return;const linked=state.products.filter(p=>p.active!==false&&String(p.category_id)===String(c.id));const extra=linked.length?`\nوسيتم حذف ${linked.length} صنف تابع له من القوائم الحالية.`:'';if(!await uiConfirm(`حذف التصنيف ${c.name}؟${extra}\nالفواتير القديمة ستظل محفوظة.`))return;if(linked.length)await rest('products',`category_id=eq.${c.id}`,{method:'PATCH',body:JSON.stringify({active:false,website_visible:false})});await rest('categories',`id=eq.${c.id}`,{method:'PATCH',body:JSON.stringify({active:false,website_visible:false})});await reloadCatalog();toast('تم حذف التصنيف');return renderProducts()}};
}



async function renderWebsiteManagement(){
 const canAvailability=hasFeaturePermission('branchProductAvailability');
 const canBranchSettings=hasFeaturePermission('websiteBranchSettings');
 $('#page').innerHTML=`<div class="panel"><div class="section-head"><div><h2>🌐 إدارة الموقع</h2><p class="muted">أدوات تشغيل الموقع مجمعة هنا من غير ما نزحم الصفحة الرئيسية.</p></div></div><div class="home-grid">${canAvailability?`<button class="home-card tone-green" data-site-tool="availability"><span class="home-icon">🍔</span><span class="home-copy"><b>توافر أصناف الموقع</b><small>تشغيل وإيقاف الأصناف لكل فرع</small></span><span class="home-arrow">‹</span></button>`:''}${canBranchSettings?`<button class="home-card tone-amber" data-site-tool="branch-settings"><span class="home-icon">🔥</span><span class="home-copy"><b>استقبال الطلبات ومدة التجهيز</b><small>فتح أو إيقاف طلبات الموقع وتحديد وقت التجهيز لكل فرع</small></span><span class="home-arrow">‹</span></button>`:''}</div></div>`;
 $('#page').onclick=e=>{if(e.target.closest('[data-site-tool="availability"]'))return showPage('branchProductAvailability');if(e.target.closest('[data-site-tool="branch-settings"]'))return showPage('websiteBranchSettings')};
}

function websiteBranchState(row){
 const until=row?.orders_paused_until?new Date(row.orders_paused_until):null;
 if(row?.orders_open===false)return {open:false,temp:false,label:'🔴 موقوف يدويًا'};
 if(until&&!Number.isNaN(until.getTime())&&until.getTime()>Date.now()){
   const t=until.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'});
   return {open:false,temp:true,label:`🟠 موقوف حتى ${t}`};
 }
 return {open:true,temp:false,label:'🟢 استقبال مفتوح'};
}
function chooseBranchOrderAction(branchName){return new Promise(resolve=>{
 const m=document.createElement('div');m.className='modal';
 m.innerHTML=`<div class="modal-card availability-modal"><h2>🔥 ${esc(branchName)}</h2><p class="muted">اختر حالة استقبال طلبات الموقع للفرع.</p><div class="availability-actions"><button class="primary" data-bo-action="on">🟢 فتح الآن</button><button class="secondary" data-bo-action="30">⏱️ إيقاف 30 دقيقة</button><button class="secondary" data-bo-action="60">⏱️ إيقاف ساعة</button><button class="secondary" data-bo-action="120">⏱️ إيقاف ساعتين</button><button class="secondary" data-bo-action="custom">🕒 لوقت محدد</button><button class="danger" data-bo-action="off">🔴 إيقاف يدوي</button></div><div class="modal-actions"><button class="secondary" data-close>إلغاء</button></div></div>`;
 document.body.appendChild(m);const finish=v=>{m.remove();resolve(v)};
 m.onclick=async e=>{if(e.target===m||e.target.closest('[data-close]'))return finish(null);const b=e.target.closest('[data-bo-action]');if(!b)return;const a=b.dataset.boAction;if(a==='custom'){const v=await uiPrompt('حدد وقت فتح الطلبات تلقائيًا','',{title:'إيقاف الطلبات لوقت محدد',type:'datetime-local',okText:'تأكيد',icon:'🕒'});if(!v)return;const d=new Date(v);if(Number.isNaN(d.getTime())||d.getTime()<=Date.now())return toast('اختار وقت بعد الوقت الحالي');return finish({type:'temp',until:d.toISOString()})}if(a==='on')return finish({type:'on'});if(a==='off')return finish({type:'off'});return finish({type:'temp',until:new Date(Date.now()+Number(a)*60000).toISOString()})};
 })}

async function renderWebsiteBranchSettings(){
 if(!hasFeaturePermission('websiteBranchSettings')){toast('ليس لديك صلاحية إدارة استقبال طلبات الموقع');return showPage('home')}
 let rows=[];try{rows=await rest('branch_website_settings','select=*')}catch(e){throw new Error('شغّل SQL الخاص بـ V9.2.8 أولًا')}
 const branches=allowedBranches();
 const cards=branches.map(b=>{const r=rows.find(x=>Number(x.branch_id)===Number(b.id))||{branch_id:b.id,orders_open:true,prep_min:30,prep_max:45};const st=websiteBranchState(r);return `<div class="branch-web-card" data-branch-settings="${b.id}"><div class="branch-web-head"><div><h3>📍 ${esc(b.name)}</h3><span class="branch-web-status ${st.open?'is-open':st.temp?'is-temp':'is-closed'}">${st.label}</span></div><button class="secondary compact" data-order-state="${b.id}">تغيير الحالة</button></div><div class="prep-settings"><label>من <input type="number" min="5" max="240" step="5" data-prep-min="${b.id}" value="${Number(r.prep_min||30)}"> دقيقة</label><label>إلى <input type="number" min="5" max="240" step="5" data-prep-max="${b.id}" value="${Number(r.prep_max||45)}"> دقيقة</label><button class="primary compact" data-save-prep="${b.id}">💾 حفظ مدة التجهيز</button></div></div>`}).join('');
 $('#page').innerHTML=`<div class="panel branch-website-panel"><div class="section-head"><div><h2>🔥 استقبال طلبات الموقع ومدة التجهيز</h2><p class="muted">كل فرع مستقل. الإيقاف المؤقت يرجع يفتح تلقائيًا، ومدة التجهيز تظهر للعميل على الموقع.</p></div></div><div class="branch-web-list">${cards||'<div class="empty">لا توجد فروع متاحة</div>'}</div></div>`;
 $('#page').onclick=async e=>{const sb=e.target.closest('[data-order-state]');if(sb){const branchId=Number(sb.dataset.orderState);if(!allowedBranchIds().includes(branchId))return toast('ليس لديك صلاحية لهذا الفرع');const b=state.branches.find(x=>Number(x.id)===branchId);const action=await chooseBranchOrderAction(b?.name||'الفرع');if(!action)return;let payload;if(action.type==='on')payload={orders_open:true,orders_paused_until:null,updated_at:new Date().toISOString()};else if(action.type==='off')payload={orders_open:false,orders_paused_until:null,updated_at:new Date().toISOString()};else payload={orders_open:true,orders_paused_until:action.until,updated_at:new Date().toISOString()};try{await rest('branch_website_settings','',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify([{branch_id:branchId,...payload}])});toast(action.type==='on'?'تم فتح استقبال الطلبات':action.type==='off'?'تم إيقاف الطلبات يدويًا':'تم إيقاف الطلبات مؤقتًا');return renderWebsiteBranchSettings()}catch(err){return toast(err.message||'تعذر تحديث حالة الفرع')}}const sp=e.target.closest('[data-save-prep]');if(sp){const branchId=Number(sp.dataset.savePrep);if(!allowedBranchIds().includes(branchId))return toast('ليس لديك صلاحية لهذا الفرع');const mn=Number($(`[data-prep-min="${branchId}"]`)?.value||0),mx=Number($(`[data-prep-max="${branchId}"]`)?.value||0);if(mn<5||mx<5||mn>240||mx>240||mx<mn)return toast('راجع مدة التجهيز: من 5 إلى 240 دقيقة، والنهاية أكبر من البداية');try{await rest('branch_website_settings','',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify([{branch_id:branchId,prep_min:mn,prep_max:mx,updated_at:new Date().toISOString()}])});toast('تم حفظ مدة التجهيز');return renderWebsiteBranchSettings()}catch(err){return toast(err.message||'تعذر حفظ مدة التجهيز')}}};
}

function availabilityState(bp){
 if(!bp)return {on:true,temp:false,label:'✅ متاح'};
 if(bp.active===false)return {on:false,temp:false,label:'❌ موقوف'};
 const until=bp.website_paused_until?new Date(bp.website_paused_until):null;
 if(until&&!Number.isNaN(until.getTime())&&until.getTime()>Date.now()){
   const t=until.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'});
   return {on:false,temp:true,label:`⏱️ حتى ${t}`};
 }
 return {on:true,temp:false,label:'✅ متاح'};
}
function chooseAvailabilityAction(productName,branchName,current){return new Promise(resolve=>{
 const m=document.createElement('div');m.className='modal';
 m.innerHTML=`<div class="modal-card availability-modal"><h2>🌐 ${esc(productName)}</h2><p class="muted">${esc(branchName)} — اختر حالة الصنف على الموقع</p><div class="availability-actions"><button class="primary" data-av-action="on">✅ تشغيل الآن</button><button class="secondary" data-av-action="30">⏱️ إيقاف 30 دقيقة</button><button class="secondary" data-av-action="60">⏱️ إيقاف ساعة</button><button class="secondary" data-av-action="120">⏱️ إيقاف ساعتين</button><button class="secondary" data-av-action="custom">🕒 لوقت محدد</button><button class="danger" data-av-action="off">⛔ إيقاف يدوي</button></div><div class="modal-actions"><button class="secondary" data-close>إلغاء</button></div></div>`;
 document.body.appendChild(m);
 const finish=v=>{m.remove();resolve(v)};
 m.onclick=async e=>{if(e.target===m||e.target.closest('[data-close]'))return finish(null);const b=e.target.closest('[data-av-action]');if(!b)return;const a=b.dataset.avAction;if(a==='custom'){const v=await uiPrompt('حدد وقت رجوع الصنف تلقائيًا','',{title:'إيقاف لوقت محدد',type:'datetime-local',okText:'تأكيد',icon:'🕒'});if(!v)return;const d=new Date(v);if(Number.isNaN(d.getTime())||d.getTime()<=Date.now())return toast('اختار وقت بعد الوقت الحالي');return finish({type:'temp',until:d.toISOString()})}if(a==='on')return finish({type:'on'});if(a==='off')return finish({type:'off'});const mins=Number(a);return finish({type:'temp',until:new Date(Date.now()+mins*60000).toISOString()})};
 })}

async function renderWebsiteAvailability(){
 if(!hasFeaturePermission('branchProductAvailability')){toast('ليس لديك صلاحية إدارة توافر أصناف الموقع');return showPage('home')}
 state.products=await rest('products','select=*&order=id');
 state.branchProducts=await rest('branch_products','select=*');
 const products=sortedActiveCategories().flatMap(c=>sortedActiveProducts(c.id));
 const branches=allowedBranches();
 const rows=products.map(p=>`<tr><td><b>${esc(p.name)}</b></td>${branches.map(b=>{const bp=(state.branchProducts||[]).find(x=>String(x.product_id)===String(p.id)&&String(x.branch_id)===String(b.id));const st=availabilityState(bp);return `<td><button class="availability-btn ${st.on?'primary':st.temp?'warning':'secondary'}" data-av-product="${p.id}" data-av-branch="${b.id}">${st.label}</button></td>`}).join('')}</tr>`).join('');
 $('#page').innerHTML=`<div class="panel website-availability-panel"><div class="section-head"><div><h2>🌐 توافر أصناف الموقع</h2><p class="muted">اضغط على حالة الصنف لتشغيله أو إيقافه مؤقتًا أو يدويًا. التأثير على الموقع فقط وفي الفرع المحدد.</p></div></div><div class="table-wrap website-availability-wrap"><table class="website-availability-table"><thead><tr><th>الصنف</th>${branches.map(b=>`<th>${esc(b.name)}</th>`).join('')}</tr></thead><tbody>${rows||'<tr><td colspan="99">لا توجد أصناف</td></tr>'}</tbody></table></div></div>`;
 $('#page').onclick=async e=>{const bt=e.target.closest('[data-av-product]');if(!bt)return;const productId=Number(bt.dataset.avProduct),branchId=Number(bt.dataset.avBranch);if(!allowedBranchIds().includes(branchId))return toast('ليس لديك صلاحية لهذا الفرع');const p=state.products.find(x=>Number(x.id)===productId);const b=state.branches.find(x=>Number(x.id)===branchId);const current=(state.branchProducts||[]).find(x=>Number(x.product_id)===productId&&Number(x.branch_id)===branchId);const action=await chooseAvailabilityAction(p?.name||'الصنف',b?.name||'الفرع',current);if(!action)return;bt.disabled=true;try{let payload;if(action.type==='on')payload={active:true,website_paused_until:null};else if(action.type==='off')payload={active:false,website_paused_until:null};else payload={active:true,website_paused_until:action.until};if(current){await rest('branch_products',`branch_id=eq.${branchId}&product_id=eq.${productId}`,{method:'PATCH',body:JSON.stringify(payload)})}else{await rest('branch_products','',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify([{branch_id:branchId,product_id:productId,...payload}])})}toast(action.type==='on'?'تم تشغيل الصنف':action.type==='off'?'تم إيقاف الصنف يدويًا':'تم إيقاف الصنف مؤقتًا');return renderWebsiteAvailability()}catch(err){toast(err.message||'تعذر تحديث التوافر')}finally{bt.disabled=false}};
}

async function uploadProductImage(product,file){
 if(!file)return; if(!/^image\//.test(file.type))return toast('اختر ملف صورة'); if(file.size>5*1024*1024)return toast('الصورة أكبر من 5MB');
 const ext=(file.name.split('.').pop()||'jpg').replace(/[^a-z0-9]/gi,'').toLowerCase();const path=`products/${product.id}-${Date.now()}.${ext}`;
 const r=await fetch(`${cfg.url}/storage/v1/object/product-images/${path}`,{method:'POST',headers:{apikey:cfg.key,Authorization:`Bearer ${session.access_token}`,'Content-Type':file.type,'x-upsert':'true'},body:file});
 if(!r.ok){let d={};try{d=await r.json()}catch{}throw new Error(d.message||d.error||`خطأ رفع الصورة ${r.status}`)}
 const url=`${cfg.url}/storage/v1/object/public/product-images/${path}`;await rest('products',`id=eq.${product.id}`,{method:'PATCH',body:JSON.stringify({image_url:url})});await reloadCatalog();toast('تم حفظ صورة الصنف');renderProducts();
}
function openProductImage(p){const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card"><h2>🖼️ صورة ${esc(p.name)}</h2>${p.image_url?`<img class="product-image-preview" src="${esc(p.image_url)}">`:'<div class="product-image-preview product-placeholder">🍔</div>'}<label>اختر صورة من الموبايل<input id="productImageFile" type="file" accept="image/*"></label><div class="modal-actions">${p.image_url?'<button class="danger" data-remove-image>حذف الصورة</button>':''}<button class="secondary" data-close>إلغاء</button><button class="primary" data-upload-image>رفع الصورة</button></div></div>`;document.body.appendChild(m);m.onclick=async e=>{if(e.target===m||e.target.closest('[data-close]'))return m.remove();if(e.target.closest('[data-upload-image]')){const f=m.querySelector('#productImageFile').files[0];if(!f)return toast('اختر صورة أولاً');try{await uploadProductImage(p,f);m.remove()}catch(err){toast(err.message)}}if(e.target.closest('[data-remove-image]')){if(!await uiConfirm('حذف صورة الصنف؟'))return;await rest('products',`id=eq.${p.id}`,{method:'PATCH',body:JSON.stringify({image_url:null})});m.remove();await reloadCatalog();toast('تم حذف الصورة');renderProducts()}}}


function openEditProductModal(p){
 const variants=productVariantList(p).slice().sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0)||Number(a.id)-Number(b.id));
 const currentModifierIds=state.productModifiers.filter(x=>String(x.product_id)===String(p.id)).map(x=>Number(x.modifier_id));
 const defaultAllExtras=p.allow_extras!==false&&currentModifierIds.length===0&&activeModifiers().length>0;
 const m=document.createElement('div');m.className='modal';
 m.innerHTML=`<div class="modal-card product-edit-modal"><h2>✏️ تعديل ${esc(p.name)}</h2>
  <div class="form-grid">
   <label>اسم الصنف<input id="editProductName" value="${esc(p.name)}"></label>
   <label>التصنيف<select id="editProductCat">${sortedActiveCategories().map(c=>`<option value="${c.id}" ${String(c.id)===String(p.category_id)?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label>
   <label>التكلفة<input id="editProductCost" type="number" min="0" step="0.01" value="${Number(p.cost||0)}"></label>
   <label>سعر البيع الأساسي<input id="editProductPrice" type="number" min="0" step="0.01" value="${Number(p.price||0)}"></label>
   <label>مكونات يمكن حذفها<input id="editProductRemovals" value="${esc((p.removable_components||[]).join('، '))}" placeholder="بصل، مخلل، صوص"></label>
  </div>
  <div class="toggle-row"><label><input id="editHasVariants" type="checkbox" ${variants.length?'checked':''}> للصنف اختيارات / أحجام</label><label><input id="editExtras" type="checkbox" ${p.allow_extras!==false?'checked':''}> يسمح بإضافات</label><label><input id="editRemove" type="checkbox" ${p.allow_removals!==false?'checked':''}> يسمح بحذف مكونات</label><label><input id="editNotes" type="checkbox" ${p.allow_item_notes!==false?'checked':''}> يسمح بملاحظة</label></div>
  <div id="editExtrasBox"><h3>الإضافات المتاحة لهذا الصنف</h3><p class="muted">اختر كل الإضافات أو حدد إضافات معينة.</p>${modifierPickerHTML('edit',currentModifierIds,defaultAllExtras)}</div>
  <div id="editVariantsBox" class="variant-builder ${variants.length?'':'hidden'}"><div class="variant-builder-head"><div><h3>الاختيارات / الأحجام</h3><p class="muted">غيّر الاسم أو السعر، أضف اختيار جديد أو احذفه.</p></div><button type="button" id="editAddVariant" class="secondary">+ إضافة اختيار</button></div>${variantBuilderHTML(variants)}</div>
  <div class="modal-actions"><button class="secondary" data-close>إلغاء</button><button class="primary" data-save-product>حفظ التعديلات</button></div>
 </div>`;
 document.body.appendChild(m);bindVariantBuilder(m,'#editHasVariants','#editVariantsBox','#editAddVariant');bindModifierPicker(m,'#editExtras','#editExtrasBox','edit');
 const close=()=>m.remove();
 m.onclick=async e=>{
  if(e.target===m||e.target.closest('[data-close]'))return close();
  if(!e.target.closest('[data-save-product]'))return;
  const name=m.querySelector('#editProductName').value.trim();const cost=Number(m.querySelector('#editProductCost').value||0);const category_id=Number(m.querySelector('#editProductCat').value);if(!name)return toast('اكتب اسم الصنف');if(!Number.isFinite(cost)||cost<0)return toast('التكلفة غير صحيحة');
  const hasVariants=m.querySelector('#editHasVariants').checked;let desired=[];try{if(hasVariants){desired=collectVariantRows(m,'#editVariantsBox');if(!desired.length)return toast('أضف اختيار واحد على الأقل')}}catch(err){return toast(err.message)}
  let basePrice=Number(m.querySelector('#editProductPrice').value||0);if(!Number.isFinite(basePrice)||basePrice<0)return toast('سعر البيع غير صحيح');if(desired.length)basePrice=desired[0].price;
  const allow_extras=m.querySelector('#editExtras').checked,allow_removals=m.querySelector('#editRemove').checked,allow_item_notes=m.querySelector('#editNotes').checked;const removable_components=m.querySelector('#editProductRemovals').value.split(/[،,]/).map(x=>x.trim()).filter(Boolean);const modifierIds=allow_extras?collectModifierChoices(m,'#editExtrasBox'):[];
  const saveBtn=m.querySelector('[data-save-product]');saveBtn.disabled=true;saveBtn.textContent='جاري الحفظ...';
  try{
   await rest('products',`id=eq.${p.id}`,{method:'PATCH',body:JSON.stringify({name,category_id,price:basePrice,cost,allow_extras,allow_removals,allow_item_notes,removable_components})});
   const keepIds=new Set();
   if(hasVariants){
    for(const v of desired){
     if(v.id){await rest('product_variants',`id=eq.${v.id}&product_id=eq.${p.id}`,{method:'PATCH',body:JSON.stringify({name:v.name,price:v.price,sort_order:v.sort_order,active:true})});keepIds.add(Number(v.id));}
     else{const created=await rest('product_variants','select=id',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{product_id:p.id,name:v.name,price:v.price,sort_order:v.sort_order,active:true}])});if(created?.[0]?.id)keepIds.add(Number(created[0].id));}
    }
   }
   for(const old of variants){if(!keepIds.has(Number(old.id)))await rest('product_variants',`id=eq.${old.id}&product_id=eq.${p.id}`,{method:'DELETE'})}
   await rest('product_modifiers',`product_id=eq.${p.id}`,{method:'DELETE'});if(modifierIds.length)await rest('product_modifiers','',{method:'POST',body:JSON.stringify(modifierIds.map(id=>({product_id:p.id,modifier_id:id})))});
   await audit('edit_product','product',p.id,{name,category_id,price:basePrice,cost,variants:desired.map(v=>({name:v.name,price:v.price})),allow_extras,modifier_ids:modifierIds});
   close();toast('تم حفظ الصنف والاختيارات والإضافات');await renderProducts();
  }catch(err){saveBtn.disabled=false;saveBtn.textContent='حفظ التعديلات';toast(err.message||'تعذر حفظ التعديلات')}
 };
}

function openProductConfig(p){const selected=new Set(state.productModifiers.filter(x=>String(x.product_id)===String(p.id)).map(x=>String(x.modifier_id)));const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card"><h2>خيارات ${p.name}</h2><div class="toggle-row"><label><input id="cfgExtras" type="checkbox" ${p.allow_extras!==false?'checked':''}> إضافات</label><label><input id="cfgRem" type="checkbox" ${p.allow_removals!==false?'checked':''}> حذف مكونات</label><label><input id="cfgNotes" type="checkbox" ${p.allow_item_notes!==false?'checked':''}> ملاحظات</label></div><label>مكونات قابلة للحذف<input id="cfgComponents" value="${(p.removable_components||[]).join('، ')}"></label><h3>الإضافات المسموحة</h3><div class="option-list">${state.modifiers.map(x=>`<label><input type="checkbox" data-pm="${x.id}" ${selected.has(String(x.id))?'checked':''}> ${x.name} (+${money(x.price)})</label>`).join('')||'أضف Extras أولًا'}</div><div class="modal-actions"><button class="secondary" data-close>إلغاء</button><button class="primary" data-save>حفظ</button></div></div>`;document.body.appendChild(m);m.onclick=async e=>{if(e.target.closest('[data-close]')||e.target===m)m.remove();if(e.target.closest('[data-save]')){const comps=m.querySelector('#cfgComponents').value.split(/[،,]/).map(x=>x.trim()).filter(Boolean);await rest('products',`id=eq.${p.id}`,{method:'PATCH',body:JSON.stringify({allow_extras:m.querySelector('#cfgExtras').checked,allow_removals:m.querySelector('#cfgRem').checked,allow_item_notes:m.querySelector('#cfgNotes').checked,removable_components:comps})});await rest('product_modifiers',`product_id=eq.${p.id}`,{method:'DELETE'});const ids=[...m.querySelectorAll('[data-pm]:checked')].map(x=>Number(x.dataset.pm));if(ids.length)await rest('product_modifiers','',{method:'POST',body:JSON.stringify(ids.map(id=>({product_id:p.id,modifier_id:id})))});m.remove();toast('تم حفظ خيارات الصنف');renderProducts()}}}

async function renderInventory(){if(!state.settings.enable_inventory){$('#page').innerHTML='<div class="empty">المخزون غير مفعّل من الإعدادات</div>';return;}const rows=await rest('ingredient_stock',`select=id,branch_id,quantity,ingredients(name,unit)&branch_id=eq.${currentBranchId()}&order=id`);$('#page').innerHTML=`<div class="panel"><h2>مخزون الخامات</h2><div class="table-wrap"><table><thead><tr><th>الخامة</th><th>الوحدة</th><th>الفرع</th><th>الرصيد</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.ingredients?.name||''}</td><td>${r.ingredients?.unit||''}</td><td>${branchName(r.branch_id)}</td><td>${r.quantity}</td></tr>`).join('')}</tbody></table></div></div>`}

function downloadCSV(name,rows){const csv='\ufeff'+rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
async function renderReports(){
  const today=localDateInput();
  $('#page').innerHTML=`
    <div class="panel report-filters">
      <h2>📊 مركز التقارير</h2>
      <div class="toolbar">
        <label>من<input id="repFrom" type="date" value="${today}"></label>
        <label>إلى<input id="repTo" type="date" value="${today}"></label>
        <label>الفرع<select id="repBranch" disabled><option value="${currentBranchId()}">${esc(branchName(currentBranchId()))}</option></select></label>
        <label>نوع الطلب<select id="repType"><option value="all">الكل</option><option value="takeaway">تيك أواي</option><option value="delivery">دليفري</option><option value="dinein">صالة</option></select></label>
        <label>الدفع<select id="repPay"><option value="all">الكل</option><option value="cash">كاش</option><option value="wallet">محفظة</option><option value="instapay">InstaPay</option></select></label>
        <label>الموظف<select id="repEmployee"><option value="all">كل الموظفين</option></select></label><label>الوردية<select id="repShift"><option value="all">كل الورديات</option></select></label>
        <button id="runReport" class="primary">عرض التقرير</button>
        <button id="exportReport" class="secondary">تصدير CSV</button>
      </div>
    </div>
    <div id="reportBody"><div class="empty">اختار الفلاتر واضغط «عرض التقرير»</div></div>`;

  let employees=[];
  let lastExport=[];
  try{
    employees=await rest('employees','select=id,name,branch_id,role&order=name');
    const sel=$('#repEmployee');
    if(sel) sel.innerHTML='<option value="all">كل الموظفين</option>'+employees.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('');
  }catch(e){ console.warn('report employees',e); }

  const safeFetch=async(table,query)=>{try{return await fetchAll(table,query)}catch(e){console.warn('report '+table,e);return []}};

  const run=async()=>{
    const body=$('#reportBody');
    if(!body)return;
    body.innerHTML='<div class="empty">جاري حساب التقرير...</div>';
    await new Promise(r=>setTimeout(r,30));
    try{
      const from=$('#repFrom')?.value||today;
      const to=$('#repTo')?.value||today;
      const r=rangeISO(from,to);
      const orders=await safeFetch('orders',`select=*&branch_id=eq.${currentBranchId()}&created_at=gte.${encodeURIComponent(r.from)}&created_at=lte.${encodeURIComponent(r.to)}&order=created_at.desc`);
      const expenses=await safeFetch('expenses',`select=*&branch_id=eq.${currentBranchId()}&created_at=gte.${encodeURIComponent(r.from)}&created_at=lte.${encodeURIComponent(r.to)}&order=created_at.desc`);
      const shifts=await safeFetch('shifts',`select=*&branch_id=eq.${currentBranchId()}&opened_at=lte.${encodeURIComponent(r.to)}&order=opened_at.desc`);
      const shiftSel=$('#repShift');if(shiftSel){const current=shiftSel.value;shiftSel.innerHTML='<option value="all">كل الورديات</option>'+shifts.map(sh=>`<option value="${sh.id}">#${sh.id} — ${branchName(sh.branch_id)} — ${fmtDate(sh.opened_at)}</option>`).join('');if([...shiftSel.options].some(o=>o.value===current))shiftSel.value=current;}

      const bf=$('#repBranch')?.value||'all';
      const tf=$('#repType')?.value||'all';
      const pf=$('#repPay')?.value||'all';
      const ef=$('#repEmployee')?.value||'all';
      const sf=$('#repShift')?.value||'all';
      let ord=(orders||[]).filter(o=>(bf==='all'||String(o.branch_id)===bf)&&(tf==='all'||String(o.order_type||o.type)===tf)&&(ef==='all'||String(o.employee_id)===ef)&&(sf==='all'||String(o.shift_id)===sf));

      let payments=[];
      const ids=ord.map(o=>o.id).filter(Boolean);
      for(let i=0;i<ids.length;i+=100){
        const part=ids.slice(i,i+100).join(',');
        if(!part)continue;
        const rows=await safeFetch('order_payments',`select=order_id,method,amount&order_id=in.(${part})`);
        payments.push(...rows);
      }
      if(pf!=='all'){
        const byOrder=new Map();
        for(const p of payments){const k=String(p.order_id);if(!byOrder.has(k))byOrder.set(k,new Set());byOrder.get(k).add(String(p.method||'').toLowerCase())}
        ord=ord.filter(o=>byOrder.get(String(o.id))?.has(pf)||(!byOrder.has(String(o.id))&&String(o.payment_method||'').toLowerCase()===pf));
      }

      const valid=ord.filter(o=>String(o.status||'').toLowerCase()!=='cancelled');
      const cancelled=ord.filter(o=>String(o.status||'').toLowerCase()==='cancelled');
      const ex=(expenses||[]).filter(x=>(bf==='all'||String(x.branch_id)===bf)&&(ef==='all'||String(x.employee_id)===ef)&&(sf==='all'||String(x.shift_id)===sf));
      const sales=valid.reduce((a,o)=>a+Number(o.total??o.total_amount??0),0);
      const discounts=valid.reduce((a,o)=>a+Number(o.discount??o.discount_amount??0),0);
      const deliveryFees=valid.reduce((a,o)=>a+Number(o.delivery_fee||0),0);
      const expTotal=ex.reduce((a,x)=>a+Number(x.amount||0),0);
      const avg=valid.length?sales/valid.length:0;

      const pmap={cash:0,wallet:0,instapay:0};
      const validIds=new Set(valid.map(o=>String(o.id)));
      const paidIds=new Set();
      for(const p of payments){
        if(!validIds.has(String(p.order_id)))continue;
        const m=String(p.method||'').toLowerCase();
        if(Object.prototype.hasOwnProperty.call(pmap,m))pmap[m]+=Number(p.amount||0);
        paidIds.add(String(p.order_id));
      }
      for(const o of valid){
        if(paidIds.has(String(o.id)))continue;
        const m=String(o.payment_method||'').toLowerCase();
        if(Object.prototype.hasOwnProperty.call(pmap,m))pmap[m]+=Number(o.total??o.total_amount??0);
      }

      let items=[];
      const itemIds=valid.map(o=>o.id).filter(Boolean);
      for(let i=0;i<itemIds.length;i+=100){
        const part=itemIds.slice(i,i+100).join(',');
        if(!part)continue;
        const rows=await safeFetch('order_items',`select=*&order_id=in.(${part})`);
        items.push(...rows);
      }
      const prod={};
      for(const it of items){
        const name=it.product_name||it.name||'صنف';
        if(!prod[name])prod[name]={name,qty:0,total:0};
        const qty=Number(it.quantity||1);
        prod[name].qty+=qty;
        prod[name].total+=Number(it.total??it.line_total??it.price*qty??0);
      }
      const products=Object.values(prod).sort((a,b)=>b.qty-a.qty);

      const branchAgg={},empAgg={};
      for(const o of valid){
        const bid=String(o.branch_id??''); const eid=String(o.employee_id??'');
        if(!branchAgg[bid])branchAgg[bid]={sales:0,count:0}; branchAgg[bid].sales+=Number(o.total??o.total_amount??0); branchAgg[bid].count++;
        if(!empAgg[eid])empAgg[eid]={sales:0,count:0}; empAgg[eid].sales+=Number(o.total??o.total_amount??0); empAgg[eid].count++;
      }

      const fromMs=new Date(r.from).getTime(),toMs=new Date(r.to).getTime();
      const shiftRows=(shifts||[]).filter(sh=>{
        const openMs=new Date(sh.opened_at||0).getTime(); const closeMs=sh.closed_at?new Date(sh.closed_at).getTime():Infinity;
        return openMs<=toMs&&closeMs>=fromMs&&(bf==='all'||String(sh.branch_id)===bf)&&(ef==='all'||String(sh.employee_id)===ef)&&(sf==='all'||String(sh.id)===sf);
      }).map(sh=>{
        const so=valid.filter(o=>String(o.shift_id)===String(sh.id));
        const sx=ex.filter(x=>String(x.shift_id)===String(sh.id));
        return {...sh,_sales:sh.closed_at?Number(sh.sales_total||0):so.reduce((a,o)=>a+Number(o.total??o.total_amount??0),0),_expenses:sh.closed_at?Number(sh.expenses_total||0):sx.reduce((a,x)=>a+Number(x.amount||0),0),_orders:sh.closed_at?Number(sh.orders_count||0):so.length};
      });

      body.innerHTML=`
        <div class="grid report-kpis">
          <div class="card kpi"><small>إجمالي المبيعات</small><strong>${money(sales)}</strong></div>
          <div class="card kpi"><small>صافي بعد المصروفات</small><strong>${money(sales-expTotal)}</strong></div>
          <div class="card kpi"><small>عدد الأوردرات</small><strong>${valid.length}</strong></div>
          <div class="card kpi"><small>متوسط الفاتورة</small><strong>${money(avg)}</strong></div>
          <div class="card kpi"><small>كاش</small><strong>${money(pmap.cash)}</strong></div>
          <div class="card kpi"><small>محفظة</small><strong>${money(pmap.wallet)}</strong></div>
          <div class="card kpi"><small>InstaPay</small><strong>${money(pmap.instapay)}</strong></div>
          <div class="card kpi"><small>المصروفات</small><strong>${money(expTotal)}</strong></div>
          <div class="card kpi"><small>رسوم الدليفري</small><strong>${money(deliveryFees)}</strong></div>
          <div class="card kpi"><small>الخصومات</small><strong>${money(discounts)}</strong></div>
          <div class="card kpi"><small>الإلغاءات</small><strong>${cancelled.length}</strong></div>
          <div class="card kpi"><small>الورديات</small><strong>${shiftRows.length}</strong></div>
        </div>
        <div class="panel"><h2>أفضل الأصناف</h2><div class="table-wrap"><table><thead><tr><th>الصنف</th><th>الكمية</th><th>المبيعات</th></tr></thead><tbody>${products.slice(0,30).map(x=>`<tr><td>${esc(x.name)}</td><td>${x.qty}</td><td>${money(x.total)}</td></tr>`).join('')||'<tr><td colspan="3">لا توجد بيانات</td></tr>'}</tbody></table></div></div>
        <div class="panel"><h2>الورديات خلال الفترة</h2><div class="table-wrap"><table><thead><tr><th>#</th><th>الفرع</th><th>الموظف</th><th>الفتح</th><th>القفل</th><th>الأوردرات</th><th>المبيعات</th><th>المصروفات</th><th>العجز/الزيادة</th></tr></thead><tbody>${shiftRows.map(x=>`<tr><td>${x.id}</td><td>${esc(branchName(x.branch_id))}</td><td>${esc(employeeName(x.employee_id,employees)||'موظف')}</td><td>${fmtDate(x.opened_at)}</td><td>${x.closed_at?fmtDate(x.closed_at):'مفتوحة الآن'}</td><td>${x._orders}</td><td>${money(x._sales)}</td><td>${money(x._expenses)}</td><td>${x.closed_at?money(x.cash_difference||0):'-'}</td></tr>`).join('')||'<tr><td colspan="9">لا توجد ورديات</td></tr>'}</tbody></table></div></div>`;

      lastExport=[['الفترة',from+' إلى '+to],['إجمالي المبيعات',sales],['صافي بعد المصروفات',sales-expTotal],['عدد الأوردرات',valid.length],['كاش',pmap.cash],['محفظة',pmap.wallet],['InstaPay',pmap.instapay],['المصروفات',expTotal],[],['الصنف','الكمية','المبيعات'],...products.map(x=>[x.name,x.qty,x.total])];
    }catch(e){
      console.error('report error',e);
      body.innerHTML=`<div class="panel"><h2>تعذر تحميل التقرير</h2><p>${esc(e?.message||String(e)||'خطأ غير معروف')}</p><button id="retryReport" class="primary">إعادة المحاولة</button></div>`;
      $('#retryReport')?.addEventListener('click',run);
    }
  };

  $('#runReport').onclick=run;
  $('#exportReport').onclick=()=>{if(!lastExport.length)return toast('اعرض التقرير الأول');downloadCSV(`report-${$('#repFrom').value}-${$('#repTo').value}.csv`,lastExport)};
}

async function renderUsers(){const rows=await rest('employees','select=id,name,username,role,branch_id,active&order=id');$('#page').innerHTML=`<div class="panel"><h2>المستخدمون</h2><p>إنشاء حسابات تسجيل الدخول الجديدة يتم حاليًا من Supabase Authentication ثم ربطها بجدول employees.</p><div class="table-wrap"><table><thead><tr><th>الاسم</th><th>المستخدم</th><th>الدور</th><th>الفرع</th><th>الحالة</th></tr></thead><tbody>${rows.map(u=>`<tr><td>${u.name}</td><td>${u.username||''}</td><td>${u.role}</td><td>${branchName(u.branch_id)}</td><td>${u.active?'فعال':'موقوف'}</td></tr>`).join('')}</tbody></table></div></div>`}

const BACKUP_GROUPS={
 orders:{label:'الطلبات وحركات البيع',tables:['order_item_modifiers','order_payments','order_items','orders']},
 shifts:{label:'الورديات',tables:['shifts']},expenses:{label:'المصروفات',tables:['expenses']},
 customers:{label:'العملاء والعناوين',tables:['customer_addresses','customers']},
 delivery:{label:'الدليفري والمندوبين والمناطق',tables:['driver_settlements','delivery_drivers','delivery_zones']},
 catalog:{label:'الأصناف والتصنيفات والإضافات',tables:['product_modifiers','branch_products','modifiers','products','categories']},
 permissions:{label:'صلاحيات المستخدمين والفروع',tables:['employee_permissions','employee_branches']},
 settings:{label:'إعدادات البرنامج',tables:['app_settings']}
};
function selectedBackupGroups(root){return [...root.querySelectorAll('[data-backup-group]:checked')].map(x=>x.dataset.backupGroup)}
async function exportBackup(groups){const data={format:'topburger-pos-backup',version:'8.9',created_at:new Date().toISOString(),groups:{}};for(const g of groups){data.groups[g]={};for(const t of BACKUP_GROUPS[g].tables){try{data.groups[g][t]=await rest(t,'select=*')}catch(e){data.groups[g][t]=[]}}}const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`top-burger-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
async function resetGroups(groups){return req('/rest/v1/rpc/reset_pos_data',{method:'POST',body:JSON.stringify({p_groups:groups})})}
async function restoreBackup(file,groups){const text=await file.text();let b;try{b=JSON.parse(text)}catch{throw new Error('ملف النسخة غير صالح')}if(b?.format!=='topburger-pos-backup')throw new Error('هذا ليس ملف Backup للبرنامج');const order=['categories','products','modifiers','branch_products','product_modifiers','customers','customer_addresses','shifts','orders','order_items','order_payments','order_item_modifiers','expenses','delivery_zones','delivery_drivers','driver_settlements','employee_branches','employee_permissions','app_settings'];const wanted=new Set(groups.flatMap(g=>BACKUP_GROUPS[g].tables));for(const t of order){if(!wanted.has(t))continue;let rows=null;for(const g of Object.values(b.groups||{})){if(g&&Array.isArray(g[t])){rows=g[t];break}}if(!rows?.length)continue;const r=await fetch(`${cfg.url}/rest/v1/${t}`,{method:'POST',headers:{...headers(),'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows)});if(!r.ok){let d={};try{d=await r.json()}catch{}throw new Error(`${t}: ${d.message||r.status}`)}}await reloadCatalog();}
async function renderSettings(){
 if(state.employee.role!=='admin'){ $('#page').innerHTML='<div class="empty">الإعدادات متاحة للمدير فقط</div>'; return; }
 const groups=Object.entries(BACKUP_GROUPS).map(([k,v])=>`<label class="backup-check"><input type="checkbox" data-backup-group="${k}"> ${v.label}</label>`).join('');
 $('#page').innerHTML=`<div class="panel"><h2>تشغيل وإيقاف المميزات</h2><p>الإعدادات دي بتتزامن على كل الأجهزة.</p><div class="settings-list">${[['enable_extras','الإضافات Extras'],['enable_removals','حذف مكونات'],['enable_item_notes','ملاحظات على الصنف'],['enable_kitchen','شاشة المطبخ'],['enable_prep_receipt','ريسيت التحضير'],['enable_receipt_print','فاتورة العميل'],['enable_inventory','المخزون'],['enable_delivery','الدليفري'],['enable_customer_search','بحث العملاء بالهاتف'],['enable_delivery_drivers','مناديب التوصيل'],['enable_mixed_payment','الدفع المختلط']].map(([k,l])=>`<label class="setting-switch"><span>${l}</span><input type="checkbox" data-setting="${k}" ${state.settings[k]?'checked':''}></label>`).join('')}</div><button id="saveSettings" class="primary">حفظ الإعدادات</button></div>
 <div class="panel backup-panel"><h2>💾 النسخ الاحتياطي والاستعادة</h2><p>حدد البيانات المطلوبة. النسخة لا تحتوي كلمات مرور حسابات الدخول.</p><div class="backup-grid">${groups}</div><div class="toolbar"><button id="backupAll" class="secondary">تحديد الكل</button><button id="backupNone" class="secondary">إلغاء التحديد</button></div><div class="backup-actions"><button id="createBackup" class="primary">⬇️ إنشاء نسخة احتياطية</button><label class="file-action">📂 ملف الاستعادة<input id="restoreFile" type="file" accept="application/json,.json"></label><button id="restoreBackup" class="secondary">♻️ استعادة المحدد</button><button id="resetSelected" class="danger">🗑️ إعادة ضبط المحدد</button></div><small>إعادة الضبط لا تحذف حساب المدير من Authentication. استخدمها بحذر وبعد إنشاء Backup.</small></div>`;
 $('#saveSettings').onclick=async()=>{const rows=[...document.querySelectorAll('[data-setting]')].map(x=>({key:x.dataset.setting,value:String(x.checked)}));for(const r of rows)await rest('app_settings',`key=eq.${encodeURIComponent(r.key)}`,{method:'PATCH',body:JSON.stringify({value:r.value})});Object.assign(state.settings,Object.fromEntries(rows.map(r=>[r.key,r.value==='true'])));toast('تم حفظ الإعدادات')};
 $('#backupAll').onclick=()=>$$('[data-backup-group]').forEach(x=>x.checked=true);$('#backupNone').onclick=()=>$$('[data-backup-group]').forEach(x=>x.checked=false);
 $('#createBackup').onclick=async()=>{const g=selectedBackupGroups($('#page'));if(!g.length)return toast('حدد بيانات للنسخ');try{await exportBackup(g);toast('تم إنشاء النسخة الاحتياطية')}catch(e){toast(e.message)}};
 $('#restoreBackup').onclick=async()=>{const f=$('#restoreFile').files[0],g=selectedBackupGroups($('#page'));if(!f)return toast('اختر ملف النسخة');if(!g.length)return toast('حدد ما تريد استعادته');if(!await uiConfirm('استعادة البيانات المحددة من النسخة؟ سيتم دمجها مع البيانات الحالية.'))return;try{await restoreBackup(f,g);toast('تمت الاستعادة بنجاح')}catch(e){toast(e.message)}};
 $('#resetSelected').onclick=async()=>{const g=selectedBackupGroups($('#page'));if(!g.length)return toast('حدد ما تريد إعادة ضبطه');const code=await uiPrompt('اكتب RESET بالحروف الكبيرة لتأكيد مسح البيانات المحددة فقط','',{title:'تأكيد إعادة الضبط',icon:'⚠️',danger:true,placeholder:'RESET',okText:'إعادة الضبط'});if(code!=='RESET')return toast('تم إلغاء إعادة الضبط');try{await resetGroups(g);toast('تمت إعادة ضبط البيانات المحددة');setTimeout(()=>location.reload(),900)}catch(e){toast(e.message)}};
}

async function init(){if(!cfg.url||!cfg.key)return show('setupView');if(!session?.access_token)return show('loginView');try{await bootstrap()}catch(e){localStorage.removeItem('sbSession');session=null;show('loginView');toast(e.message)}}
if('serviceWorker' in navigator){
  navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())).catch(()=>{});
  caches?.keys?.().then(keys=>keys.forEach(k=>caches.delete(k))).catch(()=>{});
}
init();


/* V7 — branch permissions, delivery operations and website-ready UI */
function openDriverPicker(orderId, drivers, onDone){
 const available=(drivers||[]).filter(d=>d.active!==false&&String(d.branch_id)===String(currentBranchId()));
 if(!available.length)return toast('لا يوجد مندوب فعال في هذا الفرع');
 const m=document.createElement('div');m.className='modal';
 m.innerHTML=`<div class="modal-card driver-picker"><h2>🛵 تسليم الطلب لمندوب</h2><p>اختر المندوب</p><div class="driver-picker-list">${available.map(d=>`<button class="driver-pick-btn" data-driver-pick="${d.id}"><b>🛵 ${esc(d.name)}</b><small>${esc(d.phone||'بدون رقم')}</small></button>`).join('')}</div><div class="modal-actions"><button class="secondary" data-close>إلغاء</button></div></div>`;
 document.body.appendChild(m);
 m.onclick=async e=>{if(e.target===m||e.target.closest('[data-close]'))return m.remove();const b=e.target.closest('[data-driver-pick]');if(!b)return;const d=available.find(x=>String(x.id)===String(b.dataset.driverPick));if(!d)return;try{await rest('orders',`id=eq.${orderId}`,{method:'PATCH',body:JSON.stringify({driver_id:d.id,status:'out_for_delivery',assigned_at:new Date().toISOString()})});await audit('assign_driver','order',orderId,{driver_id:d.id});m.remove();toast(`تم التسليم إلى ${d.name}`);if(onDone)onDone(d)}catch(err){toast(err.message)}};
}

async function renderDeliveryOrders(){
  $('#page').innerHTML='<div class="panel"><h2>🛵 طلبات الدليفري</h2><div class="empty">جاري التحميل...</div></div>';
  const [orders,drivers,webOrders]=await Promise.all([
    rest('orders',`select=*&branch_id=eq.${currentBranchId()}&order_type=eq.delivery&order=created_at.desc&limit=200`),
    rest('delivery_drivers','select=*&active=eq.true&order=name'),
    rest('website_orders',`select=*&branch_id=eq.${currentBranchId()}&status=eq.pending&order=created_at.asc&limit=100`).catch(()=>[])
  ]);
  state.drivers=drivers||[];
  const all=(orders||[]).filter(o=>o.status!=='cancelled');
  const active=all.filter(o=>['new','ready','out_for_delivery'].includes(o.status));
  const counts={new:all.filter(o=>o.status==='new'||o.status==='ready').length,out:all.filter(o=>o.status==='out_for_delivery').length,delivered:all.filter(o=>o.status==='delivered').length};
  const websitePanel=(webOrders||[]).length?`<div class="panel website-orders-panel"><div class="delivery-toolbar"><h2>🌐 طلبات الموقع الجديدة <span class="status-pill">${webOrders.length}</span></h2></div><div class="delivery-rows">${webOrders.map(w=>`<div class="delivery-row website-pending"><span class="delivery-row-id"><b>WEB-${String(w.id).padStart(5,'0')}</b><small>${fmtDate(w.created_at)}</small></span><span class="delivery-row-customer"><b>${esc(w.customer_name)}</b><small>${esc(w.customer_phone)} • ${esc(w.delivery_address)}</small></span><strong>${money(w.total)}</strong><span><button class="primary" data-web-accept="${w.id}">✅ استلام</button> <button class="danger" data-web-reject="${w.id}">رفض</button></span></div>`).join('')}</div></div>`:'';
  $('#page').innerHTML=`${websitePanel}<div class="delivery-mini-kpis"><div><b>${counts.new}</b><span>جديد</span></div><div><b>${counts.out}</b><span>مع المندوب</span></div><div><b>${active.length}</b><span>نشط</span></div></div>
  <div class="panel delivery-queue-panel"><div class="delivery-toolbar"><div class="delivery-filter" id="deliveryFilter"><button class="active" data-filter="active">النشط</button><button data-filter="new">جديد</button><button data-filter="out_for_delivery">مع المندوب</button><button data-filter="delivered">تم التسليم</button><button data-filter="all">الكل</button></div><input id="deliverySearch" placeholder="🔎 رقم الأوردر أو العميل أو الموبايل"></div><div class="delivery-rows" id="deliveryRows"></div></div>`;
  let filter='active';
  const draw=()=>{
    const q=($('#deliverySearch')?.value||'').trim().toLowerCase();
    const rows=all.filter(o=>{
      const ok=filter==='all'||(filter==='active'?['new','ready','out_for_delivery'].includes(o.status):filter==='new'?['new','ready'].includes(o.status):o.status===filter);
      const hay=[o.order_number,o.customer_name,o.customer_phone,o.delivery_area,o.delivery_address,branchName(o.branch_id)].join(' ').toLowerCase();
      return ok&&(!q||hay.includes(q));
    });
    $('#deliveryRows').innerHTML=rows.map(o=>deliveryOrderCard(o)).join('')||'<div class="empty">لا توجد طلبات مطابقة</div>';
  };
  $('#deliverySearch').oninput=draw;
  $('#deliveryFilter').onclick=e=>{const b=e.target.closest('[data-filter]');if(!b)return;filter=b.dataset.filter;$$('#deliveryFilter button').forEach(x=>x.classList.toggle('active',x===b));draw()};
  $('#page').onclick=async e=>{
    const acc=e.target.closest('[data-web-accept]');if(acc){if(!await uiConfirm('استلام طلب الموقع وإضافته لطلبات الدليفري؟',{title:'استلام طلب الموقع',okText:'استلام'}))return;try{const orderId=Number(await rpc('accept_website_order',{p_website_order_id:Number(acc.dataset.webAccept)}));const [orders,items]=await Promise.all([rest('orders',`select=*&id=eq.${orderId}`),rest('order_items',`select=*&order_id=eq.${orderId}&order=id`)]);const o=orders?.[0];if(!o)throw new Error('تم استلام الطلب لكن تعذر تحميله للطباعة');if(!o.order_number){const orderNo=`${o.branch_id}-${String(o.id).padStart(5,'0')}`;try{await rest('orders',`id=eq.${o.id}`,{method:'PATCH',body:JSON.stringify({order_number:orderNo})});o.order_number=orderNo}catch(e){}}toast(`تم استلام ${o.order_number||'#'+o.id}`);await renderDeliveryOrders();showReceipt(o,items||[]);return}catch(err){return toast(err.message)}}
    const rej=e.target.closest('[data-web-reject]');if(rej){if(!await uiConfirm('رفض طلب الموقع؟',{title:'رفض الطلب',danger:true,okText:'رفض'}))return;try{await rpc('reject_website_order',{p_website_order_id:Number(rej.dataset.webReject)});toast('تم رفض الطلب');return renderDeliveryOrders()}catch(err){return toast(err.message)}}
    const detail=e.target.closest('[data-order-detail]');if(detail)return openDeliveryOrderDetails(detail.dataset.orderDetail);
  };
  draw();
}
function deliveryOrderCard(o){const drv=driverName(o.driver_id);const web=o.source==='website'?'🌐 موقع • ':'';const area=o.delivery_area||zoneName(o.delivery_zone_id)||'';return `<button class="delivery-row status-${esc(o.status)}" data-order-detail="${o.id}"><span class="delivery-row-id"><b>${esc(o.order_number||'#'+o.id)}</b><small>${web}${branchName(o.branch_id)} • ${fmtDate(o.created_at)}</small></span><span class="delivery-row-customer"><b>${esc(o.customer_name||o.customer_phone||'بدون اسم')}</b><small>${esc(area)}${drv?` • 🛵 ${esc(drv)}`:''}</small></span><strong>${money(o.total)}</strong><span class="status-pill">${statusLabel(o.status)}</span><span class="delivery-chevron">‹</span></button>`}
async function openDeliveryOrderDetails(id){
 const [orders,items]=await Promise.all([rest('orders',`select=*&id=eq.${id}`),rest('order_items',`select=*&order_id=eq.${id}&order=id`)]);const o=orders[0];if(!o)return toast('الأوردر غير موجود');o._driver_name=driverName(o.driver_id);
 const m=document.createElement('div');m.className='modal';
 const action=o.status==='out_for_delivery'?'<button class="primary" data-delivered>✅ تم التسليم</button>':(['new','ready'].includes(o.status)?'<button class="primary" data-assign>🛵 تسليم لمندوب</button>':'');
 m.innerHTML=`<div class="modal-card delivery-detail-modal"><div class="detail-head"><div><small>${branchName(o.branch_id)}</small><h2>${esc(o.order_number||'#'+o.id)}</h2></div><span class="status-pill">${statusLabel(o.status)}</span></div>${customerInfoHTML(o)}<div class="detail-items">${items.map(i=>`<div><span>${i.quantity} × ${esc(i.product_name)}</span><b>${money(i.total)}</b></div>`).join('')}</div><div class="detail-total"><span>المطلوب</span><strong>${money(o.total)}</strong></div><div class="modal-actions"><button class="secondary" data-close>إغلاق</button><button class="secondary" data-print>طباعة</button>${action}</div></div>`;
 document.body.appendChild(m);
 m.onclick=async e=>{
   if(e.target.closest('[data-close]')||e.target===m){m.remove();return}
   if(e.target.closest('[data-print]')){printReceipt(o,items);return}
   if(e.target.closest('[data-assign]')){const list=state.drivers.filter(d=>String(d.branch_id)===String(o.branch_id));m.remove();openDriverPicker(o.id,list,()=>renderDeliveryOrders());return}
   if(e.target.closest('[data-delivered]')){await rest('orders',`id=eq.${o.id}`,{method:'PATCH',body:JSON.stringify({status:'delivered',delivered_at:new Date().toISOString()})});await audit('mark_delivered','order',o.id,{});m.remove();toast('تم تسجيل التسليم');return renderDeliveryOrders()}
 };
}

async function renderDeliverySettings(){
 if(!canAccessPage('deliverySettings')){ $('#page').innerHTML='<div class="empty">ليس لديك صلاحية لإعدادات الدليفري</div>';return; }
 const [drivers,zones,settlements]=await Promise.all([rest('delivery_drivers',`select=*&branch_id=eq.${currentBranchId()}&order=active.desc,name`),rest('delivery_zones',`select=*&branch_id=eq.${currentBranchId()}&order=active.desc,name`),rest('driver_settlements',`select=*&branch_id=eq.${currentBranchId()}&order=created_at.desc&limit=50`).catch(()=>[])]);
 state.drivers=drivers||[];state.deliveryZones=zones||[];
 $('#page').innerHTML=`<div class="grid delivery-admin-grid"><div class="panel"><h2>🛵 المناديب</h2><div class="form-grid"><label>الاسم<input id="driverName"></label><label>الموبايل<input id="driverPhone" inputmode="tel"></label><label>الفرع<select id="driverBranch" disabled><option value="${currentBranchId()}">${branchName(currentBranchId())}</option></select></label></div><button id="addDriver" class="primary">إضافة مندوب</button><div class="manage-list">${drivers.filter(d=>d.active!==false).map(d=>`<div class="manage-row"><span>${esc(d.name)}${d.phone?` • ${esc(d.phone)}`:''}</span><span><button class="secondary" data-edit-driver="${d.id}">✏️</button><button class="danger" data-delete-driver="${d.id}">🗑️ حذف</button></span></div>`).join('')||'لا يوجد مناديب'}</div></div><div class="panel"><h2>📍 مناطق الدليفري</h2><div class="form-grid"><label>المنطقة<input id="zoneName"></label><label>الفرع المسؤول<select id="zoneBranch" disabled><option value="${currentBranchId()}">${branchName(currentBranchId())}</option></select></label></div><button id="addZone" class="primary">إضافة منطقة</button><div class="manage-list">${zones.map(z=>`<div class="manage-row ${z.active===false?'muted':''}"><span>${esc(z.name)}</span><span><button class="secondary" data-edit-zone="${z.id}">✏️</button><button class="secondary" data-toggle-zone="${z.id}">${z.active===false?'تفعيل':'إيقاف'}</button></span></div>`).join('')||'لا توجد مناطق'}</div></div></div><div class="panel"><h2>تسويات المناديب</h2><p>التسوية تحسب طلبات الكاش التي تم تسليمها ولم تتم تسويتها بعد.</p><div class="driver-settle-list">${drivers.map(d=>`<button class="secondary" data-settle="${d.id}">تسوية ${esc(d.name)}</button>`).join('')}</div>${settlements.length?`<div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>المندوب</th><th>الفرع</th><th>الطلبات</th><th>المبلغ</th></tr></thead><tbody>${settlements.map(x=>`<tr><td>${fmtDate(x.created_at)}</td><td>${driverName(x.driver_id)}</td><td>${branchName(x.branch_id)}</td><td>${x.orders_count}</td><td>${money(x.amount)}</td></tr>`).join('')}</tbody></table></div>`:''}</div>`;
 $('#addDriver').onclick=async()=>{if(!$('#driverName').value.trim())return toast('اكتب اسم المندوب');await rest('delivery_drivers','',{method:'POST',body:JSON.stringify([{name:$('#driverName').value.trim(),phone:$('#driverPhone').value.trim()||null,branch_id:currentBranchId(),active:true}])});toast('تمت إضافة المندوب');renderDeliverySettings()};
 $('#addZone').onclick=async()=>{if(!$('#zoneName').value.trim())return toast('اكتب اسم المنطقة');await rest('delivery_zones','',{method:'POST',body:JSON.stringify([{name:$('#zoneName').value.trim(),delivery_fee:0,branch_id:currentBranchId(),active:true}])});toast('تمت إضافة المنطقة');renderDeliverySettings()};
 $('#page').onclick=async e=>{const ed=e.target.closest('[data-edit-driver]');if(ed){const d=drivers.find(x=>String(x.id)===ed.dataset.editDriver);const name=await uiPrompt('اسم المندوب',d.name);if(name===null)return;const phone=await uiPrompt('الموبايل',d.phone||'');if(phone===null)return;await rest('delivery_drivers',`id=eq.${d.id}`,{method:'PATCH',body:JSON.stringify({name:name.trim(),phone:phone.trim()||null})});toast('تم تعديل المندوب');return renderDeliverySettings()}const td=e.target.closest('[data-delete-driver]');if(td){const d=drivers.find(x=>String(x.id)===td.dataset.deleteDriver);if(!d)return;if(!await uiConfirm(`حذف المندوب ${d.name}؟\nسيختفي من المناديب الحالية مع الاحتفاظ باسمه في الطلبات والتسويات القديمة.`))return;await rest('delivery_drivers',`id=eq.${d.id}`,{method:'PATCH',body:JSON.stringify({active:false})});toast('تم حذف المندوب');return renderDeliverySettings()}const ez=e.target.closest('[data-edit-zone]');if(ez){const z=zones.find(x=>String(x.id)===ez.dataset.editZone);const name=await uiPrompt('اسم المنطقة',z.name);if(name===null)return;await rest('delivery_zones',`id=eq.${z.id}`,{method:'PATCH',body:JSON.stringify({name:name.trim()})});toast('تم تعديل المنطقة');return renderDeliverySettings()}const tz=e.target.closest('[data-toggle-zone]');if(tz){const z=zones.find(x=>String(x.id)===tz.dataset.toggleZone);if(!await uiConfirm(`${z.active===false?'تفعيل':'إيقاف'} المنطقة ${z.name}؟`))return;await rest('delivery_zones',`id=eq.${z.id}`,{method:'PATCH',body:JSON.stringify({active:z.active===false})});toast('تم تحديث المنطقة');return renderDeliverySettings()}const b=e.target.closest('[data-settle]');if(!b)return;const did=Number(b.dataset.settle);const d=drivers.find(x=>x.id===did);const os=await rest('orders',`select=id,total&driver_id=eq.${did}&status=eq.delivered&payment_method=eq.cash&driver_settled_at=is.null`);const amount=os.reduce((a,o)=>a+Number(o.total||0),0);if(!os.length)return toast('لا توجد تحصيلات كاش غير مسواة لهذا المندوب');if(!await uiConfirm(`تسوية ${d.name}: ${os.length} طلب بإجمالي ${money(amount)}؟`))return;const now=new Date().toISOString();await rest('orders',`id=in.(${os.map(o=>o.id).join(',')})`,{method:'PATCH',body:JSON.stringify({driver_settled_at:now})});await rest('driver_settlements','',{method:'POST',body:JSON.stringify([{driver_id:did,branch_id:d.branch_id,employee_id:state.employee.id,orders_count:os.length,amount,created_at:now}])});await audit('driver_settlement','delivery_driver',did,{orders_count:os.length,amount});toast('تمت تسوية المندوب');renderDeliverySettings()};
}

async function renderUsers(){
 if(!isAdmin()){ $('#page').innerHTML='<div class="empty">المستخدمون متاحون للمدير فقط</div>';return; }
 let rows=[];
 try{
   const [employees,links,permissions]=await Promise.all([
     rest('employees','select=id,name,username,role,branch_id,active,auth_user_id&order=id'),
     rest('employee_branches','select=employee_id,branch_id'),
     rest('employee_permissions','select=employee_id,permission_key,allowed')
   ]);
   rows=(employees||[]).map(u=>{const upr=(permissions||[]).filter(x=>String(x.employee_id)===String(u.id));return {...u,email:u.username||'',branch_ids:(links||[]).filter(x=>String(x.employee_id)===String(u.id)).map(x=>Number(x.branch_id)),permissions_configured:upr.length>0,permissions:upr.filter(x=>x.allowed!==false).map(x=>x.permission_key)}});
 }catch(e){ $('#page').innerHTML=`<div class="panel"><h2>المستخدمون والصلاحيات</h2><div class="empty"><b>تعذر تحميل المستخدمين.</b><p>${esc(e.message)}</p></div></div>`;return; }
 const roleLabel=r=>({admin:'مدير',cashier:'كاشير',callcenter:'كول سنتر'}[r]||r);
 const branchChecks=(selected=[],admin=false)=>admin?'<span class="tag">كل الفروع</span>':state.branches.map(b=>`<label><input type="checkbox" class="user-branch" value="${b.id}" ${selected.map(String).includes(String(b.id))?'checked':''}> ${esc(b.name)}</label>`).join('');
 const defaultPermissions=role=>[...(ROLE_PAGES[role]||ROLE_PAGES.cashier)].filter(x=>x!=='home'&&x!=='delivery'&&x!=='users');
 const permissionChecks=(selected=[],admin=false)=>admin?'<div class="empty">المدير لديه كل الصلاحيات تلقائيًا.</div>':PERMISSION_DEFS.map(([k,l])=>`<label><input type="checkbox" class="user-permission" value="${k}" ${selected.includes(k)?'checked':''}> ${l}</label>`).join('');
 $('#page').innerHTML=`<div class="panel users-admin-head"><div class="section-head"><div><h2>👥 المستخدمون والصلاحيات</h2><p>حدد لكل مستخدم الفروع والشاشات المسموح له بها.</p></div><button id="newUserBtn" class="primary">+ مستخدم جديد</button></div></div><div class="user-cards user-management-list">${rows.map(u=>`<div class="user-card ${u.active===false?'muted':''}"><div class="user-main"><b>${esc(u.name)}</b><small>${esc(u.email||u.username||'بدون بريد')} • ${roleLabel(u.role)} • ${u.active===false?'موقوف':'فعال'}</small></div><div class="user-branch-tags">${u.role==='admin'?'<span class="tag">كل الفروع</span>':(u.branch_ids||[]).map(id=>`<span class="tag">${esc(branchName(id))}</span>`).join('')||'<span class="tag">بدون فرع</span>'}</div><div class="user-branch-tags">${u.role==='admin'?'<span class="tag">كل الصلاحيات</span>':((u.permissions_configured?u.permissions:defaultPermissions(u.role)).map(k=>`<span class="tag">${esc(PERMISSION_DEFS.find(x=>x[0]===k)?.[1]||k)}</span>`).join(''))}</div><div class="row-actions"><button class="secondary" data-edit-user="${u.id}">✏️ تعديل</button><button class="secondary" data-toggle-user="${u.id}">${u.active===false?'✅ تفعيل':'⛔ إيقاف'}</button><button class="secondary" data-password-user="${u.id}">🔑 كلمة المرور</button></div></div>`).join('')||'<div class="empty">لا يوجد مستخدمون</div>'}</div>`;
 const savePermissions=async(employeeId,keys)=>{await rest('employee_permissions',`employee_id=eq.${employeeId}`,{method:'DELETE'});const rows=PERMISSION_DEFS.map(([k])=>({employee_id:employeeId,permission_key:k,allowed:keys.includes(k)}));if(rows.length)await rest('employee_permissions','',{method:'POST',body:JSON.stringify(rows)})};
 const openForm=(u=null)=>{const editing=!!u,role=u?.role||'cashier',ids=u?.branch_ids||[currentBranchId()],initialPerms=u?.permissions_configured?u.permissions:defaultPermissions(role);const m=document.createElement('div');m.className='modal';m.innerHTML=`<form class="modal-card user-edit-modal" id="userForm"><h2>${editing?'تعديل المستخدم':'إضافة مستخدم جديد'}</h2><div class="form-grid"><label>الاسم<input id="uName" value="${esc(u?.name||'')}" required></label><label>البريد الإلكتروني<input id="uEmail" type="email" value="${esc(u?.email||'')}" ${editing?'readonly':''} required></label>${editing?'':`<label>كلمة المرور<input id="uPassword" type="password" minlength="6" required></label>`}<label>الدور<select id="uRole"><option value="cashier" ${role==='cashier'?'selected':''}>كاشير</option><option value="callcenter" ${role==='callcenter'?'selected':''}>كول سنتر</option><option value="admin" ${role==='admin'?'selected':''}>مدير</option></select></label><label>الفرع الأساسي<select id="uHomeBranch">${state.branches.map(b=>`<option value="${b.id}" ${String(b.id)===String(u?.branch_id||currentBranchId())?'selected':''}>${esc(b.name)}</option>`).join('')}</select></label><label class="check-line"><input id="uActive" type="checkbox" ${u?.active===false?'':'checked'}> المستخدم فعال</label></div><div class="user-branches-box"><b>الفروع المسموح بها</b><div id="uBranchChecks" class="branch-checks">${branchChecks(ids,role==='admin')}</div><small id="uBranchHint">${role==='admin'?'المدير لديه صلاحية كل الفروع تلقائيًا.':'حدد فرعًا واحدًا أو أكثر.'}</small></div><div class="user-branches-box"><b>الصلاحيات</b><div id="uPermissionChecks" class="branch-checks">${permissionChecks(initialPerms,role==='admin')}</div><small>الدور يضع قالبًا افتراضيًا، وبعدها تقدر تزود أو تشيل أي صلاحية.</small></div><div class="modal-actions"><button type="button" class="secondary" data-close>إلغاء</button><button type="submit" class="primary">حفظ</button></div></form>`;document.body.appendChild(m);
   const redraw=()=>{const r=m.querySelector('#uRole').value;const currentBranches=[...m.querySelectorAll('.user-branch:checked')].map(x=>x.value);m.querySelector('#uBranchChecks').innerHTML=branchChecks(currentBranches.length?currentBranches:ids,r==='admin');m.querySelector('#uBranchHint').textContent=r==='admin'?'المدير لديه صلاحية كل الفروع تلقائيًا.':'حدد فرعًا واحدًا أو أكثر.';m.querySelector('#uPermissionChecks').innerHTML=permissionChecks(defaultPermissions(r),r==='admin')};
   m.querySelector('#uRole').onchange=redraw;m.onclick=e=>{if(e.target.closest('[data-close]')||e.target===m)m.remove()};
   m.querySelector('#userForm').onsubmit=async e=>{e.preventDefault();const role=m.querySelector('#uRole').value;let branch_ids=role==='admin'?state.branches.map(b=>Number(b.id)):[...m.querySelectorAll('.user-branch:checked')].map(x=>Number(x.value));if(role!=='admin'&&!branch_ids.length)return toast('حدد فرعًا واحدًا على الأقل');const branch_id=Number(m.querySelector('#uHomeBranch').value);branch_ids=[branch_id,...branch_ids.filter(x=>Number(x)!==branch_id)];const permissions=role==='admin'?ALL_PAGES:[...m.querySelectorAll('.user-permission:checked')].map(x=>x.value);const active=m.querySelector('#uActive').checked;try{let employeeId=u?.id;if(editing){await rest('employees',`id=eq.${u.id}`,{method:'PATCH',body:JSON.stringify({name:m.querySelector('#uName').value.trim(),role,branch_id,active})});await rest('employee_branches',`employee_id=eq.${u.id}`,{method:'DELETE'});if(branch_ids.length)await rest('employee_branches','',{method:'POST',body:JSON.stringify(branch_ids.map(bid=>({employee_id:u.id,branch_id:bid})))});}else{const result=await callFunction('smart-function',{action:'create',name:m.querySelector('#uName').value.trim(),username:m.querySelector('#uEmail').value.trim(),email:m.querySelector('#uEmail').value.trim(),password:m.querySelector('#uPassword').value,role,branch_ids});employeeId=result?.employee_id;if(active===false&&employeeId)await rest('employees',`id=eq.${employeeId}`,{method:'PATCH',body:JSON.stringify({active:false})});}if(employeeId)await savePermissions(employeeId,permissions);m.remove();toast(editing?'تم تعديل المستخدم والصلاحيات':'تم إنشاء المستخدم والصلاحيات');renderUsers()}catch(err){toast(err.message)}};
 };
 $('#newUserBtn').onclick=()=>openForm();$('#page').onclick=async e=>{const eb=e.target.closest('[data-edit-user]');if(eb){const u=rows.find(x=>String(x.id)===eb.dataset.editUser);if(u)openForm(u);return}const tb=e.target.closest('[data-toggle-user]');if(tb){const u=rows.find(x=>String(x.id)===tb.dataset.toggleUser);if(!u)return;if(String(u.auth_user_id)===String(session.user.id)&&u.active!==false)return toast('لا يمكنك إيقاف حسابك الحالي');if(!await uiConfirm(`${u.active===false?'تفعيل':'إيقاف'} ${u.name}؟`))return;try{await rest('employees',`id=eq.${u.id}`,{method:'PATCH',body:JSON.stringify({active:u.active===false})});toast('تم تحديث حالة المستخدم');renderUsers()}catch(err){toast(err.message)}return}const pb=e.target.closest('[data-password-user]');if(pb){const u=rows.find(x=>String(x.id)===pb.dataset.passwordUser);if(!u)return;const password=await uiPrompt(`كلمة المرور الجديدة لـ ${u.name}`);if(password===null)return;if(password.length<6)return toast('كلمة المرور 6 أحرف على الأقل');try{await callFunction('smart-function',{action:'password',employee_id:u.id,password});toast('تم تغيير كلمة المرور')}catch(err){toast(err.message)}return}};
}

