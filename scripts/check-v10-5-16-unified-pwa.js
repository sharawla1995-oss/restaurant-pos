const fs=require('fs'),path=require('path');
const dir='top-burger-unified';
const shared=['styles.css','sharawla-runtime-core.js','restaurant-engine.js','food-recipe-ui-v1.js','food-recipe-runtime-bridge-v10-5-16.js','v10-5-16-restaurant-closure-ui.js','inventory-overview-v10-5-16.js','food-advanced-ui-v10-5-16.js','hr-core-admin-v1.js','hr-attendance-admin-v1.js','v10-5-14-ops-hr-summary.js'];
for(const f of shared){
 const a=fs.readFileSync(f,'utf8'),b=fs.readFileSync(path.join(dir,f),'utf8');
 if(a!==b)throw new Error('shared source drift: '+f);
}
const app=fs.readFileSync(path.join(dir,'app.js'),'utf8');
for(const x of ["enabled_modules:['customers','delivery','expenses','inventory'","'food.prep','food.production','food.waste','food.costing'","business_id:'3e405b6f-feba-4d5c-a4bf-bebb77f2d5d7'"])if(!app.includes(x))throw new Error('browser adapter missing '+x);
const idx=fs.readFileSync(path.join(dir,'index.html'),'utf8');
for(const f of ['app.js','restaurant-engine.js','v10-5-16-restaurant-closure-ui.js','inventory-overview-v10-5-16.js','food-advanced-ui-v10-5-16.js'])if(!idx.includes(f))throw new Error('index missing '+f);
console.log('UNIFIED_DESKTOP_PWA_V10_5_16_SOURCE_PARITY_PASS');