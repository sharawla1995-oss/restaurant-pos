(function(global){
'use strict';
async function updateExpense(input={},options={}){
 const raw=String(input.id??'').trim(),local=/^offline-exp-[0-9a-f-]{36}$/.test(raw),id=local?raw:Number(raw),amount=Number(input.amount),description=String(input.description??'').trim();
 if(!local&&(!Number.isSafeInteger(id)||id<=0))throw new Error('معرّف المصروف غير صالح');
 if(!description||!Number.isFinite(amount)||amount<=0)throw new Error('بيان المصروف وقيمته غير صالحين');
 const t=global.SharawlaOfflineV2Transport;
 if(typeof t?.isActive==='function'&&await t.isActive()){
  if(!Number.isFinite(Number(input.expected_amount))||Number(input.expected_amount)<=0||typeof input.expected_description!=='string')throw new Error('أعد تحميل المصروف قبل التعديل: النسخة الأصلية مطلوبة');
  const p={p_expense_id:id,p_expense_parent_tx:input.parent_tx||(local?raw.slice('offline-exp-'.length):null),p_description:description,p_amount:amount,p_expected_amount:Number(input.expected_amount),p_expected_description:input.expected_description,p_client_tx_id:input.client_tx_id||global.crypto.randomUUID()};
  const saved=await t.commitRpcLocal('offline_expense_update_v1',p);return options.withState?saved:saved.result;
 }
 if(global.navigator?.onLine===false||local)throw new Error('Offline V2 غير جاهز لتعديل المصروف');
 const result=await global.rpc('expense_update_v2',{p_expense_id:id,p_description:description,p_amount:amount});return options.withState?{durable:false,synced:true,result}:result;
}
global.__SharawlaPV2ExpenseEdit=Object.freeze({version:'batch1-expense-edit-source-v1',updateExpense});
})(window);
