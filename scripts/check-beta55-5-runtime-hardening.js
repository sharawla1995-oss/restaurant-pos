'use strict';
const fs=require('fs');
function read(p){return fs.readFileSync(p,'utf8')}
function ok(cond,msg){if(!cond){console.error('FAIL',msg);process.exitCode=1}else console.log('PASS',msg)}
const hard=read('beta55-5-runtime-hardening.js');
const loader=read('beta36-integration-loader.js');
const app=read('app.js');
const pkg=JSON.parse(read('package.json'));

ok(hard.includes(`const VERSION='${pkg.version}'`),'55.5 hardening synced version');
ok(hard.includes("shifts:Object.freeze({mode:'full'"),'shifts declared full offline');
ok(hard.includes("expenses:Object.freeze({mode:'full-create'"),'expenses offline create contract');
ok(hard.includes("deliverySettings:Object.freeze({mode:'cache-read'"),'delivery settings cache-read contract');
ok(hard.includes("products:Object.freeze({mode:'cache-read'"),'products cache-read contract');
ok(hard.includes("#page .home-grid > .home-card[data-nav-parity-key]"),'non-home navigation leak shield');
ok(hard.includes("activePage()==='home'&&!!document.querySelector('#page > .home-hero')"),'strict true-home scope');
ok(loader.indexOf("['beta55-4-runtime-recovery'")<loader.indexOf("['beta55-5-runtime-hardening'"),'55.5 loads after 55.4 recovery');
ok(loader.includes('beta555RuntimeHardening:true'),'loader advertises 55.5 hardening');
ok(app.includes('async function saveOfflineExpense('),'existing durable offline expense path preserved');
ok(app.includes('async function saveOfflineShiftOpen('),'existing durable offline shift path preserved');
ok(app.includes("async function renderDeliverySettings()"),'delivery settings renderer present');
ok(app.includes("async function renderProducts()"),'products renderer present');
if(process.exitCode)process.exit(process.exitCode);
console.log('Beta55.5 runtime hardening gate PASS');
