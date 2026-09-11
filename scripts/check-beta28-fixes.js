const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const pkg=JSON.parse(read('package.json'));
if(!/^10\.5\.4-beta\.(?:2[89]|[3-9][0-9])$/.test(pkg.version))throw new Error(`Expected Beta28+ compatible version, got ${pkg.version}`);
const index=read('index.html'),fix=read('beta28-runtime-fixes.js'),sync=read('scripts/sync-version.js'),sw=read('sw.js'),syntax=read('scripts/check-runtime-syntax.js'),app=read('app.js');
for(const token of ['اسم المستخدم<input id="email" type="text"','beta28-runtime-fixes.js?v='])if(!index.includes(token))throw new Error(`Beta28 index invariant missing: ${token}`);
for(const token of [
  "action:'login'",
  'اسم المستخدم لا يحتوي على @ أو مسافات',
  "q('#userForm #uEmail')",
  "input.type='text'",
  'HOME_ORDER=',
  "data-home-logout",
  'normalizeOwnerDigits',
  "input.inputMode='numeric'",
  'Owner Private Diagnostics',
  '__SharawlaBeta28Fixes'
])if(!fix.includes(token))throw new Error(`Beta28 runtime fix invariant missing: ${token}`);
for(const forbidden of ['SH-0005','SH-0006','kzokretuuigjhxjzdlmk.supabase.co','OWNER_CODE=','OWNER_PASSWORD=','service_role'])if(fix.toLowerCase().includes(forbidden.toLowerCase()))throw new Error(`Forbidden Beta28 runtime token: ${forbidden}`);
if(!sync.includes("'beta28-runtime-fixes.js'"))throw new Error('Version sync missing beta28-runtime-fixes.js');
if(!sw.includes('./beta28-runtime-fixes.js?v=')||!sw.includes("url.pathname.endsWith('/beta28-runtime-fixes.js')"))throw new Error('Service worker missing Beta28 runtime fixes');
if(!syntax.includes("'beta28-runtime-fixes.js'"))throw new Error('Runtime syntax gate missing Beta28 runtime fixes');
for(const token of ["async function signIn(email,password)","callFunction('smart-function'",'renderUsers()'])if(!app.includes(token))throw new Error(`Protected app integration point missing: ${token}`);
console.log('Beta28 Owner/User/Home regression gate OK on '+pkg.version);
