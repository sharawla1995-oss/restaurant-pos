'use strict';
const fs=require('fs');
const app=fs.readFileSync('app.js','utf8');
const css=fs.readFileSync('styles.css','utf8');
const checks=[
 ['58.9 delivery-mode runtime class removed',!app.includes("classList.toggle('delivery-mode',delivery)")],
 ['whole delivery cart scrolling removed',!css.includes('.cart.delivery-mode{overflow-y:auto')],
 ['sticky delivery footer override removed',!css.includes('.cart.delivery-mode .cart-foot{position:sticky')],
 ['ordered-items area keeps a small nonzero minimum',css.includes('.cart-items{min-height:72px}')],
 ['original cart overflow ownership preserved',css.includes('.cart{background:#fff;border:1px solid var(--line);border-radius:16px;display:flex;flex-direction:column;overflow:hidden}')]
];
let bad=0;
for(const [name,ok] of checks){console.log((ok?'PASS':'FAIL')+' — '+name);if(!ok)bad++}
if(bad)process.exit(1);
console.log('Cashier layout corrective guard PASS');
