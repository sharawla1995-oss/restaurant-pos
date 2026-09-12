(function(global){
'use strict';
const VERSION='variants-v1-runtime-bridge.1';
const FEATURE='commerce.variants';
const originalRpc=typeof global.rpc==='function'?global.rpc.bind(global):null;
const originalAddRetailProduct=typeof global.addRetailProductToCart==='function'?global.addRetailProductToCart.bind(global):null;
const originalSaveOfflineSale=typeof global.saveOfflineSale==='function'?global.saveOfflineSale.bind(global):null;
let scanObserver=null;

const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const notify=m=>{try{if(typeof global.toast==='function')return global.toast(m)}catch{};console.warn(m)};
function cfg(){try{return JSON.parse(localStorage.getItem('sharawlaRuntimeConfigV1')||'{}')||{}}catch{return {}}}
function operational(){const c=cfg();return String(c.pos_profile||'').toLowerCase()==='retail'&&global.SharawlaRuntimeCore?.hasEngine?.('retail')===true&&(Array.isArray(c.enabled_features)?c.enabled_features:[]).map(x=>String(x||'').trim().toLowerCase()).includes(FEATURE)}
function branch(){try{return Number(global.currentBranchId?.()||0)}catch{return 0}}
function productVariants(productId){
 try{return (state.productVariants||[]).filter(v=>String(v.product_id)===String(productId)&&v.active!==false&&v.is_stock_unit===true)}catch{return []}
}
function variantById(id){try{return (state.productVariants||[]).find(v=>String(v.id)===String(id)&&v.is_stock_unit===true)||null}catch{return null}}
function enrichSaleItems(items){
 const out=(Array.isArray(items)?items:[]).map(x=>({...x}));
 if(!operational())return out;
 let cart=[];try{cart=Array.isArray(state.cart)?state.cart:[]}catch{}
 for(let i=0;i<out.length;i++){
  if(out[i].variant_id){const v=variantById(out[i].variant_id);if(v&&v.cost!==null&&v.cost!==undefined)out[i].cost=Number(v.cost||0);continue}
  const c=cart[i];if(!c||String(c.product_id)!==String(out[i].product_id)||!c.variant_id)continue;
  const v=variantById(c.variant_id);if(!v)continue;
  out[i].variant_id=Number(v.id);
  out[i].variant_name=v.name||c.variant_name||null;
  out[i].variant_sku=v.sku||null;
  out[i].variant_barcode=v.barcode||null;
  out[i].cost=Number(v.cost??c.cost??out[i].cost??0);
 }
 return out;
}

// Route only Retail+Variants calls to the isolated variant-aware RPCs.
// All other calls are byte-for-byte delegated to the original RPC helper.
if(originalRpc){
 global.rpc=async function(name,payload={}){
  if(!operational())return originalRpc(name,payload);
  if(name==='create_retail_pos_order_atomic'){
   return originalRpc('create_retail_variant_pos_order_atomic_v1',{...payload,p_items:enrichSaleItems(payload?.p_items)});
  }
  if(name==='create_retail_order_return_idempotent'){
   return originalRpc('create_retail_variant_order_return_idempotent_v1',payload);
  }
  return originalRpc(name,payload);
 };
}

// Persist variant identity into the normal offline sale job before network sync.
if(originalSaveOfflineSale){
 global.saveOfflineSale=async function(orderPayload,itemPayload,payRows,clientTx){
  if(!operational())return originalSaveOfflineSale(orderPayload,itemPayload,payRows,clientTx);
  return originalSaveOfflineSale(orderPayload,enrichSaleItems(itemPayload),payRows,clientTx);
 };
}

function cartQtyStep(productId){try{return Math.max(.001,Number(global.retailQtyStep?.(productId)||1))}catch{return 1}}
function normalizedQty(productId,q){try{return Number(global.retailQtyNormalize?.(productId,q)??q)}catch{return Number(q||0)}}
function addExactVariant(product,variant,forcedQty=null){
 if(!product||!variant)return;
 const step=cartQtyStep(product.id),qty=normalizedQty(product.id,forcedQty===null?step:forcedQty)||step;
 let cart=[];try{cart=state.cart}catch{return}
 const existing=cart.find(x=>String(x.product_id)===String(product.id)&&String(x.variant_id||'')===String(variant.id)&&!(x.modifiers||[]).length&&!x.notes);
 try{global.invalidateActivePromo?.()}catch{}
 if(existing){existing.qty=normalizedQty(product.id,Number(existing.qty||0)+qty);global.drawCart?.();return}
 cart.push({
  product_id:product.id,
  name:`${product.name} - ${variant.name}`,
  price:Number(variant.price??product.price??0),
  base_price:Number(variant.price??product.price??0),
  cost:Number(variant.cost??product.cost??0),
  qty,
  modifiers:[],removed:[],notes:'',
  variant_id:Number(variant.id),variant_name:variant.name,
  variant_sku:variant.sku||null,variant_barcode:variant.barcode||null
 });
 global.drawCart?.();
}
function openPicker(product,variants,forcedQty=null){
 const m=document.createElement('div');m.className='modal';
 m.innerHTML=`<div class="modal-card"><h2>${esc(product.name)}</h2><p class="muted">اختر المقاس / اللون / التركيبة</p><div class="option-list">${variants.map(v=>`<button type="button" class="secondary" data-v-pick="${v.id}"><b>${esc(v.name)}</b> — ${Number(v.price??product.price??0).toFixed(2)}${v.sku?`<small style="display:block">SKU: ${esc(v.sku)}</small>`:''}</button>`).join('')}</div><div class="modal-actions"><button class="secondary" data-v-close>إلغاء</button></div></div>`;
 document.body.appendChild(m);
 m.onclick=e=>{if(e.target===m||e.target.closest('[data-v-close]'))return m.remove();const b=e.target.closest('[data-v-pick]');if(!b)return;const v=variants.find(x=>String(x.id)===String(b.dataset.vPick));if(v){addExactVariant(product,v,forcedQty);m.remove()}};
}

// Replace only Retail add-to-cart when the feature is actually enabled.
if(originalAddRetailProduct){
 global.addRetailProductToCart=async function(product,forcedQty=null){
  if(!operational())return originalAddRetailProduct(product,forcedQty);
  let variants=productVariants(product?.id);
  if(!variants.length){
   try{
    const fresh=await global.rest('product_variants',`select=*&product_id=eq.${Number(product?.id||0)}&is_stock_unit=eq.true&active=eq.true&order=sort_order,id`);
    variants=Array.isArray(fresh)?fresh:[];
    if(Array.isArray(state.productVariants)){
     const keep=state.productVariants.filter(x=>!(String(x.product_id)===String(product?.id)&&x.is_stock_unit===true));
     state.productVariants=[...keep,...variants];
    }
   }catch{}
  }
  if(!variants.length)return originalAddRetailProduct(product,forcedQty);
  if(variants.length===1)return addExactVariant(product,variants[0],forcedQty);
  return openPicker(product,variants,forcedQty);
 };
}

async function lookupVariant(code){
 if(!originalRpc||!operational()||!branch()||!String(code||'').trim())return null;
 try{const r=await originalRpc('retail_variant_lookup_v1',{p_branch_id:branch(),p_lookup:String(code).trim()});return Array.isArray(r)?r[0]||null:r||null}catch{return null}
}
async function handleScan(input,e){
 if(!operational()||e.key!=='Enter')return;
 const code=String(input.value||'').trim();if(!code)return;
 e.preventDefault();e.stopImmediatePropagation();
 const hit=await lookupVariant(code);
 if(hit){
  let p=null;try{p=state.products.find(x=>String(x.id)===String(hit.product_id))||null}catch{}
  if(p){
   const v={id:hit.variant_id,product_id:hit.product_id,name:hit.variant_name,sku:hit.sku,barcode:hit.barcode,price:Number(hit.price||0),cost:Number(hit.cost||0),is_stock_unit:true,active:true};
   addExactVariant(p,v);input.value='';input.focus();return;
  }
 }
 // Preserve existing Retail fallbacks if this is not a variant barcode/SKU.
 try{
  const p=global.findRetailProductByBarcode?.(code);
  if(p){await global.addRetailProductToCart(p);input.value='';input.focus();return}
  const embedded=global.decodeRetailEmbeddedBarcode?.(code);
  if(embedded){await global.addRetailProductToCart(embedded.product,embedded.qty);notify(`${embedded.mode==='weight'?'وزن':'قيمة'}: ${global.retailQtyLabel?.(embedded.product.id,embedded.qty)||embedded.qty}`);input.value='';input.focus();return}
 }catch{}
 notify(`باركود/SKU غير موجود: ${code}`);input.select();
}
function wireScanner(){
 if(!operational())return;
 const input=document.querySelector('#retailScanInput');if(!input||input.dataset.variantV1Scan==='1')return;
 input.dataset.variantV1Scan='1';input.addEventListener('keydown',e=>handleScan(input,e),true);
}
function start(){
 if(!String(cfg().pos_profile||'').toLowerCase().includes('retail'))return;
 wireScanner();scanObserver=new MutationObserver(wireScanner);scanObserver.observe(document.body,{childList:true,subtree:true});
 global.__SharawlaRetailVariantsRuntimeV1=Object.freeze({version:VERSION,feature:FEATURE,operational,enrichSaleItems,lookupVariant});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
