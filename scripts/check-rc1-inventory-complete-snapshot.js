'use strict';
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('inventory-overview-v1.js','utf8');
const must=(v,m)=>{if(!v)throw new Error(m)};
must(src.includes("const SNAPSHOT_PREFIX='sharawlaInventoryOverviewSnapshotV1:'"),'complete snapshot key missing');
must(src.includes("snapshot.complete!==true"),'incomplete snapshot must fail closed');
must(src.includes('ingredientsFallback')&&src.includes('stockFallback'),'both live datasets must be freshness-checked');
must(!src.includes("rest('ingredient_stock',`select=*&branch_id=eq.${bid}&order=id`).catch(()=>[])"),'ingredient stock must not silently collapse to empty');
must(src.includes('وضع Offline / Cache: الأرقام من آخر Snapshot كاملة'),'stale inventory message missing');
must(src.includes('لا يتم اختلاق أثر مخزني لها قبل ACK'),'pending Cloud-resolved stock caveat missing');

async function boot({online=true,cache=null,mode='live'}){
 const mem=new Map(); if(cache)mem.set('sharawlaInventoryOverviewSnapshotV1:food:1',cache);
 const ctx={console,navigator:{onLine:online},localStorage:{getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,String(v))},document:{querySelector(){return null}},
  SharawlaRuntimeConfig:{current:()=>({pos_profile:'restaurant'})},currentBranchId:()=>1,moduleEnabled:()=>true,branchName:()=> 'TEST',fmtDate:x=>x,
  odbGet:async k=>{const v=mem.get(k);return v?JSON.parse(v):null},odbSet:async(k,v)=>{mem.set(k,JSON.stringify(v));return v},dispatchEvent(){}};
 ctx.rest=async(table)=>{
   if(mode==='throw')throw new TypeError('Failed to fetch');
   if(mode==='fallback'){
     ctx.__SharawlaOfflineCacheFallback={active:true,table,reason:'network-failure'};
     return table==='ingredients'?[{id:999,name:'PARTIAL'}]:[];
   }
   ctx.__SharawlaOfflineCacheFallback=null;
   return table==='ingredients'?[{id:1,name:'Tomato',active:true,track_inventory:true,minimum_quantity:2}]:[{ingredient_id:1,quantity:8,average_unit_cost:3}];
 };
 ctx.window=ctx;vm.runInNewContext(src,ctx,{filename:'inventory-overview-v1.js'});return {ctx,mem,api:ctx.__SharawlaInventoryOverviewV1};
}
(async()=>{
 const live=await boot({online:true,mode:'live'});const a=await live.api.loadFoodInventoryData(1);
 must(a.stale===false&&a.ingredients.length===1&&a.stock[0].quantity===8,'live complete snapshot load failed');
 const saved=live.mem.get('sharawlaInventoryOverviewSnapshotV1:food:1');must(saved&&JSON.parse(saved).complete===true,'complete live snapshot not persisted');
 const off=await boot({online:false,cache:saved,mode:'throw'});const b=await off.api.loadFoodInventoryData(1);
 must(b.stale===true&&b.stock[0].quantity===8,'offline must recover exact complete snapshot');
 const degraded=await boot({online:true,cache:saved,mode:'fallback'});const c=await degraded.api.loadFoodInventoryData(1);
 must(c.stale===true&&c.ingredients[0].id===1,'DNS/recovery fallback must prefer prior complete snapshot over partial read cache');
 const empty=await boot({online:false,mode:'throw'});let failed=false;try{await empty.api.loadFoodInventoryData(1)}catch(e){failed=e.code==='INVENTORY_SNAPSHOT_MISSING'}
 must(failed,'offline first-use without complete snapshot must fail closed');
 console.log('RC1 Inventory complete snapshot runtime gate PASS');
})().catch(e=>{console.error(e);process.exit(1)});
