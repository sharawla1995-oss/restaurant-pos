const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const json=f=>JSON.parse(read(f));
const pkg=json('package.json'),ver=json('version.json');
const version=String(pkg.version||'').trim();
const channel=version.includes('-')?'beta':'stable';
if(!version)throw new Error('package.json has no version');
if(String(ver.version||'').trim()!==version)throw new Error(`Version mismatch: package=${version}; version.json=${ver.version}`);
if(String(ver.channel||'').trim()!==channel)throw new Error(`Channel mismatch: expected ${channel}; got ${ver.channel}`);
if(pkg.main!=='main-beta44.js')throw new Error('Protected Beta44 storage wrapper must remain package main');
if(!Array.isArray(pkg.build?.files)||!pkg.build.files.includes('!**/*.zip'))throw new Error('Build must exclude nested ZIP files');

const index=read('index.html'),sw=read('sw.js'),app=read('app.js'),main=read('main.js'),main44=read('main-beta44.js'),preload=read('preload.js'),updateUi=read('update-ui.js');
if(!main44.includes("require('./main-beta23.js')"))throw new Error('Beta44 wrapper must preserve Beta23 updater recovery chain');
for(const token of ['topburger-pos\\.sqlite\\.tmp','crypto.randomBytes(4)','active.set(file,unique)'])if(!main44.includes(token))throw new Error(`Beta44 SQLite persistence invariant missing: ${token}`);
if(!/id="appVersionBadge">V—<\/small>/.test(index))throw new Error('Version badge must remain runtime-driven');
const direct=['styles.css','update-indicators.css','version-ui.js','update-ui.js','sharawla-runtime-core.js','sharawla-capabilities.js','restaurant-engine.js','retail-engine.js','pharmacy-engine.js','app.js','profile-parity-ui.js','owner-diagnostics.js','pharmacy-ui.js','beta43-offline-core.js','beta44-finance-b2b-inject-shim.js','beta44-offline-storage-recovery.js'];
for(const asset of direct){if(!index.includes(`${asset}?v=${version}`))throw new Error(`index cache version mismatch: ${asset}`);if(!sw.includes(`./${asset}?v=${version}`))throw new Error(`SW shell version mismatch: ${asset}`)}
for(const asset of ['retail-website-pos.js','beta22-runtime-fixes.js','beta23-full-retail.js','retail-finalization-ui.js'])if(!sw.includes(`./${asset}?v=${version}`))throw new Error(`SW dynamic Retail asset mismatch: ${asset}`);
if(!sw.includes(`const CACHE='sharawla-pos-v${version}';`))throw new Error('Service worker cache name not synchronized');
if(!index.includes(`beta-self-test.js?v=${version}`))throw new Error('Beta45 Self-Test must be loaded with the current beta version');
if(!sw.includes(`./beta-self-test.js?v=${version}`))throw new Error('Beta45 Self-Test must be in the current service-worker shell');
if(!(index.indexOf(`app.js?v=${version}`)<index.indexOf(`beta-self-test.js?v=${version}`)))throw new Error('Beta45 Self-Test must load after app.js');
if(!index.includes(`owner-diagnostics.js?v=${version}`))throw new Error('Owner diagnostics must be loaded globally');
if(!(index.indexOf(`sharawla-runtime-core.js?v=${version}`)<index.indexOf(`sharawla-capabilities.js?v=${version}`)&&index.indexOf(`sharawla-capabilities.js?v=${version}`)<index.indexOf(`restaurant-engine.js?v=${version}`)))throw new Error('Capability registry must load after Runtime Core and before profile engines');
if(!(index.indexOf(`beta44-finance-b2b-inject-shim.js?v=${version}`)<index.indexOf(`beta36-integration-loader.js?v=${version}`)))throw new Error('Beta44 Finance shim must load before Beta36 integration loader');
if(!(index.indexOf(`beta43-offline-core.js?v=${version}`)<index.indexOf(`beta44-offline-storage-recovery.js?v=${version}`)))throw new Error('Beta44 storage recovery must load after Beta43 offline core');

for(const token of ["const canonical=String(st.device_fingerprint||'').trim();",'if(canonical)return [canonical];',"cloudRpc('verify_sharawla_device'","cloudRpc('get_sharawla_business_connection'","if(String(d.business_id)!==String(st.business_id))"])if(!app.includes(token))throw new Error(`Canonical/Business Connection invariant missing: ${token}`);
if(app.includes('MachineGuid'))throw new Error('MachineGuid fallback must not be reintroduced into app runtime');

for(const token of ['function updateOfflineQueueState()','function createPreUpdateBackup(remoteVersion)','async function checkForWindowsUpdate({interactive=false,checkOnly=false}={})',"checkForWindowsUpdate({interactive:true,checkOnly:true})","state:'blocked-offline'","state:'backup-ready'"])if(!main.includes(token))throw new Error(`Protected updater invariant missing: ${token}`);
const updater=main.indexOf('async function checkForWindowsUpdate({interactive=false,checkOnly=false}={})');
const available=main.indexOf("sendUpdateProgress({state:'available'",updater);
const checkOnly=main.indexOf('if(checkOnly)return {available:true,checkOnly:true,local,remote,channel};',updater);
const assets=main.indexOf('const assets=Array.isArray(rel.assets)?rel.assets:[];',updater);
if(!(updater>=0&&available>updater&&checkOnly>available&&assets>checkOnly))throw new Error('Manual checkOnly must return before download asset selection');
const ready=main.indexOf('if(ready.response===0){',updater);
const finalRead=main.indexOf('const finalBeforeSpawn=updateOfflineQueueState();',ready);
const finalGuard=main.indexOf('if(!finalBeforeSpawn.clear){',finalRead);
const finalBlock=main.indexOf("stage:'final-before-spawn'",finalGuard);
const spawn=main.indexOf("spawn(target,['/S']",finalGuard);
if(!(ready>=0&&finalRead>ready&&finalGuard>finalRead&&finalBlock>finalGuard&&spawn>finalBlock))throw new Error('Gate C order must be Install Now -> queue read -> block guard -> spawn');
const backupStart=main.indexOf('function createPreUpdateBackup(remoteVersion)');
const backupEnd=main.indexOf('function updateSafetyInfo()',backupStart);
const backup=backupStart>=0&&backupEnd>backupStart?main.slice(backupStart,backupEnd):'';
for(const token of ['db.export()','process.pid','Date.now()','crypto.randomBytes',"fs.openSync(tmp,'wx')",'fs.fsyncSync(fd)','fs.renameSync(tmp,target)','fs.constants.COPYFILE_EXCL',"fs.openSync(target,'r+')",'success=true','if(targetCreated&&!success)try{fs.unlinkSync(target)}catch{}'])if(!backup.includes(token))throw new Error(`Pre-update backup invariant missing: ${token}`);
if(!preload.includes("safety:()=>ipcRenderer.invoke('update:safety')"))throw new Error('Update safety preload bridge missing');
if(!updateUi.includes('refreshSafety'))throw new Error('Update Center safety refresh missing');
if(!index.includes('id="updateOfflineQueueValue"')||!index.includes('id="updateBackupValue"'))throw new Error('Update Center safety fields missing');

const capabilities=read('sharawla-capabilities.js');
for(const token of ["global.SharawlaCapabilities","logistics.shipments","membership.subscriptions","pharmacy.prescriptions","function validateSelection(values)","function resolveRuntime(config)"])if(!capabilities.includes(token))throw new Error(`Capability foundation missing: ${token}`);

const retail=read('retail-engine.js'),checkout=read('beta23-full-retail.js');
for(const token of ["code:'retail'","phase:'retail-delivery-finalization'","deliveryOrders:'delivery'","deliverySettings:'delivery'","{code:'delivery',label:'توصيل'}"])if(!retail.includes(token))throw new Error(`Retail delivery contract missing: ${token}`);
const allPagesMatch=retail.match(/const ALL_PAGES=Object\.freeze\(\[([^\]]+)\]\)/);
if(!allPagesMatch)throw new Error('Retail ALL_PAGES contract not found');
if(!allPagesMatch[1].includes("'deliveryOrders'")||!allPagesMatch[1].includes("'deliverySettings'"))throw new Error('Retail delivery routes missing from ALL_PAGES');
if(allPagesMatch[1].includes("'kitchen'")||allPagesMatch[1].includes("'tables'"))throw new Error('Retail must not expose kitchen/tables');
for(const token of ["rows('delivery_drivers'","rows('delivery_zones'",'function start(){observe()}'])if(!checkout.includes(token))throw new Error(`Retail POS delivery wiring missing: ${token}`);
if(checkout.includes("rows('drivers'"))throw new Error('Retail POS must use delivery_drivers table');

const pharmacy=read('pharmacy-engine.js'),pharmacyUi=read('pharmacy-ui.js');
for(const token of ["code:'pharmacy'",'pharmacyCatalog','pharmacyBatches','pharmacyPrescriptions','pharmacyInsurance','pharmacyClaims'])if(!pharmacy.includes(token))throw new Error(`Pharmacy profile contract missing: ${token}`);
for(const token of ['create_pharmacy_pos_order_atomic','pharmacy_receive_batch','pharmacy_update_claim_status','allocateBatches'])if(!pharmacyUi.includes(token))throw new Error(`Pharmacy UI contract missing: ${token}`);

const owner=read('owner-diagnostics.js');
for(const token of ['verify_sharawla_owner_diagnostics_access','ACCESS_TTL_MS=30*60*1000',"e.ctrlKey&&e.shiftKey&&e.key==='F12'",'runNegativeStockSandbox'])if(!owner.includes(token))throw new Error(`Owner diagnostics invariant missing: ${token}`);
for(const token of ['OWNER_CODE=','OWNER_PASSWORD=','localStorage.setItem(\'owner','sessionStorage.setItem(\'owner'])if(owner.includes(token))throw new Error(`Owner diagnostics secret persistence forbidden: ${token}`);

console.log(`Sharawla source checks passed for ${version}.`);
