(function(global){
'use strict';
const checks=[
 ['Full Retail Candidate',()=>global.__SharawlaFullRetailCandidate?.version==='10.5.4-beta.23','candidate runtime loaded'],
 ['Retail No Dine-In',()=>global.__SharawlaFullRetailCandidate?.dinein===false,'Retail contract excludes restaurant dine-in'],
 ['Retail Delivery Contract',()=>global.__SharawlaFullRetailCandidate?.delivery===true,'delivery checkout enabled'],
 ['Weight Entry Contract',()=>global.__SharawlaBeta22FixesLoaded===true,'direct decimal/weight entry layer loaded'],
 ['EAN13 Runtime Export',()=>typeof global.__SharawlaRetailEan13Valid==='function','checksum validator exported'],
 ['Website Integration',()=>typeof global.renderRetailWebsiteOrders==='function','Retail website orders runtime loaded'],
 ['Inventory Contract',()=>typeof global.retailQtyNormalize==='function','Retail inventory/quantity runtime loaded']
];
function run(){const host=document.querySelector('#betaSelfTestResults');if(!host)return;let panel=document.querySelector('#beta23CandidateResults');if(!panel){panel=document.createElement('div');panel.id='beta23CandidateResults';panel.className='panel';panel.style.marginTop='12px';host.insertAdjacentElement('afterend',panel)}const rows=checks.map(([name,fn,detail])=>{let ok=false;try{ok=!!fn()}catch{}return {name,ok,detail}});panel.innerHTML=`<h3>🧩 Full Retail Candidate Contract</h3><div class="settings-list compact">${rows.map(x=>`<div class="setting-switch"><span><b>${x.name}</b><small style="display:block">${x.detail}</small></span><span class="status ${x.ok?'success':'danger'}">${x.ok?'PASS':'FAIL'}</span></div>`).join('')}</div><p class="muted">Read-only contract checks. Transactional order/return/reservation tests remain isolated Beta acceptance tests.</p>`;}
function wire(){document.addEventListener('click',e=>{if(e.target.closest?.('#betaSelfTestRunAll'))setTimeout(run,1200)});new MutationObserver(()=>{if(document.querySelector('#betaSelfTestResults')&&!document.querySelector('#beta23CandidateResults'))setTimeout(run,50)}).observe(document.body,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});else wire();
})(window);
