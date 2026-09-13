(function(global){
'use strict';
const VERSION='10.5.4-beta.55-navigation-parity.1';
const REQUIRED_RESTAURANT_KEYS=['page:foodIngredients','page:foodRecipes','page:foodOperations','page:tables'];
const META=Object.freeze({
 'page:pos':{icon:'🧾',label:'الكاشير',description:'بيع وإنشاء أوردر جديد',tone:'mint'},
 'page:orders':{icon:'📋',label:'الطلبات',description:'متابعة وطباعة الطلبات',tone:'blue'},
 'page:returns':{icon:'↩️',label:'المرتجعات',description:'مرتجع كلي أو جزئي من الفاتورة',tone:'rose'},
 'page:customers':{icon:'👤',label:'العملاء',description:'بحث وبيانات العملاء',tone:'violet'},
 'page:deliveryOrders':{icon:'🛵',label:'طلبات الدليفري',description:'متابعة طلبات التوصيل',tone:'amber'},
 'page:deliverySettings':{icon:'📍',label:'إعدادات الدليفري',description:'المناطق والمناديب والتسويات',tone:'violet'},
 'page:kitchen':{icon:'👨‍🍳',label:'المطبخ',description:'متابعة وتجهيز الطلبات',tone:'amber'},
 'page:shifts':{icon:'🕘',label:'الشيفت',description:'فتح وقفل ومراجعة الوردية',tone:'green'},
 'page:inventory':{icon:'📦',label:'المخزون',description:'الأرصدة وحركة المخزون',tone:'blue'},
 'page:marketSettings':{icon:'⚖️',label:'وحدات وباركود الوزن',description:'إعداد وحدات وباركود الوزن',tone:'violet'},
 'page:retailOffers':{icon:'🏷️',label:'عروض الماركت',description:'إدارة عروض التجزئة',tone:'amber'},
 'page:stockCount':{icon:'🧮',label:'الجرد',description:'جرد المخزون وترحيل الفروق',tone:'blue'},
 'page:transfers':{icon:'🔄',label:'تحويلات الفروع',description:'نقل المخزون بين الفروع',tone:'green'},
 'page:suppliers':{icon:'🚚',label:'الموردين',description:'بيانات وحسابات الموردين',tone:'violet'},
 'page:purchasing':{icon:'📥',label:'المشتريات والاستلام',description:'الشراء والاستلام من الموردين',tone:'blue'},
 'page:expenses':{icon:'💸',label:'المصروفات',description:'تسجيل ومراجعة المصروفات',tone:'rose'},
 'page:products':{icon:'🍔',label:'الأصناف',description:'الأصناف والأسعار',tone:'amber'},
 'page:promoCodes':{icon:'🎟️',label:'البرومو كود',description:'إدارة أكواد الخصم',tone:'violet'},
 'page:websiteManagement':{icon:'🌐',label:'إدارة الموقع',description:'التحكم في الموقع وتوافر الأصناف',tone:'green'},
 'page:reports':{icon:'📊',label:'التقارير',description:'المبيعات والورديات والتحليلات',tone:'blue'},
 'page:users':{icon:'👥',label:'المستخدمون',description:'المستخدمون والصلاحيات',tone:'blue'},
 'page:settings':{icon:'⚙️',label:'الإعدادات',description:'تشغيل وإيقاف المميزات',tone:'slate'},
 'page:foodIngredients':{icon:'🧪',label:'الخامات',description:'الخامات والأرصدة ووحدات الشراء',tone:'green'},
 'page:foodRecipes':{icon:'🍲',label:'الوصفات وFood Cost',description:'Recipe / BOM وتكلفة الأصناف',tone:'amber'},
 'page:foodOperations':{icon:'🏭',label:'الإنتاج والهالك',description:'Prep والإنتاج والهالك وFood Cost',tone:'rose'},
 'page:tables':{icon:'🪑',label:'الصالات والترابيزات',description:'الصالات والترابيزات وجلسات الصالة',tone:'violet'},
 'beta54:treasury':{icon:'🏦',label:'الخزنة',description:'حركات الخزنة والتسويات المالية',tone:'green'},
 'group:hr':{icon:'👨‍💼',label:'الموظفون',description:'الموظفون والسلف والخصومات والمرتبات',tone:'blue'},
 'custom:supply':{icon:'🏭',label:'التوريد الداخلي',description:'طلبات التوريد بين المخزن والفروع',tone:'amber'}
});
let observer=null,queued=false,wired=false;
function cfg(){try{return JSON.parse(localStorage.getItem('sharawlaRuntimeConfigV1')||'{}')||{}}catch{return {}}}
function isRestaurant(){return String(cfg().pos_profile||'').trim().toLowerCase()==='restaurant'}
function visible(el){return !!el&&!el.classList.contains('hidden')&&el.getAttribute('aria-hidden')!=='true'}
function isHomeActive(){const b=document.querySelector('#nav button[data-page="home"]');return !!b&&b.classList.contains('active')}
function keyForButton(b){
 if(!b)return null;
 if(b.dataset.page)return b.dataset.page==='home'?null:`page:${b.dataset.page}`;
 if(b.dataset.beta54Page)return `beta54:${b.dataset.beta54Page}`;
 if(Object.prototype.hasOwnProperty.call(b.dataset,'beta55SupplyPage'))return 'custom:supply';
 return null;
}
function topLevelEntries(){
 const nav=document.querySelector('#nav');if(!nav)return [];
 const out=[];
 for(const node of [...nav.children]){
   if(node.id==='logoutMenuBtn'||!visible(node))continue;
   if(node.matches?.('button')){
     const key=keyForButton(node);if(!key)continue;
     out.push({key,kind:'button',button:node,meta:META[key]||null});continue;
   }
   if(node.matches?.('[data-beta55-hr-group]')){
     const children=[...node.querySelectorAll('button[data-beta54-page]')].filter(visible);
     if(!children.length)continue;
     out.push({key:'group:hr',kind:'group',button:node.querySelector('[data-beta55-hr-toggle]'),children,meta:META['group:hr']});
   }
 }
 return out;
}
function currentKeys(){return topLevelEntries().map(x=>x.key)}
function createCard(entry){
 const m=entry.meta||{icon:'📌',label:(entry.button?.textContent||entry.key).trim(),description:'فتح القسم',tone:'slate'};
 const b=document.createElement('button');b.type='button';b.className=`home-card tone-${m.tone||'slate'}`;b.dataset.navParityKey=entry.key;
 if(entry.key.startsWith('page:'))b.dataset.homePage=entry.key.slice(5);
 b.innerHTML=`<span class="home-icon">${m.icon||'📌'}</span><span class="home-copy"><b>${m.label||entry.key}</b><small>${m.description||'فتح القسم'}</small></span><span class="home-arrow">‹</span>`;
 return b;
}
function cardKey(card){return card?.dataset?.navParityKey||(card?.dataset?.homePage?`page:${card.dataset.homePage}`:null)}
function route(key){
 const e=topLevelEntries().find(x=>x.key===key);if(!e)return false;
 if(e.kind==='group'){
   const first=e.children.find(visible);if(!first)return false;first.click();return true;
 }
 e.button?.click();return true;
}
function audit(){
 const expected=currentKeys();
 const grid=isHomeActive()?document.querySelector('#page .home-grid'):null;
 const actual=grid?[...grid.querySelectorAll(':scope > .home-card[data-nav-parity-key]')].map(cardKey).filter(Boolean):[];
 const missing=grid?expected.filter(x=>!actual.includes(x)):[];
 const extra=grid?actual.filter(x=>!expected.includes(x)):[];
 const orderMatch=!grid||expected.length===actual.length&&expected.every((x,i)=>actual[i]===x);
 const logoutSidebar=!!document.querySelector('#logoutMenuBtn');
 const logoutHome=!grid||!!grid.querySelector(':scope > [data-home-logout]');
 return {ok:(!grid||(!missing.length&&!extra.length&&orderMatch&&logoutSidebar===logoutHome)),home_present:!!grid,expected,actual,missing,extra,order_match:orderMatch,logout_match:logoutSidebar===logoutHome};
}
function contractAudit(){
 const entries=topLevelEntries(),keys=entries.map(x=>x.key),missingMetadata=entries.filter(x=>!x.meta).map(x=>x.key);
 const duplicateKeys=keys.filter((x,i)=>keys.indexOf(x)!==i);
 const missingRequiredRegistry=REQUIRED_RESTAURANT_KEYS.filter(x=>!META[x]);
 return {ok:isRestaurant()&&entries.length>0&&!missingMetadata.length&&!duplicateKeys.length&&!missingRequiredRegistry.length,profile:isRestaurant()?'restaurant':String(cfg().pos_profile||''),keys,missing_metadata:missingMetadata,duplicate_keys:[...new Set(duplicateKeys)],missing_required_registry:missingRequiredRegistry};
}
function syncHomeCards(){
 if(!isRestaurant()||!isHomeActive())return {skipped:true,reason:'not-restaurant-home'};
 const grid=document.querySelector('#page .home-grid');if(!grid)return {skipped:true,reason:'home-grid-missing'};
 const entries=topLevelEntries(),desired=entries.map(x=>x.key),existing=[...grid.querySelectorAll(':scope > .home-card[data-home-page],:scope > .home-card[data-nav-parity-key]')];
 const byKey=new Map();
 for(const c of existing){const key=cardKey(c);if(!key)continue;if(!byKey.has(key))byKey.set(key,c);else c.remove()}
 const current=[...grid.querySelectorAll(':scope > .home-card[data-nav-parity-key],:scope > .home-card[data-home-page]')].map(cardKey).filter(Boolean);
 const extras=current.filter(x=>!desired.includes(x));
 const exact=!extras.length&&current.length===desired.length&&desired.every((x,i)=>current[i]===x)&&desired.every(x=>byKey.has(x)&&byKey.get(x)?.dataset?.navParityKey===x);
 if(exact)return audit();
 for(const c of [...grid.querySelectorAll(':scope > .home-card[data-home-page],:scope > .home-card[data-nav-parity-key]')]){const key=cardKey(c);if(key&&!desired.includes(key))c.remove()}
 const logout=grid.querySelector(':scope > [data-home-logout]');
 const frag=document.createDocumentFragment();
 for(const entry of entries){
   let card=byKey.get(entry.key);if(!card||!card.isConnected)card=createCard(entry);
   card.dataset.navParityKey=entry.key;
   frag.appendChild(card);
 }
 grid.insertBefore(frag,logout||null);
 if(logout)grid.appendChild(logout);
 return audit();
}
function schedule(){if(queued)return;queued=true;const run=()=>{queued=false;try{syncHomeCards()}catch(e){console.warn('Beta55 navigation parity sync failed',e)}};if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0)}
function clickGuard(e){
 if(!isRestaurant()||!isHomeActive())return;
 const card=e.target.closest?.('#page .home-card[data-nav-parity-key]');if(!card)return;
 const key=card.dataset.navParityKey;if(!key)return;
 e.preventDefault();e.stopImmediatePropagation();route(key);
}
function start(){
 if(wired)return;wired=true;
 document.addEventListener('click',clickGuard,true);
 observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-hidden']});
 global.addEventListener('sharawla-beta55-integrations-ready',schedule);
 schedule();
 global.__SharawlaBeta55NavigationParity=Object.freeze({version:VERSION,registry:META,topLevelEntries,currentKeys,syncHomeCards,audit,contractAudit,route});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
