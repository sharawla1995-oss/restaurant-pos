const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const files=['sharawla-runtime-core.js','restaurant-engine.js','retail-engine.js','retail-website-pos.js','profile-parity-ui.js','beta-self-test.js','beta22-runtime-fixes.js','beta23-full-retail.js','beta23-candidate-self-test.js','app.js'];
for(const file of files){const source=fs.readFileSync(path.join(root,file),'utf8');try{new Function(source)}catch(err){throw new Error(`Runtime syntax check failed in ${file}: ${err.message}`)}}
console.log(`Runtime syntax check OK: ${files.join(', ')}`);
