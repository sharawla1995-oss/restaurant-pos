'use strict';

function classList(values=[]){
  const s=new Set(values);
  return {contains:function(x){return s.has(x)}};
}
function element(opts={}){
  const text=opts.text||'',hidden=opts.hidden===true,classes=opts.classes||[],attrs=opts.attrs||{};
  return {
    textContent:text,
    hidden,
    classList:classList(classes),
    getAttribute:function(n){return Object.prototype.hasOwnProperty.call(attrs,n)?attrs[n]:null}
  };
}
function documentFixture(map){
  return {querySelector:function(sel){return map[sel]||null}};
}

module.exports=Object.freeze({
  goodLock:Object.freeze({
    supportCode:'SH-0007',
    businessId:'91826502-590e-4afa-8826-2c0f4b99c490',
    backendHost:'xihcxydjnzemflhedzor.supabase.co',
    profile:'restaurant',
    channel:'beta',
    version:'10.5.4-beta.58.3'
  }),
  badLock:Object.freeze({
    supportCode:'SH-0005',
    businessId:'prod',
    backendHost:'prod.example',
    profile:'restaurant',
    channel:'stable',
    version:'10.5.3'
  }),
  ordersDoc:documentFixture({
    '#nav button[data-page="orders"].active':element(),
    '[data-orders-runtime="ORDERS-DATE-WINDOW-V58.3"]':element()
  }),
  customerDoc:documentFixture({
    '#nav button[data-page="customers"].active':element(),
    '#customerSearch':element(),
    '#customersBody':element()
  }),
  restaurantLeakageDoc:documentFixture({
    '#nav button[data-page="marketSettings"]':element(),
    '#nav button[data-page="retailOffers"]':element({classes:['hidden']})
  }),
  emptyDoc:documentFixture({}),
  element
});
