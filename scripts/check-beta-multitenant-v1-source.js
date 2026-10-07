'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const need=(s,t,l)=>{if(!s.includes(t))throw new Error(`${l} missing: ${t}`)};
const reject=(s,re,l)=>{if(re.test(s))throw new Error(l)};

const f=read('supabase-beta-multitenant-v1-foundation-DRAFT.sql');
const r=read('supabase-beta-multitenant-v1-rls-DRAFT.sql');
const d=read('docs/SHARAWLA_BETA_MULTITENANT_V1_AUDIT.md');

for(const s of [f,r]) need(s,"current_setting('sharawla.multitenant_apply', true)",'explicit Beta apply guard');
need(f,"values ('beta-current','تجريبي',false)",'historical tenant seed');
need(f,'external_business_id text unique','external Sharawla business binding');
need(f,"c.relname not in (\n        'businesses',",'business table exclusion');
need(f,"'permission_actions_v2'","platform-global permission catalog");
need(f,'No random child mapping','canonical parent comment');
need(f,"parent.relname='branches'",'branch canonical backfill');
need(f,'update public.%I c set business_id=p.business_id','parent-derived backfill');
need(f,'MULTITENANT_V1 unresolved business ownership','unresolved-row hard stop');
need(f,'MULTITENANT_V1 parent tenant mismatch','cross-parent mismatch hard stop');
need(f,"array['business_settings','website_settings']", 'legacy singleton compatibility');
need(f,'add primary key (business_id,id)','per-tenant logical id=1');

need(r,'create or replace function public.current_business_id()','authenticated tenant helper');
need(r,'create or replace function public.request_business_id()','public tenant helper');
need(r,"h->>'x-sharawla-business'",'public tenant header');
need(r,'as restrictive for all to authenticated','restrictive authenticated RLS');
need(r,'as restrictive for select to anon','restrictive anon RLS');
need(r,'CROSS_TENANT_WRITE_DENIED','cross-tenant write guard');
need(r,'CROSS_TENANT_DELETE_DENIED','cross-tenant delete guard');
need(r,'TENANT_REBIND_DENIED','tenant rebind guard');
need(r,'b.business_id=public.current_business_id()','branch access tenant binding');

reject(f,/kzokretuuigjhxjzdlmk/i,'Production project id must never appear in executable SQL');
reject(r,/kzokretuuigjhxjzdlmk/i,'Production project id must never appear in executable SQL');
need(d,'252','audit table count evidence');
need(d,'405','SECURITY DEFINER count evidence');
need(d,'230','anon SECURITY DEFINER count evidence');

console.log('Beta Multi-Tenant V1 source-preparation gate PASS');
console.log('DB apply remains blocked by explicit migration guard');
