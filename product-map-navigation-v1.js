(function(global){
'use strict';

// Sharawla Product Map Navigation V1 — Phase 1
// Presentation-only grouping layer. It MUST NOT dispatch routes or change permissions.
const VERSION='1.1.0-restaurant-product-map';

const GROUPS=Object.freeze([
  // Restaurant Product Map Reference. Home is the first section/route and has no
  // extra heading so the sidebar does not duplicate "الرئيسية".
  Object.freeze({key:'home',label:null,order:0}),
  Object.freeze({key:'sales',label:'المبيعات',order:10}),
  Object.freeze({key:'online-orders',label:'الطلبات الأونلاين',order:20}),
  Object.freeze({key:'restaurant-operations',label:'تشغيل المطعم',order:30}),
  Object.freeze({key:'inventory-purchasing',label:'المخزون والمشتريات',order:40}),
  Object.freeze({key:'hr',label:'الموظفون',order:50}),
  Object.freeze({key:'finance',label:'المالية',order:60}),
  Object.freeze({key:'reports',label:'التقارير',order:70}),
  Object.freeze({key:'website',label:'إدارة الموقع',order:80}),
  // Reserved until an approved Integrations route exists. The grouping layer
  // never invents a button just to make an empty section visible.
  Object.freeze({key:'integrations',label:'التكاملات',order:90}),
  Object.freeze({key:'administration',label:'الإدارة والإعدادات',order:100}),
  Object.freeze({key:'other',label:'أخرى',order:110})
]);

const GROUP_ALIAS=Object.freeze({
  home:'home',
  overview:'home',
  sales:'sales',
  'online-orders':'online-orders',
  operations:'restaurant-operations',
  'inventory-purchasing':'inventory-purchasing',
  employees:'hr',
  hr:'hr',
  finance:'finance',
  reports:'reports',
  'digital-channels':'website',
  website:'website',
  integrations:'integrations',
  administration:'administration',
  settings:'administration'
});

// Presentation-only exceptions required by the approved Restaurant Product Map.
// These do not select or replace route/render owners.
const ROUTE_GROUP_OVERRIDES=Object.freeze({
  onlineOrders:'online-orders',
  deliveryOrders:'restaurant-operations',
  delivery:'restaurant-operations',
  kitchen:'restaurant-operations',
  tables:'restaurant-operations',
  foodOperations:'inventory-purchasing'
});

const ROUTE_ORDER=Object.freeze([
  'home','summary',
  'pos','orders','returns','customers','promoCodes','retailOffers',
  'onlineOrders','deliveryOrders','delivery','kitchen','tables',
  'inventory','foodIngredients','foodRecipes','foodOperations','suppliers','purchasing','stockCount','transfers','internalSupply','pharmacyBatches','pharmacyExpiry',
  '__hr_group__','employees','advances','adjustments','payroll',
  'treasury','expenses','shifts','pharmacyInsurance','pharmacyClaims',
  'reports',
  'websiteManagement','branchProductAvailability','websiteBranchSettings','websitePayments','websiteAppearance','retailWebsiteOrders',
  'products','deliverySettings','marketSettings','users','settings',
  'pharmacyCatalog','pharmacyPrescriptions'
]);

const routeRank=new Map(ROUTE_ORDER.map((x,i)=>[x,i]));
let syncing=false,queued=false,observer=null;

function registryRoutes(){
  const rows=global.__SharawlaUnifiedNavigationRegistryV1?.routes;
  return Array.isArray(rows)?rows:null;
}

function routeFromUnit(node){
  if(!node)return '';
  if(node.matches?.('[data-beta55-hr-group]'))return '__hr_group__';
  if(node.tagName!=='BUTTON')return '';
  if(node.dataset?.page)return String(node.dataset.page);
  if(node.dataset?.beta54Page)return String(node.dataset.beta54Page);
  if(node.hasAttribute?.('data-beta55-supply-page'))return 'internalSupply';
  if(node.dataset?.pharmacyPage)return String(node.dataset.pharmacyPage);
  if(Object.prototype.hasOwnProperty.call(node.dataset||{},'retailWebsiteOrders'))return 'retailWebsiteOrders';
  return '';
}

function groupForRoute(routeKey,rows){
  if(routeKey==='__hr_group__')return 'hr';
  if(Object.prototype.hasOwnProperty.call(ROUTE_GROUP_OVERRIDES,routeKey))return ROUTE_GROUP_OVERRIDES[routeKey];
  const row=rows.find(x=>String(x.routeKey)===String(routeKey));
  if(!row)return 'other';
  return GROUP_ALIAS[String(row.group||'other')]||'other';
}

function unitKey(node,index){
  const routeKey=routeFromUnit(node);
  if(routeKey)return 'route:'+routeKey;
  if(node.id)return 'id:'+node.id;
  return 'other:'+index+':'+String(node.tagName||'node');
}

function makeLabel(group){
  const el=document.createElement('div');
  el.className='sharawla-nav-group-label';
  el.dataset.productMapNavV1='1';
  el.dataset.navGroup=group.key;
  el.textContent=group.label||'';
  el.setAttribute('aria-hidden','true');
  return el;
}

function currentSignature(nav){
  return [...nav.children].map((node,index)=>{
    if(node.matches?.('.sharawla-nav-group-label[data-product-map-nav-v1="1"]'))return 'label:'+String(node.dataset.navGroup||'');
    return unitKey(node,index);
  }).join('|');
}

function buildPlan(nav,rows){
  const existing=[...nav.children].filter(x=>!x.matches?.('.sharawla-nav-group-label[data-product-map-nav-v1="1"]'));
  const indexed=existing.map((node,index)=>{
    const routeKey=routeFromUnit(node);
    const groupKey=groupForRoute(routeKey,rows);
    return {
      node,index,routeKey,groupKey,
      key:unitKey(node,index),
      rank:routeRank.has(routeKey)?routeRank.get(routeKey):10000+index
    };
  });
  indexed.sort((a,b)=>{
    const ga=GROUPS.find(x=>x.key===a.groupKey)?.order??90;
    const gb=GROUPS.find(x=>x.key===b.groupKey)?.order??90;
    return ga-gb||a.rank-b.rank||a.index-b.index;
  });

  const plan=[];
  let lastGroup=null;
  for(const item of indexed){
    if(item.groupKey!==lastGroup){
      const group=GROUPS.find(x=>x.key===item.groupKey)||GROUPS[GROUPS.length-1];
      if(group.label)plan.push({kind:'label',group});
      lastGroup=item.groupKey;
    }
    plan.push({kind:'unit',item});
  }
  return plan;
}

function planSignature(plan){
  return plan.map(x=>x.kind==='label'?'label:'+x.group.key:x.item.key).join('|');
}

function refreshLabelVisibility(nav){
  const children=[...nav.children];
  for(let i=0;i<children.length;i++){
    const label=children[i];
    if(!label.matches?.('.sharawla-nav-group-label[data-product-map-nav-v1="1"]'))continue;
    let hasVisible=false;
    for(let j=i+1;j<children.length;j++){
      const node=children[j];
      if(node.matches?.('.sharawla-nav-group-label[data-product-map-nav-v1="1"]'))break;
      if(node.classList?.contains('hidden')||node.hidden||node.getAttribute?.('aria-hidden')==='true')continue;
      hasVisible=true;break;
    }
    label.classList.toggle('hidden',!hasVisible);
  }
}

function sync(){
  const nav=document.querySelector('#nav');
  if(!nav||syncing)return false;
  const rows=registryRoutes();
  if(!rows){
    nav.dataset.productMapNavState='REGISTRY_MISSING';
    return false;
  }
  syncing=true;
  try{
    const plan=buildPlan(nav,rows);
    const wanted=planSignature(plan);
    const current=currentSignature(nav);
    if(current!==wanted){
      nav.querySelectorAll(':scope > .sharawla-nav-group-label[data-product-map-nav-v1="1"]').forEach(x=>x.remove());
      const frag=document.createDocumentFragment();
      for(const entry of plan){
        if(entry.kind==='label')frag.appendChild(makeLabel(entry.group));
        else frag.appendChild(entry.item.node);
      }
      nav.appendChild(frag);
    }
    nav.dataset.productMapNavV1=VERSION;
    nav.dataset.productMapNavState='PASS';
    refreshLabelVisibility(nav);
    return true;
  }finally{
    syncing=false;
  }
}

function schedule(){
  if(queued)return;
  queued=true;
  const run=()=>{queued=false;sync()};
  if(typeof global.requestAnimationFrame==='function')global.requestAnimationFrame(run);
  else setTimeout(run,0);
}

function start(){
  const nav=document.querySelector('#nav');
  if(!nav)return false;
  sync();
  if(observer)observer.disconnect();
  observer=new MutationObserver(records=>{
    if(syncing)return;
    if(records.some(r=>r.type==='childList'||r.type==='attributes'))schedule();
  });
  observer.observe(nav,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','aria-hidden']});
  return true;
}

function audit(){
  const nav=document.querySelector('#nav');
  const rows=registryRoutes();
  if(!nav)return Object.freeze({ok:false,reason:'NAV_MISSING'});
  if(!rows)return Object.freeze({ok:false,reason:'REGISTRY_MISSING'});
  const plan=buildPlan(nav,rows);
  const labels=[...nav.querySelectorAll(':scope > .sharawla-nav-group-label[data-product-map-nav-v1="1"]')].map(x=>String(x.dataset.navGroup||''));
  const nestedRouteButtons=nav.querySelectorAll(':scope > :not([data-beta55-hr-group]) button[data-page],:scope > :not([data-beta55-hr-group]) button[data-beta54-page]').length;
  return Object.freeze({
    ok:planSignature(plan)===currentSignature(nav)&&nestedRouteButtons===0,
    version:VERSION,
    state:String(nav.dataset.productMapNavState||''),
    labels:Object.freeze(labels),
    nestedRouteButtons
  });
}

global.__SharawlaProductMapNavigationV1=Object.freeze({
  version:VERSION,start,sync,audit,routeFromUnit,groupForRoute
});

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
else start();

for(const eventName of [
  'sharawla-beta54-integrations-ready',
  'sharawla-beta55-integrations-ready',
  'sharawla-beta55-4-integrations-ready',
  'sharawla-beta55-5-integrations-ready'
]){
  global.addEventListener(eventName,schedule);
}
})(window);
