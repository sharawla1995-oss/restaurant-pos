'use strict';
const fs=require('fs');
const p=x=>'top-burger-mobile/'+x;
const read=x=>fs.readFileSync(p(x),'utf8');
const fail=(m)=>{throw new Error(m)};
const has=(src,t,m)=>{if(!src.includes(t))fail(m||('missing '+t))};

const app=read('app.js');
const index=read('index.html');
const sw=read('sw.js');
const engine=read('restaurant-engine.js');
const core=read('sharawla-runtime-core.js');
const styles=read('styles.css');
const recipe=read('food-recipe-ui-v1.js');
const hrCore=read('hr-core-admin-v1.js');
const hrAttendance=read('hr-attendance-admin-v1.js');
const v14=read('v10-5-14-ops-hr-summary.js');
const readme=read('README.md');

for(const asset of [
 'styles.css','sharawla-runtime-core.js','restaurant-engine.js','food-recipe-ui-v1.js',
 'app.js','hr-core-admin-v1.js','hr-attendance-admin-v1.js','v10-5-14-ops-hr-summary.js'
]) has(index,asset+'?v=topburger-10.5.15-mt1.2','index missing stamped '+asset);

has(index,'V10.5.15 Mobile','mobile version badge');
has(sw,"top-burger-mobile-10.5.15-mt1-2",'service-worker cache generation');
for(const asset of ['food-recipe-ui-v1.js','hr-core-admin-v1.js','hr-attendance-admin-v1.js','v10-5-14-ops-hr-summary.js'])has(sw,asset,'service-worker missing '+asset);

if(app.includes("business_id:'top-burger-mobile'"))fail('hardcoded fake browser business id remains');
has(app,"const BROWSER_BUSINESS_ID_KEY='sharawlaBrowserBusinessIdV1'",'canonical browser business id storage');
has(app,"business_id:businessId",'browser runtime canonical business binding');
has(app,"'X-Sharawla-Business':businessId",'tenant selector header');
has(index,'id="businessId"','canonical business UUID setup field');
has(app,"rpc('update_website_settings_v1',payload)",'tenant-local website settings RPC');
has(app,'${activeTenantBusinessId()}/products/','tenant-prefixed product image path');
has(app,'${activeTenantBusinessId()}/branding/','tenant-prefixed business logo path');
has(app,"...tenantIdentityHeaders(),'Content-Type':file.type",'storage request tenant selector');
if(app.includes("rest('business_settings','select=*&id=eq.1&limit=1')"))fail('legacy business settings id=1 read remains');
if(app.includes("rest('website_settings','select=*&id=eq.1&limit=1')"))fail('legacy website settings id=1 read remains');
if(app.includes("const row={id:1,theme_name:theme"))fail('legacy website settings id=1 write remains');
has(app,"enabled_modules:['customers','delivery','expenses','kitchen','pickup','pos','promocodes','reports','returns','website']", 'mobile module snapshot');
has(app,"enabled_features:['food.ingredients','food.recipes']", 'mobile feature snapshot');
has(app,'function modifierCount','exact extra quantity helper');
has(app,'function payloadItemModifiers','exact extra persistence');
has(app,'quantity&order_item_id=in.','modifier quantity reload');
has(app,'receiptModifierHTML','modifier receipt renderer');
has(app,'الإضافات الداخلية','shift internal extras section');
has(app,'الإضافات الخارجية','shift external extras section');
has(app,"window.dispatchEvent(new Event('sharawla:auth-ready'))",'auth-ready event');
has(app,'confirmDeliveryPaymentAtHandover','delivery handover payment confirmation');

has(engine,"foodRecipes:'food.recipes'",'recipe feature gate');
has(core,'function featureEnabled','runtime feature engine');
has(recipe,"const VERSION='food-recipe-ui-v1.2-production'",'stable recipe UI');
has(engine,'branch.hr.finance.disburse','branch HR finance permission');
has(hrAttendance,'sharawla:hr-nav-ready','immediate HR navigation signal');
has(v14,"const VERSION='10.5.15'",'v15 extension runtime');
has(v14,"dataset.v14Page='hr'",'single HR hub root');
has(v14,'business_summary_v2','summary V2 integration');

if(index.includes('version-ui.js')||index.includes('update-ui.js'))fail('obsolete beta17 mobile updater still loaded');
has(styles,'.modifier-qty','modifier quantity styles');
has(readme,'10.5.15 parity','parity checkpoint');

console.log('TOP_BURGER_MOBILE_V10_5_15_PARITY_PASS');
