const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const pkg=JSON.parse(read('package.json'));
const version=String(pkg.version||'');
if(!/-beta(?:\.|$)/i.test(version))throw new Error('Beta Self-Test Center must only ship from a beta package version.');
const src=read('beta-self-test.js');
const index=read('index.html');
const sw=read('sw.js');
new Function(src);
if(!index.includes(`beta-self-test.js?v=${version}`))throw new Error('beta-self-test.js is not loaded by index.html with current version.');
if(!sw.includes(`./beta-self-test.js?v=${version}`))throw new Error('beta-self-test.js is not cached by sw.js with current version.');
if(!(index.indexOf(`app.js?v=${version}`)<index.indexOf(`beta-self-test.js?v=${version}`)))throw new Error('Beta Self-Test must load after app.js.');
for(const token of ['Safe Read-Only Mode','safe_mode:true','read_only:true','Runtime Engine','Runtime Config','Business Connection','Multi-Industry Profile Isolation','Offline V2 API Surface','Offline V2 Native Store','Outbox Integrity','Takeover / Transport State','Inbox Exactly-Once','Inventory Ledger','Safety Guard','Startup Recovery','Diagnostics / Support Bundle','Update Safety V2','Capability / Food Runtime Readiness','Notification Sound','Printer Output']){
  if(!src.includes(token))throw new Error(`Self-Test invariant missing: ${token}`);
}
if(src.includes("const VERSION='10.5.4-beta.21'"))throw new Error('Beta Self-Test still uses obsolete beta.21 version marker.');
for(const forbidden of ['delete from','truncate table','drop table','service_role','SH-0005','SH-0006','removeQueuedOperation(']){
  if(src.toLowerCase().includes(forbidden.toLowerCase()))throw new Error(`Self-Test contains forbidden token: ${forbidden}`);
}
console.log(`Beta Self-Test Phase9 profile-aware read-only gate OK: ${version}`);
