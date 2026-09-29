'use strict';
const fs=require('fs');
const assert=(v,m)=>{if(!v)throw new Error(m)};
const s=fs.readFileSync('supabase-rc1-bon-reservation-v1-source.sql','utf8');
assert(!s.includes('b.business_id')&&!s.includes('public.branches.business_id'),'Restaurant source must not assume branches.business_id');
for(const x of [
 'pos_bon_reservations','pos_bon_consumptions','pos_reserve_bon_range_v1',
 'pos_consume_reserved_bon_v1','pg_advisory_xact_lock',
 "v_end:=v_start+p_size-1","next_number=v_end+1",
 'shift_open_tx_id','device_fingerprint','sale_client_tx_id',
 "v_shift.status<>'open'","p_bon_number<v_res.start_bon",
 'unique(sale_client_tx_id)','unique(shift_id,request_uid)'
])assert(s.includes(x),`missing source invariant: ${x}`);

// Executable allocation/consumption model: mirrors the source invariants without a DB write.
class M{
 constructor(){this.next=1;this.req=new Map();this.used=new Map();this.closed=false}
 reserve(device,req,size=3){
  if(this.req.has(req)){const r=this.req.get(req);if(r.device!==device)throw Error('request mismatch');return r}
  if(this.closed)throw Error('closed');
  const r={device,start:this.next,end:this.next+size-1};this.next=r.end+1;this.req.set(req,r);return r;
 }
 consume(device,req,bon,tx){
  if(this.used.has(tx)){const x=this.used.get(tx);if(x.bon!==bon||x.req!==req)throw Error('tx mismatch');return x}
  if(this.closed)throw Error('closed');
  const r=this.req.get(req);if(!r||r.device!==device||bon<r.start||bon>r.end)throw Error('foreign/range');
  for(const x of this.used.values())if(x.req===req&&x.bon===bon)throw Error('bon duplicate');
  const x={req,bon,tx};this.used.set(tx,x);return x;
 }
}
const m=new M(),a=m.reserve('A','ra',3),b=m.reserve('B','rb',3);
assert(a.start===1&&a.end===3&&b.start===4&&b.end===6,'two devices must receive disjoint monotonic ranges');
assert(m.reserve('A','ra',3)===a&&m.next===7,'reservation replay must not advance counter');
const x=m.consume('A','ra',1,'sale-1');
assert(m.consume('A','ra',1,'sale-1')===x&&m.used.size===1,'sale replay must preserve one bon');
for(const bad of [
 ()=>m.consume('B','ra',2,'sale-2'),
 ()=>m.consume('A','ra',4,'sale-3'),
 ()=>m.consume('A','ra',1,'sale-4')
]){let ok=false;try{bad()}catch{ok=true}assert(ok,'foreign/range/duplicate consumption must fail closed')}
m.closed=true;
let closed=false;try{m.consume('A','ra',2,'sale-5')}catch{closed=true}assert(closed,'closed shift reservation must not be consumed');
console.log('BON RESERVATION V1 SERVER SOURCE GATE PASS — deployment=0 sale_integration=0');
