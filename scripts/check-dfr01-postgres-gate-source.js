#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=process.argv[2]||process.cwd();
const workflow=fs.readFileSync(path.join(root,'.github/workflows/dfr01-postgres-compile.yml'),'utf8');
const fixture=fs.readFileSync(path.join(root,'scripts/dfr01-postgres-integration-fixture.sql'),'utf8');
const reportSql=fs.readFileSync(path.join(root,'supabase-dfr01-readonly-report-drilldowns.sql'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(workflow.includes('image: postgres:16'),'gate must use PostgreSQL 16');
ok(workflow.includes('test -z "${SUPABASE_URL:-}"'),'gate must assert no SUPABASE_URL');
ok(workflow.includes('test -z "${SUPABASE_DB_URL:-}"'),'gate must assert no SUPABASE_DB_URL');
ok(workflow.includes('test -z "${DATABASE_URL:-}"'),'gate must assert no DATABASE_URL');
ok(!/supabase\.co|SUPABASE_SERVICE_ROLE|service_role/i.test(workflow),'workflow must not contain live Supabase endpoint/credential material');
ok(fixture.includes('\\ir supabase-dfr01-readonly-report-drilldowns.sql'),'fixture must compile the exact DFR-01 SQL artifact');
ok(fixture.includes('DFR01_POSTGRES_INTEGRATION_PASS'),'fixture PASS marker missing');
for(const s of [
 'cash net expected 60',
 'wallet net expected 20',
 'branch/date isolated sales expected 150',
 'customer 100 net expected 80',
 'walk-in net expected 50',
 'Ali net activity expected 100',
 'Sara net activity expected 30',
 'supplier net expected 40',
 'PO outstanding qty expected 4',
 'expected branch access denial'
]) ok(fixture.includes(s),`fixture assertion missing: ${s}`);
ok((reportSql.match(/public\.has_permission\('reports'\)/g)||[]).length===6,'expected six reports permission gates');
ok((reportSql.match(/public\.has_branch_access\(p_branch_id\)/g)||[]).length>=6,'expected six branch guards');
ok((reportSql.match(/from (po_docs|grn_docs|return_docs) d group by d\.employee_id/g)||[]).length===3,'purchase role CTEs must qualify employee_id');
console.log('DFR-01 POSTGRES GATE SOURCE PASS — isolated PG16 workflow + integration fixture + safety assertions');

