const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');

const files=[
  'sharawla-runtime-core.js',
  'restaurant-engine.js',
  'retail-engine.js',
  'retail-website-pos.js',
  'profile-parity-ui.js',
  'beta-self-test.js',
  'app.js'
];

for(const file of files){
  const full=path.join(root,file);
  const source=fs.readFileSync(full,'utf8');
  try{
    // Parse without executing browser globals. This catches syntax errors that
    // token-based static checks cannot detect.
    new Function(source);
  }catch(err){
    throw new Error(`Runtime syntax check failed in ${file}: ${err.message}`);
  }
}

console.log(`Runtime syntax check OK: ${files.join(', ')}`);
