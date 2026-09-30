(function(global){'use strict';
const registry=global.__SharawlaAcceptanceRegistry;
if(!registry?.registerMany)return;
const PROTECTED=Object.freeze([293,304,316]);
registry.registerMany([{
 id:'core.sh0007-readonly-preflight',name:'SH-0007 read-only Offline preflight',pack:'core',profile:'any',level:'quick',mode:'readonly',critical:true,
 features:['offline-v2'],
 async run(){
  const api=global.topBurgerDesktop?.offlineV2;if(!api)throw new Error('Offline V2 desktop API unavailable');
  const [env,health,sync,inbox,guard,outbox]=await Promise.all([registry.environment(),api.health(),api.syncStats(),api.inboxStats(),api.guardState(),api.outbox(null)]);
  const sandbox=env?.sandbox||{};if(sandbox.support_code!=='SH-0007')throw new Error('Read-only preflight requires SH-0007');
  if(health?.ok!==true||health?.backend!=='native-sqlite3'||String(health?.journal_mode||'').toLowerCase()!=='wal'||Number(health?.foreign_keys)!==1)throw new Error('Native Offline health/WAL/FK preflight failed');
  const protectedRows=(Array.isArray(outbox)?outbox:[]).filter(x=>PROTECTED.includes(Number(x?.device_sequence))).map(x=>({device_sequence:Number(x.device_sequence),client_tx_id:x.client_tx_id||null,operation_type:x.operation_type||null,status:x.status||null,attempts:Number(x.attempts||0),last_error_code:x.last_error_code||null}));
  return {status:'PASS',detail:`native WAL/FK PASS; protected evidence observed=${protectedRows.map(x=>x.device_sequence).join(',')||'none'}`,evidence:{read_only:true,protected_sequences:PROTECTED,protected_rows:protectedRows,health,sync,inbox,guard}};
 }
}]);
})(window);
