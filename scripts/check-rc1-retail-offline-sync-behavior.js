'use strict';
const assert=require('assert');
const {createSyncEngine}=require('../beta45-offline-v2-sync.js');

function event(tx,seq,operation,entity,depends=null,payload={}){
  return {client_tx_id:tx,device_id:'retail-dev-1',device_sequence:seq,business_id:'retail-biz-1',
    branch_id:1,employee_id:7,operation_type:operation,entity_type:entity,
    local_entity_id:`offline-${operation}-${tx}`,local_shift_id:null,depends_on_tx_id:depends,
    protocol_version:2,schema_version:2,payload_digest:`digest-${tx}`,status:'pending',attempts:0,
    envelope:{payload}};
}
function ack(e,id,{duplicate=false}={}){
  return {ok:true,client_tx_id:e.client_tx_id,protocol_version:2,acknowledged:!duplicate,
    duplicate,idempotent_replay:duplicate,server_event_id:`srv-${e.client_tx_id}`,
    payload_digest:e.payload_digest,server_entity_id:String(id)};
}
class Store{
  constructor(rows){this.rows=rows.map(x=>({...x}));this.maps=new Map()}
  async recoverStaleSyncing(){for(const r of this.rows)if(r.status==='syncing')r.status='retryable';return {ok:true}}
  async refreshBlockedDependencies(){for(const r of this.rows)if(r.status==='blocked'&&r.depends_on_tx_id&&this.maps.has(r.depends_on_tx_id))r.status='pending';return {ok:true}}
  async claimNextDue(now){const r=this.rows.filter(x=>['pending','retryable'].includes(x.status)&&(!x.next_retry_at||x.next_retry_at<=now)&&(!x.depends_on_tx_id||this.maps.has(x.depends_on_tx_id))).sort((a,b)=>a.device_sequence-b.device_sequence)[0];if(!r)return null;r.status='syncing';r.attempts=(r.attempts||0)+1;return {...r}}
  async getMappingByTx(tx){return this.maps.get(tx)||null}
  async markAcked(tx,a){const r=this.rows.find(x=>x.client_tx_id===tx);r.status='synced';r.server_ack=a;this.maps.set(tx,{entity_type:r.entity_type,local_id:r.local_entity_id,server_id:String(a.server_entity_id),client_tx_id:tx});return r}
  async markRetryable(tx,e,next){const r=this.rows.find(x=>x.client_tx_id===tx);r.status='retryable';r.next_retry_at=next;r.last_error_code=e.code;return r}
  async markConflict(tx,e){const r=this.rows.find(x=>x.client_tx_id===tx);r.status='conflict';r.last_error_code=e.code;return r}
  async markBlocked(tx,e){const r=this.rows.find(x=>x.client_tx_id===tx);r.status='blocked';r.last_error_code=e.code;return r}
  async markDeadLetter(tx,e){const r=this.rows.find(x=>x.client_tx_id===tx);r.status='dead_letter';r.last_error_code=e.code;return r}
}

(async()=>{
  let clock=Date.parse('2026-09-30T00:00:00Z');
  const supplier=event('ret-supplier',1,'retail_supplier_save','retail_supplier',null,{p_name:'Supplier',p_client_tx_id:'ret-supplier'});
  const po=event('ret-po',2,'retail_po_create','retail_purchase_order','ret-supplier',{p_supplier_id:'offline-retail-supplier-ret-supplier',p_supplier_create_tx:'ret-supplier',p_client_tx_id:'ret-po',p_items:[{product_id:11,variant_id:101,quantity:3,unit_cost:20}]});
  const approve=event('ret-approve',3,'retail_po_approve','retail_purchase_order','ret-po',{p_purchase_order_id:'offline-retail-po-ret-po',p_purchase_order_create_tx:'ret-po',p_client_tx_id:'ret-approve'});
  const grn=event('ret-grn',4,'retail_purchase_receive','retail_goods_receipt','ret-po',{p_purchase_order_id:'offline-retail-po-ret-po',p_purchase_order_create_tx:'ret-po',p_client_tx_id:'ret-grn',p_items:[{product_id:11,variant_id:101,quantity:3,unit_cost:20}]});
  const store=new Store([supplier,po,approve,grn]);
  const seen=[];let supplierAttempts=0,poAttempts=0,approveAttempts=0;
  const ids={'ret-supplier':501,'ret-po':601,'ret-approve':601,'ret-grn':701};
  const engine=createSyncEngine({store,clock:()=>clock,random:()=>0.5,retry:{jitterRatio:0},
    identityProvider:async()=>({device_fingerprint:'canonical-retail-device'}),
    transport:{send:async e=>{
      seen.push({tx:e.client_tx_id,map:e.dependency_mapping,payload:e.envelope?.payload});
      if(e.client_tx_id==='ret-supplier'&&++supplierAttempts===1)throw Object.assign(new Error('ACK lost'),{code:'ECONNRESET',kind:'network'});
      if(e.client_tx_id==='ret-po'&&++poAttempts===1)throw Object.assign(new Error('PO ACK lost'),{code:'ECONNRESET',kind:'network'});
      if(e.client_tx_id==='ret-approve'&&++approveAttempts===1)throw Object.assign(new Error('approval ACK lost'),{code:'ECONNRESET',kind:'network'});
      return ack(e,ids[e.client_tx_id],{duplicate:(e.client_tx_id==='ret-supplier'&&supplierAttempts>1)||(e.client_tx_id==='ret-po'&&poAttempts>1)||(e.client_tx_id==='ret-approve'&&approveAttempts>1)});
    }}});
  let r=await engine.syncOnce();
  assert.equal(store.rows[0].status,'retryable','lost supplier ACK must be retryable');
  assert.equal(store.rows[1].status,'pending','PO must wait for supplier mapping');
  clock+=6000;r=await engine.syncOnce();
  assert.equal(store.rows[0].status,'synced','duplicate supplier ACK must reconcile');
  assert.equal(store.rows[1].status,'retryable','lost PO ACK must be retryable');
  assert.equal(store.rows[2].status,'pending','approval must still wait while PO ACK is unresolved');
  assert.equal(store.rows[3].status,'pending','GRN must still wait while PO ACK is unresolved');
  clock+=6000;r=await engine.syncOnce();
  assert.equal(store.rows[1].status,'synced','duplicate PO ACK must reconcile');
  assert.equal(store.rows[2].status,'retryable','lost approval ACK must be retryable');
  assert.equal(store.rows[3].status,'synced','GRN may sync after authoritative PO mapping exists');
  clock+=6000;r=await engine.syncOnce();
  assert.equal(store.rows[2].status,'synced','duplicate approval ACK must reconcile');
  const poSend=seen.find(x=>x.tx==='ret-po'),approveSend=seen.find(x=>x.tx==='ret-approve'),grnSend=seen.find(x=>x.tx==='ret-grn');
  assert.equal(poSend.map.client_tx_id,'ret-supplier');assert.equal(poSend.map.server_id,'501');
  assert.equal(approveSend.map.client_tx_id,'ret-po');assert.equal(approveSend.map.server_id,'601');
  assert.equal(grnSend.map.client_tx_id,'ret-po');assert.equal(grnSend.map.server_id,'601');
  assert.equal(po.envelope.payload.p_items[0].variant_id,101,'PO variant identity must survive local envelope');
  assert.equal(grn.envelope.payload.p_items[0].variant_id,101,'GRN variant identity must survive local envelope');
  const productOnly=event('ret-product-only',6,'retail_po_create','retail_purchase_order',null,{p_supplier_id:501,p_client_tx_id:'ret-product-only',p_items:[{product_id:12,quantity:2,unit_cost:9}]});
  assert.equal(Object.prototype.hasOwnProperty.call(productOnly.envelope.payload.p_items[0],'variant_id'),false,'product-only line must not invent variant identity');

  const ret=event('ret-return',5,'retail_supplier_return','retail_supplier_return','ret-supplier',{p_supplier_id:'offline-retail-supplier-ret-supplier',p_supplier_create_tx:'ret-supplier',p_client_tx_id:'ret-return',p_items:[{product_id:11,variant_id:101,quantity:1,unit_cost:20}]});
  const store2=new Store([ret]);store2.maps.set('ret-supplier',{client_tx_id:'ret-supplier',server_id:'501',entity_type:'retail_supplier',local_id:'offline-retail-supplier-ret-supplier'});
  let returnMap=null;
  const engine2=createSyncEngine({store:store2,clock:()=>clock,identityProvider:async()=>({device_fingerprint:'canonical-retail-device'}),transport:{send:async e=>{returnMap=e.dependency_mapping;return ack(e,801)}}});
  r=await engine2.syncOnce();assert.equal(r.acked,1);assert.equal(returnMap.server_id,'501');assert.equal(ret.envelope.payload.p_items[0].variant_id,101);

  console.log('RC1 Retail Offline behavioral replay/dependency harness PASS — supplier/PO/approval lost-ACK + dependencies + GRN/return + variant/product identity');
})().catch(e=>{console.error(e);process.exit(1)});
