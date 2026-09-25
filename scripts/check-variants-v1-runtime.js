#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const files={
 foundation:read('supabase-engine-variants-v1-foundation.sql'),
 api:read('supabase-engine-variants-v1-runtime-api.sql'),
 hardening:read('supabase-engine-variants-v1-runtime-api-v1-1-hardening.sql'),
 checkout:read('supabase-engine-variants-v1-checkout-returns.sql'),
 bridge:read('retail-variants-runtime-bridge.js'),
 ui:read('retail-variants-ui.js'),
 engine:read('retail-engine.js')
};
const failures=[];
const ok=(cond,msg)=>{if(!cond)failures.push(msg)};

ok(files.foundation.includes('is_stock_unit boolean not null default false'),'legacy product_variants must default is_stock_unit=false');
ok(files.foundation.includes('retail_variant_inventory_balances'),'variant stock balance table missing');
ok(files.foundation.includes('retail_variant_inventory_movements'),'variant stock movement ledger missing');
ok(files.hardening.includes('matrix_signature'),'duplicate-combination signature hardening missing');
ok(files.hardening.includes('product_variants_matrix_signature_uidx'),'unique combination index missing');

ok(files.checkout.includes('create_retail_variant_pos_order_atomic_v1'),'variant checkout RPC missing');
ok(files.checkout.includes('create_retail_variant_order_return_idempotent_v1'),'variant return RPC missing');
ok(!/create\s+or\s+replace\s+function\s+public\.create_retail_pos_order_atomic\s*\(/i.test(files.checkout),'existing Retail checkout must not be replaced');
ok(!/create\s+or\s+replace\s+function\s+public\.create_retail_order_return_idempotent\s*\(/i.test(files.checkout),'existing Retail return must not be replaced');
ok(files.checkout.includes("and nullif(x->>'variant_id','') is null"),'parent stock exclusion for variant lines missing');
ok(files.checkout.includes('retail_variant_inventory_movements'),'variant checkout must post to variant movement ledger');
ok(files.checkout.includes('variant_name=pv.name'),'order item variant snapshot missing');

ok(files.bridge.includes("const FEATURE='commerce.variants'"),'bridge capability gate missing');
ok(files.bridge.includes("pos_profile||'').toLowerCase()==='retail'"),'bridge Retail profile gate missing');
ok(files.bridge.includes("name==='create_retail_pos_order_atomic'"),'checkout route bridge missing');
ok(files.bridge.includes('create_retail_variant_pos_order_atomic_v1'),'variant checkout route target missing');
ok(files.bridge.includes("name==='create_retail_order_return_idempotent'"),'return route bridge missing');
ok(files.bridge.includes('create_retail_variant_order_return_idempotent_v1'),'variant return route target missing');
ok(files.bridge.includes('global.saveOfflineSale=async function'),'offline sale enrichment hook missing');
ok(files.bridge.includes('variant_id=Number(v.id)')||files.bridge.includes('variant_id:Number(v.id)'),'variant identity must enter cart/payload');
ok(files.bridge.includes('retail_variant_lookup_v1'),'variant barcode/SKU lookup missing');

ok(files.ui.includes('retail_variant_matrix_get_v1'),'matrix UI read missing');
ok(files.ui.includes('retail_variant_combination_save_v1'),'matrix UI save missing');
ok(files.ui.includes('توليد كل التركيبات'),'cartesian generation UI missing');
ok(files.ui.includes('combos.length>200'),'combination explosion guard missing');
ok(files.ui.includes('retail_variant_inventory_adjust_v1'),'variant stock adjustment UI missing');

const bridgeIndex=files.engine.indexOf('retail-variants-runtime-bridge.js');
const uiIndex=files.engine.indexOf('retail-variants-ui.js');
ok(bridgeIndex>=0,'Retail Engine does not load variants runtime bridge');
ok(uiIndex>=0,'Retail Engine does not load variants matrix UI');
ok(bridgeIndex>=0&&uiIndex>=0&&bridgeIndex<uiIndex,'runtime bridge must load before matrix UI');

for(const [name,src] of Object.entries({bridge:files.bridge,ui:files.ui,engine:files.engine})){
 try{new Function(src)}catch(e){failures.push(`${name} JavaScript syntax error: ${e.message}`)}
}

if(failures.length){
 console.error('Variants V1 Runtime Gate: FAIL');
 for(const f of failures)console.error(' - '+f);
 process.exit(1);
}
console.log('Variants V1 Runtime Gate: PASS');
console.log('Checked: additive schema, duplicate-combination guard, isolated checkout/returns, capability/profile gate, offline identity, barcode/SKU path, matrix UI, load order, JS syntax.');
