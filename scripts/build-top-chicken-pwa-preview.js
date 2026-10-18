'use strict';
// Pure source-packaging step, NEVER publishes or changes a cloud database.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const dest=path.join(root,'dist-top-chicken-pwa-preview');
const assets=[
  'top-chicken-pos/index.html','top-chicken-pos/tc-pwa-boot.js',
  'top-chicken-pos/manifest.webmanifest','top-chicken-pos/sw.js',
  'styles.css','sharawla-runtime-core.js','restaurant-engine.js',
  'food-recipe-ui-v1.js','app.js',
  'food-recipe-runtime-bridge-v10-5-16.js',
  'v10-5-16-restaurant-closure-ui.js',
  'inventory-overview-v10-5-16.js','food-advanced-ui-v10-5-16.js',
  'hr-core-admin-v1.js','hr-attendance-admin-v1.js',
  'v10-5-14-ops-hr-summary.js','icon-192.png','icon-512.png'
];
if(fs.existsSync(dest))fs.rmSync(dest,{recursive:true,force:true});
for(const file of assets){
  const from=path.join(root,file),to=path.join(dest,file);
  if(!fs.statSync(from).isFile())throw new Error('Missing source asset '+file);
  fs.mkdirSync(path.dirname(to),{recursive:true});
  fs.copyFileSync(from,to);
}
fs.writeFileSync(path.join(dest,'robots.txt'),'User-agent: *\nDisallow: /\n');
console.log('TOP_CHICKEN_BRANCH22_PWA_PACKAGE_PASS files='+assets.length+' path='+path.basename(dest));
