'use strict';
// Offline packaging only: Vercel Drop to Deploy wants ONE root index.html.
// No cloud deployment, no database access and no live financial operations.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const dest=path.join(root,'dist-top-chicken-pwa-preview');
const nested=['index.html','tc-pwa-boot.js','manifest.webmanifest','sw.js'];
const shared=[
  'styles.css','sharawla-runtime-core.js','restaurant-engine.js',
  'food-recipe-ui-v1.js','app.js',
  'food-recipe-runtime-bridge-v10-5-16.js',
  'v10-5-16-restaurant-closure-ui.js',
  'inventory-overview-v10-5-16.js','food-advanced-ui-v10-5-16.js',
  'hr-core-admin-v1.js','hr-attendance-admin-v1.js',
  'v10-5-14-ops-hr-summary.js','icon-192.png','icon-512.png'
];
if(fs.existsSync(dest))fs.rmSync(dest,{recursive:true,force:true});
fs.mkdirSync(dest,{recursive:true});
for(const file of nested){
  let source=fs.readFileSync(path.join(root,'top-chicken-pos',file),'utf8');
  // Flatten /top-chicken-pos/ into /; assets now live alongside index.html.
  if(file==='index.html'||file==='sw.js'||file==='manifest.webmanifest')
    source=source.replaceAll('../','./');
  fs.writeFileSync(path.join(dest,file),source,'utf8');
}
for(const file of shared)fs.copyFileSync(path.join(root,file),path.join(dest,file));
fs.writeFileSync(path.join(dest,'robots.txt'),'User-agent: *\nDisallow: /\n');
const index=fs.readFileSync(path.join(dest,'index.html'),'utf8');
const boot=fs.readFileSync(path.join(dest,'tc-pwa-boot.js'),'utf8');
if(!index.includes('href="./manifest.webmanifest">') ||
   !index.includes('src="./tc-pwa-boot.js"') ||
   !index.includes('src="./app.js?v=10.5.19-rc.10"') ||
   !boot.includes("window.__TOP_CHICKEN_PWA_PREVIEW__='top-chicken-branch22-preview-v1'"))
  throw new Error('Root PWA tenant-safe bundle did not pass static integrity checks');
console.log('TOP_CHICKEN_BRANCH22_PWA_ROOT_PACKAGE_PASS files='+(nested.length+shared.length+1));
