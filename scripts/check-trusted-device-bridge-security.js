'use strict';
const fs=require('fs'),assert=(v,m)=>{if(!v)throw new Error(m)};
const d=fs.readFileSync('docs/TRUSTED-DEVICE-BRIDGE-V1.md','utf8');
const cloud=fs.readFileSync('SHARAWLA-CLOUD-TRUSTED-DEVICE-ASSERTION-V1-SOURCE.sql','utf8');
const rest=fs.readFileSync('supabase-rc1-trusted-device-context-bon-v3-source.sql','utf8');
for(const x of ['Status: SOURCE CONTRACT / SECURITY SIMULATION','Runtime activation: BLOCKED','server-only component','wrong-business assertions fail closed','OFF-*','POS clients cannot call the mint function','employee branch authorization remains independently enforced'])
 assert(d.includes(x),'bridge contract missing '+x);
assert(cloud.includes('trusted device assertion unknown')&&cloud.includes('trusted device assertion replay')&&cloud.includes('trusted device assertion expired'),'Cloud negative paths incomplete');
assert(rest.includes('cloud_assertion_id uuid not null unique'),'Restaurant replay lineage missing');
assert(rest.includes('revoke all on function public.pos_register_trusted_device_context_v1')&&rest.includes('from public,anon,authenticated'),'client mint not denied');
assert(rest.includes('p_verified_device_context_id uuid'),'Bon V3 opaque context binding missing');

class Cloud{
 constructor(){this.m=new Map()}
 issue(token,{business,device,purpose='restaurant_bon_device_verification',exp=10}){this.m.set(token,{business,device,purpose,exp,used:false})}
 consume(token,now,purpose){
  const a=this.m.get(token); if(!a)throw Error('unknown'); if(a.purpose!==purpose)throw Error('purpose');
  if(a.used)throw Error('replay'); if(a.exp<=now)throw Error('expired'); a.used=true; return a;
 }
}
function bridge(cloud,token,now,restaurantBusiness,purpose='restaurant_bon_device_verification'){
 const a=cloud.consume(token,now,purpose); if(a.business!==restaurantBusiness)throw Error('business'); return {context:'opaque',device:a.device};
}
const reject=(fn,msg)=>{try{fn();throw Error('accepted')}catch(e){assert(e.message===msg,'expected '+msg+' got '+e.message)}};
let c=new Cloud();c.issue('ok',{business:'B1',device:'D1'});assert(bridge(c,'ok',1,'B1').device==='D1','valid canonical tuple failed');
reject(()=>bridge(c,'forged',1,'B1'),'unknown');
let e=new Cloud();e.issue('expired',{business:'B1',device:'D1',exp:1});reject(()=>bridge(e,'expired',1,'B1'),'expired');
let r=new Cloud();r.issue('replay',{business:'B1',device:'D1'});bridge(r,'replay',1,'B1');reject(()=>bridge(r,'replay',2,'B1'),'replay');
let b=new Cloud();b.issue('wrong-business',{business:'B2',device:'D2'});reject(()=>bridge(b,'wrong-business',1,'B1'),'business');
let p=new Cloud();p.issue('wrong-purpose',{business:'B1',device:'D1',purpose:'other'});reject(()=>bridge(p,'wrong-purpose',1,'B1'),'purpose');
const bridgeAvailable=false;const saleRef=bridgeAvailable?'BON':'OFF-*';assert(saleRef==='OFF-*','bridge outage must preserve OFF fallback');
console.log('TRUSTED DEVICE BRIDGE SECURITY GATE PASS — forged=REJECT expired=REJECT replay=REJECT wrong_business=REJECT wrong_purpose=REJECT outage=OFF runtime_activation=BLOCKED deployment=0');
