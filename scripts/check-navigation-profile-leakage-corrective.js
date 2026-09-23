'use strict';

const fs=require('fs');
const path=require('path');
const ROOT=path.join(__dirname,'..');
const registry=require(path.join(ROOT,'sharawla-navigation-registry.js'));

const errors=[];
function read(p){return fs.readFileSync(path.join(ROOT,p),'utf8')}
function must(name,cond){if(!cond)errors.push(name)}
function has(src,token){return src.includes(token)}

const app=read('app.js');
const index=read('index.html');
const recipe=read('food-recipe-ui-v1.js');
const advanced=read('food-advanced-ui-v1.js');
const beta34=read('beta34-feature-ui.js');
const parity=read('beta55-navigation-parity.js');
const closure=read('beta55-restaurant-closure-ui.js');

const routes=new Map((registry.routes||[]).map(r=>[r.routeKey,r]));
for(const key of ['marketSettings','retailOffers']){
  must(key+' remains registered as retail-only',routes.get(key)?.profile==='retail');
}

must('app blocks retail-only routes outside retail profile',
  has(app,"if((page==='marketSettings'||page==='retailOffers')&&!isRetailProfile())return false;")
);

must('shared inventory navigation labels are profile-aware',
  has(app,"function applyProfileNavigationLabels(){") &&
  has(app,"profile==='restaurant'") &&
  has(app,"stockCount:'🧮 جرد الخامات'") &&
  has(app,"transfers:'🔄 تحويلات الخامات'") &&
  has(app,"purchasing:'📥 مشتريات الخامات'") &&
  has(app,"stockCount:'🧮 الجرد'") &&
  has(app,"transfers:'🔄 تحويلات الفروع'") &&
  has(app,"purchasing:'📥 المشتريات والاستلام'")
);
must('profile labels run before role visibility pass',
  has(app,"function applyRoleNavigation(){\n  applyProfileNavigationLabels();")
);

must('marketSettings hidden by default in source shell',
  /<button data-page="marketSettings" class="hidden">/.test(index)
);
must('retailOffers hidden by default in source shell',
  /<button data-page="retailOffers" class="hidden">/.test(index)
);

must('recipe UI has restaurant profile guard',
  has(recipe,"function isRestaurant(){return String(cfg().pos_profile||'').trim().toLowerCase()==='restaurant'}")
);
must('recipe UI has home-active guard',
  has(recipe,"function isHomeActive(){const b=document.querySelector('#nav button[data-page=\"home\"]');return !!b&&b.classList.contains('active')}")
);
must('recipe enabled is restaurant scoped',
  has(recipe,"function enabled(){return isRestaurant()&&(has(F.ingredients)||has(F.recipes))}")
);
must('recipe home injection rejects non-home/non-restaurant',
  has(recipe,"if(!enabled()||!isHomeActive()){if(existing)existing.remove();return}")
);

must('advanced food UI has restaurant profile guard',
  has(advanced,"function isRestaurant(){return String(cfg().pos_profile||'').trim().toLowerCase()==='restaurant'}")
);
must('advanced food UI has home-active guard',
  has(advanced,"function isHomeActive(){const b=document.querySelector('#nav button[data-page=\"home\"]');return !!b&&b.classList.contains('active')}")
);
must('advanced food enabled is restaurant scoped',
  has(advanced,"function enabled(){return isRestaurant()&&Object.values(F).some(has)}")
);
must('advanced food home injection rejects non-home/non-restaurant',
  has(advanced,"if(!enabled()||!isHomeActive()){if(existing)existing.remove();return}")
);

must('beta34 kitchen card has restaurant profile guard',
  has(beta34,"function isRestaurant(){return String(runtimeConfig()?.pos_profile||'').trim().toLowerCase()==='restaurant'}")
);
must('beta34 kitchen card has home-active guard',
  has(beta34,"function isHomeActive(){const b=document.querySelector('#nav button[data-page=\"home\"]');return !!b&&b.classList.contains('active')}")
);
must('beta34 kitchen injection fail-closes outside restaurant home',
  has(beta34,"if(!isRestaurant()||!isHomeActive()||!featureEnabled('food.kitchen')){if(existing)existing.remove();return false}")
);

for(const token of [
  "'page:stockCount':{icon:'🧮',label:'جرد الخامات'",
  "'page:transfers':{icon:'🔄',label:'تحويلات الخامات'",
  "'page:purchasing':{icon:'📥',label:'مشتريات الخامات'"
]){
  must('restaurant parity label '+token,has(parity,token));
}

must('restaurant closure normalizes existing sidebar button labels',
  has(closure,"}b.textContent=`\${icon} \${label}`;return b}")
);

must('Orders V58.3 marker preserved',has(app,'ORDERS-DATE-WINDOW-V58.3'));
must('unknown-route fallback not changed in this corrective',
  has(app,"}[p]||renderPOS)")
);
must('websitePayments deferred permission behavior unchanged',
  has(app,"if(page==='websitePayments')return isAdmin()||allowed.has('financialSettings')||allowed.has('websiteAppearance');")
);

if(errors.length){
  console.error('Navigation Profile Leakage Corrective: FAIL');
  for(const e of errors)console.error(' - '+e);
  process.exit(1);
}
console.log('Navigation Profile Leakage Corrective: PASS');
console.log('retail_profile_leak=blocked; shared_inventory_labels=profile-aware; food_home_injection=restaurant-home-only; restaurant_labels=normalized; orders_v58_3=preserved; unknown_route_fallback=unchanged');
