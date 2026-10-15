// Pure validation used by the SH-0008 staff Edge and its local unit tests.
// There is no network, admin key, user creation or SQL in this module.
export const TOP_CHICKEN_BUSINESS='5358328c-9724-49aa-affc-1bce8be90f92';
export const TOP_CHICKEN_BRANCH=22;
export const REQUEST_ID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const PERMISSION_ALLOWLIST=new Set([
  'home',
  'pos',
  'orders',
  'returns',
  'returnExecute',
  'returnApprovals',
  'customers',
  'deliveryOrders',
  'deliverySettlement',
  'deliveryPaymentCorrection',
  'shifts',
  'expenses',
  'reports',
  'products',
  'promoCodes',
  'deliverySettings',
  'kitchen',
  'inventory',
  'settings',
  'branchProductAvailability',
  'websiteBranchSettings',
  'branchManagement',
  'businessSettings',
  'printingSettings',
  'financialSettings',
  'websiteAppearance',
  'discount',
  'hr.employees.view',
  'hr.employees.create',
  'hr.employees.edit',
  'hr.salary.view',
  'hr.salary.manage',
  'hr.attendance.view',
  'hr.attendance.manage',
  'hr.attendance.adjust',
  'hr.schedules.view',
  'hr.schedules.manage',
  'hr.geofence.manage',
  'hr.staff_accounts.manage',
  'hr.leave.view',
  'hr.leave.manage',
  'hr.deduction_rules.view',
  'hr.deduction_rules.manage',
  'hr.advances.view',
  'hr.advances.create',
  'hr.advances.approve',
  'hr.advances.disburse',
  'hr.adjustments.view',
  'hr.adjustments.manage',
  'hr.payroll.view',
  'hr.payroll.run',
  'hr.payroll.approve',
  'hr.payroll.pay',
  'hr.reports.view',
  'hr.settings.manage',
  'branch.hr.adjustments.request',
  'branch.hr.finance.view',
  'branch.hr.finance.disburse',
  'treasury.post',
]);
export function staffCreatePayload(body){
  if(!body||body.action!=='create')throw Error('ACTION_NOT_SUPPORTED');
  const email=String(body.username||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>255)
    throw Error('VALID_EMAIL_REQUIRED');
  const name=String(body.name||'').trim();
  const password=String(body.password||'');
  const role=String(body.role||'').trim().toLowerCase();
  const requestId=String(body.request_id||'').trim();
  const ids=Array.isArray(body.branch_ids)?body.branch_ids:[];
  if(!name||name.length>120)throw Error('STAFF_NAME_INVALID');
  if(password.length<8||password.length>128)throw Error('PASSWORD_MIN_8_REQUIRED');
  if(!['cashier','callcenter','admin'].includes(role))throw Error('ROLE_INVALID');
  if(Number(body.branch_id)!==22||!ids.length||ids.some(x=>Number(x)!==22))throw Error('BRANCH_22_ONLY');
  if(!REQUEST_ID_RE.test(requestId))throw Error('REQUEST_ID_INVALID');
  if(!Array.isArray(body.permissions)||body.permissions.length>100)throw Error('PERMISSION_LIST_INVALID');
  const permissions=role==='admin'?[]:[...new Set(body.permissions.map(x=>String(x).trim()))].sort();
  if(permissions.some(x=>!PERMISSION_ALLOWLIST.has(x)))throw Error('PERMISSION_NOT_ALLOWLISTED');
  return {action:'create',username:email,name,password,role,active:body.active!==false,
    branch_id:22,branch_ids:[22],permissions,request_id:requestId};
}
export async function staffDigest(payload){
  // The digest binds the exact request including the password without persisting it.
  // Only the SHA-256, never a plaintext credential, reaches the SQL receipt.
  const ordered={email:payload.username,name:payload.name,password:payload.password,
    role:payload.role,active:payload.active,branch_id:22,permissions:payload.permissions};
  const bytes=new TextEncoder().encode(JSON.stringify(ordered));
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

export function staffManagePayload(body){
  if(!body||!['edit','toggle','password'].includes(body.action))
    throw Error('STAFF_ACTION_NOT_SUPPORTED');
  const id=Number(body.employee_id);
  if(!Number.isSafeInteger(id)||id<=0)throw Error('EMPLOYEE_ID_INVALID');
  const requestId=String(body.request_id||'').trim();
  if(!REQUEST_ID_RE.test(requestId))throw Error('REQUEST_ID_INVALID');
  const branch=Number(body.branch_id);
  if(branch!==TOP_CHICKEN_BRANCH||!Array.isArray(body.branch_ids)
     ||body.branch_ids.length!==1||Number(body.branch_ids[0])!==TOP_CHICKEN_BRANCH)
    throw Error('BRANCH_22_ONLY');
  const action=body.action;
  if(action==='password'){
    const password=String(body.password||'');
    if(password.length<8||password.length>128)throw Error('PASSWORD_MIN_8_REQUIRED');
    return {action,employee_id:id,branch_id:TOP_CHICKEN_BRANCH,branch_ids:[22],
      password,request_id:requestId};
  }
  if(typeof body.active!=='boolean')throw Error('ACTIVE_BOOLEAN_REQUIRED');
  if(action==='toggle')return {action,employee_id:id,branch_id:TOP_CHICKEN_BRANCH,
    branch_ids:[22],active:body.active,request_id:requestId};
  const name=String(body.name||'').trim();
  const role=String(body.role||'').trim().toLowerCase();
  if(!name||name.length>120)throw Error('STAFF_NAME_INVALID');
  if(!['cashier','callcenter','admin'].includes(role))throw Error('ROLE_INVALID');
  if(!Array.isArray(body.permissions)||body.permissions.length>100)throw Error('PERMISSION_LIST_INVALID');
  const perms=role==='admin'?[]:[...new Set(body.permissions.map(v=>String(v).trim()))].sort();
  if(perms.some(v=>!PERMISSION_ALLOWLIST.has(v)))throw Error('PERMISSION_NOT_ALLOWLISTED');
  return {action,employee_id:id,branch_id:TOP_CHICKEN_BRANCH,branch_ids:[22],
    name,role,active:body.active,permissions:perms,request_id:requestId};
}
export async function staffManageDigest(payload){
  const body={action:payload.action,employee_id:payload.employee_id,branch_id:22,
    ...(payload.action==='edit'?{name:payload.name,role:payload.role,
      active:payload.active,permissions:payload.permissions}:
      payload.action==='toggle'?{active:payload.active}:{password:payload.password})};
  const raw=new TextEncoder().encode(JSON.stringify(body));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)))
    .map(v=>v.toString(16).padStart(2,'0')).join('');
}
