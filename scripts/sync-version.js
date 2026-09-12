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
const runtimeChain=['sharawla-runtime-core.js','sharawla-capabilities.js','sharawla-capabilities-beta33.js','sharawla-capabilities-v3.js','sharawla-capability-runtime-bridge.js','sharawla-feature-consumption.js','sharawla-cloud-runtime-v2.js','restaurant-engine.js'];
const direct=['styles.css','update-indicators.css','version-ui.js','update-ui.js',...runtimeChain,'retail-engine.js','pharmacy-engine.js','service-engine.js','warehouse-engine.js','membership-engine.js','logistics-engine.js','app.js','beta34-feature-ui.js','beta35-feature-behavior.js','beta36-integration-loader.js','profile-parity-ui.js','beta28-runtime-fixes.js','owner-diagnostics.js','beta29-retail-functional-finalization.js','pharmacy-ui.js'];
const retailDynamic=['retail-website-pos.js','beta22-runtime-fixes.js','beta23-full-retail.js','retail-finalization-ui.js','retail-variants-runtime-bridge.js','retail-variants-ui.js','retail-variants-startup-hotfix.js','advanced-purchasing-runtime-bridge.js','advanced-purchasing-v1.js'];
const beta36Dynamic=['beta36-offline-v2.js','permissions-v2-ui.js','printing-v2.js','landed-cost-posting-v1.js','commerce-orders-v2-ui.js','reports-v2-ui.js','finance-b2b-ui.js','service-v1-ui.js','warehouse-v1-ui.js','membership-v1-ui.js','logistics-v1-ui.js','retail-variants-startup-hotfix.js'];
const capabilityRegistry='sharawla-capability-module-registry.js';
const capabilityDynamic=['food-recipe-runtime-bridge.js','food-recipe-ui-v1.js','food-advanced-ui-v1.js'];
let index=fs.readFileSync(p('index.html'),'utf8');
for(const a of direct)if(!index.includes(`${a}?v=`))throw new Error(`Source shell missing required asset before version sync: ${a}`);
let previous=-1;for(const a of runtimeChain){const pos=index.indexOf(`${a}?v=`);if(pos<=previous)throw new Error(`Unsafe Capability V3 source load order at ${a}`);previous=pos}
for(const a of direct)index=index.replace(new RegExp(`${esc(a)}\\?v=[^"]+`,'g'),`${a}?v=${version}`);
fs.writeFileSync(p('index.html'),index,'utf8');

let consumption=fs.readFileSync(p('sharawla-feature-consumption.js'),'utf8');
if(!consumption.includes(`${capabilityRegistry}?v=`))throw new Error('Feature consumption does not bootstrap capability module registry');
consumption=consumption.replace(new RegExp(`${esc(capabilityRegistry)}\\?v=[^']+`,'g'),`${capabilityRegistry}?v=${version}`);
fs.writeFileSync(p('sharawla-feature-consumption.js'),consumption,'utf8');

let registry=fs.readFileSync(p(capabilityRegistry),'utf8');
registry=registry.replace(/const VERSION='[^']+';/,`const VERSION='${version}';`);
for(const a of capabilityDynamic)registry=registry.replace(new RegExp(`${esc(a)}\\?v=[^']+`,'g'),`${a}?v=${version}`);
fs.writeFileSync(p(capabilityRegistry),registry,'utf8');

let retail=fs.readFileSync(p('retail-engine.js'),'utf8');
for(const a of retailDynamic)retail=retail.replace(new RegExp(`${esc(a)}\\?v=[^']+`,'g'),`${a}?v=${version}`);
fs.writeFileSync(p('retail-engine.js'),retail,'utf8');

let loader=fs.readFileSync(p('beta36-integration-loader.js'),'utf8');
for(const a of beta36Dynamic)loader=loader.replace(new RegExp(`${esc(a)}\\?v=[^']+`,'g'),`${a}?v=${version}`);
loader=loader.replace(/const VERSION='[^']+';/,`const VERSION='${version}';`);
fs.writeFileSync(p('beta36-integration-loader.js'),loader,'utf8');

let variantsHotfix=fs.readFileSync(p('retail-variants-startup-hotfix.js'),'utf8');
variantsHotfix=variantsHotfix.replace(/const VERSION='[^']+';/,`const VERSION='${version}';`);
fs.writeFileSync(p('retail-variants-startup-hotfix.js'),variantsHotfix,'utf8');

let sw=fs.readFileSync(p('sw.js'),'utf8');
sw=sw.replace(/const CACHE='sharawla-pos-v[^']+';/,`const CACHE='sharawla-pos-v${version}';`);
for(const a of [...direct,...retailDynamic,...beta36Dynamic,capabilityRegistry,...capabilityDynamic])sw=sw.replace(new RegExp(`\\./${esc(a)}\\?v=[^']+`,'g'),`./${a}?v=${version}`);
fs.writeFileSync(p('sw.js'),sw,'utf8');
console.log(`Version sync OK: ${version} (${channel}) — source wiring already explicit`);
