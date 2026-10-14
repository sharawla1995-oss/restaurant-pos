// Read-only source checks for the production-line Top Chicken primary candidate.
const fs=require('node:fs'),assert=require('node:assert/strict');
const a=fs.readFileSync('app.js','utf8'),p=JSON.parse(fs.readFileSync('package.json','utf8'));
assert.equal(p.version,'10.5.19-rc.5','Dedicated higher-version primary candidate; stable release remains unchanged');
for(const name of ['topChickenOrderOperation','transitionTopChickenOrderStatus','mutateTopChickenStaff','isTopChickenStaffContext']){
  assert.equal((a.match(new RegExp('(?:async )?function '+name+'\\(','g'))||[]).length,1,name+' present once');
}
const TC='5358328c-9724-49aa-affc-1bce8be90f92';
assert.ok(a.includes(TC));
assert.ok(a.includes("cfg.url.replace(/\\/$/,'')!=='https://xihcxydjnzemflhedzor.supabase.co'"));
assert.ok(a.includes("name='top-chicken-staff'"));
assert.ok(a.includes("callFunction('top-chicken-operations'"));
assert.ok(a.includes("'top_chicken_transition_order_status'"));
assert.ok(a.includes("'top_chicken_assign_order_driver'"));
assert.ok(a.includes("if(!editing && await isTopChickenStaffContext())"));
assert.ok(a.includes("if(await isTopChickenStaffContext())await mutateTopChickenStaff"));
assert.ok(a.includes("const d=await req('/auth/v1/token?grant_type=password'"),'legacy email login must use real Supabase Auth');
assert.ok(!a.includes("await isTopChickenStaffContext()?await callFunction('smart-function'"),'missing staff Edge function must never intercept login');
const count=(a.match(/if\(await isTopChickenStaffContext\(\)\)\{/g)||[]).length;
assert.ok(count>=7,'SCOPED guard must cover assigned driver + order transitions');
for(const needle of [
 "rest('orders',\`id=eq.\${orderId}\`,{method:'PATCH'",
 "rest('orders',\`id=eq.\${done.dataset.delivered}\`,{method:'PATCH'",
 "rest('orders',\`id=eq.\${b.dataset.id}\`,{method:'PATCH'",
 "rest('orders',\`id=eq.\${o.id}\`,{method:'PATCH',body:JSON.stringify({status:'preparing'})",
 "rest('orders',\`id=eq.\${o.id}\`,{method:'PATCH',body:JSON.stringify({status:'ready'})",
 "rest('orders',\`id=eq.\${o.id}\`,{method:'PATCH',body:JSON.stringify({status:'completed'",
 "rest('orders',\`id=eq.\${o.id}\`,{method:'PATCH',body:JSON.stringify({status:'delivered'",
])assert.ok(a.includes(needle),'original non-TC behavior must remain: '+needle);
assert.ok(a.includes("const business=String(state.employee?.business_id||'')"));
assert.ok(a.includes("if(business!=='5358328c-9724-49aa-affc-1bce8be90f92'||Number(currentBranchId())!==22"));
assert.ok(a.includes("const key=['tc-order-v2',business,actor,name,JSON.stringify(payload)]"));
console.log('PASS: v10.5.18 primary baseline TC gateway wiring and non-TC source fallbacks preserved. NOT an E2E or release approval.');
