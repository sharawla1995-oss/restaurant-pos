'use strict';
const fs=require('fs');
const eng=fs.readFileSync('restaurant-engine.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const master=fs.readFileSync('SHARAWLA_MASTER_STATUS.md','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const fail=[]; const need=(ok,msg)=>{if(!ok)fail.push(msg)};
need(eng.includes("['kitchen','👨‍🍳 الوصول إلى شاشة المطبخ']"),'explicit Kitchen permission label missing');
need(app.includes("['enable_kitchen','تفعيل تشغيل المطبخ']"),'explicit Kitchen operational label missing');
need(!eng.includes("['kitchen','المطبخ']"),'ambiguous Kitchen permission label still present');
need(master.includes('food.kitchen_stations'),'Kitchen Stations entitlement code missing');
need(master.includes('Sharawla Admin entitlement'),'Admin entitlement rule missing');
need(master.includes('Station Routing'),'Station Routing contract missing');
need(master.includes('Restaurant / Cafe only'),'profile boundary missing');
need(/^10\.5\.4-beta\.58\.\d+$/.test(pkg.version),'expected Beta58 line');
if(fail.length){console.error('Kitchen labels + capability plan V1: FAIL');fail.forEach(x=>console.error('- '+x));process.exit(1)}
console.log('Kitchen labels + capability plan V1: PASS');
