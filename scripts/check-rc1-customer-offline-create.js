'use strict';
const fs=require('fs');
const app=fs.readFileSync('app.js','utf8');
const router=fs.readFileSync('permissions-v2-customers-create-routing.js','utf8');
const must=(x,m)=>{if(!x)throw new Error(m)};

const createStart=router.indexOf('async function createCustomer(input={}){');
const createEnd=router.indexOf('async function createManyCustomers',createStart);
const createBody=router.slice(createStart,createEnd);
must(createStart>=0&&createEnd>createStart,'customer create function boundary missing');
must(createBody.indexOf('const data=validatedCustomerInput(input);')>=0,'customer validation missing');
must(createBody.indexOf('return commitLocalFirst(data);')>createBody.indexOf('const data=validatedCustomerInput(input);'),'customer validation must run before local-first commit');
const localStart=router.indexOf('async function commitLocalFirst(data){');
const localEnd=router.indexOf('async function createCustomer',localStart);
const localBody=router.slice(localStart,localEnd);
must(localBody.indexOf('const clientTx=tx();')>=0,'customer durable path must allocate client_tx');
must(!createBody.includes('tx()'),'createCustomer must not allocate client_tx before validatedCustomerInput');
must(router.includes("if(rawPhone&&!/^01[0125][0-9]{8}$/.test(phone||''))"),'customer phone contract must match Egyptian server validation when supplied');
must(!router.includes("if(!phone)throw new Error('رقم الموبايل مطلوب')"),'generic customer phone must remain optional like customer_create_v2');
must(router.includes("await global.topBurgerDesktop?.offlineV2?.event?.(clientTx)"),'durable local success must verify the native outbox row');
must(router.includes("row.operation_type!=='customer_create'"),'durable local verification must bind to customer_create');
must(router.includes("durablePendingStatus(row.status)"),'durable local success must only accept non-terminal pending states');

must(app.includes('rows=await mergeOfflineCustomerRows(rows);'),'Customers UI must overlay the durable local outbox projection');
must(app.includes("status==='conflict'||status==='dead_letter'?'مشكلة مزامنة'"),'terminal local customer rows must remain visible as sync problems');
must(app.includes("if(phone&&!validEgyptMobile(phone))return toast('رقم الموبايل غير صحيح')"),'Customers UI must reject invalid supplied phone before router/outbox');
must(app.includes('placeholder="اختياري — 01xxxxxxxxx"'),'Customers UI must reflect server optional-phone contract');
must(app.includes("createdCustomer.offline===true"),'checkout must not assign a structured local customer result into bigint customer_id');
must(app.includes("customerId=null;"),'offline customer checkout must keep bigint customer_id fail-safe until explicit linkage contract closes');

console.log('RC1 customer Offline create gate PASS');
