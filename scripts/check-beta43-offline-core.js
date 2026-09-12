const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const must=(cond,msg)=>{if(!cond)throw new Error(`Beta43 Offline Core failed: ${msg}`)};

const src=read('beta43-offline-core.js');
new vm.Script(src,{filename:'beta43-offline-core.js'});

for(const token of [
  "const VERSION='10.5.4-beta.43'",
  "LOGIN_STORE_KEY='sharawlaOfflineLoginV2'",
  "BOOTSTRAP_PREFIX='bootstrap:v2'",
  'usernameSignIn43',
  'cacheBootstrap43',
  'loadOfflineBootstrap43',
  'saveOfflineShiftOpen43',
  'pendingShiftFor43',
  'syncOfflineQueue43',
  'currentOpenShift43',
  'remapQueuedShift43',
  'jobDependsOnUnresolvedShift43',
  'openPendingSyncCenter43',
  'renderOrders43',
  'offlineOrderNo:v2',
  'Beta43 sync job failed; continuing independent jobs'
])must(src.includes(token),`missing contract: ${token}`);

must(!src.includes("localStorage.removeItem(LOGIN_STORE_KEY)"),'per-user offline enrollment is removed on logout');
must(src.includes("p_shift_id:shiftId"),'offline expense does not preserve local shift identity');
must(src.includes("String(j.local_expense?.shift_id)===String(localId)"),'expense shift remap missing');
must(src.includes("global.topBurgerDesktop?.operations?.put")&&src.includes("global.topBurgerDesktop.operations.put(j)"),'desktop operations payload is not refreshed after remap');
must(src.includes("if(syncBusy||!navigator.onLine||!session?.access_token)return"),'sync mutex guard missing');
must(src.includes("snapshot.sort((a,b)=>Number(a.type!=='shift_open')"),'parent-first sync ordering missing');
must(!/catch\(e\)\{[^}]{0,240}\bbreak\b/.test(src),'sync loop still stops at first failed job');

const index=read('index.html');
const beta28=index.indexOf('beta28-runtime-fixes.js?v=');
const beta43=index.indexOf('beta43-offline-core.js?v=');
must(beta28>=0&&beta43>beta28,'Beta43 runtime must load after Beta28 username runtime');

const sync=read('scripts/sync-version.js');
must(sync.includes("'beta43-offline-core.js'"),'version sync does not wire Beta43 runtime');
const runtimeSyntax=read('scripts/check-runtime-syntax.js');
must(runtimeSyntax.includes("'beta43-offline-core.js'"),'global runtime syntax gate omits Beta43 runtime');
const sw=read('sw.js');
must(sw.includes('./beta43-offline-core.js?v='),'service worker shell omits Beta43 runtime');
must(sw.includes("url.pathname.endsWith('/beta43-offline-core.js')"),'service worker runtime policy omits Beta43 runtime');

console.log('Beta43 Offline Core closure gates OK.');
