(function(global){
'use strict';

// PV2-F3 SOURCE CANDIDATE ONLY.
// Shift Open/Close and Expense Create keep their accepted Runtime RPC routes.
// Only Expense Edit needs a renderer route switch away from direct REST PATCH.
const VERSION='10.5.4-beta.58.32';

async function rpc(name,payload){
  if(typeof global.rpc!=='function')throw new Error('RPC غير جاهز');
  return global.rpc(name,payload);
}

async function updateExpense(input={}){
  const id=Number(input.id);
  const amount=Number(input.amount);
  const description=String(input.description??'').trim();
  if(!Number.isFinite(id)||id<=0)throw new Error('معرّف المصروف غير صالح');
  if(!description)throw new Error('بيان المصروف مطلوب');
  if(!Number.isFinite(amount)||amount<=0)throw new Error('قيمة المصروف غير صحيحة');
  return rpc('expense_update_v2',{p_expense_id:id,p_description:description,p_amount:amount});
}

global.__SharawlaPV2ExpenseEdit=Object.freeze({version:VERSION,updateExpense});
})(window);
