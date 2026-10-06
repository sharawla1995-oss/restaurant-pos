#!/usr/bin/env python3
"""Synthetic PostgreSQL cluster only: no DSN, URL, existing database or runtime writes.
Tests actual customer canonical owners/final reference dispatcher and actual BON
trigger/V3 reservation components. Auth/schema are synthetic; not full sale economics.
"""
import argparse,json,os,pathlib,pwd,shutil,subprocess,tempfile
ROOT=pathlib.Path(__file__).resolve().parent.parent
ap=argparse.ArgumentParser();ap.add_argument('--pg-bin-dir');ap.add_argument('--result');ap.add_argument('--require-postgres',action='store_true');args=ap.parse_args()
bins={n:str(pathlib.Path(args.pg_bin_dir)/n) if args.pg_bin_dir else shutil.which(n) for n in ('initdb','pg_ctl','psql')}
missing=[n for n,v in bins.items() if not v or not os.path.isfile(v)]
if missing:
 result={'status':'NOT RUN','reason':'PostgreSQL fixture binaries unavailable: '+', '.join(missing),'runtime_db_contacted':False,'sql_proof':'NOT RUN, mock ACK is not PostgreSQL proof'}
 if args.result:pathlib.Path(args.result).write_text(json.dumps(result,indent=2))
 print(json.dumps(result));raise SystemExit(2 if args.require_postgres else 0)
version=subprocess.check_output([bins['initdb'],'--version'],text=True)
if ' 16.' not in version:
 result={'status':'NOT RUN','reason':'Required PostgreSQL16 engine; got '+version.strip(),'runtime_db_contacted':False}
 if args.result:pathlib.Path(args.result).write_text(json.dumps(result,indent=2))
 print(json.dumps(result));raise SystemExit(2)
files=[('supabase-rc1-offline-v2-runtime-alignment-final-dispatcher.sql',['sharawla_offline_v2_apply_event_reference_v1','sharawla_offline_v2_apply_event']),('supabase-beta54-shared-customer-foundation.sql',['customer_create_v2']),('permissions-v2-owner-customers-edit-address.sql',['customer_update_v2','customer_address_save_v2','customer_address_delete_v2']),('supabase-offline-v2-customer-delivery-owners-v1.sql',['offline_customer_create_v1','offline_customer_update_v1','offline_customer_address_save_v1','offline_customer_address_delete_v1']),('supabase-rc1-bon-numbering-policy-v1-source.sql',['pos_bon_business_date_v1','pos_bon_numbering_mode_v1']),('supabase-rc1-bon-numbering-policy-v1-online-migration-source.sql',['assign_order_numbers']),('supabase-rc1-bon-reservation-v2-scope-aware-source.sql',['pos_reserve_bon_range_v2','pos_consume_reserved_bon_v2']),('supabase-rc1-trusted-device-context-bon-v3-source.sql',['pos_verified_device_context_v1','pos_reserve_bon_range_v3','pos_consume_reserved_bon_v3'])]
files.extend([('permissions-v2-owner-shifts-expenses.sql',['expense_update_v2']),('supabase-offline-v2-expense-edit-source.sql',['offline_expense_update_v1']),('permissions-v2-owner-delivery-settings.sql',['delivery_driver_save_v2','delivery_zone_save_v2']),('supabase-offline-v2-restaurant-reference-owners-v1.sql',['offline_delivery_driver_save_v1','offline_delivery_zone_save_v1']),('permissions-v2-owner-order-fulfillment.sql',['order_fulfillment_transition_v2']),('permissions-v2-offline-order-status-owner.sql',['order_status_apply_offline_v2'])])
js="const s=require('./scripts/offline-reference-return-sql-contract'),fs=require('fs');let out={};for(const [f,names] of "+json.dumps(files)+"){for(const name of names)out[name]=s.last(fs.readFileSync(f,'utf8'),name).definition;}console.log(JSON.stringify(out));"
defs=json.loads(subprocess.check_output(['node','-e',js],cwd=ROOT,text=True))
work=pathlib.Path(tempfile.mkdtemp(prefix='sharawla-pg-source-fixture-'));work.chmod(0o700);uid=gid=None
if os.geteuid()==0:
 user=pwd.getpwnam('nobody');uid,gid=user.pw_uid,user.pw_gid;os.chown(work,uid,gid)
def run(cmd,**kw):return subprocess.run(cmd,env={'PATH':os.environ.get('PATH','/usr/bin:/bin'),'LANG':'C.UTF-8'},user=uid,group=gid,text=True,capture_output=True,check=True,timeout=30,**kw)
cluster=work/'cluster';socket=work/'socket';socket.mkdir()
if uid is not None:os.chown(socket,uid,gid)
run([bins['initdb'],'-D',str(cluster),'-U','fixture','-A','trust','--no-locale'])
run([bins['pg_ctl'],'-D',str(cluster),'-l',str(work/'postgres.log'),'-o',f"-F -c listen_addresses='' -k {socket} -p 55439",'-w','start'])
checks=[]
def sql(q):return run([bins['psql'],'-X','-h',str(socket),'-p','55439','-U','fixture','-d','postgres','-v','ON_ERROR_STOP=1','-At'],input=q).stdout.strip()
def call(e):return json.loads(sql("select sharawla_offline_v2_apply_event('"+json.dumps(e).replace("'","''")+"'::jsonb)::text;"))
def check(label,q):
 assert sql('select ('+q+')::text;')=='true',label;checks.append({'test':label,'status':'PASS'})
def reject(label,e,text):
 try:call(e)
 except subprocess.CalledProcessError as ex:
  assert text in ex.stderr,(label,ex.stderr);checks.append({'test':label,'status':'PASS'});return
 raise AssertionError(label+' unexpectedly accepted')
def event(tx,op,rpc,p,seq=1):return {'client_tx_id':tx,'payload_digest':'d-'+tx,'protocol_version':2,'operation_type':op,'device_id':'fixture','device_sequence':seq,'branch_id':70007,'employee_id':7,'payload':{'rpc_name':rpc,'rpc_payload':{**p,'p_client_tx_id':tx}}}

try:
 sql("""
 create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql as $$select '11111111-1111-4111-8111-111111111111'::uuid$$;
 create function current_employee_id() returns bigint language sql as $$select 7::bigint$$;
 create function has_action_permission_v2(text) returns boolean language sql as $$select true$$;
 create function has_branch_access(bigint) returns boolean language sql as $$select $1=70007$$;
 create table branches(id bigint primary key);insert into branches values(70007),(70008);
 create table employees(id bigint primary key,branch_id bigint);insert into employees values(7,70007);
 create table audit_logs(employee_id bigint,branch_id bigint,action text,entity_type text,entity_id bigint,details jsonb,created_at timestamptz);
 create table customers(id bigserial primary key,name text,phone text,area text,address text,notes text,created_at timestamptz,updated_at timestamptz);
 create table customer_addresses(id bigserial primary key,customer_id bigint references customers(id),label text,area text,address text,notes text,is_default boolean);
 create table offline_customer_delivery_receipts_v1(client_tx_id text primary key,operation_type text,payload_digest text,entity_id bigint,result_json jsonb,created_at timestamptz default now());
 create table offline_v2_server_receipts(client_tx_id text primary key,server_event_id text default gen_random_uuid()::text,protocol_version int,payload_digest text,operation_type text,rpc_name text,device_id text,device_sequence bigint,branch_id bigint,employee_id bigint,auth_user_id uuid,server_entity_id text,server_version text,result_json jsonb);
 create table shifts(id bigint primary key,branch_id bigint,employee_id bigint,status text,opened_at timestamptz,closed_at timestamptz,client_open_tx_id text);
 insert into shifts values(42,70007,7,'open',now(),null,'fixture-shift');
 create table orders(id bigserial primary key,client_tx_id text unique,branch_id bigint,employee_id bigint,shift_id bigint,invoice_number bigint,bon_number int,bon_numbering_mode text,bon_business_date date);
 create unique index fixture_shift_bon_unique on orders(shift_id,bon_number);
 create table branch_invoice_counters(branch_id bigint primary key,next_number bigint);
 create table shift_bon_counters(shift_id bigint primary key,branch_id bigint,next_number bigint);
 create table branch_bon_counters_v1(branch_id bigint,business_date date,next_number bigint,primary key(branch_id,business_date));
 create table branch_bon_numbering_policy(branch_id bigint primary key,bon_numbering_mode text,bon_day_timezone text);
 insert into branch_bon_numbering_policy values(70007,'SHIFT','Africa/Cairo');
 """)
 for f in ['supabase-rc1-bon-reservation-v2-scope-aware-source.sql','supabase-rc1-trusted-device-context-bon-v3-source.sql']:
  # Table/index/ACL prefixes only in the fresh fixture, no complete migration execution.
  sql((ROOT/f).read_text().split('create or replace function')[0])
 sql("""
 create table expenses(id bigserial primary key,branch_id bigint,employee_id bigint,shift_id bigint,description text,amount numeric,created_at timestamptz);
 insert into expenses(id,branch_id,employee_id,shift_id,description,amount) values(100,70007,7,42,'Old',5);
 create table delivery_drivers(id bigserial primary key,branch_id bigint,name text,phone text,active boolean);
 create table delivery_zones(id bigserial primary key,branch_id bigint,name text,delivery_fee numeric,active boolean);
 create table offline_restaurant_reference_receipts_v1(client_tx_id text primary key,operation_type text,payload_digest text,entity_id bigint,result_json jsonb,created_at timestamptz default now());
 create table offline_order_status_receipts_v2(client_tx_id text primary key,order_id bigint,target_status text,result_json jsonb,created_at timestamptz default now());
 alter table orders add column status text;alter table orders add column order_type text;alter table orders add column payment_method text;alter table orders add column delivered_at timestamptz;
 """)
 for _,names in files:
  for name in names:sql(defs[name])
 sql('create trigger fixture_assign before insert on orders for each row execute function assign_order_numbers();')
 c=event('fixture-c','customer_create','offline_customer_create_v1',{'p_name':'Alice','p_phone':'01000000000'})
 ca=call(c);cid=ca['result']['customer_id']
 assert call(c)['duplicate'];check('Customer exact replay creates one row','(select count(*) from customers)=1')
 u=event('fixture-u','customer_update','offline_customer_update_v1',{'p_customer_create_tx':'fixture-c','p_name':'Updated','p_phone':'01000000000'},2)
 u.update(depends_on_tx_id='fixture-c',dependency_mapping={'client_tx_id':'fixture-c','server_id':str(cid)})
 assert call(u)['result']['customer_id']==cid
 a=event('fixture-a','customer_address_save','offline_customer_address_save_v1',{'p_customer_create_tx':'fixture-c','p_label':'Home','p_address':'A'},3)
 a.update(depends_on_tx_id='fixture-c',dependency_mapping={'client_tx_id':'fixture-c','server_id':str(cid)})
 aid=call(a)['result']['address_id']
 au=event('fixture-au','customer_address_save','offline_customer_address_save_v1',{'p_customer_create_tx':'fixture-c','p_address_save_tx':'fixture-a','p_label':'Home','p_address':'B'},4)
 au.update(depends_on_tx_id='fixture-a',dependency_mapping={'client_tx_id':'fixture-a','server_id':str(aid)})
 assert call(au)['result']['address_id']==aid
 check('Actual final dispatcher resolves BOTH customer and address parents','(select address from customer_addresses where id='+str(aid)+")='B'")
 d=event('fixture-d','customer_address_delete','offline_customer_address_delete_v1',{'p_address_save_tx':'fixture-a'},5)
 d.update(depends_on_tx_id='fixture-a',dependency_mapping={'client_tx_id':'fixture-a','server_id':str(aid)})
 call(d);assert call(d)['duplicate'];check('Delete exact replay without resurrection','(select count(*) from customer_addresses)=0')
 wrong=event('fixture-bad','customer_update','offline_customer_address_delete_v1',{'p_customer_id':cid,'p_name':'Bad'},6)
 reject('Wrong operation/RPC rejected by final reference route',wrong,'operation/RPC')
 badparent=event('fixture-parent-bad','customer_update','offline_customer_update_v1',{'p_customer_create_tx':'missing','p_name':'Bad'},7)
 reject('Missing parent receipt rejected',badparent,'OFFLINE_CUSTOMER_PARENT_RECEIPT_REQUIRED')
 # M0507: real accepted owner, actual final dispatcher, one receipt and one audit.
 ex=event('fixture-expense-edit','expense_update','offline_expense_update_v1',{'p_expense_id':100,'p_description':'New','p_amount':7,'p_expected_amount':5,'p_expected_description':'Old'},20)
 assert call(ex)['result']['id']==100
 check('Expense edit one writer and cash expense delta 2',"(select sum(amount) from expenses)=7 and (select count(*) from audit_logs where action='expenses.edit')=1")
 sql("update shifts set status='closed',closed_at=now() where id=42;")
 assert call(ex)['duplicate'];check('Replay after shift-close has zero repeated economics',"(select sum(amount) from expenses)=7 and (select count(*) from audit_logs where action='expenses.edit')=1")
 closed=event('fixture-closed-edit','expense_update','offline_expense_update_v1',{'p_expense_id':100,'p_description':'Newer','p_amount':8,'p_expected_amount':7,'p_expected_description':'New'},21)
 reject('Closed-shift mutation rejected before writer',closed,'EXPENSE_EDIT_CLOSED_SHIFT')
 check('Closed-shift failure leaves expense and receipt unchanged',"(select amount from expenses where id=100)=7 and not exists(select 1 from offline_v2_server_receipts where client_tx_id='fixture-closed-edit')")
 sql("update shifts set status='open',closed_at=null where id=42;")
 changed=json.loads(json.dumps(ex));changed['payload_digest']='CHANGED';changed['payload']['rpc_payload']['p_amount']=99
 reject('Changed payload on duplicate TX rejected',changed,'EXPENSE_EDIT_REPLAY_MISMATCH')
 stale=event('fixture-stale-edit','expense_update','offline_expense_update_v1',{'p_expense_id':100,'p_description':'Stale','p_amount':9,'p_expected_amount':5,'p_expected_description':'Old'},22)
 reject('Stale economic revision rejected',stale,'EXPENSE_EDIT_REVISION_CONFLICT')
 for amount in [0,-1,'NaN','Infinity']:
  bad=event('fixture-bad-money-'+str(amount),'expense_update','offline_expense_update_v1',{'p_expense_id':100,'p_description':'Bad','p_amount':amount,'p_expected_amount':7,'p_expected_description':'New'},23)
  reject('Invalid cash expense '+str(amount),bad,'EXPENSE_EDIT_AMOUNT_INVALID')
 badactor=json.loads(json.dumps(ex));badactor['employee_id']=8
 reject('Expense actor mismatch',badactor,'EXPENSE_EDIT_ACTOR_MISMATCH')
 badbranch=event('fixture-exp-other-branch','expense_update','offline_expense_update_v1',{'p_expense_id':100,'p_description':'Bad','p_amount':8,'p_expected_amount':7,'p_expected_description':'New'},24);badbranch['branch_id']=70008
 reject('Expense branch mismatch',badbranch,'EXPENSE_EDIT_DENIED')
 # Seed only parent receipt; accepted expense-create economics remains outside this isolated component.
 sql("insert into offline_v2_server_receipts(client_tx_id,protocol_version,payload_digest,operation_type,rpc_name,device_id,device_sequence,branch_id,employee_id,auth_user_id,server_entity_id) values('fixture-exp-parent',2,'parent','expense','create_pos_expense_idempotent','fixture',25,70007,7,auth.uid(),'100');")
 pending=event('fixture-exp-pending','expense_update','offline_expense_update_v1',{'p_expense_id':'offline-exp-fixture-exp-parent','p_expense_parent_tx':'fixture-exp-parent','p_description':'Parent edit','p_amount':8,'p_expected_amount':7,'p_expected_description':'New'},26)
 pending.update(depends_on_tx_id='fixture-exp-parent',dependency_mapping={'client_tx_id':'fixture-exp-parent','server_id':'100'})
 assert call(pending)['result']['id']==100;assert call(pending)['duplicate']
 check('Pending expense maps same entity, never creates another',"(select count(*) from expenses)=1 and (select amount from expenses where id=100)=8")
 check('All expense negative economics and receipt rollback',"(select count(*) from audit_logs where action='expenses.edit')=2 and (select count(*) from offline_v2_server_receipts where operation_type='expense_update')=2")
 # Actual Driver/Zone canonical owners and reference route.
 for kind,field in [('driver','phone'),('zone','delivery_fee')]:
  parent=event('fixture-'+kind,'driver_save' if kind=='driver' else 'zone_save','offline_delivery_'+kind+'_save_v1',{'p_'+kind+'_id':None,'p_branch_id':70007,'p_name':'Parent','p_'+field:'01000000000' if kind=='driver' else 5,'p_active':True},30)
  id=call(parent)['result'][kind+'_id']
  child=event('fixture-'+kind+'-edit',kind+'_save','offline_delivery_'+kind+'_save_v1',{'p_'+kind+'_id':'offline-'+kind+'-fixture-'+kind,'p_'+kind+'_save_tx':'fixture-'+kind,'p_branch_id':70007,'p_name':'Latest','p_'+field:'01000000000' if kind=='driver' else 8,'p_active':False},31)
  child.update(depends_on_tx_id='fixture-'+kind,dependency_mapping={'client_tx_id':'fixture-'+kind,'server_id':str(id)})
  assert call(child)['result'][kind+'_id']==id;assert call(child)['duplicate']
  check(kind+' pending edit uses same canonical entity',"(select count(*) from delivery_"+kind+"s)=1 and (select active from delivery_"+kind+"s limit 1)=false")
  for mismatch,value in [('employee_id',8),('branch_id',70008),('device_id','other-device')]:
   bad=json.loads(json.dumps(child));bad['client_tx_id']+='-'+mismatch;bad['payload']['rpc_payload']['p_client_tx_id']=bad['client_tx_id'];bad[mismatch]=value
   reject(kind+' parent '+mismatch+' rejected',bad,'مطابقة' if mismatch=='employee_id' else 'OFFLINE_REFERENCE_PARENT_RECEIPT_INVALID')
 # Real fulfillment delegated owner; parent sale receipt is a fixture prerequisite, not sale economics proof.
 sql("insert into orders(id,branch_id,employee_id,shift_id,status,order_type) values(999,70007,7,42,'new','pickup');")
 sql("insert into offline_v2_server_receipts(client_tx_id,protocol_version,payload_digest,operation_type,rpc_name,device_id,device_sequence,branch_id,employee_id,auth_user_id,server_entity_id) values('fixture-sale-parent',2,'parent','sale','create_pos_order_atomic','fixture',40,70007,7,auth.uid(),'999');")
 fulfillment=event('fixture-fulfillment','order_status','order_status_apply_offline_v2',{'p_order_id':'offline-fixture-sale-parent','p_target_status':'preparing'},41)
 fulfillment.update(depends_on_tx_id='fixture-sale-parent',dependency_mapping={'client_tx_id':'fixture-sale-parent','server_id':'999'})
 assert call(fulfillment)['result']['order']['status']=='preparing';assert call(fulfillment)['duplicate']
 check('Fulfillment local mapping before cast, once through canonical owner',"(select status from orders where id=999)='preparing' and (select count(*) from audit_logs where action='orders.fulfillment.manage')=1")
 sql("delete from orders where id=999;delete from offline_v2_server_receipts where client_tx_id='fixture-sale-parent';")
 assert call(fulfillment)['duplicate']
 # Leave numbering fixture empty for the unchanged sequential/concurrency gates.
 sql('delete from orders;delete from shift_bon_counters;delete from branch_invoice_counters;')
 # Actual numbering trigger: Online sequential inserts, independent sessions/concurrency.
 for n in range(3):sql("insert into orders(client_tx_id,branch_id,employee_id,shift_id) values('online-"+str(n)+"',70007,7,42);")
 check('Actual Online sequential allocation 1,2,3','(select array_agg(bon_number order by id) from orders)=array[1,2,3]')
 from concurrent.futures import ThreadPoolExecutor
 with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(lambda n:sql("insert into orders(client_tx_id,branch_id,employee_id,shift_id) values('concurrent-"+str(n)+"',70007,7,42);"),range(12)))
 check('Concurrent Online trigger allocation unique and forward counter','(select count(distinct bon_number) from orders)=15 and (select next_number from shift_bon_counters where shift_id=42)=16')
 # Two synthetic trusted server contexts, actual V3 wrappers; no possession proof simulated.
 ctxs=['22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333']
 for n,ctx in enumerate(ctxs):sql("insert into pos_trusted_device_contexts_v1(context_id,cloud_assertion_id,business_id,device_id,device_fingerprint,purpose,expires_at) values('"+ctx+"',gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'fp-"+str(n)+"','restaurant_bon_device_verification',now()+interval '1 hour');")
 def reserve(pair):
  ctx,request=pair
  return json.loads(sql("select row_to_json(r) from pos_reserve_bon_range_v3(70007,42,'fixture-shift','"+ctx+"','"+request+"',10) r;"))
 requests=['44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555']
 with ThreadPoolExecutor(max_workers=2) as pool:ranges=list(pool.map(reserve,zip(ctxs,requests)))
 assert max(ranges[0]['start_bon'],ranges[1]['start_bon'])>min(ranges[0]['end_bon'],ranges[1]['end_bon'])
 assert reserve((ctxs[0],requests[0]))['reservation_uid']==ranges[0]['reservation_uid']
 checks.append({'test':'Actual V3 two-device concurrent disjoint reservation and request replay','status':'PASS'})
 sql("insert into orders(client_tx_id,branch_id,employee_id,shift_id) values('after-reserve',70007,7,42);")
 check('Online trigger cannot reuse reserved capacity',"(select bon_number from orders where client_tx_id='after-reserve')=36")
 result={'status':'PASS','tests':checks,'engine':'PostgreSQL16 isolated','runtime_db_contacted':False,'boundaries':'Actual customer owners/final dispatcher and BON trigger/V3 components; full economic sale/return owners, possession proof, device NOT RUN'}
 if args.result:pathlib.Path(args.result).write_text(json.dumps(result,indent=2))
 print(json.dumps(result))
finally:
 run([bins['pg_ctl'],'-D',str(cluster),'-m','immediate','-w','stop'])
