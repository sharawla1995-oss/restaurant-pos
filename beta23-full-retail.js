(function(global){
'use strict';
const VERSION='10.5.4-beta.27';
let wiring=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
function retail(){try{return String(JSON.parse(localStorage.getItem('sharawlaRuntimeConfigV1')||'{}')?.pos_profile||'').toLowerCase()==='retail'&&global.SharawlaRuntimeCore?.hasEngine?.('retail')}catch{return false}}
function branch(){try{return Number(global.currentBranchId?.()||0)}catch{return 0}}
function moduleOn(code){try{return typeof global.moduleEnabled==='function'?global.moduleEnabled(code):true}catch{return true}}
async function rows(table,query){try{return await global.rest(table,query)}catch{return []}}
async function enhanceCheckout(){
 if(!retail())return;
 const head=document.querySelector('.retail-sale-head'),select=document.querySelector('.retail-sale-head #orderType');
 if(!head||!select||head.dataset.fullRetail==='1')return;
 const deliveryOn=moduleOn('delivery'),pickupOn=moduleOn('pickup');
 head.dataset.fullRetail='1';
 select.classList.remove('hidden');
 select.innerHTML='<option value="takeaway">بيع تجزئة / استلام فوري</option>'+(pickupOn?'<option value="pickup">استلام من الفرع</option>':'')+(deliveryOn?'<option value="delivery">دليفري / توصيل</option>':'');
 if(!deliveryOn)return;
 const b=branch();
 const [zones,drivers]=await Promise.all([
   rows('delivery_zones',`select=id,name,delivery_fee,branch_id,active&active=eq.true${b?`&branch_id=eq.${b}`:''}&order=name`),
   rows('delivery_drivers',`select=id,name,phone,branch_id,active&active=eq.true${b?`&branch_id=eq.${b}`:''}&order=name`)
 ]);
 let box=document.querySelector('#deliveryFields');
 if(!box){
   box=document.createElement('div');box.id='deliveryFields';box.className='delivery-fields hidden';
   box.innerHTML=`<select id="deliveryZone"><option value="">منطقة التوصيل</option>${(zones||[]).map(z=>`<option value="${z.id}" data-fee="${Number(z.delivery_fee||0)}">${esc(z.name)} — ${Number(z.delivery_fee||0).toFixed(2)}</option>`).join('')}</select><input id="deliveryAddress" placeholder="عنوان التوصيل"><select id="deliveryDriver"><option value="">المندوب — يحدد لاحقًا</option>${(drivers||[]).map(d=>`<option value="${d.id}">${esc(d.name)}${d.phone?` — ${esc(d.phone)}`:''}</option>`).join('')}</select><input id="manualDeliveryFee" type="number" min="0" step="0.01" value="0" placeholder="رسوم التوصيل"><input id="deliveryBranch" type="hidden" value="${b}">`;
   head.insertAdjacentElement('afterend',box);
 }
 const foot=document.querySelector('.retail-cart .cart-foot');
 if(foot&&!document.querySelector('#deliveryFeeLine')){const line=document.createElement('div');line.id='deliveryFeeLine';line.className='totline hidden';line.innerHTML='<span>رسوم التوصيل</span><b id="deliveryFee">0</b>';const grand=foot.querySelector('.grand');foot.insertBefore(line,grand||foot.firstChild)}
 const toggle=()=>{const on=select.value==='delivery';box.classList.toggle('hidden',!on);document.querySelector('#deliveryFeeLine')?.classList.toggle('hidden',!on);try{global.drawCart?.()}catch{}};
 select.addEventListener('change',toggle);
 box.querySelector('#deliveryZone')?.addEventListener('change',e=>{const o=e.target.selectedOptions?.[0];box.querySelector('#manualDeliveryFee').value=o?.dataset?.fee||'0';try{global.drawCart?.()}catch{}});
 box.querySelector('#manualDeliveryFee')?.addEventListener('input',()=>{try{global.drawCart?.()}catch{}});
 toggle();
}
function observe(){if(wiring)return;wiring=true;const o=new MutationObserver(()=>enhanceCheckout());o.observe(document.body,{childList:true,subtree:true});enhanceCheckout();setInterval(()=>enhanceCheckout(),1200)}
global.__SharawlaFullRetailCandidate={version:VERSION,delivery:true,dinein:false,weightEntry:true,website:true,inventory:true,purchasing:true,returns:true,offers:true,stockCount:true,transfers:true};
function start(){observe()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
