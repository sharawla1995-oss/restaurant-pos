'use strict';
const fs=require('fs');
const pack=fs.readFileSync('owner-acceptance-beta55-restaurant-v55.js','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const fail=[];const need=(ok,msg)=>{if(!ok)fail.push(msg)};
for(const token of [
 "let stage='bootstrap'","stage='fixture'","stage='ingredients'","stage='uom-conversion'",
 "stage='opening-stock-adjustment'","stage='supplier'","stage='purchase-order'","stage='purchase-receive'",
 "stage='supplier-return'","stage='stock-count'","stage='stock-transfer'","stage='waste'",
 "stage='sale-recipe'","stage='prep-recipe'","stage='production'","stage='tables-open'",
 "stage='sale'","stage='return'","stage='tables-close'","[restaurant-full-roundtrip:${stage}]"
]) need(pack.includes(token),'missing '+token);
need(/^10\.5\.4-beta\.58\.\d+$/.test(pkg.version),'expected Beta58 line');
if(fail.length){console.error('Restaurant Full Acceptance Stage Diagnostics: FAIL');fail.forEach(x=>console.error('- '+x));process.exit(1)}
console.log('Restaurant Full Acceptance Stage Diagnostics: PASS');
