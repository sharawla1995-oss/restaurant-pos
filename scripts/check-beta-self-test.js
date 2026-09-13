const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const pkg=JSON.parse(read('package.json'));
const version=String(pkg.version||'');
const match=version.match(/^10\.5\.4-beta\.(\d+)$/);
if(!match||Number(match[1])<45)throw new Error(`Offline V2 Self-Test requires 10.5.4-beta.45+, got ${version}`);
const src=read('beta-self-test.js');
const index=read('index.html');
const sw=read('sw.js');
new Function(src);
for(const token of ['Safe Read-Only Mode','safe_mode:true','read_only:true','Runtime Engine','Runtime Config','Business Connection','Multi-Industry Profile Isolation','Offline V2 API Surface','Offline V2 Native Store','Outbox Integrity','Takeover / Transport State','Inbox Exactly-Once','Inventory Ledger','Safety Guard','Startup Recovery','Diagnostics / Support Bundle','Update Safety V2','Capability / Food Runtime Readiness','Notification Sound','Printer Output']){
  if(!src.includes(token))throw new Error(`Self-Test invariant missing: ${token}`);
}
if(!src.includes(`const VERSION='${version}'`))throw new Error('Beta Self-Test version marker is not synchronized to current release version.');
if(!index.includes(`beta-self-test.js?v=${version}`))throw new Error('Beta Self-Test is not wired into the current shell.');
if(!sw.includes(`./beta-self-test.js?v=${version}`))throw new Error('Beta Self-Test is not cached by the current service worker.');
if(!(index.indexOf(`app.js?v=${version}`)<index.indexOf(`beta-self-test.js?v=${version}`)))throw new Error('Beta Self-Test must load after app.js.');
for(const forbidden of ['delete from','truncate table','drop table','service_role','SH-0005','SH-0006','removeQueuedOperation(']){
  if(src.toLowerCase().includes(forbidden.toLowerCase()))throw new Error(`Self-Test contains forbidden token: ${forbidden}`);
}
console.log(`Beta Self-Test current profile-aware read-only gate OK: ${version}`);
