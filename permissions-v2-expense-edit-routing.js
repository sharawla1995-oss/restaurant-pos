(function(global){
'use strict';

// PV2-F3 SOURCE CANDIDATE ONLY.
// Shift Open/Close and Expense Create keep their accepted Runtime RPC routes.
// Only Expense Edit needs a renderer route switch away from direct REST PATCH.
const VERSION='pv2-f3-expense-edit-source';

async function rpc(name,payload){
  if(typeof global.rpc!=='function')throw new Error('RPC غير جاهز');
  return global.rpc(name,payload);
}

function missingOwner(err){return /PGRST202|could not find the function|404/i.test(String(err?.message||err||''))}
async function rest(table,query,options){if(typeof global.rest!=='function')throw new Error('REST غير جاهز');return global.rest(table,query,options)}
async function updateExpense(input={}){
  const id=Number(input.id);
  const amount=Number(input.amount);
  const description=String(input.description??'').trim();
  if(!Number.isFinite(id)||id<=0)throw new Error('معرّف المصروف غير صالح');
  if(!description)throw new Error('بيان المصروف مطلوب');
  if(!Number.isFinite(amount)||amount<=0)throw new Error('قيمة المصروف غير صحيحة');
  try{return await rpc('expense_update_v2',{p_expense_id:id,p_description:description,p_amount:amount})}catch(err){if(!missingOwner(err))throw err;await rest('expenses',`id=eq.${id}`,{method:'PATCH',body:JSON.stringify({description,amount})});return {id,description,amount}}
}

global.__SharawlaPV2ExpenseEdit=Object.freeze({version:VERSION,updateExpense});
})(window);
