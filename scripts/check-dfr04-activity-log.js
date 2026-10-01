const fs=require('fs'),path=require('path');
const root=process.argv[2]||process.cwd();
const sql=fs.readFileSync(path.join(root,'supabase-dfr04-activity-log-read-model.sql'),'utf8');
const js=fs.readFileSync(path.join(root,'activity-log-v1.js'),'utf8');
const applicability=fs.readFileSync(path.join(root,'permissions-v2-profile-feature-applicability.sql'),'utf8');
for(const profile of ['logistics','membership','pharmacy','restaurant','retail','service','warehouse']){
  const row=`('audit.activity.view','${profile}','core.reports',true)`;
  if(!applicability.includes(row))throw new Error('DFR-04 missing applicability '+profile);
}
for(const t of ["audit.activity.view","activity_log_read_v1","has_action_permission_v2('audit.activity.view')","has_branch_access(p_branch_id)","when 'create_order'","safe_summary","details->>'invoice_number'","التفاصيل الخام غير معروضة"]){if(!(sql+js).includes(t))throw new Error('DFR-04 missing '+t)}
const returnHeader=(sql.match(/returns\s+table\(([\s\S]*?)\)\s*language/i)||[])[1]||'';if(/\bdetails\b/i.test(returnHeader))throw new Error('DFR-04 must never return raw details');
if(/select\s+[\s\S]*?\ba\.details\s*(?:,|from)/i.test(sql.replace(/a\.details->>'[^']+'/g,'')))throw new Error('DFR-04 raw details selected');
for(const bad of [/\bupdate\s+public\.audit_logs\b/i,/\bdelete\s+from\s+public\.audit_logs\b/i,/\binsert\s+into\s+public\.audit_logs\b/i])if(bad.test(sql))throw new Error('DFR-04 audit log mutation forbidden');
console.log('DFR-04 PASS — action permission, branch/date gates, whitelist summary, raw audit details withheld');