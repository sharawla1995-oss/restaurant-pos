(function(global){
'use strict';
const VERSION='10.5.4-beta.44-finance-shim';
const FEATURES=['finance.credit','finance.receivables','finance.collections','finance.aging','commerce.price_tiers','commerce.b2b_orders'];
function enabled(){try{const c=JSON.parse(localStorage.getItem('sharawlaRuntimeConfigV1')||'{}')||{},set=new Set((c.enabled_features||[]).map(x=>String(x).toLowerCase()));return FEATURES.some(x=>set.has(x))}catch{return false}}
function financeInject(){
  try{
    const old=document.querySelector('[data-beta44-finance-b2b]');
    const title=String(document.querySelector('#pageTitle')?.textContent||'');
    const ok=enabled()&&/العملاء|التقارير/.test(title);
    if(!ok){old?.remove();return}
    if(old)return;
    const host=document.querySelector('#page .section-head')||document.querySelector('#page');if(!host)return;
    const b=document.createElement('button');b.type='button';b.className='secondary';b.dataset.beta44FinanceB2b='1';b.textContent='💳 Finance / B2B';
    b.onclick=()=>global.__SharawlaFinanceB2B?.open?.();host.appendChild(b);
  }catch(e){console.warn('Beta44 finance inject shim',e)}
}
if(typeof global.inject!=='function')global.inject=financeInject;
let tries=0;const timer=setInterval(()=>{
  tries++;financeInject();
  if(global.__SharawlaFinanceB2B||tries>20){clearInterval(timer);if(global.inject===financeInject)try{delete global.inject}catch{}}
},250);
global.__SharawlaBeta44FinanceShim=Object.freeze({version:VERSION,inject:financeInject});
})(window);
