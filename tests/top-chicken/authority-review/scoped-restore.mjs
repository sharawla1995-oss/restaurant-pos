// Restore only the actual affected-object snapshot into a fresh local fixture. Never a full DB claim.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {setup,db,q,serviceQuery} from './fixture.mjs';
const input=process.env.TC_SCOPED_BACKUP_PATH;if(!input||!input.startsWith('/workspace/scratch/'))throw Error('Private local snapshot path required');
const bytes=fs.readFileSync(input),backup=JSON.parse(bytes);assert.equal(backup.project_ref,'xihcxydjnzemflhedzor');assert.equal(backup.functions.length,6);
const qi=s=>'"'+s.replaceAll('"','""')+'"';const results=[];
try{
 await setup();await db.exec('RESET ROLE');
 for(const table of ['operational_business_identity_v1','operational_feature_entitlements_v1']){
  const cols=backup.columns.filter(c=>c.table_name===table);const existing=new Set((await q("select column_name from information_schema.columns where table_schema='sharawla_internal' and table_name=$1",[table])).map(c=>c.column_name));
  for(const c of cols)if(!existing.has(c.column_name))await db.exec(`ALTER TABLE sharawla_internal.${qi(table)} ADD COLUMN ${qi(c.column_name)} ${c.type}${c.default_expr?' DEFAULT '+c.default_expr:''}${c.notnull?' NOT NULL':''}`);
  const rows=table==='operational_business_identity_v1'?backup.identity_rows:backup.feature_rows;
  const fields=cols.map(c=>qi(c.column_name)).join(',');
  const upsert=table==='operational_business_identity_v1'?' ON CONFLICT(id) DO UPDATE SET '+cols.filter(c=>c.column_name!=='id').map(c=>qi(c.column_name)+'=excluded.'+qi(c.column_name)).join(','):'';
  await q(`INSERT INTO sharawla_internal.${qi(table)}(${fields}) SELECT ${fields} FROM jsonb_populate_recordset(NULL::sharawla_internal.${qi(table)},$1::jsonb)${upsert}`, [JSON.stringify(rows)]);
  const restored=(await q(`SELECT jsonb_agg(to_jsonb(t)) as rows FROM sharawla_internal.${qi(table)} t`))[0].rows;
  const sorted=a=>a.map(x=>JSON.stringify(x,Object.keys(x).sort())).sort();assert.deepEqual(sorted(restored),sorted(rows));results.push({name:table+' actual rows restored exactly',result:'PASS',count:rows.length});
 }
 for(const f of backup.functions){await db.exec(f.definition);const digest=(await q('select md5(pg_get_functiondef($1::regprocedure)) as digest',[f.signature]))[0].digest;assert.equal(digest,f.digest);results.push({name:f.signature+' original definition restored',result:'PASS',digest});}
 const result={scope:backup.scope,source_version:backup.server_version,target_version:(await q('select version() as version'))[0].version,backup_sha256:createHash('sha256').update(bytes).digest('hex'),full_database_backup:'BLOCKED: PostgreSQL17 export connection/credentials unavailable; not executed',full_database_restore:'NOT EXECUTED',results};fs.writeFileSync('evidence/top-chicken/authority-review/scoped-restore-results.json',JSON.stringify(result,null,2));console.log('PASS actual scoped rollback snapshot restore:',results.length,'checks; NOT a full database restore');process.exit(0);
}catch(e){console.error(e.stack);fs.writeFileSync('evidence/top-chicken/authority-review/scoped-restore-results.json',JSON.stringify({results,error:e.message,full_database_restore:'NOT EXECUTED'},null,2));process.exit(1);}
