(function(root,factory){
'use strict';
if(typeof module==='object'&&module.exports)module.exports=factory();
else root.SharawlaHrEmployeeProfileModelV1=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

const VERSION='hr-employee-profile-model-v1.2-root-cause-hardening';

function asPositiveId(value){
 const id=Number(value);
 if(!Number.isInteger(id)||id<=0){
  const error=new Error('HR employee id is required');
  error.code='HR_EMPLOYEE_ID_REQUIRED';
  throw error;
 }
 return id;
}

function errorCode(error){
 return String(error?.code||error?.status||error?.statusCode||'').trim();
}

function errorText(error){
 return String(error?.message||error?.details||error?.hint||error||'').trim();
}

function classifyOptionalError(error){
 const code=errorCode(error);
 const text=errorText(error);
 const haystack=`${code} ${text}`.toLowerCase();

 if(
   ['pgrst202','pgrst204','pgrst205','42p01','42883'].includes(code.toLowerCase())
   || /schema cache|could not find|does not exist|undefined table|undefined function|relation .* does not exist|function .* does not exist/.test(haystack)
 ){
   return Object.freeze({
    kind:'missing_contract',
    code:code||'HR_OPTIONAL_CONTRACT_MISSING',
    retryable:false,
    user_message:'القسم غير متاح على الـBackend الحالي'
   });
 }

 if(
   ['401','403','42501'].includes(code)
   || /unauthenticated|permission denied|not authorized|not authorised|forbidden|access denied|غير مصرح|ليس لديك صلاحية/.test(haystack)
 ){
   return Object.freeze({
    kind:'auth',
    code:code||'HR_OPTIONAL_AUTH_DENIED',
    retryable:false,
    user_message:'غير مصرح بتحميل هذا القسم'
   });
 }

 if(
   ['econnreset','econnrefused','etimedout','enotfound','network_error','offline'].includes(code.toLowerCase())
   || /network|fetch failed|failed to fetch|connection reset|connection refused|timeout|timed out|offline/.test(haystack)
 ){
   return Object.freeze({
    kind:'network',
    code:code||'HR_OPTIONAL_NETWORK_ERROR',
    retryable:true,
    user_message:'تعذر الاتصال أثناء تحميل هذا القسم'
   });
 }

 if(
   /^pgrst/i.test(code)
   || /^[0-9a-z]{5}$/i.test(code)
   || /bad request|invalid input|query|syntax error|operator does not exist|column .* does not exist/.test(haystack)
 ){
   return Object.freeze({
    kind:'query',
    code:code||'HR_OPTIONAL_QUERY_ERROR',
    retryable:false,
    user_message:'تعذر تحميل بيانات هذا القسم'
   });
 }

 return Object.freeze({
  kind:'runtime',
  code:code||'HR_OPTIONAL_RUNTIME_ERROR',
  retryable:false,
  user_message:'حدث خطأ أثناء تحميل هذا القسم'
 });
}

const OPTIONAL_SECTIONS=Object.freeze([
 Object.freeze({
  key:'attendance',
  table:'hr_attendance_daily_summary',
  query:id=>`select=*&employee_id=eq.${id}&order=work_date.desc&limit=60`
 }),
 Object.freeze({
  key:'schedule',
  table:'hr_employee_schedule_assignments',
  query:id=>`select=*&employee_id=eq.${id}&order=effective_from.desc`
 }),
 Object.freeze({
  key:'leaves',
  table:'hr_leave_requests',
  query:id=>`select=*&employee_id=eq.${id}&order=created_at.desc`
 }),
 Object.freeze({
  key:'advances',
  table:'hr_employee_advances',
  query:id=>`select=*&employee_id=eq.${id}&order=requested_on.desc`
 }),
 Object.freeze({
  key:'adjustments',
  table:'hr_employee_adjustments',
  query:id=>`select=*&employee_id=eq.${id}&order=effective_date.desc`
 }),
 Object.freeze({
  key:'payroll',
  table:'hr_payroll_items',
  query:id=>`select=*&employee_id=eq.${id}&order=id.desc`
 }),
 Object.freeze({
  key:'accounts',
  table:'hr_staff_accounts',
  query:id=>`select=*&employee_id=eq.${id}`
 }),
 Object.freeze({
  key:'devices',
  table:'hr_attendance_devices',
  query:id=>`select=*&employee_id=eq.${id}`
 })
]);

async function loadOptional(def,id,read){
 try{
  const rows=await read(def.table,def.query(id));
  return Object.freeze({
   rows:Array.isArray(rows)?rows:[],
   available:true,
   error:null
  });
 }catch(error){
  const classification=classifyOptionalError(error);
  return Object.freeze({
   rows:[],
   available:false,
   error:Object.freeze({
    kind:classification.kind,
    code:classification.code,
    retryable:classification.retryable,
    message:classification.user_message,
    technical_message:errorText(error)
   })
  });
 }
}

async function load(employeeId,read){
 const id=asPositiveId(employeeId);
 if(typeof read!=='function'){
  const error=new Error('HR profile reader is required');
  error.code='HR_PROFILE_READER_REQUIRED';
  throw error;
 }

 // Employee identity is mandatory and never degraded.
 const employeeRows=await read('hr_employees',`select=*&id=eq.${id}`);
 const employee=Array.isArray(employeeRows)?employeeRows[0]:null;
 if(!employee){
  const error=new Error(`HR employee not found: ${id}`);
  error.code='HR_EMPLOYEE_NOT_FOUND';
  throw error;
 }

 const pairs=await Promise.all(
  OPTIONAL_SECTIONS.map(async def=>[def.key,await loadOptional(def,id,read)])
 );
 const sections=Object.fromEntries(pairs);

 return Object.freeze({
  version:VERSION,
  employee:Object.freeze({...employee}),
  sections:Object.freeze(sections)
 });
}

return Object.freeze({
 VERSION,
 OPTIONAL_SECTIONS,
 classifyOptionalError,
 load
});
});