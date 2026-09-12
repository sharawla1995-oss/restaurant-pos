'use strict';

// Sharawla Offline Engine V2 — Phase 5 sync protocol.
// Pure protocol/state-machine code. Network transport and durable storage are
// injected so the same rules can be acceptance-tested without touching runtime.
const PROTOCOL_VERSION=2;
const DEFAULTS=Object.freeze({
  staleInFlightMs:60_000,
  retryDelaysMs:Object.freeze([5_000,15_000,30_000,60_000,300_000]),
  maxRetryMs:300_000,
  jitterRatio:0.20,
  maxProtocolAttempts:5,
  maxTransientAttempts:12,
  maxPerRun:100
});

function text(v){return String(v??'').trim()}
function num(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function iso(ms){return new Date(ms).toISOString()}
function err(code,message,kind='protocol'){const e=new Error(message);e.code=code;e.kind=kind;return e}

function validateAck(event,ack){
  const tx=text(event?.client_tx_id);
  if(!ack||typeof ack!=='object')throw err('OFFLINE_V2_ACK_MALFORMED','Server ACK must be an object');
  if(ack.ok!==true)throw err('OFFLINE_V2_ACK_NOT_OK','Server ACK did not confirm success');
  if(text(ack.client_tx_id)!==tx)throw err('OFFLINE_V2_ACK_TX_MISMATCH','Server ACK client_tx_id mismatch');
  if(num(ack.protocol_version)!==PROTOCOL_VERSION)throw err('OFFLINE_V2_ACK_PROTOCOL_MISMATCH','Server ACK protocol_version mismatch');
  if(!(ack.acknowledged===true||ack.duplicate===true||ack.idempotent_replay===true))throw err('OFFLINE_V2_ACK_NOT_EXPLICIT','Server response is not an explicit ACK');
  if(!text(ack.server_event_id))throw err('OFFLINE_V2_ACK_EVENT_ID_MISSING','Server ACK requires server_event_id');
  if(text(event?.payload_digest)&&text(ack.payload_digest)!==text(event.payload_digest))throw err('OFFLINE_V2_ACK_PAYLOAD_MISMATCH','Server ACK payload_digest mismatch');
  if(text(event?.local_entity_id)&&!(ack.server_entity_id!==undefined&&ack.server_entity_id!==null&&text(ack.server_entity_id)))throw err('OFFLINE_V2_ACK_MAPPING_MISSING','Server ACK requires server_entity_id for a local entity');
  return clone(ack);
}

function classifyError(error){
  const code=text(error?.code)||'OFFLINE_V2_TRANSPORT_ERROR';
  const message=text(error?.message)||String(error||'Unknown sync error');
  const lower=message.toLowerCase();
  const status=num(error?.http_status||error?.status,0);
  const businessCodes=new Set(['INSUFFICIENT_STOCK','NEGATIVE_STOCK_NOT_ALLOWED','BUSINESS_CONFLICT','VALIDATION_CONFLICT','OUT_OF_STOCK','23505','P0001']);
  const auth=status===401||status===403||error?.kind==='auth'||code==='PGRST301'||code==='JWT_EXPIRED'||lower.includes('jwt')||lower.includes('غير مصرح')||lower.includes('not authorized')||lower.includes('permission denied');
  if(auth)return {kind:'blocked',reason:'auth',code,message,retryable:false,http_status:status};
  if(code==='OFFLINE_V2_DEPENDENCY_MAPPING_MISSING'||code==='OFFLINE_V2_DEPENDENCY_PENDING'||error?.kind==='dependency')return {kind:'blocked',reason:'dependency',code,message,retryable:false,http_status:status};
  const business=error?.kind==='business_conflict'||businessCodes.has(code)||lower.includes('المخزون غير كاف')||lower.includes('insufficient stock')||lower.includes('يوجد وردية مفتوحة بالفعل')||lower.includes('الوردية غير مفتوحة')||lower.includes('غير مطابقة للموظف')||lower.includes('تغيرت')||lower.includes('غير صالح');
  if(business)return {kind:'conflict',code,message,retryable:false,http_status:status};
  if(error?.kind==='protocol'||code.startsWith('OFFLINE_V2_ACK_'))return {kind:'protocol',code,message,retryable:true,http_status:status};
  const transient=error?.kind==='network'||status===0||status===408||status===425||status===429||status>=500||['ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENOTFOUND','EAI_AGAIN','ABORT_ERR'].includes(code)||lower.includes('timeout')||lower.includes('network')||lower.includes('failed to fetch')||lower.includes('socket hang up');
  if(transient)return {kind:'transient',code,message,retryable:true,http_status:status};
  if(error?.kind==='permanent'||(status>=400&&status<500))return {kind:'permanent',code,message,retryable:false,http_status:status};
  return {kind:'transient',code,message,retryable:true,http_status:status};
}

function retryDelayMs(attempts,opts={},random=Math.random){
  // Tests/older callers may still pass baseRetryMs; production defaults use the
  // explicit 5s -> 15s -> 30s -> 60s -> 5m ladder.
  let delays=Array.isArray(opts.retryDelaysMs)&&opts.retryDelaysMs.length?opts.retryDelaysMs.map(x=>Math.max(100,num(x,5000))):null;
  if(!delays&&opts.baseRetryMs!=null){
    const base=Math.max(100,num(opts.baseRetryMs,1000)),cap=Math.max(base,num(opts.maxRetryMs,DEFAULTS.maxRetryMs));
    delays=[base,Math.min(cap,base*2),Math.min(cap,base*4),Math.min(cap,base*8),cap];
  }
  if(!delays)delays=[...DEFAULTS.retryDelaysMs];
  const cap=Math.max(100,num(opts.maxRetryMs,DEFAULTS.maxRetryMs));
  const ratio=Math.max(0,Math.min(0.90,num(opts.jitterRatio,DEFAULTS.jitterRatio)));
  const index=Math.max(0,Math.min(delays.length-1,num(attempts,1)-1));
  const raw=Math.min(cap,delays[index]);
  const r=Math.max(0,Math.min(1,num(random(),0.5)));
  const factor=1+((r*2)-1)*ratio;
  return Math.max(100,Math.min(cap,Math.round(raw*factor)));
}

function outboundEnvelope(row,deviceFingerprint,dependencyMapping){
  const base=clone(row?.envelope||{});
  return {
    ...base,
    client_tx_id:text(row?.client_tx_id||base.client_tx_id),
    device_id:text(row?.device_id||base.device_id),
    device_sequence:num(row?.device_sequence||base.device_sequence),
    business_id:text(row?.business_id||base.business_id),
    branch_id:num(row?.branch_id??base.branch_id),
    employee_id:num(row?.employee_id??base.employee_id),
    operation_type:text(row?.operation_type||base.operation_type),
    entity_type:text(row?.entity_type||base.entity_type),
    local_entity_id:text(row?.local_entity_id||base.local_entity_id)||null,
    local_shift_id:text(row?.local_shift_id||base.local_shift_id)||null,
    depends_on_tx_id:text(row?.depends_on_tx_id||base.depends_on_tx_id)||null,
    protocol_version:PROTOCOL_VERSION,
    schema_version:num(row?.schema_version||base.schema_version,2),
    payload_digest:text(row?.payload_digest),
    device_fingerprint:text(deviceFingerprint),
    dependency_mapping:dependencyMapping?clone(dependencyMapping):null
  };
}

function createSyncEngine(options={}){
  const store=options.store;
  const transport=options.transport;
  const clock=typeof options.clock==='function'?options.clock:()=>Date.now();
  const random=typeof options.random==='function'?options.random:Math.random;
  const identityProvider=typeof options.identityProvider==='function'?options.identityProvider:async()=>({});
  const retryOptions=options.retry||{};
  const cfg={...DEFAULTS,...retryOptions,...(options.config||{})};
  if(retryOptions.baseRetryMs!=null&&retryOptions.retryDelaysMs==null)cfg.retryDelaysMs=null;
  if(!store||typeof store.claimNextDue!=='function'||typeof store.markAcked!=='function')throw new Error('Offline V2 sync requires a durable store adapter');
  if(!transport||typeof transport.send!=='function')throw new Error('Offline V2 sync requires an injected transport');
  let running=false;

  async function recoverStale(){
    const now=num(clock(),Date.now());
    return store.recoverStaleSyncing(iso(now-Math.max(1,num(cfg.staleInFlightMs))),iso(now));
  }

  async function transitionFailure(row,c){
    const attempts=num(row?.attempts,1);
    if(c.kind==='conflict'){
      if(typeof store.markConflict!=='function')throw new Error('Offline V2 store missing markConflict');
      await store.markConflict(row.client_tx_id,c);return 'conflict';
    }
    if(c.kind==='blocked'){
      if(typeof store.markBlocked!=='function')throw new Error('Offline V2 store missing markBlocked');
      await store.markBlocked(row.client_tx_id,c);return 'blocked';
    }
    if(c.kind==='permanent'||(c.kind==='protocol'&&attempts>=num(cfg.maxProtocolAttempts,5))||(c.kind==='transient'&&attempts>=num(cfg.maxTransientAttempts,12))){
      if(typeof store.markDeadLetter!=='function'){
        const delay=retryDelayMs(attempts,cfg,random);await store.markRetryable(row.client_tx_id,c,iso(num(clock(),Date.now())+delay));return 'retry';
      }
      await store.markDeadLetter(row.client_tx_id,c);return 'dead_letter';
    }
    const delay=retryDelayMs(attempts,cfg,random);
    await store.markRetryable(row.client_tx_id,c,iso(num(clock(),Date.now())+delay));return 'retry';
  }

  async function syncOnce(limit=cfg.maxPerRun){
    if(running)return {ok:true,skipped:'already_running',attempted:0,acked:0,retried:0,conflicts:0,blocked:0,dead_letters:0};
    running=true;
    const result={ok:true,attempted:0,acked:0,retried:0,conflicts:0,blocked:0,dead_letters:0,protocol_errors:0};
    try{
      await recoverStale();
      const identity=await identityProvider();
      const fingerprint=text(identity?.device_fingerprint);
      if(!fingerprint)throw err('OFFLINE_V2_CANONICAL_FINGERPRINT_REQUIRED','Canonical device_fingerprint is required before sync','identity');
      const max=Math.max(1,Math.min(1000,num(limit,cfg.maxPerRun)));
      while(result.attempted<max){
        if(typeof store.refreshBlockedDependencies==='function')await store.refreshBlockedDependencies();
        const nowMs=num(clock(),Date.now());
        const row=await store.claimNextDue(iso(nowMs));
        if(!row)break;
        result.attempted++;
        try{
          let dependencyMapping=null;
          if(text(row.depends_on_tx_id)){
            dependencyMapping=await store.getMappingByTx(text(row.depends_on_tx_id));
            if(!dependencyMapping)throw err('OFFLINE_V2_DEPENDENCY_MAPPING_MISSING','Acknowledged parent has no server mapping','dependency');
          }
          const outbound=outboundEnvelope(row,fingerprint,dependencyMapping);
          const ack=validateAck({...row,...outbound},await transport.send(outbound));
          await store.markAcked(row.client_tx_id,ack);
          result.acked++;
        }catch(error){
          const c=classifyError(error);
          const outcome=await transitionFailure(row,c);
          if(c.kind==='protocol')result.protocol_errors++;
          if(outcome==='conflict')result.conflicts++;
          else if(outcome==='blocked')result.blocked++;
          else if(outcome==='dead_letter')result.dead_letters++;
          else result.retried++;
        }
      }
      return result;
    }finally{running=false}
  }

  return Object.freeze({syncOnce,recoverStale,validateAck:(event,ack)=>validateAck(event,ack),classifyError,retryDelayMs:(attempts)=>retryDelayMs(attempts,cfg,random)});
}

module.exports={PROTOCOL_VERSION,DEFAULTS,createSyncEngine,validateAck,classifyError,retryDelayMs,outboundEnvelope};
