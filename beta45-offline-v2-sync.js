'use strict';

// Sharawla Offline Engine V2 — Phase 3 sync protocol.
// Pure protocol/state-machine code: no Electron, Supabase or production runtime
// dependencies. A transport must be injected explicitly. Beta45 remains shadow
// mode until the later takeover gate wires a real transport.
const PROTOCOL_VERSION=2;
const DEFAULTS=Object.freeze({
  staleInFlightMs:60_000,
  baseRetryMs:2_000,
  maxRetryMs:300_000,
  jitterRatio:0.20,
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
  const businessCodes=new Set(['INSUFFICIENT_STOCK','NEGATIVE_STOCK_NOT_ALLOWED','BUSINESS_CONFLICT','VALIDATION_CONFLICT','OUT_OF_STOCK']);
  const business=error?.kind==='business_conflict'||businessCodes.has(code)||lower.includes('المخزون غير كاف')||lower.includes('insufficient stock');
  if(business)return {kind:'conflict',code,message,retryable:false};
  if(error?.kind==='protocol'||code.startsWith('OFFLINE_V2_ACK_'))return {kind:'protocol',code,message,retryable:true};
  return {kind:'transient',code,message,retryable:true};
}

function retryDelayMs(attempts,opts={},random=Math.random){
  const base=Math.max(100,num(opts.baseRetryMs,DEFAULTS.baseRetryMs));
  const cap=Math.max(base,num(opts.maxRetryMs,DEFAULTS.maxRetryMs));
  const ratio=Math.max(0,Math.min(0.90,num(opts.jitterRatio,DEFAULTS.jitterRatio)));
  const exp=Math.min(cap,base*Math.pow(2,Math.max(0,num(attempts,1)-1)));
  const r=Math.max(0,Math.min(1,num(random(),0.5)));
  const factor=1+((r*2)-1)*ratio;
  return Math.max(base,Math.min(cap,Math.round(exp*factor)));
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
  const cfg={...DEFAULTS,...(options.retry||{}),...(options.config||{})};
  if(!store||typeof store.claimNextDue!=='function'||typeof store.markAcked!=='function')throw new Error('Offline V2 sync requires a durable store adapter');
  if(!transport||typeof transport.send!=='function')throw new Error('Offline V2 sync requires an injected transport');
  let running=false;

  async function recoverStale(){
    const now=num(clock(),Date.now());
    return store.recoverStaleSyncing(iso(now-Math.max(1,num(cfg.staleInFlightMs))),iso(now));
  }

  async function syncOnce(limit=cfg.maxPerRun){
    if(running)return {ok:true,skipped:'already_running',attempted:0,acked:0,retried:0,conflicts:0};
    running=true;
    const result={ok:true,attempted:0,acked:0,retried:0,conflicts:0,protocol_errors:0};
    try{
      await recoverStale();
      const identity=await identityProvider();
      const fingerprint=text(identity?.device_fingerprint);
      if(!fingerprint)throw err('OFFLINE_V2_CANONICAL_FINGERPRINT_REQUIRED','Canonical device_fingerprint is required before sync','identity');
      const max=Math.max(1,Math.min(1000,num(limit,cfg.maxPerRun)));
      while(result.attempted<max){
        const nowMs=num(clock(),Date.now());
        const row=await store.claimNextDue(iso(nowMs));
        if(!row)break;
        result.attempted++;
        try{
          let dependencyMapping=null;
          if(text(row.depends_on_tx_id)){
            dependencyMapping=await store.getMappingByTx(text(row.depends_on_tx_id));
            if(!dependencyMapping)throw err('OFFLINE_V2_DEPENDENCY_MAPPING_MISSING','Acknowledged parent has no server mapping','protocol');
          }
          const outbound=outboundEnvelope(row,fingerprint,dependencyMapping);
          const ack=validateAck({...row,...outbound},await transport.send(outbound));
          await store.markAcked(row.client_tx_id,ack);
          result.acked++;
        }catch(error){
          const c=classifyError(error);
          if(c.kind==='conflict'){
            await store.markConflict(row.client_tx_id,c);
            result.conflicts++;
          }else{
            const delay=retryDelayMs(row.attempts,cfg,random);
            await store.markRetryable(row.client_tx_id,c,iso(num(clock(),Date.now())+delay));
            result.retried++;
            if(c.kind==='protocol')result.protocol_errors++;
          }
        }
      }
      return result;
    }finally{running=false}
  }

  return Object.freeze({syncOnce,recoverStale,validateAck:(event,ack)=>validateAck(event,ack),classifyError,retryDelayMs:(attempts)=>retryDelayMs(attempts,cfg,random)});
}

module.exports={PROTOCOL_VERSION,DEFAULTS,createSyncEngine,validateAck,classifyError,retryDelayMs,outboundEnvelope};
