(function(root,factory){
'use strict';
const api=factory();
if(typeof module==='object'&&module.exports)module.exports=api;
if(root)root.SharawlaUniversalDashboardEngineV1=api;
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';

const VERSION='1.0.0';
const STATES=Object.freeze({
 READY:'ready',LOADING:'loading',EMPTY:'empty',ERROR:'error',NO_PERMISSION:'no_permission',
 CAPABILITY_UNAVAILABLE:'capability_unavailable',OFFLINE_UNAVAILABLE:'offline_unavailable',UNSUPPORTED:'unsupported'
});
const FINANCIAL_PERMISSION='reports';
const CANCELLED_ORDER_STATUSES=Object.freeze(['cancelled']);

const WIDGETS=Object.freeze([
 {id:'quick_actions',group:'shared',title:'اختصارات العمل',permissions:[],offline:'full',datasets:[]},
 {id:'business_kpis',group:'shared',title:'ملخص الأعمال',capabilities:['commerce.orders','commerce.returns','core.reports'],permissions:[FINANCIAL_PERMISSION],offline:'current_branch',datasets:['orders','returns','expenses']},
 {id:'sales_timeline',group:'shared',title:'المبيعات عبر الوقت',capabilities:['commerce.orders','commerce.returns','core.reports'],permissions:[FINANCIAL_PERMISSION],offline:'current_branch',datasets:['orders','returns']},
 {id:'payment_distribution',group:'shared',title:'طرق الدفع',capabilities:['commerce.orders','commerce.returns','core.payments','core.reports'],permissions:[FINANCIAL_PERMISSION],offline:'current_branch',datasets:['orders','returns','order_payments','return_payments']},
 {id:'best_sellers',group:'shared',title:'الأصناف الأكثر مبيعًا',capabilities:['commerce.orders','commerce.returns','commerce.products','core.reports'],permissions:[FINANCIAL_PERMISSION],offline:'current_branch',datasets:['orders','returns','order_items','return_items']},
 {id:'recent_orders',group:'shared',title:'أحدث العمليات',capabilities:['commerce.orders'],permissions:['orders'],offline:'current_branch',datasets:['order_operations']},
 {id:'employee_performance',group:'shared',title:'أداء الموظفين',capabilities:['commerce.orders','commerce.returns','core.reports'],permissions:[FINANCIAL_PERMISSION],offline:'none',datasets:['orders','returns','employees']},
 {id:'branch_comparison',group:'shared',title:'مقارنة الفروع',capabilities:['commerce.orders','commerce.returns','core.reports'],permissions:[FINANCIAL_PERMISSION],offline:'none',allBranches:true,datasets:['orders','returns']},
 {id:'customer_activity',group:'shared',title:'نشاط العملاء',capabilities:['commerce.orders','commerce.returns','core.customers','core.reports'],permissions:[FINANCIAL_PERMISSION,'customers'],offline:'current_branch',datasets:['orders','returns']},
 {id:'inventory_alerts',group:'capability',title:'تنبيهات المخزون',capabilities:['inventory.stock'],permissions:['inventory'],offline:'none',profiles:['restaurant','retail','pharmacy','warehouse'],datasets:['inventory']},
 {id:'purchasing_status',group:'capability',title:'المشتريات والموردون',capabilities:['inventory.purchasing'],permissions:['purchasing'],offline:'none',profiles:['restaurant','retail','pharmacy','warehouse'],datasets:['purchasing']},
 {id:'restaurant_orders',group:'profile',title:'تشغيل المطعم',profiles:['restaurant'],anyCapabilities:['commerce.delivery','commerce.pickup','food.tables','food.kitchen'],permissions:['orders'],offline:'current_branch',datasets:['order_operations']},
 {id:'restaurant_food_ops',group:'profile',title:'الإنتاج والهالك',profiles:['restaurant'],anyCapabilities:['food.production','food.waste','food.prep'],permissions:['inventory'],offline:'none',datasets:['food_operations']},
 {id:'pharmacy_expiry',group:'profile',title:'الصلاحية والباتشات',profiles:['pharmacy'],capabilities:['inventory.batch','inventory.expiry'],permissions:['inventory'],offline:'none',datasets:['pharmacy_batches']},
 {id:'service_operations',group:'profile',title:'الخدمات والمواعيد',profiles:['service'],anyCapabilities:['service.jobs','service.appointments'],permissions:['orders'],offline:'none',datasets:['service_operations']},
 {id:'membership_operations',group:'profile',title:'العضويات والحضور',profiles:['membership'],anyCapabilities:['membership.subscriptions','membership.checkin'],permissions:['customers'],offline:'none',datasets:['membership_operations']},
 {id:'logistics_operations',group:'profile',title:'الشحنات والتحصيل',profiles:['logistics'],capabilities:['logistics.shipments'],permissions:['orders'],offline:'none',datasets:['logistics_operations']},
 {id:'warehouse_operations',group:'profile',title:'حركة المخزن',profiles:['warehouse'],capabilities:['inventory.stock'],permissions:['inventory'],offline:'none',datasets:['inventory','purchasing']},
 {id:'central_supply',group:'capability',title:'طلبات التوريد المركزي',capabilities:['inventory.multi_warehouse'],actionPermissions:['inventory.supply.view'],offline:'none',datasets:['central_supply']}
].map(row=>Object.freeze({...row})));

function norm(value){return String(value??'').trim().toLowerCase()}
function unique(values){return [...new Set((Array.isArray(values)?values:[]).map(value=>String(value)).filter(Boolean))]}
function number(value){const parsed=Number(value);return Number.isFinite(parsed)?parsed:0}
function round(value,precision=2){const scale=10**precision;return Math.round((number(value)+Number.EPSILON)*scale)/scale}
function localDateKey(date){
 const value=date instanceof Date?date:new Date(date);
 const y=value.getFullYear(),m=String(value.getMonth()+1).padStart(2,'0'),d=String(value.getDate()).padStart(2,'0');
 return `${y}-${m}-${d}`;
}
function startOfDay(date){const value=new Date(date);value.setHours(0,0,0,0);return value}
function endOfDay(date){const value=new Date(date);value.setHours(23,59,59,999);return value}
function addDays(date,days){const value=new Date(date);value.setDate(value.getDate()+days);return value}
function resolvePeriod(key='today',now=new Date(),custom={}){
 const current=new Date(now);if(Number.isNaN(current.getTime()))throw new Error('INVALID_NOW');
 let from,to,label;
 if(key==='custom'){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(custom.from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(custom.to||''))throw new Error('INVALID_CUSTOM_PERIOD');
  from=startOfDay(new Date(`${custom.from}T00:00:00`));to=endOfDay(new Date(`${custom.to}T00:00:00`));label='فترة مخصصة';
  if(from>to)throw new Error('INVALID_CUSTOM_PERIOD_ORDER');
 }else if(key==='yesterday'){
  const day=addDays(current,-1);from=startOfDay(day);to=endOfDay(day);label='أمس';
 }else if(key==='week'){
  const day=startOfDay(current),offset=(day.getDay()+6)%7;from=addDays(day,-offset);to=endOfDay(current);label='هذا الأسبوع';
 }else if(key==='month'){
  from=startOfDay(new Date(current.getFullYear(),current.getMonth(),1));to=endOfDay(current);label='هذا الشهر';
 }else{
  from=startOfDay(current);to=endOfDay(current);key='today';label='اليوم';
 }
 return Object.freeze({key,label,from:from.toISOString(),to:to.toISOString(),fromDate:localDateKey(from),toDate:localDateKey(to),boundary:'device-local'});
}

function resolveBranchScope({mode='current',branchId,selectedBranchId,allowedBranchIds=[],canAllBranches=false}={}){
 const allowed=unique(allowedBranchIds.map(String));
 const current=String(branchId??'');
 if(mode==='all'){
  if(!canAllBranches||allowed.length<2)return Object.freeze({ok:false,reason:'NO_ALL_BRANCH_PERMISSION',branchIds:[]});
  return Object.freeze({ok:true,mode:'all',branchIds:allowed});
 }
 const selected=mode==='specific'?String(selectedBranchId??''):current;
 if(!selected||!allowed.includes(selected))return Object.freeze({ok:false,reason:'BRANCH_NOT_ALLOWED',branchIds:[]});
 return Object.freeze({ok:true,mode:mode==='specific'?'specific':'current',branchIds:[selected]});
}

function resolveWidgetRegistry(context={},options={}){
 const profile=norm(context.profile),capabilities=new Set((context.capabilities||[]).map(norm));
 const permissions=new Set(context.permissions||[]),actions=new Set(context.actionPermissions||[]);
 const online=context.online!==false,branchMode=context.branchMode||'current';
 return WIDGETS.map(widget=>{
  let state=STATES.READY,reason=null;
  if(widget.profiles&&!widget.profiles.includes(profile)){state=STATES.CAPABILITY_UNAVAILABLE;reason='PROFILE_NOT_APPLICABLE'}
  if(state===STATES.READY&&widget.capabilities?.some(code=>!capabilities.has(code))){state=STATES.CAPABILITY_UNAVAILABLE;reason='CAPABILITY_DISABLED'}
  if(state===STATES.READY&&widget.anyCapabilities&&!widget.anyCapabilities.some(code=>capabilities.has(code))){state=STATES.CAPABILITY_UNAVAILABLE;reason='CAPABILITY_DISABLED'}
  if(state===STATES.READY&&widget.permissions?.some(code=>!permissions.has(code))){state=STATES.NO_PERMISSION;reason='PAGE_PERMISSION_REQUIRED'}
  if(state===STATES.READY&&widget.actionPermissions?.some(code=>!actions.has(code))){state=STATES.NO_PERMISSION;reason='ACTION_PERMISSION_REQUIRED'}
  if(state===STATES.READY&&!online&&(widget.offline==='none'||branchMode==='all')){state=STATES.OFFLINE_UNAVAILABLE;reason=branchMode==='all'?'ALL_BRANCH_OFFLINE_UNAVAILABLE':'CLOUD_ONLY_WIDGET'}
  if(state===STATES.READY&&widget.allBranches&&branchMode!=='all'){state=STATES.CAPABILITY_UNAVAILABLE;reason='ALL_BRANCH_SCOPE_REQUIRED'}
  return Object.freeze({...widget,state,reason});
 }).filter(widget=>options.includeUnavailable===true||widget.state===STATES.READY);
}

function requiredDatasets(widgets){return unique((widgets||[]).filter(widget=>widget.state===STATES.READY).flatMap(widget=>widget.datasets||[]))}
function buildReadPlan(context={},options={}){
 const widgets=resolveWidgetRegistry(context,{includeUnavailable:options.includeUnavailable===true});
 const readyWidgets=widgets.filter(widget=>widget.state===STATES.READY);
 return Object.freeze({widgets:Object.freeze(widgets),readyWidgets:Object.freeze(readyWidgets),datasets:Object.freeze(requiredDatasets(readyWidgets))});
}

const IDENTITY_FIELDS=Object.freeze({
 orders:['server_id','canonical_id','_server_entity_id','id','client_tx_id','document_uid','offline_reference','_local_entity_id'],
 returns:['server_id','canonical_id','_server_entity_id','id','client_tx_id','document_uid','offline_reference','_local_entity_id'],
 order_items:['server_id','canonical_id','_server_entity_id','id','line_uid','_projection_key','_local_entity_id'],
 return_items:['server_id','canonical_id','_server_entity_id','id','line_uid','_projection_key','_local_entity_id'],
 order_payments:['server_id','canonical_id','_server_entity_id','id','client_tx_id','_projection_key','_local_entity_id'],
 return_payments:['server_id','canonical_id','_server_entity_id','id','client_tx_id','_projection_key','_local_entity_id'],
 expenses:['server_id','canonical_id','_server_entity_id','id','client_tx_id','document_uid','_projection_key','_local_entity_id'],
 default:['server_id','canonical_id','_server_entity_id','id','client_tx_id','document_uid','_projection_key','_local_entity_id']
});
function identityCandidates(row,kind='default'){
 const fields=IDENTITY_FIELDS[kind]||IDENTITY_FIELDS.default;
 const namespace=field=>['server_id','canonical_id','_server_entity_id','id'].includes(field)?'entity':field;
 return fields.flatMap(field=>row?.[field]===null||row?.[field]===undefined||String(row[field]).trim()===''?[]:[`${namespace(field)}:${String(row[field]).trim()}`]);
}
function reconcileRows(cloudRows=[],localRows=[],kind='default'){
 const output=[],identityIndex=new Map();
 function add(row,authority){
  if(!row||typeof row!=='object')return;
  const ids=identityCandidates(row,kind);let index=ids.map(id=>identityIndex.get(id)).find(value=>value!==undefined);
  if(index===undefined){index=output.length;output.push({...row,__dashboard_authority:authority})}
  else{
   const previous=output[index],previousAuthority=previous.__dashboard_authority;
   if(authority==='cloud'||previousAuthority!=='cloud')output[index]={...previous,...row,__dashboard_authority:authority};
  }
  for(const id of identityCandidates(output[index],kind))identityIndex.set(id,index);
 }
 for(const row of localRows||[])add(row,'local');
 for(const row of cloudRows||[])add(row,'cloud');
 return output.map(row=>{const clean={...row};delete clean.__dashboard_authority;return clean});
}

function inScope(row,{branchIds=[],from=null,to=null,dateField='created_at'}={}){
 if(branchIds.length&&!branchIds.map(String).includes(String(row?.branch_id)))return false;
 if(!from&&!to)return true;
 const time=new Date(row?.[dateField]||0).getTime();if(!Number.isFinite(time))return false;
 return (!from||time>=new Date(from).getTime())&&(!to||time<=new Date(to).getTime());
}
function isCollectedOrder(order){
 if(CANCELLED_ORDER_STATUSES.includes(norm(order?.status)))return false;
 if(norm(order?.source)!=='website')return true;
 if(norm(order?.payment_status)==='confirmed')return true;
 return norm(order?.payment_method)==='cash'&&['delivered','completed'].includes(norm(order?.status));
}
function paymentLabel(method){
 const key=norm(method);return ({cash:'نقدي',wallet:'محفظة',instapay:'InstaPay',card:'بطاقة',visa:'بطاقة',mixed:'دفع مختلط'})[key]||method||'غير محدد';
}
function aggregateDashboard(input={},scope={}){
 const orders=reconcileRows(input.orders||[],input.localOrders||[],'orders').filter(row=>inScope(row,scope));
 const returns=reconcileRows(input.returns||[],input.localReturns||[],'returns').filter(row=>inScope(row,scope));
 const expenses=reconcileRows(input.expenses||[],input.localExpenses||[],'expenses').filter(row=>inScope(row,scope));
 const collected=orders.filter(isCollectedOrder),collectedIds=new Set(collected.map(row=>String(row.id)));
 const returnIds=new Set(returns.map(row=>String(row.id)));
 const grossSales=round(collected.reduce((sum,row)=>sum+number(row.total),0));
 const returnsTotal=round(returns.reduce((sum,row)=>sum+number(row.total),0));
 const netSales=round(grossSales-returnsTotal);
 const expenseTotal=round(expenses.reduce((sum,row)=>sum+number(row.amount),0));
 const discounts=round(collected.reduce((sum,row)=>sum+number(row.discount),0));
 const payments={};const detailedOrders=new Set();
 for(const row of reconcileRows(input.orderPayments||[],input.localOrderPayments||[],'order_payments')){
  if(!collectedIds.has(String(row.order_id)))continue;const method=norm(row.method)||'other';
  payments[method]=round((payments[method]||0)+number(row.amount));detailedOrders.add(String(row.order_id));
 }
 for(const order of collected){
  if(detailedOrders.has(String(order.id)))continue;const method=norm(order.payment_method);
  if(method&&method!=='mixed')payments[method]=round((payments[method]||0)+number(order.total));
 }
 for(const row of reconcileRows(input.returnPayments||[],input.localReturnPayments||[],'return_payments')){
  if(!returnIds.has(String(row.return_id)))continue;const method=norm(row.method)||'other';payments[method]=round((payments[method]||0)-number(row.amount));
 }
 const timeline=new Map(),hourly=new Map(),branches=new Map(),employees=new Map(),channels=new Map();
 for(const order of collected){
  const date=localDateKey(new Date(order.created_at)),hour=String(new Date(order.created_at).getHours()).padStart(2,'0');
  timeline.set(date,round((timeline.get(date)||0)+number(order.total)));
  hourly.set(hour,round((hourly.get(hour)||0)+number(order.total)));
  branches.set(String(order.branch_id),round((branches.get(String(order.branch_id))||0)+number(order.total)));
  const employee=String(order.employee_id||'unknown');employees.set(employee,{sales:round((employees.get(employee)?.sales||0)+number(order.total)),orders:(employees.get(employee)?.orders||0)+1});
  const channel=norm(order.order_type)||'other';channels.set(channel,(channels.get(channel)||0)+1);
 }
 for(const returned of returns){
  const date=localDateKey(new Date(returned.created_at));timeline.set(date,round((timeline.get(date)||0)-number(returned.total)));
  const branch=String(returned.branch_id);branches.set(branch,round((branches.get(branch)||0)-number(returned.total)));
  const employee=String(returned.employee_id||'unknown');employees.set(employee,{sales:round((employees.get(employee)?.sales||0)-number(returned.total)),orders:employees.get(employee)?.orders||0});
 }
 const itemTotals=new Map();
 for(const row of reconcileRows(input.orderItems||[],input.localOrderItems||[],'order_items')){
  if(!collectedIds.has(String(row.order_id)))continue;const key=String(row.product_id||row.product_name||'unknown');const old=itemTotals.get(key)||{productId:row.product_id||null,name:row.product_name||'صنف',quantity:0,total:0};
  old.quantity=round(old.quantity+number(row.quantity),3);old.total=round(old.total+number(row.total));itemTotals.set(key,old);
 }
 for(const row of reconcileRows(input.returnItems||[],input.localReturnItems||[],'return_items')){
  if(!returnIds.has(String(row.return_id)))continue;const key=String(row.product_id||row.product_name||'unknown');const old=itemTotals.get(key)||{productId:row.product_id||null,name:row.product_name||'صنف',quantity:0,total:0};
  old.quantity=round(old.quantity-number(row.quantity),3);old.total=round(old.total-number(row.total));itemTotals.set(key,old);
 }
 const bestSellers=[...itemTotals.values()].sort((a,b)=>b.quantity-a.quantity||b.total-a.total).slice(0,8);
 const peakHours=[...hourly.entries()].map(([hour,sales])=>({hour:Number(hour),sales})).sort((a,b)=>b.sales-a.sales).slice(0,3);
 const recent=[...orders].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,8);
 const customerIds=new Set(collected.map(row=>row.customer_id).filter(value=>value!==null&&value!==undefined).map(String));
 return Object.freeze({
  grossSales,returnsTotal,netSales,expenseTotal,discounts,orderCount:collected.length,
  averageOrderValue:collected.length?round(grossSales/collected.length):0,
  cancelledCount:orders.filter(row=>CANCELLED_ORDER_STATUSES.includes(norm(row.status))).length,
  uncollectedWebsiteCount:orders.filter(row=>norm(row.source)==='website'&&!isCollectedOrder(row)&&!CANCELLED_ORDER_STATUSES.includes(norm(row.status))).length,
  payments:Object.entries(payments).map(([method,total])=>({method,label:paymentLabel(method),total})).sort((a,b)=>b.total-a.total),
  timeline:[...timeline.entries()].map(([date,sales])=>({date,sales})).sort((a,b)=>a.date.localeCompare(b.date)),
  hourly:[...hourly.entries()].map(([hour,sales])=>({hour:Number(hour),sales})).sort((a,b)=>a.hour-b.hour),peakHours,
  branches:[...branches.entries()].map(([branchId,sales])=>({branchId,sales})).sort((a,b)=>b.sales-a.sales),
  employees:[...employees.entries()].map(([employeeId,value])=>({employeeId,...value})).sort((a,b)=>b.sales-a.sales),
  channels:[...channels.entries()].map(([channel,count])=>({channel,count})).sort((a,b)=>b.count-a.count),
  bestSellers,recent,customerCount:customerIds.size,unlinkedOrderCount:collected.filter(row=>row.customer_id===null||row.customer_id===undefined||String(row.customer_id)==='').length,
  isEmpty:orders.length===0&&returns.length===0&&expenses.length===0
 });
}

function settleResources(entries={}){
 const output={};for(const [key,value] of Object.entries(entries)){
  if(value?.status==='fulfilled')output[key]={state:Array.isArray(value.value)&&value.value.length===0?STATES.EMPTY:STATES.READY,data:value.value,error:null};
  else output[key]={state:STATES.ERROR,data:null,error:value?.reason?.message||String(value?.reason||'LOAD_FAILED')};
 }return output;
}
function createRequestGate(){let generation=0;return Object.freeze({next(){generation+=1;return generation},isCurrent(token){return token===generation},cancel(){generation+=1},current(){return generation}})}
function dataState({loading=false,error=null,available=true,data=null,emptyTest=Array.isArray}={}){
 if(loading)return {state:STATES.LOADING,data:null,error:null};
 if(!available)return {state:STATES.OFFLINE_UNAVAILABLE,data:null,error:null};
 if(error)return {state:STATES.ERROR,data:null,error:String(error.message||error)};
 const empty=typeof emptyTest==='function'?emptyTest(data)&&data.length===0:data===null||data===undefined;
 return {state:empty?STATES.EMPTY:STATES.READY,data,error:null};
}

return Object.freeze({VERSION,STATES,WIDGETS,FINANCIAL_PERMISSION,CANCELLED_ORDER_STATUSES,resolvePeriod,resolveBranchScope,resolveWidgetRegistry,requiredDatasets,buildReadPlan,identityCandidates,reconcileRows,inScope,isCollectedOrder,aggregateDashboard,settleResources,createRequestGate,dataState,round});
});
