'use strict';
const fs=require('fs');
const assert=require('assert');
const {createSyncEngine}=require('../beta45-offline-v2-sync.js');
const app=fs.readFileSync('app.js','utf8');
const sync=fs.readFileSync('beta45-offline-v2-sync.js','utf8');
const sql=fs.readFileSync('supabase-rc1-offline-outer-consolidated-v3.sql','utf8');
const baseSql=fs.readFileSync('supabase-beta45-offline-v2-transport-v1.sql','utf8');
const must=(x,m)=>{if(!x)throw new Error(m)};

must(app.includes('customer_id:customerId,customer_create_tx:customerCreateTx,shift_id:'),'sale payload customer dependency marker missing');
must(sync.includes("const customerTx=text(row?.envelope?.payload?.rpc_payload?.p_order?.customer_create_tx)"),'sync customer dependency extraction missing');
must(sync.includes('out.customer_dependency_mapping=clone(customerDependencyMapping)'),'sync outbound customer dependency mapping missing');
must(sync.includes('OFFLINE_V2_CUSTOMER_DEPENDENCY_TERMINAL'),'terminal customer dependency fail-closed missing');
must(sync.includes('OFFLINE_V2_CUSTOMER_DEPENDENCY_PARENT_MISSING'),'missing customer dependency parent fail-closed missing');
must(sync.includes('OFFLINE_V2_CUSTOMER_DEPENDENCY_MAPPING_MISSING'),'customer dependency retry wait missing');

must(sql.includes('Required deployed Beta Outer MD5 before patch: a269349dbc9a71f453e12699bc0617ce'),'deployed Outer MD5 pin missing');
must(sql.includes("v_outer_md5 is distinct from 'a269349dbc9a71f453e12699bc0617ce'"),'runtime drift refusal missing');
must(sql.includes("v_owner is distinct from 'postgres'"),'owner metadata gate missing');
must(sql.includes("'search_path=public'=any"),'search_path metadata gate missing');
must(sql.includes("has_function_privilege('anon','public.sharawla_offline_v2_apply_event(jsonb)','EXECUTE')"),'Outer ACL pre/post gate missing');
must(sql.includes("has_function_privilege('service_role','public.sharawla_offline_v2_apply_event(jsonb)','EXECUTE')"),'service_role execute preservation gate missing');
must(sql.includes('customer_dependency_mapping'),'server customer dependency mapping missing');
must(sql.includes("r.operation_type='customer_create'"),'server customer receipt family binding missing');
must(sql.includes('r.device_id=v_device_id')&&sql.includes('r.branch_id=v_branch')&&sql.includes('r.employee_id=v_employee')&&sql.includes('r.auth_user_id=auth.uid()'),'server mapping scope binding incomplete');
must(sql.includes("- 'customer_create_tx'"),'transport-only customer marker must be stripped before economic RPC');
must(!sql.includes('CREATE OR REPLACE FUNCTION public.sharawla_offline_v2_apply_event_core_v1'),'Point4 Core must not be replaced');
must(sql.indexOf("'idempotent_replay',true") < sql.indexOf('RC1 customer -> sale linkage'),'authoritative replay must precede customer dependency evaluation');

// Preserve Work's newer customer/address dependency rewrites in the consolidated final definition.
for(const token of [
  "elsif v_operation='customer_update' then",
  "v_operation='customer_address_save' and nullif(trim(coalesce(v_payload->>'p_address_save_tx','')),'') is not null",
  "elsif v_operation='customer_address_delete' then"
]){
  must(baseSql.includes(token),'Work transport dependency rewrite missing from base source: '+token);
  must(sql.includes(token),'Consolidated SQL regressed Work transport dependency rewrite: '+token);
}
for(const token of ['offline_customer_create_v1','offline_customer_update_v1','offline_customer_address_save_v1','offline_customer_address_delete_v1','offline_delivery_assign_driver_v1','order_status_apply_offline_v2'])
  must(sql.includes(token),'owner family lost from consolidated SQL: '+token);

function ackFor(e,id='9001'){
  return {ok:true,acknowledged:true,duplicate:false,idempotent_replay:false,client_tx_id:e.client_tx_id,protocol_version:2,payload_digest:e.payload_digest,server_event_id:'evt-'+e.client_tx_id,server_entity_id:id,server_version:'test',result:{order:{id:Number(id)}}};
}
function saleRow(){return {
  client_tx_id:'sale-tx',device_id:'dev-7',device_sequence:2,business_id:'biz',branch_id:1,employee_id:2,
  operation_type:'sale',entity_type:'order',local_entity_id:'offline-sale-tx',depends_on_tx_id:null,
  schema_version:2,payload_digest:'digest-sale',status:'pending',attempts:0,
  envelope:{payload:{rpc_name:'create_pos_order_atomic',rpc_payload:{p_order:{client_tx_id:'sale-tx',branch_id:1,employee_id:2,customer_id:null,customer_create_tx:'cust-tx'},p_items:[],p_payments:[]}}}
}}
class Store{
  constructor(mode){this.mode=mode;this.row=saleRow();this.outcome=null}
  async recoverStaleSyncing(){}
  async refreshBlockedDependencies(){}
  async claimNextDue(){if(this.claimed)return null;this.claimed=true;this.row.attempts=1;return this.row}
  async getMappingByTx(tx){return tx==='cust-tx'&&this.mode==='mapped'?{client_tx_id:'cust-tx',server_id:'501'}:null}
  async getOutbox(tx){if(tx!=='cust-tx')return null;if(this.mode==='terminal')return {client_tx_id:tx,status:'conflict'};if(this.mode==='pending')return {client_tx_id:tx,status:'pending'};return null}
  async markAcked(_tx,ack){this.outcome='acked';this.ack=ack}
  async markConflict(_tx,c){this.outcome='conflict';this.err=c}
  async markBlocked(_tx,c){this.outcome='blocked';this.err=c}
  async markRetryable(_tx,c){this.outcome='retry';this.err=c}
  async markDeadLetter(_tx,c){this.outcome='dead_letter';this.err=c}
}
async function run(){
  let sent;
  let s=new Store('mapped');
  let e=createSyncEngine({store:s,identityProvider:async()=>({device_fingerprint:'fp'}),random:()=>0.5,transport:{send:async x=>{sent=x;return ackFor(x)}}});
  let r=await e.syncOnce();
  assert.equal(r.acked,1);assert.equal(s.outcome,'acked');
  assert.deepEqual(sent.customer_dependency_mapping,{client_tx_id:'cust-tx',server_id:'501'});

  s=new Store('terminal');e=createSyncEngine({store:s,identityProvider:async()=>({device_fingerprint:'fp'}),random:()=>0.5,transport:{send:async x=>ackFor(x)}});r=await e.syncOnce();
  assert.equal(s.outcome,'conflict');assert.equal(s.err.code,'OFFLINE_V2_CUSTOMER_DEPENDENCY_TERMINAL');

  s=new Store('missing');e=createSyncEngine({store:s,identityProvider:async()=>({device_fingerprint:'fp'}),random:()=>0.5,transport:{send:async x=>ackFor(x)}});r=await e.syncOnce();
  assert.equal(s.outcome,'dead_letter');assert.equal(s.err.code,'OFFLINE_V2_CUSTOMER_DEPENDENCY_PARENT_MISSING');

  s=new Store('pending');e=createSyncEngine({store:s,identityProvider:async()=>({device_fingerprint:'fp'}),random:()=>0.5,transport:{send:async x=>ackFor(x)}});r=await e.syncOnce();
  assert.equal(s.outcome,'retry');assert.equal(s.err.code,'OFFLINE_V2_CUSTOMER_DEPENDENCY_MAPPING_MISSING');
  console.log('RC1 consolidated Customer -> Sale linkage V2 gate PASS');
}
run().catch(e=>{console.error(e);process.exit(1)});
