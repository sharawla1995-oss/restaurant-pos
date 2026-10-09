// Beta-only one-time first-admin provisioning.
// Run from an authorized operator environment with env secrets; never deploy this as a public endpoint.
// Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FIRST_ADMIN_PASSWORD.
// Requires npm dependency @supabase/supabase-js v2.
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

const BUSINESS='5358328c-9724-49aa-affc-1bce8be90f92';
const BRANCH=22;
const USERNAME='topchicken';
const EXPECTED_URL='https://xihcxydjnzemflhedzor.supabase.co';
const url=process.env.SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const password=process.env.FIRST_ADMIN_PASSWORD;
if(url!==EXPECTED_URL)throw new Error('Refusing non-Beta Supabase target');
if(!key||!password||password.length<12||!/[A-Z]/.test(password)||!/[a-z]/.test(password)||!/[0-9]/.test(password))throw new Error('Provide a new strong password via FIRST_ADMIN_PASSWORD (12+ mixed-case letters and digits)');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const one=async(table,filter)=>{let q=db.from(table).select('*');for(const [k,v] of Object.entries(filter))q=q.eq(k,v);const {data,error}=await q.maybeSingle();if(error)throw error;return data};
const business=await one('businesses',{id:BUSINESS});
const branch=await one('branches',{id:BRANCH});
if(!business||business.active!==true||business.code!=='top-chicken'||!branch||branch.business_id!==BUSINESS||branch.name!=='TOP CHICKEN 20')throw new Error('Canonical Beta tenant/branch mismatch');
const existing=await one('employees',{username:USERNAME});
if(existing)throw new Error('Username already exists; refusing overwrite');
const hash=createHash('sha256').update(USERNAME).digest('hex');
const internalEmail=`u-${hash.slice(0,32)}@sharawla.local`;
let authId=null,employeeId=null;
try{
 const {data:auth,error:authError}=await db.auth.admin.createUser({email:internalEmail,password,email_confirm:true,user_metadata:{sharawla_username:USERNAME}});
 if(authError||!auth?.user)throw authError||new Error('Auth creation failed');
 authId=auth.user.id;
 const {data:employee,error:empError}=await db.from('employees').insert({name:'Top Chicken Admin',username:USERNAME,role:'admin',branch_id:BRANCH,business_id:BUSINESS,active:true,auth_user_id:authId}).select('id').single();
 if(empError||!employee)throw empError||new Error('Employee creation failed');
 employeeId=employee.id;
 const {error:branchError}=await db.from('employee_branches').insert({employee_id:employeeId,branch_id:BRANCH,business_id:BUSINESS});
 if(branchError)throw branchError;
 const {error:memberError}=await db.from('business_auth_memberships').insert({auth_user_id:authId,business_id:BUSINESS,active:true,source:'operator-top-chicken-first-admin'});
 if(memberError)throw memberError;
 console.log('Top Chicken first admin provisioned; verify login on SH-0008');
}catch(error){
 // Compensate only rows owned by this newly created Auth identity.
 if(authId){
  await db.from('business_auth_memberships').delete().eq('auth_user_id',authId).eq('business_id',BUSINESS);
  if(employeeId)await db.from('employee_branches').delete().eq('employee_id',employeeId).eq('business_id',BUSINESS);
  if(employeeId)await db.from('employees').delete().eq('id',employeeId).eq('business_id',BUSINESS);
  await db.auth.admin.deleteUser(authId);
 }
 throw error;
}
