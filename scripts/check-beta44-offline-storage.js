const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const must=(cond,msg)=>{if(!cond)throw new Error(`Beta44 Offline Storage failed: ${msg}`)};

const bridge=read('beta44-offline-storage-recovery.js');
new vm.Script(bridge,{filename:'beta44-offline-storage-recovery.js'});
for(const token of [
  "const VERSION='10.5.4-beta.44'",
  "DB_NAME='topburger-pos-offline-v98'",
  'async function odbGet44',
  'desktop!==undefined&&desktop!==null',
  'return idbGet(k)',
  'async function odbSet44',
  'await idbSet(k,v)',
  'global.odbGet=odbGet44',
  'global.odbSet=odbSet44'
])must(bridge.includes(token),`storage bridge contract missing: ${token}`);

const main44=read('main-beta44.js');
new vm.Script(main44,{filename:'main-beta44.js'});
for(const token of [
  'topburger-pos\\.sqlite\\.tmp',
  'crypto.randomBytes(4)',
  'active.set(file,unique)',
  'original.copyFileSync(mapped(src),dst',
  "require('./main-beta23.js')"
])must(main44.includes(token),`SQLite temp hardening contract missing: ${token}`);
must(!main44.includes("require('./main.js')"),'Beta44 wrapper must preserve Beta23 updater recovery chain');

const finance=read('beta44-finance-b2b-inject-shim.js');
new vm.Script(finance,{filename:'beta44-finance-b2b-inject-shim.js'});
for(const token of ['finance.credit','finance.receivables','finance.collections','finance.aging','commerce.price_tiers','commerce.b2b_orders','__SharawlaFinanceB2B','data-beta44-finance-b2b'])must(finance.includes(token),`Finance shim contract missing: ${token}`);

const index=read('index.html');
const shim=index.indexOf('beta44-finance-b2b-inject-shim.js?v=');
const loader=index.indexOf('beta36-integration-loader.js?v=');
const b43=index.indexOf('beta43-offline-core.js?v=');
const b44=index.indexOf('beta44-offline-storage-recovery.js?v=');
must(shim>=0&&loader>shim,'Finance inject shim must load before Beta36 dynamic Finance module');
must(b43>=0&&b44>b43,'Beta44 storage recovery must load after Beta43 offline core');

const pkg=JSON.parse(read('package.json'));
must(pkg.main==='main-beta44.js','package entrypoint must use Beta44 SQLite hardening wrapper');

console.log('Beta44 Offline Storage recovery gates OK.');
