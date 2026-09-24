'use strict';
const fs=require('fs');
const app=fs.readFileSync('app.js','utf8');
const css=fs.readFileSync('styles.css','utf8');
const checks=[
 ['delivery mode class is toggled from order type',app.includes("$('.cart')?.classList.toggle('delivery-mode',delivery)")],
 ['delivery cart becomes vertically scrollable on constrained height',css.includes('.cart.delivery-mode{overflow-y:auto;overscroll-behavior:contain}')],
 ['delivery ordered-items list cannot collapse to zero',css.includes('.cart.delivery-mode .cart-items{flex:0 0 auto;min-height:120px;max-height:220px;overflow:auto}')],
 ['delivery header/fields/footer do not flex-shrink over the items list',css.includes('.cart.delivery-mode .next-bon-badge,.cart.delivery-mode .cart-head,.cart.delivery-mode .delivery-fields,.cart.delivery-mode .customer-hint,.cart.delivery-mode .cart-foot{flex-shrink:0}')],
 ['delivery payment footer remains reachable',css.includes('.cart.delivery-mode .cart-foot{position:sticky;bottom:0;background:inherit;z-index:3}')]
];
let bad=0;
for(const [name,ok] of checks){console.log((ok?'PASS':'FAIL')+' — '+name);if(!ok)bad++}
if(bad)process.exit(1);
console.log('Delivery POS cart layout guard PASS');
