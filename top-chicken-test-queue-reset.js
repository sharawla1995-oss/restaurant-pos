'use strict';
// SH-0008 Top Chicken Beta-only counterpart of the old SH-0007 / TEST
// "تصفير بيانات الاختبار" button. LOCAL test sync queue only; NO cloud deletes.
// Never reuse the old SH-0007 whitelist or expose a generic queue reset.
const {identify}=require('./top-chicken-update-channel');

function resetTopChickenTestQueue({db,one,persistDb,createBackup,license,fingerprintCandidates,branchId}){
  if(!identify(license, fingerprintCandidates||[]) || Number(branchId)!==22 ||
     (license.support_code && String(license.support_code)!=='SH-0008')){
    throw new Error('تصفير بيانات الاختبار متاح لجهاز SH-0008 / Top Chicken / فرع 22 فقط');
  }
  if(!db||typeof one!=='function'||typeof persistDb!=='function'||typeof createBackup!=='function'){
    throw new Error('قاعدة الجهاز غير جاهزة للتصفير');
  }
  const row=one("SELECT value FROM kv WHERE key='queue'");
  let legacy=[];
  try{legacy=row?JSON.parse(String(row.value)):[]}catch{throw new Error('طابور المزامنة غير قابل للقراءة؛ لم يتم التصفير');}
  if(!Array.isArray(legacy))throw new Error('طابور المزامنة غير صالح؛ لم يتم التصفير');
  const countRow=one("SELECT COUNT(*) AS count FROM local_operations WHERE status NOT IN ('synced','discarded')");
  const active=Number(countRow?.count||0);
  if(!Number.isSafeInteger(active)||active<0)throw new Error('تعذر فحص حركات الجهاز');
  if(!legacy.length&&!active)return {ok:true,cleared_legacy:0,discarded_operations:0,scope:'SH-0008/TOP-CHICKEN/22'};

  // The existing local SQLite backup function preserves a pre-reset recovery point.
  const backup=createBackup('tc-sh0008-test-reset');
  if(!backup)throw new Error('تعذر حفظ نسخة الجهاز قبل تصفير الاختبارات؛ لم يتم التصفير');
  db.run('BEGIN IMMEDIATE TRANSACTION');
  try{
    // Mirrors the old Beta's local-only legacy clear and pending->discarded
    // transition. Synced history, cloud records, orders, license and setup stay.
    db.run("UPDATE local_operations SET status='discarded',last_error='SH-0008 TOP CHICKEN TEST RESET',updated_at=datetime('now') WHERE status NOT IN ('synced','discarded')");
    db.run("INSERT INTO kv(key,value,updated_at) VALUES('queue','[]',datetime('now')) ON CONFLICT(key) DO UPDATE SET value='[]',updated_at=datetime('now')");
    db.run('COMMIT');
  }catch(error){
    try{db.run('ROLLBACK')}catch{}
    throw error;
  }
  persistDb();
  return {ok:true,cleared_legacy:legacy.length,discarded_operations:active,scope:'SH-0008/TOP-CHICKEN/22'};
}
module.exports={resetTopChickenTestQueue};
