#!/usr/bin/env python3
"""Required PG16 economic component harness. Fresh cluster/private socket only.
No URL/DSN/connection option, deployment, migration, existing DB or device access.
Expense writer loaded verbatim from accepted source; Return reference is explicitly
historical source, not proof of effective deployed Point4/Food composition.
"""
import argparse,json,os,pathlib,pwd,shutil,subprocess,tempfile
ROOT=pathlib.Path(__file__).resolve().parent.parent
ap=argparse.ArgumentParser();ap.add_argument('--pg-bin-dir');ap.add_argument('--result');args=ap.parse_args()
bins={n:str(pathlib.Path(args.pg_bin_dir)/n) if args.pg_bin_dir else shutil.which(n) for n in ('initdb','pg_ctl','psql')}
if any(not v or not os.path.isfile(v) for v in bins.values()):
 out={'status':'NOT RUN','reason':'PG16 initdb/pg_ctl/psql unavailable','economic_proof':'NOT RUN','runtime_db_contacted':False}
 if args.result:pathlib.Path(args.result).write_text(json.dumps(out,indent=2))
 print(json.dumps(out));raise SystemExit(2)
assert ' 16.' in subprocess.check_output([bins['initdb'],'--version'],text=True),'PG16 required'
files=[('permissions-v2-owner-shifts-expenses.sql',['expense_update_v2']),('supabase-offline-v2-expense-edit-source.sql',['offline_expense_update_v1']),('supabase-rc1-offline-v2-runtime-alignment-final-dispatcher.sql',['sharawla_offline_v2_apply_event_reference_v1','sharawla_offline_v2_apply_event']),('supabase-v10-4-6-final-stability.sql',['create_order_return'])]
js="const s=require('./scripts/offline-reference-return-sql-contract'),fs=require('fs');let out={};for(const [f,names] of "+json.dumps(files)+"){for(const n of names)out[n]=s.last(fs.readFileSync(f,'utf8'),n).definition;}console.log(JSON.stringify(out));"
defs=json.loads(subprocess.check_output(['node','-e',js],cwd=ROOT,text=True))
work=pathlib.Path(tempfile.mkdtemp(prefix='sharawla-final-gap-pg16-'));work.chmod(0o700);uid=gid=None
if os.geteuid()==0:
 user=pwd.getpwnam('nobody');uid,gid=user.pw_uid,user.pw_gid;os.chown(work,uid,gid)
def run(cmd,**kw):return subprocess.run(cmd,env={'PATH':os.environ.get('PATH','/usr/bin:/bin'),'LANG':'C.UTF-8'},user=uid,group=gid,text=True,capture_output=True,check=True,timeout=30,**kw)
cluster=work/'cluster';sock=work/'socket';sock.mkdir()
if uid is not None:os.chown(sock,uid,gid)
run([bins['initdb'],'-D',str(cluster),'-U','fixture','-A','trust','--no-locale'])
run([bins['pg_ctl'],'-D',str(cluster),'-l',str(work/'log'),'-o',f"-F -c listen_addresses='' -k {sock} -p 55441",'-w','start'])
checks=[]
def sql(q):return run([bins['psql'],'-X','-h',str(sock),'-p','55441','-U','fixture','-d','postgres','-v','ON_ERROR_STOP=1','-At'],input=q).stdout.strip()
def call(e):return json.loads(sql("select sharawla_offline_v2_apply_event('"+json.dumps(e).replace("'","''")+"'::jsonb)::text;"))
def reject(name,q,expected):
 try:sql(q)
 except subprocess.CalledProcessError as ex:assert expected in ex.stderr,(name,ex.stderr);checks.append({'test':name,'status':'PASS'});return
 raise AssertionError(name+' accepted')
def query(e):return "select sharawla_offline_v2_apply_event('"+json.dumps(e).replace("'","''")+"'::jsonb);"
def ev(tx,**p):return {'client_tx_id':tx,'payload_digest':'digest-'+tx,'protocol_version':2,'operation_type':'expense_update','device_id':'fixture','device_sequence':1,'branch_id':70007,'employee_id':7,'payload':{'rpc_name':'offline_expense_update_v1','rpc_payload':{'p_expense_id':10,'p_description':'New','p_amount':7,'p_expected_amount':5,'p_expected_description':'Old','p_client_tx_id':tx,**p}}}
try:
 sql("""
 create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql as $$select '11111111-1111-4111-8111-111111111111'::uuid$$;
 create function current_employee_id() returns bigint language sql as $$select 7::bigint$$;
 create function has_action_permission_v2(text) returns boolean language sql as $$select true$$;
 create function has_branch_access(bigint) returns boolean language sql as $$select $1=70007$$;
 create function is_admin() returns boolean language sql as $$select true$$;
 create function has_permission(text) returns boolean language sql as $$select true$$;
 create table audit_logs(employee_id bigint,branch_id bigint,action text,entity_type text,entity_id bigint,details jsonb,created_at timestamptz default now());
 create table offline_v2_server_receipts(client_tx_id text primary key,server_event_id text,protocol_version int,payload_digest text,operation_type text,rpc_name text,device_id text,device_sequence bigint,branch_id bigint,employee_id bigint,auth_user_id uuid,server_entity_id text,server_version text,result_json jsonb);
 create table shifts(id bigint primary key,branch_id bigint,employee_id bigint,status text,opened_at timestamptz,closed_at timestamptz);
 insert into shifts values(42,70007,7,'open',now(),null);
 create table expenses(id bigint primary key,branch_id bigint,employee_id bigint,shift_id bigint,description text,amount numeric,created_at timestamptz);
 insert into expenses values(10,70007,7,42,'Old',5,now());
 create table customers(id bigint);create table customer_addresses(id bigint);
 create table orders(id bigint primary key,branch_id bigint,employee_id bigint,shift_id bigint,status text,order_type text,delivered_at timestamptz,invoice_number bigint,bon_number bigint,subtotal numeric,discount numeric,tax_amount numeric,service_amount numeric);
 create table order_items(id bigint primary key,order_id bigint,product_id bigint,product_name text,quantity numeric,total numeric);
 create table app_settings(key text,value text);insert into app_settings values('returns_allow_closed_shifts','false');
 create table branch_financial_settings(branch_id bigint,prices_include_tax boolean);
 create table returns(id bigserial primary key,branch_id bigint,return_number bigint,order_id bigint,original_invoice_number bigint,original_bon_number bigint,employee_id bigint,shift_id bigint,reason text,notes text,subtotal numeric,discount_adjustment numeric,tax_adjustment numeric,service_adjustment numeric,total numeric);
 create table return_items(return_id bigint,order_item_id bigint,product_id bigint,product_name text,quantity numeric,unit_refund numeric,total numeric);
 create table return_payments(return_id bigint,method text,amount numeric);
 create table branch_return_counters(branch_id bigint primary key,next_number bigint);
 insert into orders values(43,70007,7,42,'completed','pickup',now(),1,1,10,0,0,0);
 insert into order_items values(63,43,1,'Product',2,10);
 """)
 for n in ['expense_update_v2','offline_expense_update_v1','sharawla_offline_v2_apply_event_reference_v1','sharawla_offline_v2_apply_event','create_order_return']:sql(defs[n])
 a=call(ev('edit'));assert a['result']['amount']==7;assert call(ev('edit'))['duplicate'];assert sql('select count(*) from audit_logs;')=='1';checks.append({'test':'canonical expense writer + receipt replay changes economic amount/audit once','status':'PASS'})
 reject('expense stale revision conflict writes nothing',query(ev('stale')),'REVISION_CONFLICT')
 bad=ev('edit');bad['payload_digest']='other';reject('expense duplicate digest conflict',query(bad),'REPLAY_MISMATCH')
 bad=ev('actor');bad['employee_id']=8;reject('expense actor binding',query(bad),'ACTOR_MISMATCH')
 bad=ev('branch');bad['branch_id']=70008;reject('expense branch binding',query(bad),'DENIED')
 sql("update shifts set status='closed',closed_at=now();")
 reject('closed shift blocks expense edit before cash economic change',query(ev('closed',p_expected_amount=7,p_expected_description='New')),'CLOSED_SHIFT');assert call(ev('edit'))['duplicate'];assert sql('select amount from expenses where id=10;')=='7';checks.append({'test':'closed-shift receipt replay has no new economic change','status':'PASS'})
 sql("update shifts set status='open',closed_at=null;")
 parent={"client_tx_id":"parent-exp","server_event_id":"parent-event","protocol_version":2,"payload_digest":"parent-digest","operation_type":"expense","rpc_name":"create_pos_expense_idempotent","device_id":"fixture","device_sequence":1,"branch_id":70007,"employee_id":7,"auth_user_id":"11111111-1111-4111-8111-111111111111","server_entity_id":"10","server_version":"fixture","result_json":{}}
 sql("insert into offline_v2_server_receipts select * from jsonb_populate_record(null::offline_v2_server_receipts,'"+json.dumps(parent)+"'::jsonb);")
 pending=ev('pending',p_expense_id='offline-exp-parent-exp',p_expense_parent_tx='parent-exp',p_expected_amount=7,p_expected_description='New',p_description='Pending Edited',p_amount=8);pending['depends_on_tx_id']='parent-exp';pending['dependency_mapping']={'client_tx_id':'parent-exp','server_id':'10'}
 pa=call(pending);assert pa['result']['id']==10;assert pa['result']['amount']==8;checks.append({'test':'pending expense receipt mapping delegates same numeric owner, preserving original digest','status':'PASS'})
 sql("delete from offline_v2_server_receipts where client_tx_id='parent-exp';")
 assert call(pending)['duplicate'];checks.append({'test':'lost ACK exact replay requires no parent receipt/economic repost','status':'PASS'})
 bad=ev('wrong-rpc');bad['payload']['rpc_name']='expense_update_v2';reject('negative final expense RPC binding',query(bad),'RPC_BINDING_INVALID')
 assert sql("select count(*) from audit_logs where action='expenses.edit';")=='2';assert sql('select amount from expenses where id=10;')=='8'
 for name,items,payments,expected in [('over-return','[{"order_item_id":63,"quantity":3}]','[{"method":"cash","amount":15}]','كمية المرتجع أكبر'),('wrong-item','[{"order_item_id":999,"quantity":1}]','[{"method":"cash","amount":5}]','صنف المرتجع غير موجود'),('refund-mismatch','[{"order_item_id":63,"quantity":1}]','[{"method":"cash","amount":6}]','إجمالي رد المبلغ')]:
  reject('historical reference Return economic negative '+name,"select create_order_return(43,'Test',null,'"+items+"'::jsonb,'"+payments+"'::jsonb);",expected)
 assert sql('select count(*) from returns;')=='0';assert sql('select count(*) from return_payments;')=='0';checks.append({'test':'negative Return economic guards create zero refunds','status':'PASS'})
 out={'status':'PASS','tests':checks,'expense':'actual source owner/wrapper; synthetic auth/schema only','return':'historical economic reference only; effective deployed Food/Point4 Return remains NEEDS RUNTIME PROOF','runtime_db_contacted':False}
 if args.result:pathlib.Path(args.result).write_text(json.dumps(out,indent=2))
 print(json.dumps(out))
finally:run([bins['pg_ctl'],'-D',str(cluster),'-m','immediate','-w','stop'])
