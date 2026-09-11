const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const files=['main-beta23.js','sharawla-runtime-core.js','restaurant-engine.js','retail-engine.js','retail-website-pos.js','profile-parity-ui.js','beta-self-test.js','beta22-runtime-fixes.js','beta23-full-retail.js','beta23-acceptance-suite.js','retail-finalization-ui.js','beta26-ui-delivery-acceptance.js','app.js'];
for(const file of files){
  const source=fs.readFileSync(path.join(root,file),'utf8');
  try{new vm.Script(source,{filename:file})}catch(err){throw new Error(`Runtime syntax check failed in ${file}: ${err.stack||err.message}`)}
}
console.log(`Runtime syntax check OK: ${files.join(', ')}`);
