'use strict';
// Top Chicken SH-0008 source-only safety: never copy over a live SQLite file.
// This module has no cloud, updater, device, tenant, or queue access.
const path=require('node:path');
const crypto=require('node:crypto');

const SQLITE_HEADER=Buffer.from('SQLite format 3\0','binary');

function assertSqliteHealthy(SQL,bytes,label){
  if(!bytes||bytes.length<=SQLITE_HEADER.length||
     !Buffer.from(bytes).subarray(0,SQLITE_HEADER.length).equals(SQLITE_HEADER)){
    throw new Error('SQLITE_INVALID_HEADER: '+label);
  }
  let probe;
  try{
    probe=new SQL.Database(bytes);
    const rows=probe.exec('PRAGMA integrity_check;');
    if(rows.length!==1||rows[0].values.length!==1||
       rows[0].values[0].length!==1||rows[0].values[0][0]!=='ok'){
      throw new Error('SQLITE_INTEGRITY_FAILED: '+label);
    }
  }catch(e){
    throw new Error('SQLITE_INVALID: '+label+' ('+String(e&&e.message||e)+')');
  }finally{
    if(probe)probe.close();
  }
}

function atomicReplace({fs,SQL,target,bytes}){
  const data=Buffer.from(bytes);
  assertSqliteHealthy(SQL,data,'stage');
  const tmp=target+'.tmp-'+process.pid+'-'+Date.now()+'-'+crypto.randomBytes(4).toString('hex');
  let fd;
  try{
    fd=fs.openSync(tmp,'wx',0o600);
    try{
      fs.writeFileSync(fd,data);
      // An fsync failure MUST abort; it is not an optional best effort.
      fs.fsyncSync(fd);
    }finally{
      fs.closeSync(fd);
      fd=undefined;
    }
    const staged=fs.readFileSync(tmp);
    if(staged.length!==data.length||
       !crypto.timingSafeEqual(crypto.createHash('sha256').update(staged).digest(),
                               crypto.createHash('sha256').update(data).digest())){
      throw new Error('SQLITE_STAGE_HASH_MISMATCH');
    }
    assertSqliteHealthy(SQL,staged,'disk stage');
    // Same-directory rename: no truncation/copy into the existing live file.
    // On Windows a locked destination may reject rename; fail closed instead.
    fs.renameSync(tmp,target);
  }finally{
    if(fd!==undefined){try{fs.closeSync(fd)}catch{}}
    // Preserve the original main/lastgood, never leave a 4MB stage per retry.
    try{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}catch{}
  }
}

function createProtectedSqliteStore({fs,SQL,mainPath,lastGoodPath}){
  if(!fs||!SQL||!mainPath||!lastGoodPath||mainPath===lastGoodPath){
    throw new Error('SQLITE_STORE_CONFIG_INVALID');
  }
  let writeBlocked=false;
  function open(){
    if(fs.existsSync(mainPath)){
      const bytes=fs.readFileSync(mainPath);
      // No silent empty DB and no automatic lastgood replay: operations
      // after lastgood could be unacknowledged; require operator recovery.
      assertSqliteHealthy(SQL,bytes,'main; restore a verified snapshot manually');
      return new SQL.Database(bytes);
    }
    if(fs.existsSync(lastGoodPath)){
      throw new Error('SQLITE_MAIN_MISSING_WITH_LASTGOOD: recovery required');
    }
    // Existing abandoned temp files mean a previous DB existed.
    const stem=path.basename(mainPath)+'.tmp-';
    if(fs.readdirSync(path.dirname(mainPath)).some(n=>n.startsWith(stem))){
      throw new Error('SQLITE_MAIN_MISSING_WITH_TEMP: recovery required');
    }
    return new SQL.Database();
  }
  function persist(db){
    if(writeBlocked)throw new Error('SQLITE_WRITES_BLOCKED_AFTER_FAILURE');
    try{
      const next=Buffer.from(db.export());
      assertSqliteHealthy(SQL,next,'export');
      if(fs.existsSync(mainPath)){
        const prior=fs.readFileSync(mainPath);
        // Do not contaminate lastgood with the corrupt main DB.
        assertSqliteHealthy(SQL,prior,'current main');
        atomicReplace({fs,SQL,target:lastGoodPath,bytes:prior});
      }
      atomicReplace({fs,SQL,target:mainPath,bytes:next});
      const written=fs.readFileSync(mainPath);
      if(!written.equals(next))throw new Error('SQLITE_MAIN_POST_RENAME_MISMATCH');
      return true;
    }catch(e){
      // Memory has possibly changed; do not accept more writes after a
      // failed disk persist. A fresh process/reconciliation is necessary.
      writeBlocked=true;
      throw e;
    }
  }
  return {open,persist,isWriteBlocked:()=>writeBlocked};
}

module.exports={createProtectedSqliteStore,assertSqliteHealthy};
