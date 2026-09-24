'use strict';
const fs=require('fs');
const app=fs.readFileSync('app.js','utf8');
const css=fs.readFileSync('styles.css','utf8');
const checks=[
 ['whole cart keeps Top Burger overflow-hidden ownership',css.includes('.cart{background:#fff;border:1px solid var(--line);border-radius:16px;display:flex;flex-direction:column;overflow:hidden}')],
 ['no delivery-mode whole-cart scroller remains',!css.includes('.cart.delivery-mode{overflow-y:auto')],
 ['no sticky delivery footer override remains',!css.includes('.cart.delivery-mode .cart-foot{position:sticky')],
 ['runtime delivery-mode class remains absent',!app.includes("classList.toggle('delivery-mode',delivery)")],
 ['ordered-items area has large minimum space',css.includes('.cart-items{min-height:180px}')],
 ['ordered-items area remains the flex owner',css.includes('.cart .cart-items{flex:1 1 auto;overflow:auto;padding:6px 10px}')],
 ['cashier top is compact',css.includes('.cart .next-bon-badge{padding:6px 10px')&&css.includes('.cart .cart-head{padding:8px 10px;gap:6px}')],
 ['delivery fields are compact two-column desktop layout',css.includes('.cart .delivery-fields{padding:7px 10px;gap:6px;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}')],
 ['footer and payment actions are compact',css.includes('.cart .cart-foot{padding:7px 10px}')&&css.includes('.cart .pay-actions button{padding:8px 6px;font-size:12px}')]
];
let bad=0;
for(const [name,ok] of checks){console.log((ok?'PASS':'FAIL')+' — '+name);if(!ok)bad++}
if(bad)process.exit(1);
console.log('Top Burger cashier layout corrective guard PASS');
