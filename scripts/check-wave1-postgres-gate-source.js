const fs=require('fs'),path=require('path');
const root=process.argv[2]||process.cwd();
const workflow=fs.readFileSync(path.join(root,'.github/workflows/wave1-postgres-compile.yml'),'utf8');
const fixture=fs.readFileSync(path.join(root,'scripts/wave1-postgres-integration-fixture.sql'),'utf8');
for(const t of ['image: postgres:16','SUPABASE_URL','SUPABASE_DB_URL','DATABASE_URL','WAVE1_POSTGRES_INTEGRATION_PASS','WAVE1_EFFECTIVE_FUNCTIONS=5','pg_get_functiondef'])if(!workflow.includes(t)&&!fixture.includes(t))throw new Error('Wave1 PG gate missing '+t);
for(const f of ['supabase-dfr02-customer-timeline-read-model.sql','supabase-dfr04-activity-log-read-model.sql','supabase-dfr22-operational-statements.sql'])if(!workflow.includes(f)||!fixture.includes(`\\i ${f}`))throw new Error('Wave1 PG gate does not compile exact '+f);
for(const t of ['DFR02 timeline count expected 2','DFR04 leaked secret key','unknown action must have null summary','DFR22 customer event count expected 5','DFR22 supplier events expected 3'])if(!fixture.includes(t))throw new Error('Wave1 PG fixture missing assertion '+t);
if(/^\s*(SUPABASE_URL|SUPABASE_DB_URL|DATABASE_URL)\s*:/mi.test(workflow))throw new Error('Wave1 PG gate must not define live DB env');
console.log('WAVE1 PG16 GATE SOURCE PASS — ephemeral postgres:16, exact SQL load, five functions, DFR02/04/22 smoke assertions');