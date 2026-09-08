const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
let db, SQL, mainWindow;
function dataDir(){const d=path.join(app.getPath('userData'),'data');fs.mkdirSync(d,{recursive:true});return d}
function dbPath(){return path.join(dataDir(),'topburger-pos.sqlite')}
function backupDir(){const d=path.join(app.getPath('documents'),'TopBurgerPOS','Backups');fs.mkdirSync(d,{recursive:true});return d}
function persistDb(){if(!db)return;const bytes=db.export();fs.writeFileSync(dbPath(),Buffer.from(bytes))}
async function openDb(){
  SQL=await initSqlJs({locateFile:f=>path.join(__dirname,'node_modules','sql.js','dist',f)});
  const p=dbPath();
  if(fs.existsSync(p)){try{db=new SQL.Database(fs.readFileSync(p))}catch{db=new SQL.Database()}}
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
function registerIpc(){
 ipcMain.handle('db:get',(_e,k)=>{const r=one('select value from kv where key=?',[String(k)]);return r?JSON.parse(r.value):undefined});
 ipcMain.handle('db:set',(_e,k,v)=>run(`insert into kv(key,value,updated_at) values(?,?,datetime('now')) on conflict(key) do update set value=excluded.value,updated_at=datetime('now')`,[String(k),JSON.stringify(v)]));
 ipcMain.handle('ops:put',(_e,op)=>run(`insert into local_operations(client_tx_id,type,payload,status,updated_at) values(?,?,?,'pending',datetime('now')) on conflict(client_tx_id) do update set payload=excluded.payload,updated_at=datetime('now')`,[String(op.client_tx_id),String(op.type),JSON.stringify(op)]));
 ipcMain.handle('ops:list',(_e,status='pending')=>all('select * from local_operations where status=? order by id',[status]).map(r=>({...r,payload:JSON.parse(r.payload)})));
 ipcMain.handle('ops:status',(_e,id,status,error=null)=>run(`update local_operations set status=?,attempts=attempts+1,last_error=?,updated_at=datetime('now') where client_tx_id=?`,[status,error,String(id)]));
 ipcMain.handle('backup:create',()=>createBackup('manual'));
 ipcMain.handle('backup:list',()=>fs.readdirSync(backupDir()).filter(x=>x.endsWith('.sqlite')).sort().reverse());
 ipcMain.handle('desktop:paths',()=>({data:dataDir(),backups:backupDir(),database:dbPath()}));
 ipcMain.handle('print:list',async()=>mainWindow?await mainWindow.webContents.getPrintersAsync():[]);
 ipcMain.handle('print:current',async(_e,opts={})=>new Promise(resolve=>{if(!mainWindow)return resolve({ok:false,error:'window unavailable'});mainWindow.webContents.print({silent:!!opts.silent,deviceName:opts.deviceName||'',printBackground:true},(ok,reason)=>resolve({ok,error:reason||null}))}));
 ipcMain.handle('print:html',async(_e,html,opts={})=>new Promise(resolve=>{const w=new BrowserWindow({show:false,webPreferences:{sandbox:true}});const data='data:text/html;charset=utf-8,'+encodeURIComponent(String(html||''));w.loadURL(data).then(()=>{w.webContents.print({silent:!!opts.silent,deviceName:opts.deviceName||'',printBackground:true,margins:{marginType:'none'}},(ok,reason)=>{try{w.close()}catch{}resolve({ok,error:reason||null})})}).catch(err=>{try{w.close()}catch{}resolve({ok:false,error:String(err&&err.message||err)})})}));
}
function createWindow(){mainWindow=new BrowserWindow({width:1440,height:900,minWidth:1024,minHeight:700,autoHideMenuBar:true,backgroundColor:'#fff',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:false}});mainWindow.loadFile('index.html')}
app.whenReady().then(async()=>{await openDb();registerIpc();try{createBackup('startup');pruneBackups(30)}catch{}createWindow();setInterval(()=>{try{createBackup('auto');pruneBackups(30)}catch{}},10*60*1000);app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()})});
app.on('before-quit',()=>{try{createBackup('close');pruneBackups(30)}catch(e){console.error(e)}});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
