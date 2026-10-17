'use strict';
// Top Chicken RC10 printed receipt time only. No network, database or device operations.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=app.indexOf('function fmtTopChickenReceiptDate(value){');
const end=app.indexOf('function receiptIdentityHTML(',start);
assert(start>=0&&end>start,'receipt-only formatter must exist');
const body=app.slice(start,end);
const make=new Function('beta','const fmtDate=v=>"legacy:"+v;const isTopChickenBetaAuthScope=()=>beta;'+body+'return fmtTopChickenReceiptDate;');
const fmt=make(true),fallback=make(false);
const cases=[
  ['Jan 2026 UTC+2','2026-01-10T10:00:00Z',2],
  ['Apr just before DST','2026-04-23T21:59:00Z',2],
  ['Apr after DST','2026-04-23T22:00:00Z',3],
  ['Oct order current DST','2026-10-17T23:11:09.275989+00:00',3],
  ['Oct before rollback','2026-10-29T20:59:00Z',3],
  ['Oct after rollback','2026-10-29T21:00:00Z',2],
  ['Nov UTC+2','2026-11-15T21:00:00+00:00',2]
];
for(const [name,iso,hours] of cases){
  const expected=new Date(Date.parse(iso)+hours*3600000).toLocaleString('ar-EG',{timeZone:'UTC'});
  assert.equal(fmt(iso),expected,name);
}
assert.equal(fallback('2026-10-17T23:11:09Z'),'legacy:2026-10-17T23:11:09Z','non-Beta unchanged');
assert.equal(fmt('2026-10-18 02:11:09'),'legacy:2026-10-18 02:11:09','naive timestamp unchanged');
assert.equal((app.match(/fmtTopChickenReceiptDate\(o\.created_at/g)||[]).length,2,'customer and kitchen receipts only');
assert(app.includes('const fmtDate=s=>new Date(s).toLocaleString(\'ar-EG\')'),'other pages remain unchanged');
console.log('TOP_CHICKEN_RC10_CAIRO_RECEIPT_TIMESTAMP_PASS (11 checks)');
