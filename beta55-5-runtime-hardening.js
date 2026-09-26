(function(global){
'use strict';

// Beta55.5 — SH-0007-only runtime hardening.
// This layer does not touch licensing, canonical fingerprint, auth encryption,
// Production devices, or backend schema. It formalizes the Restaurant offline
// page contract and prevents Navigation Parity cards from leaking into sub-pages.
const VERSION='10.5.4-beta.58.32';
const READ_CACHE_PAGES=new Set(['deliverySettings','products']);
const FULL_OFFLINE_PAGES=new Set(['shifts','expenses']);
const OFFLINE_CONTRACT=Object.freeze({
  home:Object.freeze({mode:'cache-read',read:true,create:false,update:false,notes:'dashboard is derived from cached and pending local operations'}),
  pos:Object.freeze({mode:'full',read:true,create:true,update:true,notes:'cart and checkout use the durable Offline V2 sale owner'}),
  orders:Object.freeze({mode:'cache-read',read:true,create:false,update:false,notes:'orders include cached server rows and native pending projections'}),
  returns:Object.freeze({mode:'full-create',read:true,create:true,update:false,notes:'returns use the durable Offline V2 owner for synced sales'}),
  customers:Object.freeze({mode:'full',read:true,create:true,update:true,notes:'customers and addresses use durable owners and local projections'}),
  deliveryOrders:Object.freeze({mode:'full',read:true,create:false,update:true,notes:'queue and status actions use cached orders and durable owners'}),
  kitchen:Object.freeze({mode:'full',read:true,create:false,update:true,notes:'kitchen queue and statuses use cached orders and durable owners'}),
  reports:Object.freeze({mode:'cache-read',read:true,create:false,update:false,notes:'offline reports are limited to locally cached and pending operational rows'}),
  shifts:Object.freeze({mode:'full',read:true,create:true,update:true,notes:'open/close uses durable offline queue'}),
  expenses:Object.freeze({mode:'full-create',read:true,create:true,update:false,notes:'new expenses queue offline; editing historical rows requires internet'}),
  deliverySettings:Object.freeze({mode:'cache-read',read:true,create:false,update:false,notes:'drivers/zones/settlements read from cached bootstrap; administration requires internet'}),
  products:Object.freeze({mode:'cache-read',read:true,create:false,update:false,notes:'catalog reads from cached bootstrap; catalog mutation requires internet'})
});

const text=v=>String(v??'').trim();
function activePage(){
  const a=[...document.querySelectorAll('#nav button.active[data-page]')];
  return a.length===1?text(a[0].dataset.page):'';
}
function isTrueHome(){return activePage()==='home'&&!!document.querySelector('#page > .home-hero')&&!!document.querySelector('#page > .home-grid')}
function toast55(m){try{if(typeof toast==='function')return toast(m)}catch{}try{return global.toast?.(m)}catch{}}
function setScopeClass(){
  const home=isTrueHome();
  document.body.classList.toggle('sharawla-beta55-5-not-home',!home);
  return home;
}
function ensureScopeStyle(){
  if(document.getElementById('sharawlaBeta555ScopeStyle'))return;
  const s=document.createElement('style');s.id='sharawlaBeta555ScopeStyle';
  s.textContent='body.sharawla-beta55-5-not-home #page .home-grid > .home-card[data-nav-parity-key]{display:none!important;pointer-events:none!important}';
  document.head.appendChild(s);
}
function mutationSelector(page){
  if(page==='deliverySettings')return '#addDriver,#addZone,[data-edit-driver],[data-delete-driver],[data-edit-zone],[data-toggle-zone],[data-settle]';
  if(page==='products')return '#addCategory,#addProduct,[data-edit-cat],[data-delete-cat],[data-cat-up],[data-cat-down],[data-edit-product],[data-delete-product],[data-product-up],[data-product-down]';
  return '';
}
function guardOfflineMutations(e){
  if(navigator.onLine)return;
  const page=activePage();
  if(!READ_CACHE_PAGES.has(page))return;
  const selector=mutationSelector(page);if(!selector)return;
  const hit=e.target?.closest?.(selector);if(!hit)return;
  e.preventDefault();e.stopImmediatePropagation();
  toast55(page==='products'?'إدارة الأصناف متاحة للقراءة أوفلاين. الإضافة والتعديل تحتاج إنترنت.':'بيانات الدليفري متاحة للقراءة أوفلاين. تعديل المناديب والمناطق والتسويات يحتاج إنترنت.');
}
function annotateOfflinePage(){
  const fallback=global.__SharawlaOfflineCacheFallback,existing=document.querySelector('#page [data-beta555-offline-note]');if(navigator.onLine&&fallback?.active!==true){existing?.remove();return}
  const page=activePage();const c=OFFLINE_CONTRACT[page];if(!c)return;
  const host=document.querySelector('#page');if(!host||host.querySelector('[data-beta55-5-offline-note]'))return;
  const note=document.createElement('div');note.dataset.beta555OfflineNote='1';note.className='panel';note.style.marginBottom='10px';
  note.innerHTML=c.mode==='cache-read'
    ?'<b>⚠️ وضع أوفلاين — بيانات محلية</b><div class="muted">المعروض من آخر نسخة محفوظة والحركات المعلّقة على هذا الجهاز، وقد لا يشمل بيانات Cloud الأحدث.</div>'
    :'<b>✓ وضع أوفلاين</b><div class="muted">الحركات الجديدة محفوظة محليًا وستتم مزامنتها بعد رجوع الاتصال والجلسة Online.</div>';
  host.prepend(note);
}
function scheduleUiHardening(){setTimeout(()=>{setScopeClass();annotateOfflinePage()},0)}

function offlineAudit(){
  const page=activePage();const contract=OFFLINE_CONTRACT[page]||null;
  const leakedVisible=[...document.querySelectorAll('#page .home-grid > .home-card[data-nav-parity-key]')].filter(x=>getComputedStyle(x).display!=='none');
  return {ok:leakedVisible.length===0,version:VERSION,page,online:navigator.onLine,contract,visible_navigation_leaks:leakedVisible.map(x=>x.dataset.navParityKey||x.textContent.trim().slice(0,40))};
}

function start(){
  ensureScopeStyle();setScopeClass();
  document.addEventListener('click',guardOfflineMutations,true);
  const obs=new MutationObserver(scheduleUiHardening);obs.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  global.addEventListener('offline',scheduleUiHardening);global.addEventListener('online',scheduleUiHardening);
  global.addEventListener('sharawla:offline-v2-projection-changed',scheduleUiHardening);
  global.addEventListener('sharawla:offline-cache-fallback',scheduleUiHardening);
  global.addEventListener('sharawla-beta55-integrations-ready',scheduleUiHardening);
  setTimeout(scheduleUiHardening,200);
  global.__SharawlaBeta555RuntimeHardening=Object.freeze({version:VERSION,offlineContract:OFFLINE_CONTRACT,activePage,isTrueHome,offlineAudit,fullOfflinePages:[...FULL_OFFLINE_PAGES],cacheReadPages:[...READ_CACHE_PAGES]});
  global.dispatchEvent(new CustomEvent('sharawla-beta55-5-runtime-hardening-ready',{detail:{version:VERSION}}));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
