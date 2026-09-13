(function(global){
'use strict';
const VERSION='10.5.4-beta.50';
const RUNTIME_KEY='sharawlaRuntimeConfigV1',CONNECTION_KEY='sharawlaBusinessConnectionV1';
const ACTIVE_KEY='sharawlaAcceptanceActiveV3',HISTORY_KEY='sharawlaAcceptanceHistoryV3',RESUME_KEY='sharawlaAcceptanceResumeV3';
const BETA_BUSINESS_ID='91826502-590e-4afa-8826-2c0f4b99c490',BETA_HOST='xihcxydjnzemflhedzor.supabase.co',BETA_SUPPORT='SH-0007';
const tests=new Map();
let current=null;
const now=()=>new Date().toISOString();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const json=(k,d=null)=>{try{return JSON.parse(localStorage.getItem(k)||'null')??d}catch{return d}};
const put=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}return v};
const runtime=()=>json(RUNTIME_KEY,{})||{};
const connection=()=>json(CONNECTION_KEY,{})||{};
const text=v=>String(v??'').trim();
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
function sanitize(v,depth=0){
 if(depth>8)return '[depth-limit]';
 if(Array.isArray(v))return v.slice(0,300).map(x=>sanitize(x,depth+1));
 if(v&&typeof v==='object'){
  const out={};for(const [k,x] of Object.entries(v)){
   if(/fingerprint|password|secret|publishable|access_token|refresh_token|authorization|apikey|(^|_)key$/i.test(k)){out[k]='[REDACTED]';continue}
   out[k]=sanitize(x,depth+1);
  }return out;
 }
 if(typeof v==='string'&&v.length>4000)return v.slice(0,4000)+'…';
 return v;
}
function ownerUnlocked(){try{return global.__SharawlaOwnerDiagnostics?.isUnlocked?.()===true}catch{return false}}
async function license(){try{return await global.topBurgerDesktop?.licenseState?.get?.()||null}catch{return null}}
function connectionHost(){try{return new URL(connection().url||'').host}catch{return''}}
async function sandboxLock({requireOwner=true}={}){
 const [st,rc]=await Promise.all([license(),Promise.resolve(runtime())]);
 const support=text(st?.support_code),business=text(rc.business_id||connection().business_id||st?.business_id),host=connectionHost();
 const reasons=[];
 if(requireOwner&&!ownerUnlocked())reasons.push('owner_locked');
 if(support!==BETA_SUPPORT)reasons.push('support_not_SH-0007');
 if(business!==BETA_BUSINESS_ID)reasons.push('business_not_sandbox');
 if(host!==BETA_HOST)reasons.push('backend_not_sandbox');
 return {ok:reasons.length===0,reasons,support_code:support||null,business_id:business||null,host:host||null,profile:text(rc.pos_profile)||null};
}
function normalizeTest(t){
 if(!t||!text(t.id)||typeof t.run!=='function')throw new Error('Acceptance test requires id + run()');
 return Object.freeze({id:text(t.id),name:text(t.name||t.id),pack:text(t.pack||'core'),profile:text(t.profile||'any'),level:text(t.level||'quick'),mode:text(t.mode||'readonly'),critical:t.critical===true,features:[...(t.features||[])].map(text),dependsOn:[...(t.dependsOn||[])].map(text),quarantined:t.quarantined===true,run:t.run});
}
function register(t){const x=normalizeTest(t);if(tests.has(x.id))throw new Error(`Duplicate acceptance test: ${x.id}`);tests.set(x.id,x);return x}
function registerMany(rows){return (rows||[]).map(register)}
function list(){return [...tests.values()].map(({run,...x})=>x)}
function history(){return json(HISTORY_KEY,[])||[]}
function lastResult(id){for(const r of history())for(const x of r.results||[])if(x.id===id)return x;return null}
function lastComparableResult(id,ctx){
 for(const r of history()){
  if(text(r.harness_version)!==VERSION)continue;
  if(text(r.profile)!==text(ctx.profile)||text(r.level)!==text(ctx.level)||text(r.mode)!==text(ctx.mode))continue;
  for(const x of r.results||[])if(x.id===id)return x;
 }
 return null;
}
function runId(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `ACC-${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${Math.random().toString(36).slice(2,7).toUpperCase()}`}
async function environment(){
 const [app,st,lock]=await Promise.all([global.topBurgerDesktop?.app?.info?.().catch(()=>null),license(),sandboxLock({requireOwner:false})]);
 const rc=runtime();return sanitize({app,device:{support_code:st?.support_code||null,device_id:st?.device_id||null,canonical_fingerprint_present:!!text(st?.device_fingerprint)},business:{id:rc.business_id||connection().business_id||null,name:rc.business_name||connection().business_name||null,host:connectionHost(),profile:rc.pos_profile||null,modules:rc.enabled_modules||[],features:rc.enabled_features||[],capability_version:rc.capability_version??null},sandbox:lock});
}
async function baseline(){
 const a=global.topBurgerDesktop?.offlineV2;
 const b={at:now(),branch_id:Number(global.currentBranchId?.()||0),employee_id:Number(global.state?.employee?.id||0)};
 try{b.offline={health:await a?.health?.(),sync:await a?.syncStats?.(),inbox:await a?.inboxStats?.(),inventory:await a?.inventoryStats?.({}),guard:await a?.guardState?.()}}catch(e){b.offline_error=text(e?.message||e)}
 if(typeof global.rest==='function'&&b.branch_id){for(const [k,table] of [['orders','orders'],['returns','returns'],['expenses','expenses']]){try{const rows=await global.rest(table,`select=id&branch_id=eq.${b.branch_id}&limit=1000`);b[`${k}_count`]=Array.isArray(rows)?rows.length:null}catch{b[`${k}_count`]=null}}try{const c=await global.rest('customers','select=id&limit=1000');b.customers_count=Array.isArray(c)?c.length:null}catch{b.customers_count=null}}
 return sanitize(b);
}
function resultStatus(v){const s=text(v||'PASS').toUpperCase();return ['PASS','FAIL','BLOCKED','MANUAL','SKIPPED','FLAKY','QUARANTINED'].includes(s)?s:'FAIL'}
function levelsAllow(testLevel,requested){const order={quick:1,full:2,chaos:3};return (order[testLevel]||1)<=(order[requested]||1)}
function statusCounts(rows){return (rows||[]).reduce((a,x)=>(a[x.status]=(a[x.status]||0)+1,a),{})}
function score(rows){const auto=(rows||[]).filter(x=>!['MANUAL','SKIPPED','QUARANTINED'].includes(x.status)),pass=auto.filter(x=>x.status==='PASS').length;return auto.length?Math.round(pass*10000/auto.length)/100:100}
function readiness(rows){const critical=(rows||[]).filter(x=>x.critical&&['FAIL','BLOCKED','FLAKY'].includes(x.status));const failed=(rows||[]).filter(x=>['FAIL','BLOCKED','FLAKY'].includes(x.status));return {status:critical.length?'BLOCKED':failed.length?'NOT_READY':'READY_FOR_RC',critical_failures:critical.map(x=>x.id),failures:failed.map(x=>x.id),coverage_score:score(rows),counts:statusCounts(rows)} }
function persistActive(){if(current)put(ACTIVE_KEY,sanitize(current));else localStorage.removeItem(ACTIVE_KEY)}
async function executeTest(t,ctx){
 const started=now(),previous=lastComparableResult(t.id,ctx);
 if(t.quarantined)return {id:t.id,name:t.name,pack:t.pack,critical:t.critical,status:'QUARANTINED',detail:'quarantined by registry',started_at:started,ended_at:now()};
 for(const d of t.dependsOn){const dep=ctx.results.find(x=>x.id===d);if(!dep||dep.status!=='PASS')return {id:t.id,name:t.name,pack:t.pack,critical:t.critical,status:'BLOCKED',detail:`dependency=${d}`,started_at:started,ended_at:now()}}
 if(['write','recovery','chaos'].includes(t.mode)){const lock=await sandboxLock();if(!lock.ok)return {id:t.id,name:t.name,pack:t.pack,critical:t.critical,status:'BLOCKED',detail:`sandbox_lock=${lock.reasons.join(',')}`,evidence:sanitize(lock),started_at:started,ended_at:now()}}
 try{
  const out=await t.run({...ctx,test:t,registry:api,run_id:ctx.run_id});const status=resultStatus(out?.status||'PASS'),detail=text(out?.detail||'');let final=status;
  if(previous&&['PASS','FAIL'].includes(previous.status)&&['PASS','FAIL'].includes(status)&&previous.status!==status)final='FLAKY';
  return {id:t.id,name:t.name,pack:t.pack,critical:t.critical,status:final,raw_status:status,detail,evidence:sanitize(out?.evidence||null),started_at:started,ended_at:now()};
 }catch(e){return {id:t.id,name:t.name,pack:t.pack,critical:t.critical,status:'FAIL',detail:text(e?.message||e),evidence:sanitize({code:e?.code,stack:e?.stack}),started_at:started,ended_at:now()}}
}
async function start(opts={}){
 if(current?.status==='RUNNING')throw new Error('Acceptance run already active');
 const level=text(opts.level||'quick').toLowerCase(),mode=text(opts.mode||'readonly').toLowerCase(),profile=text(runtime().pos_profile||'').toLowerCase();
 const selected=[...tests.values()].filter(t=>levelsAllow(t.level,level)&&(t.profile==='any'||t.profile===profile)&&(!opts.packs||opts.packs.includes(t.pack))&&(!opts.ids||opts.ids.includes(t.id)));
 if(mode!=='readonly'&&selected.some(t=>['write','recovery','chaos'].includes(t.mode))){const lock=await sandboxLock();if(!lock.ok)throw new Error(`Sandbox lock failed: ${lock.reasons.join(', ')}`)}
 current={schema:4,harness_version:VERSION,run_id:runId(),status:'RUNNING',level,mode,profile,started_at:now(),environment:await environment(),baseline_before:await baseline(),results:[],selected:selected.map(t=>t.id)};persistActive();
 const ctx={run_id:current.run_id,level,mode,profile,results:current.results,state:{},evidence:{}};
 for(const t of selected){const r=await executeTest(t,ctx);current.results.push(r);ctx.results=current.results;persistActive();global.dispatchEvent(new CustomEvent('sharawla-acceptance-progress',{detail:sanitize({run_id:current.run_id,result:r})}));if(t.critical&&['FAIL','BLOCKED','FLAKY'].includes(r.status)&&opts.failFast!==false)break}
 current.baseline_after=await baseline();current.ended_at=now();current.readiness=readiness(current.results);current.status='COMPLETED';const h=[sanitize(current),...history()].slice(0,20);put(HISTORY_KEY,h);persistActive();global.dispatchEvent(new CustomEvent('sharawla-acceptance-complete',{detail:sanitize(current)}));return clone(current);
}
function active(){return current?clone(current):json(ACTIVE_KEY,null)}
function setResume(step,data={}){const v={run_id:current?.run_id||data.run_id||null,step:text(step),data:sanitize(data),expires_at:Date.now()+15*60*1000,created_at:now()};put(RESUME_KEY,v);return v}
function resume(){const r=json(RESUME_KEY,null);if(!r||Number(r.expires_at||0)<Date.now()){localStorage.removeItem(RESUME_KEY);return null}return r}
function clearResume(){localStorage.removeItem(RESUME_KEY)}
function coverage(){const rc=runtime(),enabled=new Set((rc.enabled_features||[]).map(text)),covered=new Set();for(const t of tests.values())for(const f of t.features)covered.add(f);const rows=[...enabled].map(f=>({feature:f,covered:covered.has(f),tests:[...tests.values()].filter(t=>t.features.includes(f)).map(t=>t.id)}));return {enabled:enabled.size,covered:rows.filter(x=>x.covered).length,uncovered:rows.filter(x=>!x.covered).map(x=>x.feature),rows}}
function report(run=current||history()[0]){if(!run)return 'No acceptance run';const hv=run.harness_version||VERSION,lines=['Sharawla Full Acceptance',`${hv} — ${run.run_id}`,`Profile: ${run.profile} • Level: ${run.level} • Mode: ${run.mode}`,`Readiness: ${run.readiness?.status||run.status} • Coverage Score: ${run.readiness?.coverage_score??'—'}%`,'',...(run.results||[]).map(x=>`${x.id.padEnd(40,'.')} ${x.status}${x.detail?` — ${x.detail}`:''}`),'',`Generated: ${now()}`];return lines.join('\n')}
function resetHistory(){localStorage.removeItem(HISTORY_KEY);localStorage.removeItem(ACTIVE_KEY);localStorage.removeItem(RESUME_KEY);current=null}
const api=Object.freeze({version:VERSION,register,registerMany,list,start,active,history,lastResult,sandboxLock,environment,baseline,coverage,report,setResume,resume,clearResume,resetHistory,sanitize,sleep});
current=json(ACTIVE_KEY,null);if(current?.status!=='RUNNING'||text(current?.harness_version)!==VERSION)current=null;
global.__SharawlaAcceptanceRegistry=api;
global.dispatchEvent(new CustomEvent('sharawla-acceptance-registry-ready',{detail:{version:VERSION}}));
})(window);
