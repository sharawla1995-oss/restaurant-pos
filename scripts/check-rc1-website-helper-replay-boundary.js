'use strict';
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const s=fs.readFileSync('app.js','utf8');
for(const [fn,label,rpc] of [['acceptOnlineOrderFromChannel','استلام طلب أونلاين','accept_website_order'],['rejectOnlineOrderFromChannel','رفض طلب أونلاين','reject_website_order']]){const a=s.indexOf('async function '+fn),b=s.indexOf('\nasync function ',a+20),part=s.slice(a,b>0?b:a+6000);assert(part.includes("rc1RequireCloudOnline('"+label+"')"),fn+' cloud boundary missing');assert(part.indexOf('rc1RequireCloudOnline')<part.indexOf("rpc('"+rpc+"'"),fn+' guard must precede RPC');}
const syncStart=s.indexOf('async function syncOfflineQueue()'),syncEnd=s.indexOf('function refreshActiveDashboardForConnectivity',syncStart),sync=s.slice(syncStart,syncEnd);
for(const n of ['open_pos_shift_idempotent','close_pos_shift_idempotent','create_pos_expense_idempotent']){const all=[...s.matchAll(new RegExp("rpc\\('"+n+"'",'g'))].map(x=>x.index);assert(all.length>=1,n+' replay binding missing');for(const p of all)assert(p>=syncStart&&p<syncEnd,n+' direct legacy RPC escaped replay-only sync boundary');}
new vm.Script(s,{filename:'app.js'});console.log('RC1 website helper + legacy replay boundary PASS');
