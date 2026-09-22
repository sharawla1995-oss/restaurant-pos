const fs=require('fs');
const matrix=JSON.parse(fs.readFileSync('contracts/point4-fast-track-remaining.v1.json','utf8'));
const contracts=JSON.parse(fs.readFileSync('contracts/point4-pre-cutover-46-guard-contracts.v1.json','utf8'));
let failed=0;
for(const item of matrix.active){
 const c=contracts.records.find(x=>x.id===item.id);
 const out={id:item.id,family:item.family,signature:c&&c.signature,status:'PREFLIGHT'};
 if(!c){out.status='FAIL';out.reason='missing-contract';failed++;console.log(JSON.stringify(out));continue}
 if(!item.source){out.status='DISCOVERY_REQUIRED';console.log(JSON.stringify(out));continue}
 if(!fs.existsSync(item.source)){out.status='FAIL';out.reason='missing-source';failed++;console.log(JSON.stringify(out));continue}
 const s=fs.readFileSync(item.source,'utf8').toLowerCase();
 const name=c.signature.slice(0,c.signature.indexOf('(')).toLowerCase();
 if(!s.includes('function public.'+name+'(')){out.status='FAIL';out.reason='definition-not-found';failed++;console.log(JSON.stringify(out));continue}
 out.status='READY_FOR_FACTORY';
 out.guard=c.required_guard;
 out.classification=c.classification;
 console.log(JSON.stringify(out));
}
if(failed)process.exit(1);
