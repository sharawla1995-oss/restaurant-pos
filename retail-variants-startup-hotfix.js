(function(global){
'use strict';
const VERSION='10.5.4-beta.50';
const KEY='sharawlaRuntimeConfigV1';
let timer=null;
let tries=0;
let reloadStarted=false;
function cfg(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch{return {}}}
function retailReady(){
 const c=cfg();
 return String(c.pos_profile||'').toLowerCase()==='retail'&&global.SharawlaRuntimeCore?.hasEngine?.('retail')===true;
}
function featureReady(){
 if(!retailReady())return false;
 const c=cfg();
 const features=Array.isArray(c.enabled_features)?c.enabled_features:[];
 return features.map(x=>String(x||'').trim().toLowerCase()).includes('commerce.variants');
}
function normalizeVariantLabels(){
 for(const b of document.querySelectorAll('[data-retail-variant-product]'))b.textContent='🧩 متغيرات الصنف';
 for(const h of document.querySelectorAll('.variant-matrix-modal h2')){
  if(/^🎛️\s*Variants\s*—/.test(String(h.textContent||'')))h.textContent=String(h.textContent||'').replace(/^🎛️\s*Variants\s*—/,'🧩 متغيرات الصنف —');
 }
}
function hideLegacyRestaurantVariantUi(){
 if(!retailReady())return;
 const p=document.querySelector('#pHasVariants');
 if(p){const label=p.closest('label');if(label)label.style.display='none'}
 const pb=document.querySelector('#pVariantsBox');if(pb)pb.style.display='none';
 for(const modal of document.querySelectorAll('.product-edit-modal')){
  const e=modal.querySelector('#editHasVariants');if(e){const label=e.closest('label');if(label)label.style.display='none'}
  const eb=modal.querySelector('#editVariantsBox');if(eb)eb.style.display='none';
 }
 const page=document.querySelector('#page');
 if(page){
  for(const table of page.querySelectorAll('table')){
   const ths=[...table.querySelectorAll('thead th')];
   const idx=ths.findIndex(th=>String(th.textContent||'').includes('الاختيارات / الأحجام'));
   if(idx>=0){
    ths[idx].style.display='none';
    for(const row of table.querySelectorAll('tbody tr')){const cell=row.children[idx];if(cell)cell.style.display='none'}
   }
  }
 }
 normalizeVariantLabels();
}
function reloadVariantsUi(){
 if(global.__SharawlaRetailVariantsV1)return true;
 if(!featureReady()||reloadStarted)return false;
 reloadStarted=true;
 const s=document.createElement('script');
 s.src=`retail-variants-ui.js?v=${VERSION}-runtime-ready`;
 s.async=false;
 s.setAttribute('data-retail-variants-runtime-retry','1');
 s.onload=()=>{
  if(global.__SharawlaRetailVariantsV1){normalizeVariantLabels();global.dispatchEvent(new CustomEvent('sharawla-retail-variants-ready'))}
  else {reloadStarted=false;console.error('Retail Variants retry loaded but API was not registered')}
 };
 s.onerror=()=>{reloadStarted=false;console.error('Retail Variants runtime retry failed to load UI')};
 document.head.appendChild(s);
 return true;
}
function tick(){
 tries++;
 hideLegacyRestaurantVariantUi();
 if(featureReady()&&!global.__SharawlaRetailVariantsV1)reloadVariantsUi();
 if(global.__SharawlaRetailVariantsV1||tries>=600){if(timer){clearInterval(timer);timer=null}}
}
function start(){
 hideLegacyRestaurantVariantUi();
 if(timer)return;
 timer=setInterval(tick,100);
 tick();
 const observer=new MutationObserver(()=>hideLegacyRestaurantVariantUi());
 observer.observe(document.body,{childList:true,subtree:true});
 global.__SharawlaRetailVariantsStartupHotfix=Object.freeze({version:VERSION,retailReady,featureReady});
}
global.addEventListener('sharawla-beta36-integrations-ready',start);
global.addEventListener('sharawla-beta37-integrations-ready',start);
global.addEventListener('sharawla-beta38-integrations-ready',start);
global.addEventListener('sharawla-beta39-integrations-ready',start);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);