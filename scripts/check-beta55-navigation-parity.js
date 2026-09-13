const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const need=(src,token,label)=>{if(!src.includes(token))throw new Error(`Beta55 navigation parity gate failed: ${label||token}`)};
const forbid=(src,token,label)=>{if(src.includes(token))throw new Error(`Beta55 navigation parity gate failed: forbidden ${label||token}`)};

const parity=read('beta55-navigation-parity.js');
for(const token of [
 "const REQUIRED_RESTAURANT_KEYS=['page:foodIngredients','page:foodRecipes','page:foodOperations','page:tables']",
 "'beta54:treasury'","'group:hr'","'custom:supply'",
 "node.matches?.('[data-beta55-hr-group]')","Object.prototype.hasOwnProperty.call(b.dataset,'beta55SupplyPage')",
 'function fallbackKey(b)','return fallbackKey(b)','function fallbackMeta(entry)',
 'function topLevelEntries()','function syncHomeCards()','function contractAudit()','function audit()',
 "document.addEventListener('click',clickGuard,true)","observer.observe(document.body",
 "global.__SharawlaBeta55NavigationParity=Object.freeze"
])need(parity,token,`runtime ${token}`);

const loader=read('beta36-integration-loader.js');
need(loader,"['beta55-navigation-parity','beta55-navigation-parity.js?v=10.5.4-beta.55']",'navigation runtime loader');
need(loader,"['owner-acceptance-beta55-navigation','owner-acceptance-beta55-navigation-v55.js?v=10.5.4-beta.55']",'navigation acceptance loader');
if(loader.indexOf("['beta55-navigation-parity'")>loader.indexOf("['owner-acceptance-beta55-navigation'"))throw new Error('Beta55 navigation parity gate failed: acceptance loads before parity runtime');

const acceptance=read('owner-acceptance-beta55-navigation-v55.js');
for(const token of [
 "id:'beta55.restaurant-navigation-parity'","profile:'restaurant'","level:'quick'","mode:'readonly'","critical:true",
 '__SharawlaBeta55NavigationParity','contractAudit()','syncHomeCards?.()','audit?.()',
 "['page:foodIngredients','page:foodRecipes','page:foodOperations','page:tables']"
])need(acceptance,token,`acceptance ${token}`);

const syntax=read('scripts/check-runtime-syntax.js');
need(syntax,"'beta55-navigation-parity.js'",'runtime syntax registration');
need(syntax,"'owner-acceptance-beta55-navigation-v55.js'",'acceptance syntax registration');

for(const src of [parity,acceptance]){
 forbid(src,'SH-0005','production device isolation');
 forbid(src,'SH-0006','production device isolation');
}
console.log('Beta55 Sidebar ↔ Dashboard navigation parity static gate OK');
