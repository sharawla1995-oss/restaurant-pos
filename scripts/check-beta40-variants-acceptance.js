const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const must=(cond,msg)=>{if(!cond)throw new Error(`Beta40 Variants acceptance failed: ${msg}`)};

async function runtimeDelayedConfigTest(){
  const store=new Map();
  const localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
  const intervals=[];
  const input={dataset:{},value:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn},focus(){},select(){}};
  const document={readyState:'complete',body:{},querySelector:s=>s==='#retailScanInput'?input:null,createElement(){throw new Error('unexpected modal creation')}};
  class MutationObserver{constructor(fn){this.fn=fn}observe(){}}
  const rpcCalls=[];
  const offlineCalls=[];
  const state={productVariants:[{id:77,product_id:7,name:'M / Black',sku:'SKU77',barcode:'BAR77',price:120,cost:55,is_stock_unit:true,active:true}],cart:[{product_id:7,variant_id:77,variant_name:'M / Black',cost:55}],products:[]};
  const window={
    SharawlaRuntimeCore:{hasEngine:code=>code==='retail'},
    rpc:async(name,payload)=>{rpcCalls.push({name,payload});return {ok:true}},
    addRetailProductToCart:async()=>null,
    saveOfflineSale:async(...args)=>{offlineCalls.push(args);return {ok:true}},
    currentBranchId:()=>1,
    rest:async()=>[],
    addEventListener(){},
    console
  };
  window.window=window;
  const sandbox={window,localStorage,document,MutationObserver,state,console,setInterval:fn=>{intervals.push(fn);return intervals.length},clearInterval:()=>{}};
  vm.runInNewContext(read('retail-variants-runtime-bridge.js'),sandbox,{filename:'retail-variants-runtime-bridge.js'});

  must(input.dataset.variantV1Scan!=='1','scanner must not wire before Retail+Variants runtime config exists');
  must(intervals.length===1,'scanner retry timer must start while runtime config is pending');

  store.set('sharawlaRuntimeConfigV1',JSON.stringify({pos_profile:'retail',enabled_features:['commerce.variants']}));
  intervals[0]();
  must(input.dataset.variantV1Scan==='1','scanner did not wire after delayed runtime config became available');
  must(window.__SharawlaRetailVariantsRuntimeV1?.operational()===true,'runtime API did not become operational after delayed config');

  await window.rpc('create_retail_pos_order_atomic',{p_items:[{product_id:7,variant_id:77,quantity:1,cost:55}]});
  must(rpcCalls.at(-1)?.name==='create_retail_variant_pos_order_atomic_v1','Retail sale did not route to variant-aware atomic RPC');

  await window.rpc('create_retail_order_return_idempotent',{p_order_id:1,p_items:[]});
  must(rpcCalls.at(-1)?.name==='create_retail_variant_order_return_idempotent_v1','Retail return did not route to variant-aware return RPC');

  await window.saveOfflineSale({branch_id:1},[{product_id:7,quantity:1,cost:0}],[], 'offline-variant-test');
  const savedItems=offlineCalls.at(-1)?.[1]||[];
  must(savedItems[0]?.variant_id===77,'offline sale lost variant_id');
  must(savedItems[0]?.variant_sku==='SKU77','offline sale lost variant SKU');
  must(Number(savedItems[0]?.cost)===55,'offline sale did not preserve variant cost');
}

function staticContractTest(){
  const bridge=read('retail-variants-runtime-bridge.js');
  for(const token of ["variants-v1-runtime-bridge.2",'SCANNER_RETRY_MAX=600','scannerRetryTimer=setInterval(ensureScannerRuntime,100)','create_retail_variant_pos_order_atomic_v1','create_retail_variant_order_return_idempotent_v1','retail_variant_lookup_v1'])must(bridge.includes(token),`bridge invariant missing: ${token}`);
  const retail=read('retail-engine.js');
  const bridgePos=retail.indexOf('retail-variants-runtime-bridge.js?v=');
  const uiPos=retail.indexOf('retail-variants-ui.js?v=');
  must(bridgePos>=0&&uiPos>=0&&bridgePos<uiPos,'Retail Engine source order must place runtime bridge before variants UI');
}

(async()=>{
  staticContractTest();
  await runtimeDelayedConfigTest();
  console.log('Beta40 Variants acceptance gate OK.');
})().catch(e=>{console.error(e);process.exit(1)});