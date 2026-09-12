const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const files=[
 'main-beta23.js','sharawla-runtime-core.js','sharawla-capabilities.js','sharawla-capabilities-beta33.js','sharawla-capabilities-v3.js','sharawla-capability-runtime-bridge.js','sharawla-feature-consumption.js','sharawla-cloud-runtime-v2.js',
 'restaurant-engine.js','retail-engine.js','pharmacy-engine.js','service-engine.js','warehouse-engine.js','membership-engine.js','logistics-engine.js',
 'retail-website-pos.js','profile-parity-ui.js','beta22-runtime-fixes.js','beta23-full-retail.js','retail-finalization-ui.js','beta28-runtime-fixes.js','owner-diagnostics.js','beta29-retail-functional-finalization.js','pharmacy-ui.js',
 'retail-variants-runtime-bridge.js','retail-variants-ui.js','retail-variants-startup-hotfix.js','advanced-purchasing-v1.js',
 'beta36-offline-v2.js','permissions-v2-ui.js','printing-v2.js','landed-cost-posting-v1.js','commerce-orders-v2-ui.js','reports-v2-ui.js','finance-b2b-ui.js','service-v1-ui.js','warehouse-v1-ui.js','membership-v1-ui.js','logistics-v1-ui.js','app.js'
];
for(const file of files){
  const source=fs.readFileSync(path.join(root,file),'utf8');
  try{new vm.Script(source,{filename:file})}catch(err){throw new Error(`Runtime syntax check failed in ${file}: ${err.stack||err.message}`)}
}
console.log(`Runtime syntax check OK: ${files.join(', ')}`);
