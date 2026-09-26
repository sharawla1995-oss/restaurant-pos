'use strict';
const fs=require('fs');const app=fs.readFileSync('app.js','utf8');const fail=[];const need=(x,m)=>{if(!x)fail.push(m)};
const inbox=(app.match(/async function renderOnlineOrders\([\s\S]*?\r?\r?\n}\r?\n\r?\nasync function renderDeliveryOrders/)||[])[0]||'';
need(/canonicalById=new Map/.test(inbox),'canonical identity index missing');
need(/w\.order_id\?\?w\.accepted_order_id\?\?null/.test(inbox),'existing website->canonical lineage fields not consumed');
need(/linkedCanonicalIds=new Set/.test(inbox),'linked canonical dedupe set missing');
need(/if\(linked\)linkedCanonicalIds\.add/.test(inbox),'linked canonical identity not recorded');
need(/if\(linked\)return \{kind:'canonical',row:linked,sourceRow:w/.test(inbox),'linked source row must resolve to canonical lifecycle entry');
need(/filter\(o=>!linkedCanonicalIds\.has\(String\(o\.id\)\)\)/.test(inbox),'duplicate canonical rows not removed');
need(/identity:\{source_order_id:w\.id,canonical_order_id:linked\.id\}/.test(inbox),'linked identity metadata missing');
need(/identity:\{source_order_id:w\.id,canonical_order_id:linkedId\}/.test(inbox),'unlinked source identity metadata missing');
need(/identity:\{source_order_id:null,canonical_order_id:o\.id\}/.test(inbox),'canonical-only identity metadata missing');
need(/WEB-.*→/.test(inbox),'lineage display label missing');
need(/isSource&&isNew/.test(inbox),'actions must remain raw-new-only');
need((app.match(/rpc\('accept_website_order'/g)||[]).length===1,'Accept RPC ownership regressed');
need((app.match(/rpc\('reject_website_order'/g)||[]).length===1,'Reject RPC ownership regressed');
if(fail.length){console.error('Online Orders Batch 11 Identity Deduplication: FAIL');fail.forEach(x=>console.error('- '+x));process.exit(1)}
console.log('Online Orders Batch 11 Identity Deduplication: PASS');
console.log('lineage=website_order->canonical_order; linked_rows=single-entry; actions=raw-new-only; db=unchanged');
