const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const pkg=JSON.parse(read('package.json'));
const version=String(pkg.version||'');
if(!/-beta(?:\.|$)/i.test(version))throw new Error('Beta Self-Test Center must only ship from a beta package version.');
const src=read('beta-self-test.js');
new Function(src);
for(const token of ['Safe Read-Only Mode','safe_mode:true','read_only:true','Runtime Engine','Runtime Config','Business Connection','Multi-Industry Profile Isolation','Offline V2 API Surface','Offline V2 Native Store','Outbox Integrity','Takeover / Transport State','Inbox Exactly-Once','Inventory Ledger','Safety Guard','Startup Recovery','Diagnostics / Support Bundle','Update Safety V2','Capability / Food Runtime Readiness','Notification Sound','Printer Output']){
  if(!src.includes(token))throw new Error(`Self-Test invariant missing: ${token}`);
}
if(src.includes("const VERSION='10.5.4-beta.21'"))throw new Error('Beta Self-Test still uses obsolete beta.21 version marker.');
for(const forbidden of ['delete from','truncate table','drop table','service_role','SH-0005','SH-0006','removeQueuedOperation(']){
  if(src.toLowerCase().includes(forbidden.toLowerCase()))throw new Error(`Self-Test contains forbidden token: ${forbidden}`);
}
// Phase 9 prepares the profile-aware self-test source. Phase 10 owns final Beta45
// version/cache wiring so we do not bump or disturb the released Beta44 shell early.
console.log(`Beta Self-Test Phase9 staged profile-aware read-only gate OK: package=${version}`);
