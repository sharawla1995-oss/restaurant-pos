(function(global){
'use strict';
const VERSION='10.5.4-beta.28';
const OFFLINE_KEY='offlineLoginVerifier';
const HOME_ORDER=['pos','orders','deliveryOrders','returns','customers','shifts','reports','expenses','products','inventory','marketSettings','retailOffers','stockCount','suppliers','purchasing','transfers','websiteManagement','deliverySettings','users','settings'];
const TITLE_PAGE=new Map([
  ['الكاشير','pos'],['الطلبات','orders'],['طلبات الدليفري','deliveryOrders'],['المرتجعات','returns'],['العملاء','customers'],['الورديات','shifts'],['الشيفت','shifts'],['التقارير','reports'],['المصروفات','expenses'],['الأصناف','products'],['المخزون','inventory'],['وحدات وباركود الوزن','marketSettings'],['عروض الماركت','retailOffers'],['الجرد','stockCount'],['الموردين','suppliers'],['المشتريات والاستلام','purchasing'],['تحويلات الفروع','transfers'],['إدارة الموقع','websiteManagement'],['إعدادات الدليفري','deliverySettings'],['إدارة الدليفري','deliverySettings'],['المستخدمون والصلاحيات','users'],['الإعدادات','settings']
]);
const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];
const normalizeUsername=v=>String(v??'').trim().toLowerCase();
const hasForbiddenUsernameChars=v=>/@|\s/.test(String(v||''));
function bytesHex(bytes){return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function offlineHash(password,saltHex){
  const salt=new Uint8Array((saltHex.match(/.{2}/g)||[]).map(x=>parseInt(x,16)));
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(String(password||'')),'PBKDF2',false,['deriveBits']);
  return bytesHex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:120000,hash:'SHA-256'},key,256)));
}
async function rememberUsernameOffline(username,password){
  const salt=crypto.getRandomValues(new Uint8Array(16)),saltHex=bytesHex(salt);
  const hash=await offlineHash(password,saltHex);
  localStorage.setItem(OFFLINE_KEY,JSON.stringify({username:normalizeUsername(username),salt:saltHex,hash}));
}
async function usernameSignIn(username,password){
  username=normalizeUsername(username);
  if(!username)throw new Error('اكتب اسم المستخدم');
  if(hasForbiddenUsernameChars(username))throw new Error('اسم المستخدم لا يحتوي على @ أو مسافات');
  if(navigator.onLine){
    const d=await callFunction('smart-function',{action:'login',username,password:String(password||'')});
    const s=d?.session||d;
    if(!s?.access_token||!s?.user)throw new Error(d?.message||d?.error||'بيانات الدخول غير صحيحة');
    session=s;resumeSession=s;
    localStorage.setItem('sbResumeSession',JSON.stringify(s));
    await rememberUsernameOffline(username,password);
    return s;
  }
  const v=JSON.parse(localStorage.getItem(OFFLINE_KEY)||'null');
  const stored=normalizeUsername(v?.username||v?.login||v?.email||'');
  if(!v||stored!==username||await offlineHash(password,v.salt)!==v.hash)throw new Error('بيانات الدخول غير صحيحة. بعد Beta28 سجّل دخول مرة واحدة بالإنترنت باسم المستخدم لتفعيل Offline Login لهذا الحساب.');
  if(!resumeSession?.access_token)throw new Error('لا توجد جلسة محفوظة للعمل بدون إنترنت على هذا الجهاز');
  session=resumeSession;return session;
}
function installUsernameLogin(){
  try{signIn=usernameSignIn}catch{}
  try{global.signIn=usernameSignIn}catch{}
  const input=q('#email');
  if(input){input.type='text';input.autocomplete='username';input.placeholder='مثال: cashier1';input.setAttribute('inputmode','text');const label=input.closest('label');if(label){for(const n of label.childNodes){if(n.nodeType===Node.TEXT_NODE&&String(n.textContent||'').trim()){n.textContent='اسم المستخدم';break}}}}
}
function installFunctionErrorMap(){
  if(typeof callFunction!=='function'||callFunction.__beta28Wrapped)return;
  const base=callFunction;
  const wrapped=async(name,payload={})=>{try{return await base(name,payload)}catch(e){const m=String(e?.message||e||'');if(/Requested function was not found|404/i.test(m))throw new Error('خدمة إدارة المستخدمين غير متاحة على قاعدة هذا النشاط. راجع نشر smart-function.');throw e}};
  wrapped.__beta28Wrapped=true;
  try{callFunction=wrapped}catch{}
  try{global.callFunction=wrapped}catch{}
}
function patchUserForm(){
  const input=q('#userForm #uEmail');if(!input||input.dataset.beta28Username==='1')return;
  input.dataset.beta28Username='1';input.type='text';input.autocomplete='off';input.placeholder='مثال: cashier1';input.removeAttribute('pattern');
  const label=input.closest('label');if(label){for(const n of label.childNodes){if(n.nodeType===Node.TEXT_NODE&&String(n.textContent||'').trim()){n.textContent='اسم المستخدم';break}}}
  const validate=()=>{const v=String(input.value||'');input.setCustomValidity(hasForbiddenUsernameChars(v)?'اسم المستخدم لا يحتوي على @ أو مسافات':'')};
  input.addEventListener('input',validate);validate();
}
function normalizeOwnerDigits(v){
  const ar='٠١٢٣٤٥٦٧٨٩',fa='۰۱۲۳۴۵۶۷۸۹';
  return String(v||'').replace(/[٠-٩]/g,c=>String(ar.indexOf(c))).replace(/[۰-۹]/g,c=>String(fa.indexOf(c))).replace(/\D+/g,'').slice(0,32);
}
function patchOwnerUnlock(){
  const input=q('#ownerDiagnosticCode');if(!input||input.dataset.beta28Owner==='1')return;
  input.dataset.beta28Owner='1';input.inputMode='numeric';input.placeholder='اكتب كود المالك بالأرقام';
  input.addEventListener('input',()=>{const n=normalizeOwnerDigits(input.value);if(input.value!==n)input.value=n});
  const p=q('#ownerUnlockModal p');if(p)p.textContent='أدخل كود التشخيص الخاص بالمالك. يقبل الأرقام العربية أو الإنجليزية ولا يتم حفظ الكود على الجهاز.';
}
function cardPage(card){
  const direct=String(card?.dataset?.homePage||'').trim();if(direct)return direct;
  const title=String(card?.querySelector?.('.home-copy b')?.textContent||'').replace(/\s+/g,' ').trim();return TITLE_PAGE.get(title)||'';
}
let ordering=false;
function enforceHomeOrder(){
  if(ordering)return;
  const grid=q('#page .home-grid');if(!grid)return;
  const title=String(q('#pageTitle')?.textContent||'').trim();if(title!=='الرئيسية')return;
  const cards=qa(':scope > .home-card',grid);if(!cards.length)return;
  const logout=cards.find(c=>c.hasAttribute('data-home-logout'))||null;
  const regular=cards.filter(c=>c!==logout);
  const scored=regular.map((c,i)=>{const p=cardPage(c),idx=HOME_ORDER.indexOf(p);return {c,i,score:idx>=0?idx:HOME_ORDER.length+100+i}}).sort((a,b)=>a.score-b.score||a.i-b.i).map(x=>x.c);
  const desired=[...scored,...(logout?[logout]:[])];
  const current=qa(':scope > .home-card',grid);
  if(current.length===desired.length&&current.every((c,i)=>c===desired[i]))return;
  ordering=true;try{desired.forEach(c=>grid.appendChild(c))}finally{ordering=false}
}
async function copyOwnerReportBeta28(){
  const api=global.__SharawlaOwnerDiagnostics;if(!api)return false;
  let actual=VERSION;try{actual=(await global.topBurgerDesktop?.update?.info?.())?.version||VERSION}catch{}
  const rows=Array.isArray(api.results)?api.results:[],sandbox=Array.isArray(api.sandbox)?api.sandbox:[];
  const lines=['Sharawla Owner Diagnostics',`${actual} — Owner Private Diagnostics`,'',...rows.map(x=>`${x.name} — ${x.status}${x.detail?` — ${x.detail}`:''}`)];
  if(sandbox.length)lines.push('',...sandbox.map(x=>`${x.name} — ${x.status}${x.detail?` — ${x.detail}`:''}`));
  lines.push('',`Generated: ${new Date().toISOString()}`);
  const text=lines.join('\n');
  try{await navigator.clipboard.writeText(text)}catch{const t=document.createElement('textarea');t.value=text;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove()}
  global.toast?.('تم نسخ تقرير التشخيص');return true;
}
function patchOwnerCenter(){
  if(String(q('#pageTitle')?.textContent||'').trim()!=='تشخيص Sharawla')return;
  qa('#page b[dir="ltr"]').forEach(el=>{if(/^10\.5\.4-beta\.27$/.test(String(el.textContent||'').trim()))el.textContent=VERSION});
}
function start(){
  installFunctionErrorMap();installUsernameLogin();patchUserForm();patchOwnerUnlock();enforceHomeOrder();patchOwnerCenter();
  document.addEventListener('click',e=>{if(e.target?.closest?.('#ownerCopy')){e.preventDefault();e.stopImmediatePropagation();copyOwnerReportBeta28()}},true);
  const obs=new MutationObserver(()=>{installUsernameLogin();patchUserForm();patchOwnerUnlock();enforceHomeOrder();patchOwnerCenter()});
  obs.observe(document.body,{childList:true,subtree:true});
  global.__SharawlaBeta28Fixes=Object.freeze({version:VERSION,usernameLogin:true,usernameNoAt:true,ownerPrivate:true,homeLogoutLast:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
