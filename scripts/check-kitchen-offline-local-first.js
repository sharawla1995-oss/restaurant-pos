const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const a=src.indexOf('async function kitchenOrderBundles()');
const b=src.indexOf('\nasync function renderKitchen()',a);
assert(a>=0&&b>a,'kitchen local-first helper missing');
const fn=src.slice(a,b);
let restCalls=0;
const cached=[
 {order:{id:'offline-a',status:'preparing',created_at:'2026-09-28T08:00:00Z'},items:[{product_name:'A',quantity:1}]},
 {order:{id:'offline-b',status:'completed',created_at:'2026-09-28T07:00:00Z'},items:[]},
 {order:{id:'offline-c',status:'new',created_at:'2026-09-28T06:00:00Z'},items:[{product_name:'C',quantity:2}]}
];
const ctx={navigator:{onLine:false},currentBranchId:()=>1,cachedOrderBundles:async()=>JSON.parse(JSON.stringify(cached)),rest:async()=>{restCalls++;throw new Error('cloud read must not run offline')},Date,console};
vm.createContext(ctx);vm.runInContext(fn+';globalThis.__testKitchen=kitchenOrderBundles;',ctx);
(async()=>{
 const rows=await ctx.__testKitchen();
 assert.strictEqual(restCalls,0,'kitchen touched Cloud while offline');
 assert.deepStrictEqual(Array.from(rows,x=>String(x.order.id)),['offline-c','offline-a'],'kitchen did not filter/sort durable bundles');
 assert.strictEqual(rows[0].items[0].product_name,'C','kitchen lost cached order items');
 ctx.navigator.onLine=true;ctx.rest=async(table)=>{restCalls++;if(table==='orders')return[{id:9,status:'new',created_at:'2026-09-28T09:00:00Z'}];if(table==='order_items')return[{product_name:'Cloud',quantity:1}];return[]};
 const online=await ctx.__testKitchen();
 assert.strictEqual(online.length,1);assert.strictEqual(online[0].items[0].product_name,'Cloud');assert(restCalls>=2,'online kitchen did not use server reads');
 console.log('Kitchen local-first runtime acceptance OK');
})().catch(e=>{console.error(e);process.exit(1)});
