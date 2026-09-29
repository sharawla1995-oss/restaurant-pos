'use strict';
const fs=require('fs'),assert=(v,m)=>{if(!v)throw new Error(m)};
const t=fs.readFileSync('beta45-offline-v2-transport-runtime.js','utf8'),s=fs.readFileSync('beta45-offline-v2-sync.js','utf8');
for(const x of ['async function salePayloadWithReservedBon(payload,identity)',"api?.nextReservedBon","openShift:","device_fingerprint:identity.device_fingerprint","bon_reservation:clone(evidence)","row?.envelope?.payload?.rpc_payload","_official_number_pending:!reservedBon"])assert(t.includes(x),'transport Bon binding missing '+x);
assert(t.includes("if(!open||num(open.id,0)!==shiftId||text(open.status)!=='open'||!shiftOpenTx)return out"),'reservation must require matching cached server shift identity');
assert(t.includes("if(!api?.nextReservedBon||typeof global.odbGet!=='function'||branchId<1||shiftId<1)return out"),'missing reservation capability must preserve OFF fallback');
assert(s.includes('OFFLINE_V2_ACK_BON_MISMATCH'),'reserved Bon ACK mismatch must be protocol failure before ACK persistence');
const v=s.indexOf('function validateAck'),m=s.indexOf('OFFLINE_V2_ACK_BON_MISMATCH',v),r=s.indexOf('return clone(ack)',v);assert(v>=0&&m>v&&r>m,'Bon ACK validation must run before ACK acceptance');
console.log('OFFLINE BON TRANSPORT BINDING GATE PASS — reservation_absent_fallback=OFF deployment=0');
