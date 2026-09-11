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
if(!index.includes(`beta-self-test.js?v=${version}`))throw new Error('beta-self-test.js is not loaded by index.html with current version.');
if(!sw.includes(`./beta-self-test.js?v=${version}`))throw new Error('beta-self-test.js is not cached by sw.js with current version.');
if(!(index.indexOf(`app.js?v=${version}`)<index.indexOf(`beta-self-test.js?v=${version}`)))throw new Error('Beta Self-Test must load after app.js.');
for(const token of ['Safe Read-Only Mode','safe_mode:true','Runtime Engine','Runtime Config','Business Connection','Reports Contract','Restaurant Leakage','Update Health','Notification Sound','Printer Output']){
  if(!src.includes(token))throw new Error(`Self-Test invariant missing: ${token}`);
}
for(const forbidden of ['delete from','truncate table','drop table','service_role','SH-0005','SH-0006']){
  if(src.toLowerCase().includes(forbidden.toLowerCase()))throw new Error(`Self-Test contains forbidden token: ${forbidden}`);
}
console.log(`Beta Self-Test safety gate OK: ${version}`);
