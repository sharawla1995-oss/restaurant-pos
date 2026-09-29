const fs=require('fs');

const order=[
  'supabase-rc1-bon-numbering-policy-v1-source.sql',
  'supabase-rc1-bon-numbering-policy-v1-online-migration-source.sql',
  'supabase-rc1-bon-reservation-v2-scope-aware-source.sql',
  'supabase-rc1-trusted-device-context-bon-v3-source.sql',
  'supabase-rc1-bon-v3-sale-integration-source.sql',
  'supabase-rc1-bon-v3-base-sale-owner-source.sql'
];
const expected=[
  'pos_bon_numbering_mode_v1',
  'assign_order_numbers',
  'pos_bon_policy_preflight_v1',
  'pos_reserve_bon_range_v2',
  'pos_consume_reserved_bon_v2',
  'pos_register_trusted_device_context_v1',
  'pos_verified_device_context_v1',
  'pos_reserve_bon_range_v3',
  'pos_consume_reserved_bon_v3',
  'pos_consume_sale_bon_v3',
  'create_pos_order_atomic'
];
const fail=m=>{throw new Error(m)};
const bodies=order.map(p=>({p,s:fs.readFileSync(p,'utf8')}));
const defs=[];
for(const {p,s} of bodies){
  for(const m of s.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)\s*\(/gi)) defs.push({name:m[1],p});
}
for(const name of expected){
  const hits=defs.filter(x=>x.name===name);
  if(hits.length!==1) fail(name+' must have exactly one definition in final Bon chain, got '+hits.length);
}
const idx=p=>order.indexOf(p);
const owner=defs.find(x=>x.name==='create_pos_order_atomic');
if(owner.p!=='supabase-rc1-bon-v3-base-sale-owner-source.sql') fail('base sale owner must be final V3 owner');
if(idx(defs.find(x=>x.name==='pos_consume_sale_bon_v3').p)>=idx(owner.p)) fail('sale helper must exist before base owner');
if(idx(defs.find(x=>x.name==='pos_reserve_bon_range_v3').p)>=idx(defs.find(x=>x.name==='pos_consume_sale_bon_v3').p)) fail('V3 context must exist before sale helper');
if(idx(defs.find(x=>x.name==='pos_reserve_bon_range_v2').p)>=idx(defs.find(x=>x.name==='pos_reserve_bon_range_v3').p)) fail('V2 must exist before V3');
const migration=bodies.find(x=>x.p.includes('online-migration')).s;
if(!migration.includes("to_regclass('public.pos_bon_reservations_v2')")) fail('migration must tolerate pre-V2 state');
const v2=bodies.find(x=>x.p.includes('reservation-v2')).s;
if(/grant execute on function public\.pos_(?:reserve_bon_range|consume_reserved_bon)_v2[\s\S]{0,180}authenticated/i.test(v2)) fail('V2 client bypass reopened');
const v3=bodies.find(x=>x.p.includes('trusted-device-context')).s;
if(/grant execute on function public\.pos_consume_reserved_bon_v3[\s\S]{0,180}authenticated/i.test(v3)) fail('direct V3 consume reopened');
const helper=bodies.find(x=>x.p.includes('sale-integration')).s;
if(/grant execute on function public\.pos_consume_sale_bon_v3[\s\S]{0,180}authenticated/i.test(helper)) fail('sale helper client bypass reopened');
console.log('BON FINAL DEFINITION CHAIN GATE PASS — definitions=11 duplicates=0 order=PASS internal_bypasses=DENIED deployment=0');
