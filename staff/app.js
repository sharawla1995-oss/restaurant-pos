(function(global){
'use strict';
const APP_VERSION='10.5.14-hr2';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const store=global.SharawlaStaffStore,domain=global.SharawlaStaffDomain;
const queue=new domain.DurableAttendanceQueue(store.queueStore);
let currentSession=store.session(),snapshot=null,currentPage='home',cameraStream=null,pendingType=null,replaying=false;

const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const fmt=value=>value?new Date(value).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'}):'—';
const date=value=>value?new Date(value).toLocaleDateString('ar-EG',{dateStyle:'medium'}):'—';
const tx=prefix=>`${prefix}-${Date.now()}-${store.randomId()}`;
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),4200)}
function show(id){for(const view of $$('.view'))view.classList.add('hidden');$(id).classList.remove('hidden')}
function connection(){return store.config()||global.SHARAWLA_STAFF_CONFIG||null}
function endpoint(){const cfg=connection();if(!cfg?.url||!cfg?.key)throw new Error('إعداد الاتصال غير مكتمل');return `${String(cfg.url).replace(/\/$/,'')}/functions/v1/hr-staff-api`}
async function api(body,{form=false,requireSession=true}={}){
 const cfg=connection(),headers={apikey:cfg.key,Authorization:`Bearer ${cfg.key}`};
 if(requireSession&&currentSession?.session_token)headers['x-staff-session']=currentSession.session_token;
 if(!form)headers['content-type']='application/json';
 const response=await fetch(endpoint(),{method:'POST',headers,body:form?body:JSON.stringify(body),cache:'no-store'});
 const data=await response.json().catch(()=>({ok:false,code:'INVALID_SERVER_RESPONSE'}));
 if(!response.ok||data.ok===false){const error=new Error(data.code||'تعذر تنفيذ الطلب');error.code=data.code;if(data.code==='STAFF_SESSION_INVALID'){store.saveSession(null);currentSession=null}throw error}
 return data;
}
function cacheSnapshot(value){snapshot=value;localStorage.setItem('sharawlaStaffSnapshotV1',JSON.stringify(value))}
function loadSnapshot(){try{return JSON.parse(localStorage.getItem('sharawlaStaffSnapshotV1')||'null')}catch{return null}}
async function refreshSnapshot(){
 if(!currentSession)return;
 if(!navigator.onLine){snapshot=loadSnapshot();render();return}
 const now=new Date(),from=new Date(now);from.setDate(from.getDate()-62);const to=new Date(now);to.setDate(to.getDate()+62);
 try{const result=await api({action:'snapshot',from:from.toISOString().slice(0,10),to:to.toISOString().slice(0,10)});cacheSnapshot(result.data);render()}
 catch(error){snapshot=loadSnapshot();if(!snapshot&&error.code==='STAFF_SESSION_INVALID')bootstrap();else render()}
}
function updateNetwork(){const offline=!navigator.onLine;$('#networkText').textContent=offline?'غير متصل':'متصل';$('.status').classList.toggle('offline',offline);$('#offlineBanner').classList.toggle('hidden',!offline)}
async function updatePending(){const rows=await queue.pending(),badge=$('#pendingBadge');badge.textContent=String(rows.length);badge.classList.toggle('hidden',rows.length===0);return rows}
async function reportSyncState(lastError=null){if(!navigator.onLine||!currentSession)return;try{const rows=await queue.pending();await api({action:'sync-state',pending_count:rows.length,last_error:lastError})}catch{}}
function summaryPill(row){if(row.approved_leave)return '<span class="pill">إجازة معتمدة</span>';if(row.absent)return '<span class="pill bad">غياب</span>';if(row.incomplete)return '<span class="pill warn">حركة غير مكتملة</span>';return '<span class="pill">حاضر</span>'}
function renderHome(){
 const employee=snapshot?.employee||currentSession?.employee||{},today=snapshot?.today||{},now=new Date();
 $('#employeeName').textContent=employee.name||'تطبيق الموظفين';
 $('#page').innerHTML=`<section class="hero-card"><div class="muted">مرحبًا، ${esc(employee.name||'')}</div><h1>وردية اليوم</h1><div id="liveClock" class="clock">${now.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}</div><div>${today.work_date?summaryPill(today):'<span class="pill warn">لا يوجد ملخص بعد</span>'}</div><div class="attendance-actions"><button class="check-in" data-attendance="check_in">📷 حضور</button><button class="check-out" data-attendance="check_out">📷 انصراف</button></div></section>
 <div class="kpi-grid"><div class="kpi"><span>وقت الحضور</span><b>${today.actual_check_in_at?new Date(today.actual_check_in_at).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}):'—'}</b></div><div class="kpi"><span>وقت الانصراف</span><b>${today.actual_check_out_at?new Date(today.actual_check_out_at).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}):'—'}</b></div><div class="kpi"><span>التأخير</span><b>${Number(today.late_minutes||0)} د</b></div><div class="kpi"><span>الإضافي</span><b>${Number(today.overtime_minutes||0)} د</b></div></div>
 <section class="card"><h3>حالة اليوم</h3><div class="row"><span>ساعات العمل</span><b>${(Number(today.worked_minutes||0)/60).toFixed(2)}</b></div><div class="row"><span>خروج مبكر</span><b>${Number(today.early_leave_minutes||0)} دقيقة</b></div><div class="row"><span>مراجعة مطلوبة</span><b>${Number(snapshot?.pending_review||0)}</b></div><div class="staff-request-actions"><button id="leaveRequestBtn" class="primary" type="button">طلب إجازة أو إذن</button><button id="advanceRequestBtn" type="button">طلب سلفة</button></div></section>`;
 $$('#page [data-attendance]').forEach(button=>button.onclick=()=>openCamera(button.dataset.attendance));
 $('#leaveRequestBtn').onclick=openLeaveRequest;
 $('#advanceRequestBtn').onclick=openAdvanceRequest;
}
function renderHistory(){
 const rows=snapshot?.history||[];
 $('#page').innerHTML=`<h1>سجل الحضور</h1><section class="card">${rows.map(row=>`<div class="row"><div><b>${date(row.work_date)}</b><small class="muted">${fmt(row.actual_check_in_at)} ← ${fmt(row.actual_check_out_at)}</small></div><div>${summaryPill(row)}<small class="muted">${Number(row.worked_minutes||0)} دقيقة</small></div></div>`).join('')||'<p class="muted">لا توجد بيانات محفوظة.</p>'}</section>`;
}
function renderSchedule(){
 const rows=snapshot?.schedule||[];
 $('#page').innerHTML=`<h1>جدول عملي</h1>${rows.map(row=>`<section class="card"><h3>${esc(row.name)}</h3><div class="row"><span>الموعد</span><b>${esc(String(row.scheduled_start||'').slice(0,5))} — ${esc(String(row.scheduled_end||'').slice(0,5))}${row.overnight?' (ليلي)':''}</b></div><div class="row"><span>السماح</span><b>${Number(row.grace_minutes||0)} دقيقة</b></div><div class="row"><span>الأيام</span><b>${(row.work_days||[]).join('، ')}</b></div><div class="muted">ساري من ${date(row.assignment_from||row.effective_from)} إلى ${row.assignment_to||row.effective_to?date(row.assignment_to||row.effective_to):'مستمر'}</div></section>`).join('')||'<section class="card muted">لا يوجد جدول مسند حاليًا.</section>'}`;
}
function renderSummary(){
 const rows=snapshot?.history||[],total=key=>rows.reduce((n,row)=>n+Number(row[key]||0),0),absent=rows.filter(r=>r.absent).length,leave=rows.filter(r=>r.approved_leave).length;
 const advances=snapshot?.advance_requests||[],adjustments=snapshot?.adjustments||[],payroll=snapshot?.payroll||[],notes=snapshot?.notifications||[];
 $('#page').innerHTML=`<h1>ملفي وطلباتي</h1><div class="kpi-grid"><div class="kpi"><span>ساعات العمل</span><b>${(total('worked_minutes')/60).toFixed(1)}</b></div><div class="kpi"><span>التأخير</span><b>${total('late_minutes')} د</b></div><div class="kpi"><span>الإضافي</span><b>${total('overtime_minutes')} د</b></div><div class="kpi"><span>الغياب</span><b>${absent}</b></div></div>
 <section class="card"><div class="row"><span>الخروج المبكر</span><b>${total('early_leave_minutes')} دقيقة</b></div><div class="row"><span>الإجازات المعتمدة</span><b>${leave}</b></div><div class="row"><span>حركات ناقصة</span><b>${rows.filter(r=>r.incomplete).length}</b></div></section>
 <section class="card"><div class="section-title"><h3>🔔 الإشعارات</h3><span class="pill">${notes.filter(n=>!n.read_at).length} جديد</span></div>${notes.slice(0,20).map(n=>`<button class="self-note ${n.read_at?'':'unread'}" data-staff-note="${n.id}"><b>${esc(n.title)}</b><span>${esc(n.body||'')}</span><small>${fmt(n.created_at)}</small></button>`).join('')||'<p class="muted">لا توجد إشعارات.</p>'}</section>
 <section class="card"><div class="section-title"><h3>💰 طلبات السلف</h3><button id="summaryAdvanceRequest" type="button">طلب سلفة</button></div>${advances.map(a=>`<div class="row"><div><b>${Number(a.amount||0).toFixed(2)}</b><small class="muted">${esc(a.reason||'بدون سبب')}</small></div><span class="pill">${esc(a.status)}</span></div>`).join('')||'<p class="muted">لا توجد طلبات سلفة.</p>'}</section>
 <section class="card"><h3>➕➖ الجزاءات والمكافآت المعتمدة</h3>${adjustments.slice(0,20).map(a=>`<div class="row"><span>${esc(a.adjustment_type)} — ${esc(a.reason||'')}</span><b>${Number(a.amount||0).toFixed(2)}</b></div>`).join('')||'<p class="muted">لا توجد حركات معتمدة.</p>'}</section>
 <section class="card"><h3>🧾 المرتبات</h3>${payroll.slice(0,12).map(p=>`<div class="row"><div><b>${esc(p.period_start)} → ${esc(p.period_end)}</b><small class="muted">${esc(p.status)}</small></div><b>${Number(p.net_amount||0).toFixed(2)}</b></div>`).join('')||'<p class="muted">لا توجد مسيرات مرتبات.</p>'}</section>
 <section class="card"><button id="logoutBtn" class="primary" type="button">تسجيل الخروج</button></section>`;
 $('#logoutBtn').onclick=logout;$('#summaryAdvanceRequest').onclick=openAdvanceRequest;
 $$('#page [data-staff-note]').forEach(b=>b.onclick=async()=>{try{await api({action:'notification-read',notification_id:Number(b.dataset.staffNote)});await refreshSnapshot()}catch(error){toast(error.message||'تعذر تحديث الإشعار')}});
}
async function renderSync(){
 const rows=await updatePending();
 $('#page').innerHTML=`<h1>المزامنة</h1><section class="card"><div class="row"><span>الحركات المنتظرة</span><b>${rows.length}</b></div><button id="syncNow" class="primary" type="button" ${!navigator.onLine||replaying?'disabled':''}>مزامنة الآن</button></section>${rows.map(row=>`<section class="card sync-item"><b>${row.eventType==='check_in'?'حضور':'انصراف'}</b><div>${fmt(row.capturedAtDevice)}</div><div class="muted">المحاولات: ${row.attempts||0} — ${esc(row.state)}</div>${row.lastError?`<div class="danger">${esc(row.lastError)}</div>`:''}</section>`).join('')}`;
 $('#syncNow')?.addEventListener('click',replayPending);
}
function render(){
 if(!currentSession)return bootstrap();
 show('#appView');$$('.bottom-nav button').forEach(button=>button.classList.toggle('active',button.dataset.page===currentPage));
 if(currentPage==='home')renderHome();else if(currentPage==='history')renderHistory();else if(currentPage==='schedule')renderSchedule();else if(currentPage==='summary')renderSummary();else renderSync();
 updatePending();updateNetwork();
}
function geolocate(){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(new Error('الموقع غير مدعوم'));navigator.geolocation.getCurrentPosition(position=>resolve({latitude:position.coords.latitude,longitude:position.coords.longitude,accuracyM:position.coords.accuracy,capturedAt:new Date(position.timestamp).toISOString()}),()=>reject(new Error('تعذر التقاط GPS. اسمح بالوصول للموقع وحاول مجددًا.')),{enableHighAccuracy:true,timeout:20000,maximumAge:0})})}
function stopCamera(){cameraStream?.getTracks().forEach(track=>track.stop());cameraStream=null;$('#cameraModal').classList.add('hidden')}
async function openCamera(type){
 pendingType=type;$('#cameraTitle').textContent=type==='check_in'?'تسجيل الحضور':'تسجيل الانصراف';$('#gpsState').textContent='سيتم التقاط الموقع عند الضغط.';$('#cameraModal').classList.remove('hidden');
 try{cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280},height:{ideal:1280}},audio:false});$('#cameraVideo').srcObject=cameraStream}
 catch{stopCamera();toast('تعذر فتح الكاميرا. امنح إذن الكاميرا واستخدم HTTPS.');}
}
function cameraBlob(){return new Promise((resolve,reject)=>{const video=$('#cameraVideo'),canvas=$('#cameraCanvas'),width=Math.min(960,video.videoWidth||720),height=Math.round(width*(video.videoHeight||720)/(video.videoWidth||720));canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');context.translate(width,0);context.scale(-1,1);context.drawImage(video,0,0,width,height);canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('تعذر إنشاء السيلفي')),'image/jpeg',.84)})}
async function captureAttendance(){
 const button=$('#captureAttendance');button.disabled=true;
 try{
  $('#gpsState').textContent='جاري التقاط GPS والسيلفي…';const capturedAt=new Date().toISOString();const [gps,selfie]=await Promise.all([geolocate(),cameraBlob()]);
  const clientTxId=tx('HR-ATT'),offline=!navigator.onLine,envelope={clientTxId,eventType:pendingType,capturedAtDevice:capturedAt,gps,selfie,capturedOffline:offline,branchId:Number(currentSession.employee?.branch_id),deviceId:store.deviceId(),appVersion:APP_VERSION,deviceTimeOffsetMinutes:new Date().getTimezoneOffset()};
  await queue.enqueue(envelope);stopCamera();toast('تم تسجيل الحركة محليًا - في انتظار المزامنة');await updatePending();render();
  if(navigator.onLine)await replayPending();
 }catch(error){toast(error.message||String(error))}finally{button.disabled=false}
}
async function sendEnvelope(row){
 const form=new FormData();form.set('action','selfie-upload');form.set('client_tx_id',row.clientTxId);form.set('captured_at_device',row.capturedAtDevice);form.set('selfie',row.selfie,`${row.clientTxId}.jpg`);
 const upload=await api(form,{form:true});
 const payload={employee_id:Number(currentSession.employee.id),branch_id:row.branchId,event_type:row.eventType,client_tx_id:row.clientTxId,captured_at_device:row.capturedAtDevice,latitude:row.gps.latitude,longitude:row.gps.longitude,accuracy_m:row.gps.accuracyM,selfie_storage_reference:upload.selfie.reference,device_id:row.deviceId,captured_offline:row.capturedOffline,app_version:row.appVersion,device_time_offset_minutes:row.deviceTimeOffsetMinutes,metadata:{queue_created_at:row.createdAt,gps_timestamp:row.gps.capturedAt}};
 return (await api({action:'attendance',payload})).ack;
}
async function replayPending(){
 if(replaying||!navigator.onLine||!currentSession)return;replaying=true;
 try{const result=await queue.replay(sendEnvelope);if(result.synced)toast(`تمت مزامنة ${result.synced} حركة`);await updatePending();await reportSyncState();await refreshSnapshot()}
 catch(error){await reportSyncState(error.message||String(error));toast(error.message||'تعذر المزامنة')}finally{replaying=false;if(currentPage==='sync')renderSync()}
}
async function login(event){
 event.preventDefault();const button=event.submitter;button.disabled=true;
 try{const result=await api({action:'login',identity:$('#identity').value.trim(),pin:$('#pin').value,device_uid:store.deviceId(),device_name:'Sharawla Staff PWA',device_model:navigator.userAgentData?.platform||'',platform:navigator.platform||''},{requireSession:false});currentSession={session_token:result.session_token,expires_at:result.expires_at,must_change_pin:result.must_change_pin,employee:result.employee,device_id:result.device_id};store.saveSession(currentSession);if(result.must_change_pin){show('#pinView');$('#currentPin').focus()}else{await enterApp()}}
 catch(error){toast(error.message||'تعذر تسجيل الدخول')}finally{button.disabled=false}
}
async function changePin(event){event.preventDefault();const next=$('#newPin').value;if(!/^\d{6}$/.test(next)||next!==$('#confirmPin').value)return toast('تأكيد PIN غير مطابق أو ليس 6 أرقام');try{await api({action:'change-pin',current_pin:$('#currentPin').value,new_pin:next});store.saveSession(null);currentSession=null;toast('تم تغيير PIN. سجل الدخول بالرقم الجديد.');bootstrap()}catch(error){toast(error.message||'تعذر تغيير PIN')}}
async function logout(){try{if(navigator.onLine)await api({action:'logout'})}catch{}store.saveSession(null);currentSession=null;snapshot=null;bootstrap()}
function openAdvanceRequest(){
 const wrapper=document.createElement('div');wrapper.className='camera-modal';wrapper.innerHTML=`<form class="camera-card"><h2>طلب سلفة</h2><label>المبلغ<input data-f="amount" type="number" min="1" step=".01" required></label><label>طريقة الاستقطاع<select data-f="mode"><option value="one_time">مرة واحدة</option><option value="installments">أقساط</option></select></label><label>قيمة القسط<input data-f="installment" type="number" min="1" step=".01"></label><label>عدد الأقساط<input data-f="count" type="number" min="1" step="1"></label><label>السبب<textarea data-f="reason" rows="3"></textarea></label><div class="camera-actions"><button type="button" data-close>إلغاء</button><button class="primary" type="submit">إرسال إلى HR</button></div></form>`;document.body.appendChild(wrapper);
 wrapper.querySelector('[data-close]').onclick=()=>wrapper.remove();
 wrapper.querySelector('form').onsubmit=async event=>{event.preventDefault();if(!navigator.onLine)return toast('إرسال طلب السلفة يحتاج اتصالًا بالإنترنت.');const value=name=>wrapper.querySelector(`[data-f="${name}"]`).value,mode=value('mode');try{await api({action:'advance-request',amount:Number(value('amount')),repayment_mode:mode,installment_amount:mode==='installments'?Number(value('installment')):null,installments_count:mode==='installments'?Number(value('count')):null,reason:value('reason'),client_tx_id:tx('HR-ADV')});wrapper.remove();toast('تم إرسال طلب السلفة إلى HR');await refreshSnapshot()}catch(error){toast(error.message||'تعذر إرسال طلب السلفة')}};
}
function openLeaveRequest(){
 const wrapper=document.createElement('div');wrapper.className='camera-modal';wrapper.innerHTML=`<form class="camera-card"><h2>طلب إجازة أو إذن</h2><label>النوع<select data-f="type"><option value="leave">إجازة</option><option value="permission">إذن قصير</option><option value="late_permission">إذن تأخير</option><option value="early_leave_permission">إذن خروج مبكر</option><option value="sick_leave">إجازة مرضية</option><option value="unpaid_leave">إجازة بدون مرتب</option></select></label><label>من<input data-f="from" type="datetime-local" required></label><label>إلى<input data-f="to" type="datetime-local" required></label><label>السبب<textarea data-f="reason" rows="3"></textarea></label><div class="camera-actions"><button type="button" data-close>إلغاء</button><button class="primary" type="submit">إرسال</button></div></form>`;document.body.appendChild(wrapper);wrapper.querySelector('[data-close]').onclick=()=>wrapper.remove();wrapper.querySelector('form').onsubmit=async event=>{event.preventDefault();if(!navigator.onLine)return toast('إرسال طلب الإجازة يحتاج اتصالًا بالإنترنت.');const value=name=>wrapper.querySelector(`[data-f="${name}"]`).value;try{await api({action:'leave-request',request_type:value('type'),starts_at:new Date(value('from')).toISOString(),ends_at:new Date(value('to')).toISOString(),reason:value('reason'),client_tx_id:tx('HR-LEAVE')});wrapper.remove();toast('تم إرسال الطلب للمدير');await refreshSnapshot()}catch(error){toast(error.message||'تعذر إرسال الطلب')}};
}
async function enterApp(){currentPage='home';snapshot=loadSnapshot();render();await replayPending();await refreshSnapshot()}
function bootstrap(){
 updateNetwork();const cfg=connection();if(!cfg?.url||!cfg?.key)return show('#setupView');
 currentSession=store.session();if(!currentSession)return show('#loginView');
 if(currentSession.must_change_pin)return show('#pinView');enterApp();
}

$('#setupForm').addEventListener('submit',event=>{event.preventDefault();const url=$('#backendUrl').value.trim().replace(/\/$/,'') ,key=$('#backendKey').value.trim();if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)||!key.startsWith('sb_'))return toast('راجع Project URL وPublishable key');store.saveConfig({url,key});bootstrap()});
$('#changeConnection').onclick=()=>{store.saveSession(null);localStorage.removeItem('sharawlaStaffConfigV1');currentSession=null;bootstrap()};
$('#loginForm').addEventListener('submit',login);$('#pinForm').addEventListener('submit',changePin);
$('.bottom-nav').addEventListener('click',event=>{const button=event.target.closest('[data-page]');if(!button)return;currentPage=button.dataset.page;render()});
$('#cancelCamera').onclick=stopCamera;$('#captureAttendance').onclick=captureAttendance;
addEventListener('online',()=>{updateNetwork();replayPending()});addEventListener('offline',updateNetwork);addEventListener('focus',replayPending);addEventListener('pageshow',replayPending);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')replayPending()});
setInterval(()=>{if(currentPage==='home')$('#liveClock')?.replaceChildren(document.createTextNode(new Date().toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})))},30000);
setInterval(()=>{if(document.visibilityState==='visible')replayPending()},60000);
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').then(reg=>{navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='REPLAY_PENDING')replayPending()});if('sync'in reg)reg.sync.register('sharawla-staff-replay').catch(()=>{})}).catch(()=>{});
bootstrap();
})(globalThis);
