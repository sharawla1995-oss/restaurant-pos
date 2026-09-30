'use strict';
const fs=require('fs'),assert=require('assert'),vm=require('vm');

const app=fs.readFileSync('app.js','utf8');
const beta54=fs.readFileSync('beta54-shared-core-ui.js','utf8');
const hr=fs.readFileSync('hr-attendance-admin-v1.js','utf8');
const product=fs.readFileSync('product-map-navigation-v1.js','utf8');

const helper=app.match(/function isServerNumericId\(value\)\{[^}]+\}/);
assert(helper,'server numeric-id helper must exist');
const sandbox={};vm.createContext(sandbox);
vm.runInContext(helper[0]+';this.isServerNumericId=isServerNumericId;',sandbox);
assert.strictEqual(sandbox.isServerNumericId(842),true);
assert.strictEqual(sandbox.isServerNumericId('841'),true);
assert.strictEqual(sandbox.isServerNumericId('offline-dc734039-b28b'),false);
assert.strictEqual(sandbox.isServerNumericId('offline-shift-x'),false);
assert.strictEqual(sandbox.isServerNumericId(null),false);

assert(app.includes(".map(x=>x.id).filter(isServerNumericId);"),'shift payment query must filter order IDs');
assert(app.includes("returnIdsForPayments=(await rest('returns'"),'shift return-payment boundary must be explicit');
assert(app.includes("const ids=(orders||[]).map(o=>o.id).filter(isServerNumericId);"),'shift report order-item IDs must be server-only');
assert(app.includes("const returnIds=(returnRows||[]).map(r=>r.id).filter(isServerNumericId);"),'shift report return-item IDs must be server-only');
assert(app.includes("universalDashboardActionPermissionCache.has(key))return universalDashboardActionPermissionCache.get(key);if(navigator.onLine===false)return false"),'Dashboard resolved action permission must survive offline transition');

assert(beta54.includes("if(values[i].resolved)perms[c]=values[i].allowed"),'Beta54 permission refresh must preserve prior state on network loss');
assert(beta54.includes("typeof global.isAdmin==='function'&&global.isAdmin()"),'Beta54 admin routes must remain available without live permission RPC');

assert(hr.includes("const HR_NAV_KEYS=Object.freeze(['employees','attendance','schedules','leaves','advances','adjustments','rules','payroll','reports','settings']);"),'Sharawla HR grouped ownership missing');
assert(hr.includes("if(values[index].resolved)perms[code]=values[index].allowed"),'HR permission refresh must preserve prior state on network loss');
assert(product.includes("'__hr_group__','employees','advances','adjustments','payroll'"),'HR group must occupy canonical product-map slot');

const settingsRepaints=(app.match(/finally\{await renderDeliverySettings\(\)\}/g)||[]).length;
const deliveryRepaints=(app.match(/finally\{await renderDelivery\(\)\}/g)||[]).length;
assert.strictEqual(settingsRepaints,2,'driver+zone settings saves must repaint local projection');
assert.strictEqual(deliveryRepaints,2,'driver+zone delivery saves must repaint local projection');

console.log('RC1 runtime/navigation alignment PASS — local IDs isolated; HR grouped; permissions sticky; delivery RAW repaint=4');
