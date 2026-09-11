const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const pkg=JSON.parse(read('package.json'));
const owner=read('owner-diagnostics.js');
const index=read('index.html');
const retail=read('retail-engine.js');
const checkout=read('beta23-full-retail.js');
const sw=read('sw.js');

if(!/^10\.5\.4-beta\.\d+$/.test(pkg.version))throw new Error(`Unexpected Beta version: ${pkg.version}`);
for(const token of [
  'verify_sharawla_owner_diagnostics_access',
  'device_fingerprint',
  'ACCESS_TTL_MS=30*60*1000',
  "e.ctrlKey&&e.shiftKey&&e.key==='F12'",
  'Sharawla Owner Diagnostics',
  'runNegativeStockSandbox',
  'Negative Stock Enforcement',
  'ownerDiagnosticsNav',
  'navigator.clipboard.writeText'
])if(!owner.includes(token))throw new Error(`Owner diagnostics invariant missing: ${token}`);
for(const forbidden of ['OWNER_CODE=','OWNER_PASSWORD=','ownerDiagnosticCode=','localStorage.setItem(\'owner','sessionStorage.setItem(\'owner'])if(owner.includes(forbidden))throw new Error(`Owner diagnostic secret/persistence risk: ${forbidden}`);
if(!index.includes(`owner-diagnostics.js?v=${pkg.version}`))throw new Error('Owner diagnostics is not versioned/loaded from index.html');
if(index.includes('beta-self-test.js?v='))throw new Error('Public Beta Self-Test must not be loaded in Beta27 runtime');
if(!sw.includes(`./owner-diagnostics.js?v=${pkg.version}`)||!sw.includes("url.pathname.endsWith('/owner-diagnostics.js')"))throw new Error('Owner diagnostics missing from service worker runtime policy');
if(retail.includes('beta23-acceptance-suite.js?v=')||retail.includes('beta26-ui-delivery-acceptance.js?v='))throw new Error('Legacy visible diagnostic suites must not auto-load in Retail runtime');
for(const token of ["deliveryOrders:'delivery'","deliverySettings:'delivery'","'deliveryOrders','deliverySettings'","['🛵 الدليفري',['deliveryOrders','deliverySettings']]","phase:'retail-delivery-finalization'"])if(!retail.includes(token))throw new Error(`Retail Delivery Module contract missing: ${token}`);
if(retail.includes("'kitchen'",retail.indexOf('ALL_PAGES'))||retail.includes("'tables'",retail.indexOf('ALL_PAGES')))throw new Error('Retail ALL_PAGES must not expose kitchen/tables');
for(const token of ["rows('delivery_drivers'","rows('delivery_zones'",'function start(){observe()}','<option value="delivery">دليفري / توصيل</option>'])if(!checkout.includes(token))throw new Error(`Retail checkout delivery wiring missing: ${token}`);
if(checkout.includes("rows('drivers'"))throw new Error('Retail checkout still queries legacy drivers table');
console.log('Owner diagnostics + Retail delivery gate OK');
