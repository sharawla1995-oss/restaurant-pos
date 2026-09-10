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
for (const asset of ['styles.css','update-indicators.css','version-ui.js','update-ui.js','sharawla-runtime-core.js','restaurant-engine.js','app.js']) {
  if (!index.includes(`${asset}?v=${packageVersion}`)) throw new Error(`index.html cache reference mismatch for ${asset}`);
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

console.log(`Version check OK: ${packageVersion} (${expectedChannel})`);
