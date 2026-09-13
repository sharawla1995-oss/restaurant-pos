'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const pkg=JSON.parse(read('package.json'));
const loader=read('owner-acceptance-lazy-loader-v47.js');
const pack=read('owner-acceptance-retail-coverage-v53.js');
const sync=read('scripts/sync-version.js');
assert.strictEqual(pkg.version,'10.5.4-beta.53','Beta53 package version mismatch');
assert(String(pkg.description||'').includes('Offline Engine V2'),'Offline V2 release identity must be preserved');
assert(String(pkg.description||'').includes('Acceptance Coverage Stage 2'),'Stage 2 release identity missing');
assert(loader.includes("owner-acceptance-retail-coverage-v53.js?v=10.5.4-beta.53"),'Beta53 Retail coverage pack missing from lazy loader');
assert(loader.indexOf('owner-acceptance-retail-coverage-v53.js')<loader.indexOf('owner-acceptance-ui-v47.js'),'Retail coverage pack must load before acceptance UI');
for(const token of [
 "const VERSION='10.5.4-beta.53'",
 "retail.products-live-catalog",
 "retail.variants-runtime-contract",
 "retail.purchasing-roundtrip",
 "retail.replenishment-read-model",
 "retail.transfer-atomic-guard",
 "retail.stock-count-rollback-guard",
 "commerce.products","commerce.variants","inventory.suppliers","inventory.purchase_orders","inventory.receiving","inventory.supplier_returns","inventory.replenishment","inventory.transfers","inventory.count",
 "retail_variant_matrix_get_v1","retail_purchase_order_create_v2","retail_purchase_order_approve","retail_purchase_receive_v2","retail_supplier_return_create_v2","retail_transfer_create","retail_post_stock_count","sharawla_acceptance_cleanup_v3","sharawla_acceptance_scan_v3",
 "average_unit_cost","last_purchase_cost","same-branch transfer rejected atomically","transaction rollback residue=0"
])assert(pack.includes(token),`Beta53 Retail coverage invariant missing: ${token}`);
assert(!pack.includes('takeoverActivate'),'Stage2 acceptance must not activate Offline V2 takeover');
assert(!pack.includes('takeoverPrepare'),'Stage2 acceptance must not rerun Offline V2 migration');
assert(sync.includes("'owner-acceptance-retail-coverage-v53.js'"),'version sync must own Beta53 acceptance pack');
console.log('Beta53 Retail Acceptance Coverage Stage 2 gate PASS — variants/products + purchasing/replenishment/transfer/count contracts registered with sandbox-safe cleanup/rollback guards');
