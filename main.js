const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const initSqlJs = require('sql.js');
let db, SQL, mainWindow;
function dataDir(){const d=path.join(app.getPath('userData'),'data');fs.mkdirSync(d,{recursive:true});return d}
function dbPath(){return path.join(dataDir(),'topburger-pos.sqlite')}
function lastGoodDbPath(){return path.join(dataDir(),'topburger-pos.lastgood.sqlite')}
function backupDir(){const d=path.join(app.getPath('documents'),'TopBurgerPOS','Backups');fs.mkdirSync(d,{recursive:true});return d}

function licenseStatePath(){return path.join(dataDir(),'sharawla-license-state.json')}
function readLicenseStateFile(){
  try{const p=licenseStatePath();if(!fs.existsSync(p))return null;const v=JSON.parse(fs.readFileSync(p,'utf8'));return v&&typeof v==='object'?v:null}catch{return null}
}
function writeLicenseStateFile(v){
  const p=licenseStatePath();
  if(v==null){
    try{if(fs.existsSync(p)){try{fs.chmodSync(p,0o600)}catch{}fs.unlinkSync(p)}}catch{}
    // Clean up only stale license temp files; never touch POS database temp files.
    try{for(const n of fs.readdirSync(dataDir()))if(/^sharawla-license-state\.json\.tmp(?:-|$)/.test(n)){try{fs.unlinkSync(path.join(dataDir(),n))}catch{}}}catch{}
    return true;
  }
  const json=JSON.stringify(v);
  // A unique temp name avoids Windows 7 EPERM caused by a stale/locked fixed .tmp file.
  const tmp=`${p}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  let wroteTmp=false;
  try{
    fs.writeFileSync(tmp,json,{encoding:'utf8',flag:'wx'});wroteTmp=true;
    try{const fd=fs.openSync(tmp,'r');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}catch{}
    try{fs.copyFileSync(tmp,p)}catch(copyErr){
      // Fallback for Windows file replacement edge cases. The state is still tied to device fingerprint in Cloud.
      try{if(fs.existsSync(p)){try{fs.chmodSync(p,0o600)}catch{}fs.unlinkSync(p)}}catch{}
      try{fs.renameSync(tmp,p);wroteTmp=false}catch(renameErr){
        try{fs.writeFileSync(p,json,'utf8')}catch{throw copyErr}
      }
    }
    return true;
  }finally{
    if(wroteTmp)try{fs.unlinkSync(tmp)}catch{}
  }
}
function persistDb(){if(!db)return;const bytes=Buffer.from(db.export()),p=dbPath(),tmp=p+'.tmp';try{if(fs.existsSync(p))fs.copyFileSync(p,lastGoodDbPath())}catch{}fs.writeFileSync(tmp,bytes);try{const fd=fs.openSync(tmp,'r');fs.fsyncSync(fd);fs.closeSync(fd)}catch{}fs.copyFileSync(tmp,p);try{fs.unlinkSync(tmp)}catch{}}
async function openDb(){
  SQL=await initSqlJs({locateFile:f=>path.join(__dirname,'node_modules','sql.js','dist',f)});
  const p=dbPath();
  if(fs.existsSync(p)){try{db=new SQL.Database(fs.readFileSync(p))}catch{try{db=new SQL.Database(fs.readFileSync(lastGoodDbPath()))}catch{db=new SQL.Database()}}}
  else if(fs.existsSync(lastGoodDbPath())){try{db=new SQL.Database(fs.readFileSync(lastGoodDbPath()))}catch{db=new SQL.Database()}}
  else db=new SQL.Database();
  db.run(`
create table if not exists kv(key text primary key,value text not null,updated_at text not null default(datetime('now')));
create table if not exists local_operations(id integer primary key autoincrement,client_tx_id text unique not null,type text not null,payload text not null,status text not null default 'pending',attempts integer not null default 0,last_error text,created_at text not null default(datetime('now')),updated_at text not null default(datetime('now')));
create index if not exists local_operations_status_idx on local_operations(status,created_at);
create table if not exists sync_log(id integer primary key autoincrement,client_tx_id text,type text,status text,message text,created_at text not null default(datetime('now')));
`);
  persistDb();
}
function one(sql,params=[]){const s=db.prepare(sql);try{s.bind(params);if(!s.step())return undefined;return s.getAsObject()}finally{s.free()}}
function all(sql,params=[]){const s=db.prepare(sql);const out=[];try{s.bind(params);while(s.step())out.push(s.getAsObject());return out}finally{s.free()}}
function run(sql,params=[]){db.run(sql,params);persistDb();return true}
function stamp(){return new Date().toISOString().replace(/[:.]/g,'-')}
function createBackup(reason='manual'){if(!db)return null;persistDb();const target=path.join(backupDir(),`topburger-pos-${reason}-${stamp()}.sqlite`);fs.copyFileSync(dbPath(),target);return target}
function pruneBackups(max=30){try{const a=fs.readdirSync(backupDir()).filter(x=>x.endsWith('.sqlite')).map(n=>({n,p:path.join(backupDir(),n),t:fs.statSync(path.join(backupDir(),n)).mtimeMs})).sort((a,b)=>b.t-a.t);for(const f of a.slice(max))fs.unlinkSync(f.p)}catch{}}
function saveJsonBackup(json,reason='full'){const target=path.join(backupDir(),`topburger-pos-${reason}-${stamp()}.json`);fs.writeFileSync(target,String(json||''),'utf8');pruneJsonBackups(15);return target}
function pruneJsonBackups(max=15){try{const a=fs.readdirSync(backupDir()).filter(x=>x.endsWith('.json')).map(n=>({p:path.join(backupDir(),n),t:fs.statSync(path.join(backupDir(),n)).mtimeMs})).sort((a,b)=>b.t-a.t);for(const f of a.slice(max))fs.unlinkSync(f.p)}catch{}}


// ===== V10.4.5 GitHub Windows Auto Update =====
const https = require('https');
const { spawn } = require('child_process');
let updateCheckBusy = false;
function readUpdateConfig(){
  try{return JSON.parse(fs.readFileSync(path.join(__dirname,'update-config.json'),'utf8'))}catch{return {enabled:false}}
}
function normalizeUpdateChannel(value){return String(value||'').trim().toLowerCase()==='beta'?'beta':'stable'}
function updateChannelPath(){return path.join(app.getPath('userData'),'update-channel.json')}
function initialUpdateChannel(cfg){
  const version=String(app.getVersion()||'');
  if(/-(?:alpha|beta|rc|preview)(?:[.-]|$)/i.test(version))return 'beta';
  return normalizeUpdateChannel(cfg&&cfg.channel);
}
function readDeviceUpdateChannel(cfg=readUpdateConfig()){
  try{
    const p=updateChannelPath();
    if(fs.existsSync(p)){const row=JSON.parse(fs.readFileSync(p,'utf8'));return normalizeUpdateChannel(row&&row.channel)}
    const channel=initialUpdateChannel(cfg);
    fs.writeFileSync(p,JSON.stringify({channel},null,2),'utf8');
    return channel;
  }catch{return initialUpdateChannel(cfg)}
}
function writeDeviceUpdateChannel(value){
  const channel=normalizeUpdateChannel(value),p=updateChannelPath(),tmp=p+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify({channel},null,2),'utf8');
  fs.copyFileSync(tmp,p);try{fs.unlinkSync(tmp)}catch{}
  return channel;
}
function parseSemver(value){
  const raw=String(value||'').trim().replace(/^v/i,'');
  const m=raw.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if(!m)return null;
  return {raw,major:Number(m[1]),minor:Number(m[2]),patch:Number(m[3]),pre:m[4]?m[4].split('.'):[]};
}
function compareSemver(aValue,bValue){
  const a=parseSemver(aValue),b=parseSemver(bValue);if(!a||!b)return 0;
  for(const k of ['major','minor','patch']){if(a[k]>b[k])return 1;if(a[k]<b[k])return -1}
  if(!a.pre.length&&!b.pre.length)return 0;if(!a.pre.length)return 1;if(!b.pre.length)return -1;
  const n=Math.max(a.pre.length,b.pre.length);
  for(let i=0;i<n;i++){
    if(i>=a.pre.length)return -1;if(i>=b.pre.length)return 1;
    const x=a.pre[i],y=b.pre[i],xn=/^\d+$/.test(x),yn=/^\d+$/.test(y);
    if(xn&&yn){const nx=Number(x),ny=Number(y);if(nx>ny)return 1;if(nx<ny)return -1;continue}
    if(xn&&!yn)return -1;if(!xn&&yn)return 1;if(x>y)return 1;if(x<y)return -1;
  }
  return 0;
}
function isNewerVersion(remote,local){return compareSemver(remote,local)>0}
function releaseVersion(rel){return String(rel&&rel.tag_name||'').trim().replace(/^v/i,'')}
function validRelease(rel){return !!rel&&!rel.draft&&!!parseSemver(releaseVersion(rel))}
async function getReleaseForChannel(cfg,channel){
  const base=`https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
  if(channel==='stable'){
    const rel=await githubJson(`${base}/releases/latest`);
    if(!validRelease(rel)||rel.prerelease)throw new Error('No valid stable release found');
    return rel;
  }
  const rows=await githubJson(`${base}/releases?per_page=50`);
  const releases=(Array.isArray(rows)?rows:[])
    .filter(rel=>validRelease(rel)&&rel.prerelease===true)
    .sort((a,b)=>compareSemver(releaseVersion(b),releaseVersion(a)));
  if(!releases.length)throw new Error('No valid beta prerelease found');
  return releases[0];
}
function githubJson(url){
  return new Promise((resolve,reject)=>{
    const req=https.get(url,{headers:{'User-Agent':'Sharawla-POS-Updater','Accept':'application/vnd.github+json'}},res=>{
      if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();return githubJson(res.headers.location).then(resolve,reject)}
      let body='';res.setEncoding('utf8');res.on('data',c=>body+=c);res.on('end',()=>{
        if(res.statusCode!==200)return reject(new Error('GitHub HTTP '+res.statusCode));
        try{resolve(JSON.parse(body))}catch(e){reject(e)}
      })
    });req.on('error',reject);req.setTimeout(15000,()=>req.destroy(new Error('Update check timeout')))
  })
}
function sendUpdateProgress(payload){
  try{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('update:progress',payload)}catch{}
  try{if(mainWindow&&!mainWindow.isDestroyed()&&payload&&payload.state==='progress'&&Number.isFinite(payload.percent))mainWindow.setProgressBar(Math.max(0,Math.min(1,payload.percent/100)))}catch{}
  if(payload&&['done','downloaded','available','up-to-date','error','idle'].includes(payload.state)){try{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.setProgressBar(-1)}catch{}}
}
function downloadFile(url,target,onProgress){
  return new Promise((resolve,reject)=>{
    let finished=false;
    const fail=e=>{if(finished)return;finished=true;reject(e)};
    const go=u=>{
      const req=https.get(u,{headers:{'User-Agent':'Sharawla-POS-Updater','Accept':'application/octet-stream'}},res=>{
        if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();return go(res.headers.location)}
        if(res.statusCode!==200){res.resume();return fail(new Error('Download HTTP '+res.statusCode))}
        const tmp=target+'.part';try{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}catch{}
        const total=Math.max(0,Number(res.headers['content-length']||0));let received=0,lastPercent=-1;
        const file=fs.createWriteStream(tmp);
        res.on('data',chunk=>{received+=chunk.length;const percent=total?Math.min(100,Math.floor((received/total)*100)):null;if(percent!==lastPercent){lastPercent=percent;try{onProgress&&onProgress({received,total,percent})}catch{}}});
        res.pipe(file);
        file.on('finish',()=>file.close(()=>{if(finished)return;try{if(fs.existsSync(target))fs.unlinkSync(target);fs.renameSync(tmp,target);finished=true;resolve(target)}catch(e){fail(e)}}));
        file.on('error',e=>{try{file.close();if(fs.existsSync(tmp))fs.unlinkSync(tmp)}catch{}fail(e)});
        res.on('error',fail);
      });
      req.on('error',fail);req.setTimeout(120000,()=>req.destroy(new Error('Update download timeout')))
    };go(url)
  })
}
async function checkForWindowsUpdate({interactive=false}={}){
  const cfg=readUpdateConfig();
  const local=app.getVersion();
  const channel=readDeviceUpdateChannel(cfg);

  if(updateCheckBusy){
    const result={busy:true,local,channel};
    if(interactive)sendUpdateProgress({state:'busy',local,channel,message:'يوجد فحص تحديثات جارٍ بالفعل'});
    return result;
  }
  if(!app.isPackaged){
    const result={error:'Update check is available in the installed Windows app only',local,channel};
    if(interactive)sendUpdateProgress({state:'error',local,channel,message:'فحص التحديثات متاح من نسخة Windows المثبتة فقط'});
    return result;
  }
  if(!cfg.enabled||!cfg.owner||!cfg.repo){
    const result={error:'Updater is disabled or repository is not configured',local,channel};
    if(interactive)sendUpdateProgress({state:'error',local,channel,message:'نظام التحديث غير مفعّل في هذه النسخة'});
    return result;
  }

  updateCheckBusy=true;let userAcceptedUpdate=false;
  try{
    sendUpdateProgress({state:'checking',local,channel,message:'جاري فحص التحديثات…'});
    const rel=await getReleaseForChannel(cfg,channel);
    const remote=releaseVersion(rel);

    if(!isNewerVersion(remote,local)){
      sendUpdateProgress({state:'up-to-date',local,remote,channel,message:`أنت على أحدث إصدار V${local}`});
      if(interactive&&mainWindow)await dialog.showMessageBox(mainWindow,{type:'info',title:'تحديث Sharawla POS',message:`أنت على أحدث إصدار V${local}.`,buttons:['تمام']});
      return {available:false,local,remote,channel};
    }

    sendUpdateProgress({state:'available',local,remote,channel,message:`متاح تحديث V${remote}`});

    const assets=Array.isArray(rel.assets)?rel.assets:[];
    const exeAssets=assets.filter(a=>/\.exe$/i.test(a.name||''));
    const wantedArch=process.arch==='ia32'?'ia32':'x64';
    const archPattern=wantedArch==='ia32'?/(?:^|[._-])(?:ia32|x86|win32)(?:[._-]|$)/i:/(?:^|[._-])(?:x64|amd64|win64)(?:[._-]|$)/i;
    let asset=exeAssets.find(a=>archPattern.test(String(a.name||'')));

    // Backward compatibility for old x64-only releases that used a generic EXE name.
    if(!asset&&wantedArch==='x64')asset=exeAssets.find(a=>/Top[ ._-]*Burger[ ._-]*POS/i.test(a.name||''))||exeAssets.find(a=>!/ia32|x86|win32/i.test(String(a.name||'')));
    if(!asset?.browser_download_url)throw new Error(`No Windows ${wantedArch} installer asset found in selected ${channel} release`);

    const ask=await dialog.showMessageBox(mainWindow,{type:'info',title:'تحديث جديد متاح',message:`متاح تحديث Sharawla POS V${remote}`,detail:'سيتم تنزيل التحديث من GitHub ثم تثبيته. لن يتم حذف بيانات الكاشير المحلية.',buttons:['تنزيل وتثبيت','لاحقًا'],defaultId:0,cancelId:1});
    if(ask.response!==0){
      sendUpdateProgress({state:'available',local,remote,channel,skipped:true,message:`التحديث V${remote} متاح — تم التأجيل`});
      return {available:true,skipped:true,local,remote,channel};
    }

    userAcceptedUpdate=true;
    const dir=path.join(app.getPath('userData'),'updates');fs.mkdirSync(dir,{recursive:true});
    const target=path.join(dir,asset.name||`Sharawla-POS-${remote}.exe`);

    sendUpdateProgress({state:'downloading',local,remote,channel,version:remote,percent:0,message:`جاري تنزيل التحديث V${remote}`});
    await downloadFile(asset.browser_download_url,target,p=>sendUpdateProgress({state:'progress',local,remote,channel,version:remote,percent:p.percent,received:p.received,total:p.total,message:p.percent==null?'جاري تنزيل التحديث…':`جاري تنزيل التحديث V${remote} — ${p.percent}%`}));

    sendUpdateProgress({state:'downloaded',local,remote,channel,version:remote,percent:100,message:`تم تنزيل التحديث V${remote}`});

    const ready=await dialog.showMessageBox(mainWindow,{type:'info',title:'التحديث جاهز',message:`تم تنزيل V${remote}`,detail:'اضغط تثبيت الآن. سيغلق البرنامج ويبدأ تثبيت النسخة الجديدة. بيانات الكاشير المحلية والنسخ الاحتياطية لن تُحذف.',buttons:['تثبيت الآن','لاحقًا'],defaultId:0,cancelId:1});
    if(ready.response===0){
      sendUpdateProgress({state:'installing',local,remote,channel,version:remote,percent:100,message:'جاري بدء التثبيت…'});
      try{
        spawn(target,['/S'],{detached:true,stdio:'ignore'}).unref();
        setTimeout(()=>{
          sendUpdateProgress({state:'restarting',local,remote,channel,version:remote,percent:100,message:'سيتم إغلاق البرنامج لإكمال التثبيت…'});
          app.quit();
        },600);
      }catch(e){throw e}
    }else{
      sendUpdateProgress({state:'available',local,remote,channel,version:remote,skipped:true,message:`تم تنزيل V${remote} — التثبيت مؤجل`});
    }

    return {available:true,downloaded:true,local,remote,channel};
  }catch(e){
    console.warn('auto update',e);
    sendUpdateProgress({state:'error',local,channel,message:'فشل تنزيل أو تثبيت التحديث',error:String(e&&e.message||e)});
    if((interactive||userAcceptedUpdate)&&mainWindow)await dialog.showMessageBox(mainWindow,{type:'warning',title:'تحديث Sharawla POS',message:userAcceptedUpdate?'تعذر تنزيل أو بدء تثبيت التحديث.':'تعذر فحص التحديث الآن.',detail:String(e&&e.message||e),buttons:['تمام']});
    return {error:String(e&&e.message||e),local,channel};
  }finally{updateCheckBusy=false}
}
function startUpdateWatch(){
  const cfg=readUpdateConfig();if(!cfg.enabled)return;
  setTimeout(()=>checkForWindowsUpdate().catch(()=>{}),15000);
  const h=Math.max(1,Number(cfg.checkEveryHours||6));
  setInterval(()=>checkForWindowsUpdate().catch(()=>{}),h*60*60*1000);
}


function fingerprintHash(seed){return crypto.createHash('sha256').update(String(seed||'')).digest('hex')}
function deviceFingerprintCandidates(){
  const seeds=[];
  if(process.platform==='win32'){
    try{
      const out=execFileSync('reg',['query','HKLM\\SOFTWARE\\Microsoft\\Cryptography','/v','MachineGuid'],{encoding:'utf8',windowsHide:true,timeout:4000});
      const m=String(out||'').match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i);
      if(m&&m[1].trim())seeds.push('win:'+m[1].trim());
    }catch{}
  }
  // Legacy fallback is kept as a migration candidate only. Once a fingerprint is
  // accepted by Sharawla Cloud, app.js pins that exact value in license state.
  try{seeds.push([process.platform,os.hostname(),os.arch(),app.getPath('userData')].join('|'))}
  catch{seeds.push([process.platform,os.hostname(),os.arch()].join('|'))}
  return [...new Set(seeds.map(fingerprintHash).filter(Boolean))];
}
function stableDeviceFingerprint(){return deviceFingerprintCandidates()[0]||fingerprintHash([process.platform,os.hostname(),os.arch()].join('|'))}
function deviceInfo(){const candidates=deviceFingerprintCandidates();return {fingerprint:candidates[0]||stableDeviceFingerprint(),fingerprint_candidates:candidates,name:os.hostname(),os:`${os.type()} ${os.release()} ${os.arch()}`,version:app.getVersion()}}

function registerIpc(){
 ipcMain.handle('db:get',(_e,k)=>{const r=one('select value from kv where key=?',[String(k)]);return r?JSON.parse(r.value):undefined});
 ipcMain.handle('db:set',(_e,k,v)=>run(`insert into kv(key,value,updated_at) values(?,?,datetime('now')) on conflict(key) do update set value=excluded.value,updated_at=datetime('now')`,[String(k),JSON.stringify(v)]));
 ipcMain.handle('license-state:get',()=>readLicenseStateFile());
 ipcMain.handle('license-state:set',(_e,v)=>writeLicenseStateFile(v));
 ipcMain.handle('license-state:clear',()=>writeLicenseStateFile(null));
 ipcMain.handle('ops:put',(_e,op)=>run(`insert into local_operations(client_tx_id,type,payload,status,updated_at) values(?,?,?,'pending',datetime('now')) on conflict(client_tx_id) do update set payload=excluded.payload,updated_at=datetime('now')`,[String(op.client_tx_id),String(op.type),JSON.stringify(op)]));
 ipcMain.handle('ops:list',(_e,status='pending')=>all('select * from local_operations where status=? order by id',[status]).map(r=>({...r,payload:JSON.parse(r.payload)})));
 ipcMain.handle('ops:status',(_e,id,status,error=null)=>run(`update local_operations set status=?,attempts=attempts+1,last_error=?,updated_at=datetime('now') where client_tx_id=?`,[status,error,String(id)]));
 ipcMain.handle('backup:create',(_e,reason='manual')=>createBackup(String(reason||'manual').replace(/[^a-z0-9_-]/gi,'-')));
 ipcMain.handle('backup:saveJson',(_e,json,reason='full')=>saveJsonBackup(json,String(reason||'full').replace(/[^a-z0-9_-]/gi,'-')));
 ipcMain.handle('backup:list',()=>fs.readdirSync(backupDir()).filter(x=>x.endsWith('.sqlite')).sort().reverse());
 ipcMain.handle('desktop:paths',()=>({data:dataDir(),backups:backupDir(),database:dbPath()}));
 ipcMain.handle('device:info',()=>deviceInfo());
 ipcMain.handle('external:open',async(_e,url)=>{const u=String(url||'');if(!/^https:\/\//i.test(u))throw new Error('invalid external URL');await shell.openExternal(u);return true});
 ipcMain.handle('update:check',()=>checkForWindowsUpdate({interactive:true}));
 ipcMain.handle('update:info',()=>{const cfg=readUpdateConfig();return {version:app.getVersion(),channel:readDeviceUpdateChannel(cfg),enabled:!!cfg.enabled,arch:process.arch};});
 ipcMain.handle('update:setChannel',(_e,value)=>writeDeviceUpdateChannel(value));
 ipcMain.handle('app:info',()=>{const cfg=readUpdateConfig();return {product:'Sharawla POS',version:app.getVersion(),channel:readDeviceUpdateChannel(cfg),arch:process.arch};});
 ipcMain.handle('print:list',async()=>mainWindow?await mainWindow.webContents.getPrintersAsync():[]);
 ipcMain.handle('print:current',async(_e,opts={})=>new Promise(resolve=>{if(!mainWindow)return resolve({ok:false,error:'window unavailable'});mainWindow.webContents.print({silent:!!opts.silent,deviceName:opts.deviceName||'',printBackground:true},(ok,reason)=>resolve({ok,error:reason||null}))}));
 ipcMain.handle('print:html',async(_e,html,opts={})=>new Promise(async resolve=>{const w=new BrowserWindow({show:false,width:420,height:900,webPreferences:{sandbox:true}});try{let deviceName=String(opts.deviceName||'');if(deviceName){const ps=await w.webContents.getPrintersAsync();const wanted=deviceName.trim().toLowerCase();const hit=ps.find(p=>String(p.name||'').trim().toLowerCase()===wanted||String(p.displayName||'').trim().toLowerCase()===wanted);if(hit)deviceName=hit.name}const data='data:text/html;charset=utf-8,'+encodeURIComponent(String(html||''));await w.loadURL(data);setTimeout(()=>{if(w.isDestroyed())return resolve({ok:false,error:'print window closed'});w.webContents.print({silent:!!opts.silent,deviceName,printBackground:true,margins:{marginType:'none'}},(ok,reason)=>{try{w.close()}catch{}resolve({ok,error:reason||null,deviceName})})},300)}catch(err){try{w.close()}catch{}resolve({ok:false,error:String(err&&err.message||err)})}}));
}
function createWindow(){mainWindow=new BrowserWindow({width:1440,height:900,minWidth:1024,minHeight:700,autoHideMenuBar:true,backgroundColor:'#fff',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:false}});mainWindow.loadFile('index.html')}
app.whenReady().then(async()=>{await openDb();registerIpc();try{createBackup('startup');pruneBackups(30)}catch{}createWindow();startUpdateWatch();setInterval(()=>{try{createBackup('auto');pruneBackups(30)}catch{}},10*60*1000);app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()})});
app.on('before-quit',()=>{try{createBackup('close');pruneBackups(30)}catch(e){console.error(e)}});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
