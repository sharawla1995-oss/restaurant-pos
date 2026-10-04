const fs=require('fs');
function read(p){return fs.readFileSync(p,'utf8')}
function assert(ok,msg){if(!ok){console.error('RETURN_APPROVAL_V1_FAIL:',msg);process.exit(1)}}
const app=read('app.js');
const engine=read('restaurant-engine.js');
const html=read('index.html');
const sql=read('supabase-v10-5-6-return-approval-v1.sql');

for(const marker of [
  "page==='returns'",
  "page==='approvals'",
  "hasFeaturePermission('returnApprovals')",
  'request_order_return_approval_v1',
  'decide_order_return_approval_v1',
  'startReturnApprovalWatch',
  'waitForReturnApproval',
  'renderReturnApprovals',
  "طلب اعتماد مدير",
  "stopReturnApprovalWatch()"
]) assert(app.includes(marker),'app marker '+marker);

for(const marker of [
  "approvals:'returns'",
  "approvals:'موافقات المدير'",
  "['returnApprovals','✅ اعتماد المرتجعات']"
]) assert(engine.includes(marker),'engine marker '+marker);

assert(html.includes('data-page="approvals"'),'approvals nav');
assert(html.includes('id="returnApprovalBadge"'),'approval badge');

for(const marker of [
  'create table if not exists public.return_approval_requests',
  'request_order_return_approval_v1',
  'decide_order_return_approval_v1',
  'create_approved_order_return_v1',
  'return_approval_validate_v1',
  "public.has_permission('returnApprovals')",
  "requester_shift_id",
  "approved_by_employee_id",
  "status='approved'",
  "status='rejected'",
  "status='expired'",
  'pg_advisory_xact_lock',
  'request_digest',
  'decision_digest',
  'returns_approval_request_uidx',
  'returns_approval_request_fk'
]) assert(sql.includes(marker),'sql marker '+marker);

console.log('RETURN_APPROVAL_V1_PASS');
