const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const must=(cond,msg)=>{if(!cond)throw new Error(`Beta41 Purchasing acceptance failed: ${msg}`)};

async function bridgeBehaviorTest(){
  const store=new Map();
  const localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
  const calls=[];
  const window={
    rpc:async(name,payload)=>{calls.push({name,payload});return {name,payload}},
    SharawlaRuntimeCore:{hasEngine:code=>code==='retail'},
    addEventListener(){},
    console
  };
  window.window=window;
  const document={readyState:'complete',addEventListener(){}};
  const sandbox={window,document,localStorage,console,setInterval:()=>1,clearInterval:()=>{}};
  vm.runInNewContext(read('advanced-purchasing-runtime-bridge.js'),sandbox,{filename:'advanced-purchasing-runtime-bridge.js'});
  must(window.__SharawlaAdvancedPurchasingRuntimeBridge?.installed===true,'bridge did not install over existing rpc');

  store.set('sharawlaRuntimeConfigV1',JSON.stringify({pos_profile:'retail',enabled_features:[]}));
  await window.rpc('retail_purchase_receive',{p_purchase_order_id:1});
  must(calls.at(-1)?.name==='retail_purchase_receive','receive changed while feature disabled');
  await window.rpc('retail_supplier_return_create',{p_branch_id:1});
  must(calls.at(-1)?.name==='retail_supplier_return_create','supplier return changed while feature disabled');

  store.set('sharawlaRuntimeConfigV1',JSON.stringify({pos_profile:'retail',enabled_features:['inventory.purchase_orders']}));
  await window.rpc('retail_purchase_receive',{p_purchase_order_id:2});
  must(calls.at(-1)?.name==='retail_purchase_receive_v2','purchase receive did not route to V2');
  await window.rpc('retail_supplier_return_create',{p_branch_id:1});
  must(calls.at(-1)?.name==='retail_supplier_return_create','supplier return routed without entitlement');

  store.set('sharawlaRuntimeConfigV1',JSON.stringify({pos_profile:'retail',enabled_features:['inventory.purchase_orders','inventory.supplier_returns']}));
  await window.rpc('retail_supplier_return_create',{p_branch_id:1});
  must(calls.at(-1)?.name==='retail_supplier_return_create_v2','supplier return did not route to V2');
  await window.rpc('create_retail_variant_pos_order_atomic_v1',{p_items:[]});
  must(calls.at(-1)?.name==='create_retail_variant_pos_order_atomic_v1','bridge interfered with unrelated RPC');

  store.set('sharawlaRuntimeConfigV1',JSON.stringify({pos_profile:'restaurant',enabled_features:['inventory.purchase_orders','inventory.supplier_returns']}));
  await window.rpc('retail_purchase_receive',{p_purchase_order_id:3});
  must(calls.at(-1)?.name==='retail_purchase_receive','bridge leaked outside Retail profile');
}

function sourceContractTest(){
  const bridge=read('advanced-purchasing-runtime-bridge.js');
  for(const token of [
    "advanced-purchasing-runtime-bridge.1",
    "inventory.purchase_orders",
    "inventory.supplier_returns",
    "retail_purchase_receive_v2",
    "retail_supplier_return_create_v2"
  ])must(bridge.includes(token),`bridge invariant missing: ${token}`);

  const retail=read('retail-engine.js');
  const runtimePos=retail.indexOf('advanced-purchasing-runtime-bridge.js?v=');
  const uiPos=retail.indexOf('advanced-purchasing-v1.js?v=');
  must(runtimePos>=0,'Retail Engine does not load purchasing runtime bridge');
  must(uiPos>=0,'Retail Engine lost advanced purchasing UI');
  must(runtimePos<uiPos,'purchasing runtime bridge must load before advanced purchasing UI');

  const sync=read('scripts/sync-version.js');
  must(sync.includes("'advanced-purchasing-runtime-bridge.js'"),'version sync does not include purchasing runtime bridge');
  const sw=read('sw.js');
  must(sw.includes('advanced-purchasing-runtime-bridge.js'),'service worker shell does not cache purchasing runtime bridge');
}

(async()=>{
  sourceContractTest();
  await bridgeBehaviorTest();
  console.log('Beta41 Purchasing acceptance gate OK.');
})().catch(e=>{console.error(e);process.exit(1)});
