'use strict';
const fs=require('fs');
const read=f=>fs.readFileSync(f,'utf8');
const app=read('app.js');
const takeover=read('beta45-offline-v2-runtime-takeover.js');
const transport=read('beta45-offline-v2-transport-runtime.js');
const recovery=read('beta55-4-runtime-recovery.js');
const numbering=read('supabase-v9-4-0-numbering-payments-finance.sql');
const must=(v,m)=>{if(!v)throw new Error(m)};
const reject=(v,m)=>{if(v)throw new Error(m)};

must(app.includes('invoice_number:null,bon_number:null,offline_reference:offlineReference,_official_number_pending:true'),'app local sale must not invent official numbers');
must(takeover.includes('invoice_number:null,bon_number:null,offline_reference:offlineReference,_official_number_pending:true'),'native takeover local sale must not invent official numbers');
reject(/invoice_number:code|bon_number:code/.test(takeover),'native takeover still writes OFF-* into official number fields');
reject(/out\.order\.invoice_number=`OFF-|out\.order\.bon_number=`OFF-/.test(recovery),'recovery still overwrites official number fields with OFF-*');
must(recovery.includes('الرقم الرسمي يخصصه السيرفر'),'offline next-bon UI must explain server authority');

for(const token of [
  'create or replace function public.assign_order_numbers()',
  'public.branch_invoice_counters.next_number+1',
  'public.shift_bon_counters.next_number+1',
  'create trigger trg_assign_order_numbers before insert on public.orders'
])must(numbering.includes(token),`server official numbering source missing: ${token}`);

must(transport.includes("const result=row?.server_ack?.result||{},serverOrder=result.order||null"),'sale ACK must expose authoritative server order');
must(transport.includes("String(b?.order?.client_tx_id||'')!==tx"),'reconcile must remove local row by client_tx_id');
must(transport.includes("String(b?.order?.id)!==serverId"),'reconcile must remove stale server duplicate by server id');
must(transport.includes("if(serverOrder)kept.unshift({order:{...serverOrder,_offline:false,_official_number_pending:false}"),'reconcile must install authoritative server-numbered row after ACK');

console.log('RC1 official bon/invoice reconciliation gate PASS');
