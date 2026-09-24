'use strict';
const fs=require('fs');
const acc=fs.readFileSync('owner-acceptance-beta55-restaurant-v55.js','utf8');
const sql=fs.readFileSync('supabase-beta58-26-restaurant-acceptance-point4-canonical-tx-cleanup.sql','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const fail=[];const need=(ok,msg)=>{if(!ok)fail.push(msg)};

need(acc.includes("const saleTx=point4Uuid(),saleDocumentUid=point4Uuid()"),'sale TX is not canonical UUIDv4');
need(acc.includes("const returnTx=point4Uuid(),returnDocumentUid=point4Uuid()"),'return TX is not canonical UUIDv4');
need(!acc.includes("const saleTx=tx(run,'SALE')"),'legacy sale TX still present');
need(!acc.includes("const returnTx=tx(run,'RETURN')"),'legacy return TX still present');
need(acc.includes("global.__SharawlaPoint4UuidV4"),'shared secure Point4 UUID provider was lost');
need(acc.includes("stage='sale'"),'sale stage diagnostics missing');
need(acc.includes("stage='return'"),'return stage diagnostics missing');
need(acc.includes("const sale2=await global.rpc('create_pos_order_atomic',salePayload);"),'sale retry must reuse the same payload');
need(acc.includes("const ret2=Number(await global.rpc('create_order_return_idempotent',retPayload));"),'return retry must reuse the same payload');

need(sql.includes("public.orders where client_tx_id like v_run||'-B55R-%' or notes=v_marker"),'UUID-TX order cleanup marker missing');
need(sql.includes("public.returns where client_tx_id like v_run||'-B55R-%' or notes=v_marker or order_id=any(v_orders)"),'UUID-TX return cleanup lineage missing');
need(sql.includes("inventory_stock_assert_legacy_write_allowed_v2"),'Point4 cleanup stock guard was lost');
need(sql.includes("delete from public.food_return_consumption_snapshots"),'return snapshot cleanup missing');
need(sql.includes("delete from public.orders where id=any(v_orders)"),'order cleanup missing');
need(!/create\s+or\s+replace\s+function\s+public\.(create_pos_order_atomic|create_food_pos_order_atomic_v1|create_order_return_idempotent|create_food_order_return_idempotent_v1)/i.test(sql),'business sale/return runtime must remain untouched');
need(/^10\.5\.4-beta\.58\.(?:2[6-9]|[3-9][0-9]|[1-9][0-9]{2,})$/.test(pkg.version),'expected Beta58.26+ line');

if(fail.length){console.error('Beta58.26 Restaurant Point4 Canonical TX Acceptance: FAIL');fail.forEach(x=>console.error('- '+x));process.exit(1)}
console.log('Beta58.26 Restaurant Point4 Canonical TX Acceptance: PASS');
console.log('scope=acceptance-only; tx=uuidv4; cleanup=marker+lineage; business-runtime=unchanged');
