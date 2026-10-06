'use strict';
// Offline analyzer only. No HTTP, device, SQL execution, retry, acquisition or import.
function inspectCapture(c){
 const row=c?.durable_row,e=row?.envelope,p=e?.payload?.rpc_payload||{},type=e?.operation_type;
 if(!row||!e||!['sale','return'].includes(type))throw new Error('BATCH1_SALE_RETURN_ENVELOPE_REQUIRED');
 if(e.client_tx_id!==row.client_tx_id||(e.payload_digest!=null&&e.payload_digest!==row.payload_digest)||!row.payload_digest)throw new Error('BATCH1_ENVELOPE_IDENTITY_MISMATCH');
 if(type==='return'&&!/^[1-9][0-9]*$/.test(String(p.p_order_id)))throw new Error('SERVER_ORDER_RETURN_ONLY');
 const errors=[];for(const field of ['effective_owner_definitions','effective_owner_signatures_acls_md5','economic_before_after','actual_transport_response'])if(!c[field])errors.push(field);
 if(type==='sale'&&!c.trigger_enabled_definition_counter_scope)errors.push('trigger_enabled_definition_counter_scope');
 return {kind:type==='return'?'SERVER_ORDER_RETURN':'ACTUAL_ONLINE_BON',tx:row.client_tx_id,operation_type:type,rpc_name:e.payload.rpc_name,payload:p,depends_on_tx_id:e.depends_on_tx_id||null,verdict:errors.length?'NEEDS RUNTIME PROOF':'CAPTURE COMPLETE — requires review',missing:errors,root_cause:'UNDETERMINED; never inferred from local-parent or provisional OFF reference'};
}
module.exports={inspectCapture};
