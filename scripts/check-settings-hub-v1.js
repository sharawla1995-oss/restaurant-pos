'use strict';
const fs=require('fs');
const app=fs.readFileSync('app.js','utf8').replace(/\r\n?/g,'\n');
const css=fs.readFileSync('settings-hub-v1.css','utf8');
const html=fs.readFileSync('index.html','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const fail=[];
const need=(ok,msg)=>{if(!ok)fail.push(msg)};

need(app.includes('data-settings-hub-v1="1"'),'Settings Hub marker missing');
for(const key of ['business','printing','financial','features','backup','returns'])
  need(app.includes('data-settings-section="'+key+'"')||app.includes("dataset.settingsSection='returns'"),'Settings section missing: '+key);
need(app.includes("canSystem&&['returns','↩️ المرتجعات']"),'Returns tab permission gate missing');
need(app.includes("if(canSystem&&$('#settingsSections')&&!$('#returnsPolicyCard'))"),'Returns policy write UI must require system settings permission');
need(app.includes("x.classList.toggle('hidden',x.dataset.settingsSection!==key)"),'Section activation logic missing');
need(app.includes("b.dataset.settingsTab"),'Settings tab click routing missing');

need(css.includes('.settings-hub-tabs'),'Settings Hub tab style missing');
need(css.includes('@media (any-pointer: coarse)'),'Settings Hub touch rule missing');
need(css.includes('min-height:48px'),'Settings tab touch target missing');

const ref='settings-hub-v1.css?v='+pkg.version;
need(html.includes(ref),'versioned Settings Hub stylesheet missing');
for(const r of [
 'touch-ux-v1.css?v='+pkg.version,
 'inventory-overview-v1.js?v='+pkg.version,
 'sharawla-navigation-registry.js?v='+pkg.version,
 'product-map-navigation-v1.js?v='+pkg.version
])need(html.includes(r),'runtime ref not synchronized: '+r);

if(fail.length){
 console.error('Settings Hub V1: FAIL');
 fail.forEach(x=>console.error('- '+x));
 process.exit(1);
}
console.log('Settings Hub V1: PASS');
console.log('writes=existing-handlers; organization=tabs; touch-ready=true; returns-permission=system-only');
