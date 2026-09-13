(function(global){
'use strict';
const VERSION='10.5.4-beta.55-print-order-type.1';
if(global.__SharawlaBeta55PrintOrderTypeV1?.active)return;
const originalCustomer=global.receiptHTML;
const originalPrep=global.prepReceiptHTML;
if(typeof originalCustomer!=='function'||typeof originalPrep!=='function')throw new Error('Beta55 print order type runtime requires receiptHTML + prepReceiptHTML');
const TYPES=Object.freeze({
 delivery:Object.freeze({ar:'دليفري',en:'DELIVERY'}),
 takeaway:Object.freeze({ar:'تيك أواي',en:'TAKEAWAY'}),
 pickup:Object.freeze({ar:'استلام فرع',en:'PICKUP'}),
 dinein:Object.freeze({ar:'صالة',en:'DINE-IN'})
});
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function meta(type){const key=String(type||'').trim().toLowerCase();return TYPES[key]||Object.freeze({ar:key||'طلب',en:(key||'ORDER').toUpperCase()})}
function banner(type,prep=false){const m=meta(type),size=prep?30:23,en=prep?18:15,pad=prep?5:4,margin=prep?'4px 0 6px':'3px 0 5px';return `<div class="order-type-print-banner" data-order-type="${E(String(type||''))}" style="text-align:center;border:3px solid #000;padding:${pad}px 4px;margin:${margin};font-weight:900;line-height:1.05"><div style="font-size:${size}px;font-weight:900">${E(m.ar)}</div><div style="font-size:${en}px;font-weight:900;letter-spacing:.8px;margin-top:2px">${E(m.en)}</div></div>`}
function insertBanner(html,type,prep=false){const b=banner(type,prep);return String(html||'').replace('<div class="receipt">',`<div class="receipt">${b}`)}
function currencySuffixFromPrep(html){const m=String(html||'').match(/<span>إجمالي الأصناف<\/span><b>([^<]*)<\/b>/);if(!m)return 'ج.م';const raw=String(m[1]||'').trim(),suffix=raw.replace(/^-?[\d.,]+\s*/,'').trim();return suffix||'ج.م'}
function fmt(v,suffix){return `${Number(v||0).toFixed(2)} ${E(suffix)}`}
function addPrepTotals(html,o){let out=String(html||''),suffix=currencySuffixFromPrep(out);const delivery=String(o?.order_type||'').toLowerCase()==='delivery';const feeLine=delivery?`<div class="prep-delivery-fee"><span>رسوم التوصيل</span><b>${fmt(o?.delivery_fee,suffix)}</b></div>`:'';const grand=`<div class="grand-print"><span>الإجمالي</span><b>${fmt(o?.total,suffix)}</b></div>`;out=out.replace(/(<div class="r-totals"><div><span>إجمالي الأصناف<\/span><b>[^<]*<\/b><\/div>)(<\/div>)/,`$1${feeLine}${grand}$2`);if(o?.notes){const note=`<div class="prep-order-note" style="border:1px dashed #000;padding:3px;margin:3px 0"><b>ملاحظات الطلب:</b> ${E(o.notes)}</div>`;out=out.replace('<hr><div class="r-totals">',`<hr>${note}<div class="r-totals">`)}return out}
function decorateCustomer(html,o){return insertBanner(html,o?.order_type,false)}
function decoratePrep(html,o){return addPrepTotals(insertBanner(html,o?.order_type,true),o)}
global.receiptHTML=function(o,items,isCopy=false){return decorateCustomer(originalCustomer.call(this,o,items,isCopy),o)};
global.prepReceiptHTML=function(o,items,isCopy=false){return decoratePrep(originalPrep.call(this,o,items,isCopy),o)};
global.__SharawlaBeta55PrintOrderTypeV1=Object.freeze({version:VERSION,active:true,types:TYPES,meta,banner,decorateCustomer,decoratePrep});
})(window);
