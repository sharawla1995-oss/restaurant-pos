'use strict';
// Source-level and runtime-bridge regression only. No requests, DB writes or device access.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('app.js','utf8');
const begin=source.indexOf('function ensureTopChickenFoodLineUid(');
const end=source.indexOf('\nfunction resetCheckoutAttempt()',begin);
assert.ok(begin>=0 && end>begin, 'Food identity helper exists next to checkout');
const outputs=['cdd2b902-b7e4-4fd2-a457-8357630981e1','6b6f7468-7a48-4b6f-9c98-9a8a9c629682','5be46e62-3dd5-4847-87d1-cd9eec3043b4'];
let calls=0;
const foodLineUid=vm.runInNewContext('('+source.slice(begin,end).trim()+')',{
  crypto:{randomUUID:()=>outputs[calls++]}
});
const item={product_id:84,qty:2};
assert.equal(foodLineUid(item,'a-client-transaction'),outputs[0]);
assert.equal(foodLineUid(item,'a-client-transaction'),outputs[0],'retry must never regenerate UID');
assert.equal(calls,1);
assert.equal(foodLineUid(item,'a-new-client-transaction'),outputs[1],'new sale must generate new UID');
assert.equal(calls,2);
assert.equal(foodLineUid(item,'a-new-client-transaction'),outputs[1]);
item.top_chicken_food_line_uid='bad-id';
assert.equal(foodLineUid(item,'a-new-client-transaction'),outputs[2],'malformed prior identity replaced');
assert.throws(()=>foodLineUid({},null),/هوية/);
const scope='const useTopChickenFoodLines=await isTopChickenStaffContext();';
const payload='...(useTopChickenFoodLines?{line_uid:ensureTopChickenFoodLineUid(i,clientTx)}:{}),';
assert.ok(source.includes(scope),'Top Chicken filter is required');
assert.ok(source.includes(payload),'field is added to p_items only for TC');
assert.ok(source.indexOf('const clientTx=state.checkoutAttemptTx||uuid();')<source.indexOf('const itemPayload=state.cart.map'),'transaction is bound BEFORE Food lines');
assert.equal((source.match(/const clientTx=state\.checkoutAttemptTx\|\|uuid\(\)/g)||[]).length,1,'only one client tx');
assert.ok(source.includes('await saveOfflineSale(orderPayload,itemPayload,payRows,clientTx)'),'offline queue consumes EXACT online payload');
assert.ok(source.includes("p_items:itemPayload,p_payments:payRows}"),'online uses same payload');
assert.ok(source.includes("let result;let localFirst=null;"));

const bridge=fs.readFileSync('food-recipe-runtime-bridge-v10-5-16.js','utf8');
let captured;
let enabled=true;
const ctx={window:{
  rpc:async(name,payload)=>{captured={name,payload};return {ok:true}},
  saveOfflineSale:async(_order,items)=>{captured={name:'offline',payload:{p_items:items}};return {ok:true}}
},state:{cart:[],productVariants:[]},document:{readyState:'complete'},localStorage:{
  getItem:()=>JSON.stringify({enabled_features:enabled?['food.recipes']:[]})
}};
vm.runInNewContext(bridge,ctx);
(async()=>{
 const value={line_uid:outputs[1],product_id:84,quantity:2,modifiers:[]};
 await ctx.window.rpc('create_pos_order_atomic',{p_order:{client_tx_id:'tx-1'},p_items:[value],p_payments:[]});
 assert.equal(captured.name,'create_food_pos_order_atomic_v1','Food path must reach Food API when feature enabled');
 assert.equal(captured.payload.p_items[0].line_uid,outputs[1],'runtime enrichment preserves Food identity');
 await ctx.window.saveOfflineSale({},[value],[], 'tx-1');
 assert.equal(captured.payload.p_items[0].line_uid,outputs[1],'offline queue preserves Food identity');
 enabled=false;
 await ctx.window.rpc('create_pos_order_atomic',{p_order:{},p_items:[{product_id:84,quantity:2}],p_payments:[]});
 assert.equal(captured.name,'create_pos_order_atomic','feature-OFF uses original POS owner');
 assert.equal(captured.payload.p_items[0].line_uid,undefined,'non-food payload remains untouched');
 console.log('PASS: Food frozen-context line_uid required and stable across online/offline/retry; Top Chicken only, other-tenant payload unchanged');
})().catch(e=>{console.error(e);process.exitCode=1});
