'use strict';
const fs=require('fs');
const app=fs.readFileSync('app.js','utf8');
const must=(x,m)=>{if(!x)throw new Error(m)};
const body=(start,end)=>{
  const a=app.indexOf(start); if(a<0)throw new Error(`missing ${start}`);
  const b=app.indexOf(end,a+start.length); if(b<0)throw new Error(`missing end ${end}`);
  return app.slice(a,b);
};
const printIsolated=body('async function printIsolated(', 'async function recordSuccessfulPrint(');
const customerPrint=body('async function printReceipt(', 'function prepReceiptHTML(');
const prepPrint=body('async function printPrepReceipt(', 'function autoPrintOrder(');
const details=body('async function openOrderDetails(', 'function returnReceiptHTML(');
const checkout=body('async function checkout(', 'async function openMixedPayment(');

must(printIsolated.includes("if(!r?.ok){") && printIsolated.includes('return false'), 'desktop printer failure must return false');
must(printIsolated.includes("catch(e){f.remove();toast('تعذر الطباعة:") && printIsolated.includes('return false'), 'printer exception must fail without mutating sale');
must(customerPrint.includes('const ok=await printIsolated(') && customerPrint.includes("if(ok)await recordSuccessfulPrint("), 'customer print audit/count must advance only after successful print');
must(prepPrint.includes('const ok=await printIsolated(') && prepPrint.includes("if(ok)await recordSuccessfulPrint("), 'prep print audit/count must advance only after successful print');
for(const [name,src] of [['customer print',customerPrint],['prep print',prepPrint],['order detail/reprint',details]]){
  must(!/saveOfflineSale\s*\(/.test(src), `${name} must never create a local sale`);
  must(!/create_(?:food_)?pos_order_atomic/.test(src), `${name} must never call a sale RPC`);
  must(!/\bcheckout\s*\(/.test(src), `${name} must never re-enter checkout`);
}
must(details.includes("printReceipt(o,items)") && details.includes("printPrepReceipt(o,items)"), 'reprint must use the already-loaded order bundle');
must(checkout.includes('if(!o?.id)throw new Error') && checkout.includes('showReceipt(o,savedItems)'), 'printing must happen only after a durable sale result exists');
must(checkout.indexOf('if(!o?.id)throw new Error') < checkout.indexOf('showReceipt(o,savedItems)'), 'sale durability/result validation must precede print UI');
console.log('RC1 printer failure / reprint no-duplicate source gate PASS');
