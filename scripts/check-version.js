const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function readJson(file) { return JSON.parse(read(file)); }
const pkg = readJson('package.json');
const versionFile = readJson('version.json');
const packageVersion = String(pkg.version || '').trim();
const appVersion = String(versionFile.version || '').trim();
const expectedChannel = packageVersion.includes('-') ? 'beta' : 'stable';
if (!packageVersion) throw new Error('package.json has no version.');
if (packageVersion !== appVersion) throw new Error(`Version mismatch: package.json=${packageVersion}, version.json=${appVersion}`);
if (String(versionFile.channel || '').trim() !== expectedChannel) throw new Error(`Channel mismatch: expected ${expectedChannel}, got ${versionFile.channel}`);
const index = read('index.html');
const sw = read('sw.js');
const app = read('app.js');
if (!/id="appVersionBadge">V—<\/small>/.test(index)) throw new Error('Version badge must be runtime-driven and contain no hardcoded app version.');
for (const asset of ['styles.css','update-indicators.css','version-ui.js','update-ui.js','sharawla-runtime-core.js','restaurant-engine.js','retail-engine.js','retail-website-pos.js','profile-parity-ui.js','app.js']) {
  if (!index.includes(`${asset}?v=${packageVersion}`) && asset !== 'retail-website-pos.js') throw new Error(`index.html cache reference mismatch for ${asset}`);
  if (!sw.includes(`./${asset}?v=${packageVersion}`)) throw new Error(`sw.js cache reference mismatch for ${asset}`);
}
if (!sw.includes(`const CACHE='sharawla-pos-v${packageVersion}';`)) throw new Error('sw.js cache name is not synchronized.');
if (/serviceWorker\.register\('\.\/sw\.js\?v=/.test(app)) throw new Error('app.js still hardcodes a service-worker version.');

// V10.5.4 Part 3 safety invariants.
const main = read('main.js');
const preload = read('preload.js');
const updateUi = read('update-ui.js');
if (!main.includes('function updateOfflineQueueState()')) throw new Error('Part 3 missing Offline Queue Guard state reader.');
if (!main.includes('function createPreUpdateBackup(remoteVersion)')) throw new Error('Part 3 missing pre-update backup creator.');
const backupStart = main.indexOf('function createPreUpdateBackup(remoteVersion)');
const backupEnd = main.indexOf('function updateSafetyInfo()', backupStart);
const backupBody = backupStart >= 0 && backupEnd > backupStart ? main.slice(backupStart, backupEnd) : '';
if (!backupBody) throw new Error('Unable to validate pre-update backup implementation.');
if (backupBody.includes('persistDb()') || backupBody.includes('createBackup(')) throw new Error('Pre-update backup must be independent from persistDb()/createBackup() fixed runtime temp path.');
for (const token of ['db.export()', 'process.pid', 'Date.now()', 'crypto.randomBytes', "fs.openSync(tmp,'wx')", 'fs.fsyncSync(fd)', 'fs.renameSync(tmp,target)', 'fs.constants.COPYFILE_EXCL', "fs.openSync(target,'r+')", 'fs.fsyncSync(finalFd)', 'let targetCreated=false', 'let success=false', 'targetCreated=true', 'success=true', 'if(targetCreated&&!success)try{fs.unlinkSync(target)}catch{}']) {
  if (!backupBody.includes(token)) throw new Error(`Pre-update backup hardening missing: ${token}`);
}
const finalFsync = backupBody.indexOf("fs.openSync(target,'r+')");
const finalVerify = backupBody.indexOf("if(!st.isFile()||st.size!==bytes.length||st.size<=0)");
const markSuccess = backupBody.indexOf('success=true;');
const failedTargetCleanup = backupBody.indexOf('if(targetCreated&&!success)try{fs.unlinkSync(target)}catch{}');
if (!(finalFsync >= 0 && finalVerify > finalFsync && markSuccess > finalVerify && failedTargetCleanup > markSuccess)) {
  throw new Error('Pre-update backup must fsync/verify the final target before success and clean the target on failure.');
}
if ((main.match(/updateOfflineQueueState\(\)/g)||[]).length < 3) throw new Error('Part 3 must check the offline queue before download and again before install.');
if (!main.includes('async function checkForWindowsUpdate({interactive=false,checkOnly=false}={})')) throw new Error('Updater function must explicitly support checkOnly.');
if (!main.includes("checkForWindowsUpdate({interactive:true,checkOnly:true})")) throw new Error('Manual update IPC must invoke checkOnly=true.');
const updaterStart = main.indexOf('async function checkForWindowsUpdate({interactive=false,checkOnly=false}={})');
const availableState = main.indexOf("sendUpdateProgress({state:'available'", updaterStart);
const checkOnlyReturn = main.indexOf('if(checkOnly)return {available:true,checkOnly:true,local,remote,channel};', updaterStart);
const assetSelection = main.indexOf('const assets=Array.isArray(rel.assets)?rel.assets:[];', updaterStart);
const downloadPrompt = main.indexOf("title:'تحديث جديد متاح'", updaterStart);
if (updaterStart < 0 || availableState < 0 || checkOnlyReturn < 0 || assetSelection < 0 || downloadPrompt < 0) throw new Error('Unable to validate Manual Check control flow.');
if (!(availableState < checkOnlyReturn && checkOnlyReturn < assetSelection && checkOnlyReturn < downloadPrompt)) throw new Error('Manual Check checkOnly return must occur before asset selection and any download/install dialog.');
if (!main.includes("state:'blocked-offline'")) throw new Error('Part 3 missing blocked-offline updater state.');
if (!main.includes("state:'backup-ready'")) throw new Error('Part 3 missing backup-ready updater state.');

// Gate C must exist in the exact final-install path: explicit Install Now -> final queue read -> blocking guard -> installer spawn.
const readyResponse = main.indexOf('if(ready.response===0){', updaterStart);
const finalQueueRead = main.indexOf('const finalBeforeSpawn=updateOfflineQueueState();', readyResponse);
const finalQueueGuard = main.indexOf('if(!finalBeforeSpawn.clear){', finalQueueRead);
const finalBlockedReturn = main.indexOf("stage:'final-before-spawn'", finalQueueGuard);
const installerSpawn = main.indexOf("spawn(target,['/S']", finalQueueGuard);
if (readyResponse < 0 || finalQueueRead < 0 || finalQueueGuard < 0 || finalBlockedReturn < 0 || installerSpawn < 0) {
  throw new Error('Part 3 Gate C final instant guard is missing or cannot be validated.');
}
if (!(readyResponse < finalQueueRead && finalQueueRead < finalQueueGuard && finalQueueGuard < finalBlockedReturn && finalBlockedReturn < installerSpawn)) {
  throw new Error('Part 3 Gate C order must be Install Now -> final queue read -> guard/block -> installer spawn.');
}
if (!preload.includes("safety:()=>ipcRenderer.invoke('update:safety')")) throw new Error('Part 3 update safety bridge is missing.');
if (!index.includes('id="updateOfflineQueueValue"')) throw new Error('Part 3 Offline Queue status UI is missing.');
if (!index.includes('id="updateBackupValue"')) throw new Error('Part 3 pre-update backup status UI is missing.');
if (!updateUi.includes('refreshSafety')) throw new Error('Part 3 Update Center safety refresh is missing.');

// V10.5.4-beta.4 UI invariants: Update Center lives on Login, not the authenticated sidebar.
const loginStart = index.indexOf('<section id="loginView"');
const appStart = index.indexOf('<section id="appView"');
const updateEntry = index.indexOf('id="updateCenterMenuBtn"');
if (loginStart < 0 || appStart < 0 || updateEntry < 0 || !(loginStart < updateEntry && updateEntry < appStart)) {
  throw new Error('Update Center entry must be on the Login screen before appView.');
}
if ((index.match(/id="updateCenterMenuBtn"/g)||[]).length !== 1) throw new Error('Update Center entry must exist exactly once.');
if (!app.includes("data?.state==='idle'||data?.state==='up-to-date'")) throw new Error('Bottom desktop update widget must stay hidden for up-to-date state.');

// V10.5.4-beta.10 FINAL MERGED Update Safety invariants.
const indicators = read('update-indicators.css');
for (const forbidden of ['.cart{','.cart-items{','.cart-foot{','.delivery-fields{','.pay-actions{']) {
  if (indicators.includes(forbidden)) throw new Error(`Compact indicator CSS must not change POS layout: ${forbidden}`);
}
for (const token of ['async function verifyInstallerIntegrity(file,asset)','st.size!==expectedSize','expectedAssetSha256(asset)',"crypto.createHash('sha256')","state:'verifying-integrity'","state:'integrity-error'","reason:'integrity-failed'"]) {
  if (!main.includes(token)) throw new Error(`Merged integrity safety missing: ${token}`);
}
const downloadAwait = main.indexOf('await downloadFile(asset.browser_download_url,target', updaterStart);
const integrityAwait = main.indexOf('installerIntegrity=await verifyInstallerIntegrity(target,asset);', downloadAwait);
const gateBRead = main.indexOf('const beforeInstall=updateOfflineQueueState();', integrityAwait);
if (!(downloadAwait >= 0 && integrityAwait > downloadAwait && gateBRead > integrityAwait)) throw new Error('Integrity must run after download and before Gate B.');
for (const token of ['function runLocalHealthChecks(expectedVersion=null,pending=null)','pragma integrity_check',"['kv','local_operations']",'function runPostUpdateHealthCheck()','async function applyRendererHealthReport(report={})',"reason:'core-health-not-passed'",'function markCurrentVersionLastKnownGood','async function rollbackToLastKnownGood({confirmFirst=true}={})',"mode:'rollback'",'function logUpdateEvent(stage,data={})',"update-log.jsonl"]) {
  if (!main.includes(token)) throw new Error(`Merged Update Safety missing: ${token}`);
}
if (!preload.includes("health:r=>ipcRenderer.invoke('update:health',r)")) throw new Error('Renderer health bridge missing.');
if (!preload.includes("rollback:()=>ipcRenderer.invoke('update:rollback')")) throw new Error('Rollback bridge missing.');
if (!app.includes("reportDesktopUpdateHealth(true,'renderer-ready'")) throw new Error('Renderer health success report missing.');
if (!app.includes("session=null;")) throw new Error('Manual login invariant missing.');
for (const id of ['updateIntegrityValue','updateHealthValue','updateLastGoodValue','rollbackLastGoodBtn']) {
  if (!index.includes(`id="${id}"`)) throw new Error(`Update Center missing ${id}.`);
}
const backupReadyForSpawn = main.indexOf("state:'backup-ready'", updaterStart);
const rollbackPrep = main.indexOf("prepareRollbackCandidate({local,remote,backup:preUpdateBackup,installerPath:target,integrity:installerIntegrity,mode:'update'})", backupReadyForSpawn);
const spawnAfterPrep = main.indexOf("spawn(target,['/S']", rollbackPrep);
if (!(backupReadyForSpawn >= 0 && rollbackPrep > backupReadyForSpawn && spawnAfterPrep > rollbackPrep)) throw new Error('Pending update state must be committed after backup and before spawn.');

// V10.5.4-beta.12 FINAL MASTER CANDIDATE — Previous LKG invariants.
for (const token of [
  'previousLastKnownGood:safety.previousLastKnownGood||null',
  'rollbackTarget:rollbackTargetForState(safety)',
  'function rollbackTargetForState(',
  'if(oldLkg?.version&&String(oldLkg.version)!==currentVersion)previous=oldLkg',
  'previousLastKnownGood:previous',
  "previousVersion:previous?.version||null"
]) {
  if (!main.includes(token)) throw new Error(`Previous LKG hardening missing: ${token}`);
}
if (!index.includes('id="updatePreviousGoodValue"')) throw new Error('Update Center must show Previous LKG.');
if (!updateUi.includes("setText('updatePreviousGoodValue'")) throw new Error('Previous LKG UI refresh missing.');
if (!updateUi.includes('info?.rollbackTarget?.version')) throw new Error('Rollback button must show the resolved rollback target.');
const rollbackFnStart = main.indexOf('async function rollbackToLastKnownGood({confirmFirst=true}={})');
const rollbackTargetUse = main.indexOf('const lkg=rollbackTargetForState(state,current);', rollbackFnStart);
const rollbackDownload = main.indexOf("releases/tags/${encodeURIComponent('v'+lkg.version)}", rollbackFnStart);
if (!(rollbackFnStart >= 0 && rollbackTargetUse > rollbackFnStart && rollbackDownload > rollbackTargetUse)) {
  throw new Error('Rollback must resolve Previous/Current LKG target before downloading the installer.');
}

// V10.5.4-beta.15+ Retail foundation invariants.
const runtimeCore = read('sharawla-runtime-core.js');
const restaurantEngine = read('restaurant-engine.js');
const retailEngine = read('retail-engine.js');
const appSource = read('app.js');
const retailInventorySql = read('supabase-v10-5-4-beta15-retail-inventory-foundation.sql');
if (!runtimeCore.includes('bootstrapDefault===true')) throw new Error('Runtime Core must support an explicit bootstrap default engine.');
if (!restaurantEngine.includes('bootstrapDefault:true')) throw new Error('Restaurant must remain the bootstrap compatibility default.');
for (const token of ["code:'retail'","phase:'core-parity-fix-pack'","'home','pos','orders','customers','shifts','inventory','marketSettings','retailOffers','stockCount','transfers','suppliers','purchasing','websiteManagement','returns','expenses','products','reports','users','settings'","orders:'pos'","returns:'returns'","pos:'pos'"]) {
  if (!retailEngine.includes(token)) throw new Error(`Retail foundation missing: ${token}`);
}
for (const forbidden of ["'deliveryOrders'","'deliverySettings'","'delivery'","'kitchen'","'tables'"]) {
  if (retailEngine.includes(forbidden)) throw new Error(`Retail must not expose Restaurant-only page: ${forbidden}`);
}
for (const token of [
  'async function renderRetailPOS()',
  'function findRetailProductByBarcode(code)',
  'function addRetailProductToCart(p,forcedQty=null)',
  "moduleEnabled('barcode')",
  'async function renderRetailInventory()',
  "create_retail_pos_order_atomic",
  "create_retail_order_return_idempotent",
  "retail_inventory_adjust",
  "retail_inventory_set_policy",
  "job.engine==='retail'",
  "step=\"${isRetailProfile()?'0.001':'1'}\""
]) {
  if (!appSource.includes(token)) throw new Error(`Retail inventory implementation missing: ${token}`);
}
for (const token of [
  'create table if not exists public.retail_inventory_balances',
  'quantity numeric(14,3)',
  'create table if not exists public.retail_inventory_movements',
  "movement_type in ('opening','sale','return','adjustment','waste','purchase','supplier_return','transfer_out','transfer_in')",
  'create or replace function public.create_retail_pos_order_atomic',
  'v_result:=public.create_pos_order_atomic',
  'create or replace function public.create_retail_order_return_idempotent',
  'v_return_id:=public.create_order_return_idempotent',
  'create or replace function public.retail_inventory_adjust',
  'create or replace function public.retail_inventory_set_policy'
]) {
  if (!retailInventorySql.includes(token)) throw new Error(`Retail inventory SQL missing: ${token}`);
}
if (!index.includes(`retail-engine.js?v=${packageVersion}`)) throw new Error('Retail Engine must load before app.js.');
if (!(index.indexOf(`restaurant-engine.js?v=${packageVersion}`) < index.indexOf(`retail-engine.js?v=${packageVersion}`) && index.indexOf(`retail-engine.js?v=${packageVersion}`) < index.indexOf(`app.js?v=${packageVersion}`))) {
  throw new Error('Engine script order must be Runtime Core -> Restaurant -> Retail -> app.js.');
}

// V10.5.4 beta.16 Retail Suppliers & Purchasing invariants.
const retailEngineBeta16 = read('retail-engine.js');
const beta16Sql = read('supabase-v10-5-4-beta16-retail-suppliers-purchasing.sql');
for (const token of ["suppliers:'inventory'","purchasing:'inventory'"]) if (!retailEngineBeta16.includes(token)) throw new Error(`beta.16 Retail Engine invariant missing: ${token}`);
for (const token of ['retail_purchase_orders','retail_goods_receipts','retail_purchase_receive','average_unit_cost','supplier_return']) if (!beta16Sql.includes(token)) throw new Error(`beta.16 SQL invariant missing: ${token}`);
for (const token of ['renderRetailSuppliers','renderRetailPurchasing','retail_purchase_order_create','retail_purchase_receive','retail_supplier_return_create']) if (!app.includes(token)) throw new Error(`beta.16 UI invariant missing: ${token}`);

// V10.5.4-beta.17 Retail / Supermarket Market foundation invariants.
const beta17Sql = read('supabase-v10-5-4-beta17-retail-market-core.sql');
for (const token of ['retail_product_settings','retail_offers','retail_suspended_sales','retail_stock_counts','retail_transfers','retail_stock_reservations','retail_catalog','retail_reserve_stock']) {
  if (!beta17Sql.includes(token)) throw new Error(`beta.17 Market SQL invariant missing: ${token}`);
}
for (const token of ['decodeRetailEmbeddedBarcode','retailOfferDiscount','renderRetailMarketSettings','renderRetailOffers','renderRetailStockCount','renderRetailTransfers','retail_suspend_sale']) {
  if (!app.includes(token)) throw new Error(`beta.17 Market UI invariant missing: ${token}`);
}
for (const token of ["marketSettings:'inventory'","retailOffers:'pos'","stockCount:'inventory'","transfers:'inventory'","websiteManagement:'website'"]) {
  if (!retailEngine.includes(token)) throw new Error(`beta.17 Retail Engine invariant missing: ${token}`);
}

// V10.5.4-beta.19 Core Parity invariants.
const parityUi = read('profile-parity-ui.js');
const retailWebsite = read('retail-website-pos.js');
for (const token of ['shiftCloseBlockers','reportOrderTypes']) {
  if (!runtimeCore.includes(token)) throw new Error(`Core parity contract missing: ${token}`);
  if (!restaurantEngine.includes(token)) throw new Error(`Restaurant parity implementation missing: ${token}`);
  if (!retailEngine.includes(token)) throw new Error(`Retail parity implementation missing: ${token}`);
}
for (const token of ['function ean13Valid(raw)','wireRetailShiftClose','enforceRetailReportTypes','[data-prep]']) {
  if (!parityUi.includes(token)) throw new Error(`beta.19 parity UI invariant missing: ${token}`);
}
for (const token of ['showRejectModal','Retail Website','reservation_expires_at']) {
  if (!retailWebsite.includes(token)) throw new Error(`beta.19 Retail Website invariant missing: ${token}`);
}
if (!(index.indexOf(`app.js?v=${packageVersion}`) < index.indexOf(`profile-parity-ui.js?v=${packageVersion}`))) {
  throw new Error('profile-parity-ui.js must load after app.js.');
}

console.log(`Version check OK: ${packageVersion} (${expectedChannel})`);
