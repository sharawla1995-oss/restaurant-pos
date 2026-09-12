const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const p=f=>path.join(root,f);
const pkg=JSON.parse(fs.readFileSync(p('package.json'),'utf8'));
const version=String(pkg.version||'').trim();
if(!version)throw new Error('package.json has no version');
const channel=version.includes('-')?'beta':'stable';
const v=JSON.parse(fs.readFileSync(p('version.json'),'utf8'));v.version=version;v.channel=channel;fs.writeFileSync(p('version.json'),JSON.stringify(v,null,2)+'\n','utf8');
const esc=x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const beta33=['sharawla-capabilities-beta33.js','sharawla-capability-runtime-bridge.js','sharawla-cloud-runtime-v2.js'];
const preCloud=['sharawla-feature-consumption.js'];
const postApp=['beta34-feature-ui.js','beta35-feature-behavior.js'];
const direct=['styles.css','update-indicators.css','version-ui.js','update-ui.js','sharawla-runtime-core.js','sharawla-capabilities.js',...beta33,...preCloud,'restaurant-engine.js','retail-engine.js','pharmacy-engine.js','service-engine.js','warehouse-engine.js','membership-engine.js','logistics-engine.js','app.js',...postApp,'beta36-integration-loader.js','profile-parity-ui.js','beta28-runtime-fixes.js','owner-diagnostics.js','beta29-retail-functional-finalization.js','pharmacy-ui.js'];
const retailDynamic=['retail-website-pos.js','beta22-runtime-fixes.js','beta23-full-retail.js','retail-finalization-ui.js','retail-variants-runtime-bridge.js','retail-variants-ui.js','advanced-purchasing-v1.js'];
const beta36Dynamic=['beta36-offline-v2.js','permissions-v2-ui.js','printing-v2.js','landed-cost-posting-v1.js','commerce-orders-v2-ui.js','reports-v2-ui.js','finance-b2b-ui.js','service-v1-ui.js','warehouse-v1-ui.js','membership-v1-ui.js','logistics-v1-ui.js'];
function ensureBefore(html,asset,anchor){if(html.includes(`${asset}?v=`))return html;const mark=`<script src="${anchor}`;if(!html.includes(mark))throw new Error(`Could not find ${anchor} anchor for ${asset}`);return html.replace(mark,`<script src="${asset}?v=${version}"></script>\n${mark}`)}
function ensureAfter(html,asset,anchor){if(html.includes(`${asset}?v=`))return html;const re=new RegExp(`<script src="${esc(anchor)}\\?v=[^"]+"><\\/script>`);const m=html.match(re);if(!m)throw new Error(`Could not find ${anchor} anchor for ${asset}`);return html.replace(re,`${m[0]}\n<script src="${asset}?v=${version}"></script>`)}
let index=fs.readFileSync(p('index.html'),'utf8');
for(const a of beta33)index=ensureBefore(index,a,'restaurant-engine.js');
for(const a of preCloud)index=ensureBefore(index,a,'sharawla-cloud-runtime-v2.js');
index=ensureAfter(index,'beta34-feature-ui.js','app.js');
index=ensureAfter(index,'beta35-feature-behavior.js','beta34-feature-ui.js');
for(const a of direct)index=index.replace(new RegExp(`${esc(a)}\\?v=[^"]+`,'g'),`${a}?v=${version}`);
fs.writeFileSync(p('index.html'),index,'utf8');

let retail=fs.readFileSync(p('retail-engine.js'),'utf8');
for(const a of retailDynamic)retail=retail.replace(new RegExp(`${esc(a)}\\?v=[^']+`,'g'),`${a}?v=${version}`);
fs.writeFileSync(p('retail-engine.js'),retail,'utf8');

let loader=fs.readFileSync(p('beta36-integration-loader.js'),'utf8');
for(const a of beta36Dynamic)loader=loader.replace(new RegExp(`${esc(a)}\\?v=[^']+`,'g'),`${a}?v=${version}`);
loader=loader.replace(/const VERSION='[^']+';/,`const VERSION='${version}';`);
fs.writeFileSync(p('beta36-integration-loader.js'),loader,'utf8');

let sw=fs.readFileSync(p('sw.js'),'utf8');
sw=sw.replace(/const CACHE='sharawla-pos-v[^']+';/,`const CACHE='sharawla-pos-v${version}';`);
for(const a of [...direct,...retailDynamic,...beta36Dynamic])sw=sw.replace(new RegExp(`\\./${esc(a)}\\?v=[^']+`,'g'),`./${a}?v=${version}`);
fs.writeFileSync(p('sw.js'),sw,'utf8');
console.log(`Version sync OK: ${version} (${channel})`);
