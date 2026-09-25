const fs=require('fs');
const matrix=JSON.parse(fs.readFileSync('contracts/point4-fast-track-remaining.v1.json','utf8'));
const contracts=JSON.parse(fs.readFileSync('contracts/point4-pre-cutover-46-guard-contracts.v1.json','utf8'));
let failed=0;
function bodyFor(src,name){
 const low=src.toLowerCase(), start=low.indexOf('create or replace function public.'+name.toLowerCase()+'(');
 if(start<0)return null;
 const next=low.indexOf('\ncreate or replace function public.',start+20);
 return src.slice(start,next<0?src.length:next);
}
for(const item of matrix.active){
 const c=contracts.records.find(x=>x.id===item.id);
 const out={id:item.id,family:item.family,signature:c&&c.signature};
 if(!c){out.status='FAIL';out.reason='missing-contract';failed++;console.log(JSON.stringify(out));continue}
 if(!item.source){out.status='DISCOVERY_REQUIRED';console.log(JSON.stringify(out));continue}
 if(!fs.existsSync(item.source)){out.status='FAIL';out.reason='missing-source';failed++;console.log(JSON.stringify(out));continue}
 const src=fs.readFileSync(item.source,'utf8'), name=c.signature.slice(0,c.signature.indexOf('(')), body=bodyFor(src,name);
 if(!body){out.status='FAIL';out.reason='definition-not-found';failed++;console.log(JSON.stringify(out));continue}
 const hasGuard=body.toLowerCase().includes(c.required_guard.toLowerCase());
 out.classification=c.classification;out.guard=c.required_guard;out.has_required_guard=hasGuard;
 out.status=hasGuard?'IMPLEMENTED_PENDING_SEMANTIC_COMPILE':'READY_FOR_IMPLEMENTATION';
 console.log(JSON.stringify(out));
}
if(failed)process.exit(1);
