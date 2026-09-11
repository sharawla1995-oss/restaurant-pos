(function(global){
'use strict';
const VERSION='10.5.4-beta.25';
const qs=(s,r=document)=>r.querySelector(s),qsa=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function isRetail(){try{return global.SharawlaRuntimeCore?.hasEngine?.('retail')&&global.runtimeAllPages?.().includes('marketSettings')}catch{return false}}
function visibleNav(){return qsa('#nav button[data-page]').filter(b=>!b.classList.contains('hidden')&&b.dataset.page&&b.dataset.page!=='home')}
function syncHomeCards(){
 if(!isRetail())return;
 const page=qs('#page');if(!page||String(qs('#pageTitle')?.textContent||'').trim()!=='الرئيسية')return;
 let host=qs('#retailFinalHomeCards');
 if(!host){host=document.createElement('section');host.id='retailFinalHomeCards';host.className='home-grid retail-final-home-grid';page.appendChild(host)}
 const nav=visibleNav();
 host.innerHTML=nav.map(b=>`<button class="home-card" data-final-page="${esc(b.dataset.page)}"><span class="home-card-icon">${esc((b.textContent||'').trim().split(/\s+/)[0]||'•')}</span><b>${esc((b.textContent||'').replace(/^\S+\s*/,'').trim()||b.textContent||b.dataset.page)}</b></button>`).join('');
 host.onclick=e=>{const b=e.target.closest('[data-final-page]');if(b)global.showPage?.(b.dataset.finalPage)};
}
function addToolbar(key,title,placeholder='بحث بالاسم أو الباركود'){const page=qs('#page');if(!page||qs(`[data-final-toolbar="${key}"]`))return null;const panel=page.querySelector('.panel');if(!panel)return null;const bar=document.createElement('div');bar.dataset.finalToolbar=key;bar.className='filter-row retail-final-toolbar';bar.innerHTML=`<input type="search" data-final-search="${key}" placeholder="${esc(placeholder)}" autocomplete="off"><button type="button" data-final-clear="${key}">مسح</button>`;panel.insertBefore(bar,panel.children[1]||null);bar.querySelector('[data-final-clear]').onclick=()=>{const i=bar.querySelector('input');i.value='';i.dispatchEvent(new Event('input'))};return bar}
function filterRows(input,selectors){const q=String(input.value||'').trim().toLowerCase();for(const row of qsa(selectors.join(','),qs('#page')))row.classList.toggle('hidden',!!q&&!String(row.textContent||'').toLowerCase().includes(q))}
function enhanceInventory(){const t=String(qs('#pageTitle')?.textContent||'');if(!/المخزون/.test(t))return;const bar=addToolbar('inventory','المخزون');if(!bar)return;bar.querySelector('input').oninput=e=>filterRows(e.target,['tbody tr','.inventory-card','.setting-switch'])}
function enhanceMarketSettings(){const t=String(qs('#pageTitle')?.textContent||'');if(!/باركود الوزن|وحدات/.test(t))return;const bar=addToolbar('units','الوحدات');if(!bar)return;bar.querySelector('input').oninput=e=>filterRows(e.target,['tbody tr','.product-row','.setting-switch'])}
function enhanceStockCount(){const t=String(qs('#pageTitle')?.textContent||'');if(!/الجرد/.test(t))return;const bar=addToolbar('stockcount','الجرد');if(!bar)return;bar.querySelector('input').oninput=e=>filterRows(e.target,['tbody tr','.stock-count-row','.setting-switch'])}
function enhanceSuppliers(){const t=String(qs('#pageTitle')?.textContent||'');if(!/الموردين/.test(t))return;const bar=addToolbar('suppliers','الموردين','بحث باسم المورد أو الهاتف أو الرقم الضريبي');if(!bar)return;bar.querySelector('input').oninput=e=>filterRows(e.target,['tbody tr','.supplier-card','.setting-switch'])}
function enhanceOrders(){const t=String(qs('#pageTitle')?.textContent||'');if(!/الفواتير|الطلبات/.test(t)||/طلبات الموقع/.test(t))return;const bar=addToolbar('orders','الفواتير','بحث برقم الفاتورة أو البون أو العميل');if(!bar)return;bar.querySelector('input').oninput=e=>filterRows(e.target,['tbody tr','.order-card','.setting-switch'])}
function enhanceReturns(){const t=String(qs('#pageTitle')?.textContent||'');if(!/المرتجعات/.test(t))return;const bar=addToolbar('returns','المرتجعات','بحث برقم الفاتورة أو الصنف أو العميل');if(!bar)return;bar.querySelector('input').oninput=e=>filterRows(e.target,['tbody tr','.return-card','.setting-switch'])}
function enhanceWebsiteOrders(){const t=String(qs('#pageTitle')?.textContent||'');if(!/طلبات الموقع Retail/.test(t))return;const bar=addToolbar('weborders','طلبات الموقع','بحث برقم الطلب أو الهاتف أو اسم العميل');if(!bar)return;bar.querySelector('input').oninput=e=>filterRows(e.target,['.retail-web-order-card'])}
function enhancePurchasing(){const t=String(qs('#pageTitle')?.textContent||'');if(!/المشتريات|الاستلام/.test(t))return;const bar=addToolbar('purchasing','المشتريات','بحث بالمورد أو رقم أمر الشراء أو الصنف');if(!bar)return;bar.querySelector('input').oninput=e=>filterRows(e.target,['tbody tr','.purchase-card','.setting-switch'])}
function enhanceTransfers(){const t=String(qs('#pageTitle')?.textContent||'');if(!/تحويلات الفروع/.test(t))return;const bar=addToolbar('transfers','التحويلات','بحث برقم التحويل أو الفرع أو الصنف');if(!bar)return;bar.querySelector('input').oninput=e=>filterRows(e.target,['tbody tr','.transfer-card','.setting-switch'])}
function run(){if(!isRetail())return;syncHomeCards();enhanceInventory();enhanceMarketSettings();enhanceStockCount();enhanceSuppliers();enhanceOrders();enhanceReturns();enhanceWebsiteOrders();enhancePurchasing();enhanceTransfers()}
const obs=new MutationObserver(()=>requestAnimationFrame(run));function start(){run();obs.observe(document.body,{childList:true,subtree:true});global.__SharawlaRetailFinalization={version:VERSION,homeSidebarParity:true,searchEnhancements:true}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
