'use strict';
const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync('owner-acceptance-offline-customer-delivery-v58.js','utf8');
for(const t of ["support!=='SH-0007'","branch!=='TEST'","business!=='تجريبي'","e.code='ACCEPTANCE_SANDBOX_LOCK'"])assert(src.includes(t),'sandbox lock missing '+t);
for(const fn of ['customer','customerChain','customerMutations','driver','delivered']){const p=src.indexOf('async function '+fn+'(ctx){');assert(p>=0,fn+' missing');const body=src.slice(p,p+250);assert(body.includes('sandboxLock();'),fn+' must lock before mutation');}
const lock=src.indexOf('function sandboxLock()'),firstNetwork=src.indexOf("net().enable('offline'");assert(lock>=0&&firstNetwork>lock,'sandbox lock must be defined before mutating network lab use');
for(const forbidden of ['SH-0005','SH-0006'])assert(!src.includes(forbidden),'production device literal forbidden in mutating acceptance pack');
console.log('RC1 practical acceptance sandbox lock PASS — SH-0007 / تجريبي / TEST only');
