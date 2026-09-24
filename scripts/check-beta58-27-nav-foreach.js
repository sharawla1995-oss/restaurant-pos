const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'app.js'),'utf8');

const bad="function navActive(p){$('#nav button').forEach";
const good="function navActive(p){$$('#nav button').forEach";

if(src.includes(bad)){
  throw new Error('beta58.27 regression: navActive uses single-element $ selector with forEach');
}
if(!src.includes(good)){
  throw new Error('beta58.27 contract missing: navActive must iterate navigation buttons via $$');
}

console.log('beta58.27 navigation forEach corrective PASS');
