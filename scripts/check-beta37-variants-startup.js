const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const pkg=JSON.parse(read('package.json'));
const m=String(pkg.version||'').match(/^10\.5\.4-beta\.(\d+)$/);
if(!m||Number(m[1])<37)throw new Error(`Expected beta37 or later, got ${pkg.version}`);
const hotfix=read('retail-variants-startup-hotfix.js');
const retail=read('retail-engine.js');
const loader=read('beta36-integration-loader.js');
const sw=read('sw.js');
const sync=read('scripts/sync-version.js');
for(const token of [
 "const KEY='sharawlaRuntimeConfigV1'",
 "includes('commerce.variants')",
 "global.__SharawlaRetailVariantsV1",
 "retail-variants-ui.js?v=${VERSION}",
 "setInterval",
 "retail-variants-runtime-retry"
])if(!hotfix.includes(token))throw new Error(`Variants startup invariant missing: ${token}`);
if(!retail.includes("load('sharawla-retail-variants-startup-hotfix','retail-variants-startup-hotfix.js?v="))throw new Error('Retail Engine must own the Variants startup hotfix loader');
if(loader.includes("retail-variants-startup-hotfix.js?v="))throw new Error('Variants startup hotfix must not be loaded twice by multi-engine loader');
if(!sw.includes("./retail-variants-startup-hotfix.js?v="))throw new Error('Service worker does not cache Variants startup hotfix');
if(!sw.includes("url.pathname.endsWith('/retail-variants-startup-hotfix.js')"))throw new Error('Service worker fetch policy missing Variants startup hotfix');
if(!sync.includes("'retail-variants-startup-hotfix.js'"))throw new Error('Version sync does not include Variants startup hotfix');
if(/function start\(\)\{\s*if\(!ready\(\)\)return/.test(hotfix))throw new Error('Hotfix must poll instead of permanently exiting before runtime config is ready');
console.log(`Beta37+ Variants startup gate OK on ${pkg.version} — single Retail Engine loader`);
