const fs=require('fs');
const path=require('path');
const sourcePath=path.join(process.cwd(),'supabase-point4-pre-cutover-46-guard-installation-batch3-legacy-website-lifecycle.sql');
const source=fs.readFileSync(sourcePath,'utf8');
const names=['accept_retail_website_order','cancel_retail_website_order_customer','reject_retail_website_order'];
function die(m){console.error('BATCH3_LEGACY_WEBSITE_SEMANTIC_FAIL '+m);process.exit(1)}
const starts=[...source.matchAll(/create or replace function\s+public\.([a-z0-9_]+)\s*\(/gi)];
if(starts.length!==3)die('function-count='+starts.length);
if(starts.map(x=>x[1]).join(',')!==names.join(','))die('unexpected-signatures='+starts.map(x=>x[1]).join(','));
let mat=0,guards=0,bound=0;
for(let i=0;i<starts.length;i++){
 const a=starts[i].index,b=i+1<starts.length?starts[i+1].index:source.length,x=source.slice(a,b),name=names[i];
 const freeze=x.indexOf('into v_frozen_items');
 if(freeze<0)die(name+':missing-freeze');
 if((x.match(/into v_frozen_items/g)||[]).length!==1)die(name+':materialization-count');
 mat++;
 const guard=x.indexOf('inventory_stock_assert_legacy_write_allowed_v2',freeze);
 if(guard<0)die(name+':missing-guard');
 if((x.match(/inventory_stock_assert_legacy_write_allowed_v2/g)||[]).length!==1)die(name+':guard-count');
 guards++;
 const firstWeb=x.indexOf('update public.retail_website_orders',freeze);
 if(firstWeb<0||guard>firstWeb)die(name+':guard-not-before-first-website-commitment');
 const freezeStatementEnd=x.indexOf(';',freeze);\n const afterFreeze=x.slice(freezeStatementEnd+1);
 const direct=[...afterFreeze.matchAll(/\b(?:from|join)\s+public\.retail_website_order_items\b/gi)];
 if(direct.length)die(name+':item-rediscovery='+direct.length);
 const res=x.indexOf('update public.retail_stock_reservations',guard);
 if(res<0)die(name+':missing-reservation-mutation');
 const resEnd=x.indexOf(';',res);
 const resSql=x.slice(res,resEnd);
 if(!/product_id\s+in\s*\(/i.test(resSql)||!resSql.includes('jsonb_array_elements(v_frozen_items)'))die(name+':reservation-not-frozen');
 bound++;
 if(name==='accept_retail_website_order'){
   const shift=x.indexOf('select id into v_shift');
   const expiry=x.indexOf('if v_web.reservation_expires_at<=now()');
   const shiftError=x.indexOf("if v_shift is null then raise exception");
   if(!(shift>=0&&shift<freeze&&freeze<guard&&guard<expiry&&expiry<shiftError))die(name+':expiry-shift-ordering');
   const expiryEnd=x.indexOf("raise exception 'انتهت مدة حجز المخزون لهذا الطلب';",expiry);
   const expiryRes=x.indexOf('update public.retail_stock_reservations',expiry);
   if(!(expiryRes>expiry&&expiryRes<expiryEnd))die(name+':expiry-reservation-mutation-missing');
   const expSql=x.slice(expiryRes,x.indexOf(';',expiryRes));
   if(!expSql.includes('jsonb_array_elements(v_frozen_items)'))die(name+':expiry-reservation-not-frozen');
 }
}
if(/cutover-hooks|inventory_stock_activate|canonical_stock/i.test(source))die('forbidden-activation-token');
console.log('BATCH3_LEGACY_WEBSITE_SEMANTIC_PASS functions=3 materialize='+mat+' guards='+guards+' reservation-bound='+bound+' rediscovery=0 expiry-shift=pass activation=0');
