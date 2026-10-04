const fs=require('fs');
function read(p){return fs.readFileSync(p,'utf8')}
function assert(ok,msg){if(!ok){console.error('MOBILE_RETURN_APPROVAL_V1_FAIL:',msg);process.exit(1)}}
const app=read('top-burger-mobile/app.js');
const engine=read('top-burger-mobile/restaurant-engine.js');
const html=read('top-burger-mobile/index.html');
const sw=read('top-burger-mobile/sw.js');

for(const marker of [
  "page==='approvals'",
  "hasFeaturePermission('returnApprovals')",
  'startReturnApprovalWatch',
  'renderReturnApprovals',
  'decide_order_return_approval_v1',
  "طلب اعتماد مرتجع جديد",
  'stopReturnApprovalWatch()'
]) assert(app.includes(marker),'app '+marker);
for(const marker of [
  "approvals:'returns'",
  "approvals:'موافقات المدير'",
  "['returnApprovals','✅ اعتماد المرتجعات']"
]) assert(engine.includes(marker),'engine '+marker);
assert(html.includes('data-page="approvals"'),'approval nav');
assert(html.includes('id="returnApprovalBadge"'),'approval badge');
assert(html.includes('topburger-return-approval-v1.1'),'asset cache bust');
assert(sw.includes('top-burger-mobile-return-approval-v1-1'),'service worker cache');
console.log('MOBILE_RETURN_APPROVAL_V1_PASS');
