'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('app.js'),html=read('top-chicken-pos/index.html'),
  boot=read('top-chicken-pos/tc-pwa-boot.js'),
  sw=read('top-chicken-pos/sw.js');
const mf=JSON.parse(read('top-chicken-pos/manifest.webmanifest'));
for(const [p,s] of [['app.js',app],['top-chicken-pos/tc-pwa-boot.js',boot],['top-chicken-pos/sw.js',sw]])
  new Function(s);
assert.equal(mf.display,'standalone');
assert.equal(mf.scope,'./');
assert(mf.icons.some(x=>x.sizes==='192x192')&&mf.icons.some(x=>x.sizes==='512x512'));
assert(html.includes('href="./manifest.webmanifest"'));
assert(html.indexOf('src="./tc-pwa-boot.js"')<html.indexOf('src="../app.js'));
assert(html.includes('id="tcPwaInstall"'));
assert(app.includes("url:'https://xihcxydjnzemflhedzor.supabase.co'"));
assert(app.includes("TOP_CHICKEN_PWA_BRANCH_ID=22"));
assert(app.includes("Number(member.branch_id)!==TOP_CHICKEN_PWA_BRANCH_ID"));
assert(app.includes("Number(member.business_id)")===false); // strict UUID string
assert(app.includes("String(member.business_id)!==TOP_CHICKEN_PWA_BUSINESS_ID"));
assert(app.includes("if(method!=='GET'&&!authFlow&&!permissionRead)"));
assert(app.includes("async function syncOfflineQueue(){if(TOP_CHICKEN_PWA_PREVIEW)return;"));
for(const writer of ['saveOfflineSale','saveOfflineExpense','saveOfflineReturn','saveOfflineShiftOpen','saveOfflineShiftClose'])
  assert(new RegExp('async function '+writer+'\\([^)]*\\)\\{if\\(TOP_CHICKEN_PWA_PREVIEW\\)').test(app),writer+' must be blocked in preview');
assert(boot.includes('window.fetch=function(input,init)'));
assert(boot.includes("if(method!=='GET'&&method!=='HEAD')")); // fail closed globally
assert(!boot.includes("requestUrl.origin===betaOrigin||requestUrl.origin===centralOrigin"));
assert(boot.includes('!authorizedAuthFlow&&!readonlyPermission'));
assert(sw.includes("key.startsWith('tc-pwa-branch22-')"));
assert(sw.includes("if(event.request.method!=='GET')return"));
assert(sw.includes("if(!isNavigation&&!shellResource)return"));
assert(!sw.includes('caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE)'));
assert(!html.includes('href="styles.css?'));
assert(app.includes('TOP_BURGER_WEB_CONNECTION'));
console.log('TOP_CHICKEN_BRANCH22_FULL_POS_PWA_STATIC_PASS');
