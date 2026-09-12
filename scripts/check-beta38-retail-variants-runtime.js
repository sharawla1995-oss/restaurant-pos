const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const pkg=JSON.parse(read('package.json'));
const m=String(pkg.version||'').match(/^10\.5\.4-beta\.(\d+)$/);
if(!m||Number(m[1])<38)throw new Error(`Beta38+ expected, got ${pkg.version}`);
const retail=read('retail-engine.js');
const hotfix=read('retail-variants-startup-hotfix.js');
const sync=read('scripts/sync-version.js');
const sw=read('sw.js');
if(!retail.includes("load('sharawla-retail-variants-startup-hotfix','retail-variants-startup-hotfix.js?v="))throw new Error('Retail Engine does not load variants startup hotfix');
for(const token of ["retail-variants-ui.js?v=${VERSION}-runtime-ready",'#pHasVariants','#editHasVariants','الاختيارات / الأحجام','data-retail-variants-runtime-retry','commerce.variants'])if(!hotfix.includes(token))throw new Error(`Beta38 variants hotfix invariant missing: ${token}`);
if(!sync.includes("'retail-variants-startup-hotfix.js'"))throw new Error('Version sync does not include variants startup hotfix');
if(!sw.includes('retail-variants-startup-hotfix.js'))throw new Error('Service Worker shell does not cache variants startup hotfix');
try{new Function(hotfix)}catch(e){throw new Error(`Beta38 hotfix syntax error: ${e.message}`)}
console.log('Beta38 Retail Variants runtime gate passed.');
