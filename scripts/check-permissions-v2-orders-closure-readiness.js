'use strict';
const fs=require('fs');
const v7=fs.readFileSync('supabase-v7.sql','utf8');
const takeover=fs.readFileSync('beta45-offline-v2-runtime-takeover.js','utf8');
const transport=fs.readFileSync('beta45-offline-v2-transport-runtime.js','utf8');
const wrapper=fs.readFileSync('beta55-delivery-settlement-shift-cash.js','utf8');
function need(s,t,l){if(!s.includes(t))throw new Error(l+' missing: '+t)}
need(v7,'create policy orders_branch_update on public.orders','historical Orders UPDATE policy');
need(v7,'for update to authenticated using (public.has_branch_access(branch_id))','branch UPDATE authority');
need(takeover,"registerOperation('order_status'","Offline takeover registry");
need(transport,'throw new Error(`Offline V2 transport target is not registered: ${type}`)','transport fail-closed');
if(/type===['"]order_status['"]/.test(transport)||/if\s*\(type===['"]order_status['"]\)/.test(transport))throw new Error('F5E audit changed: order_status transport now exists; re-review readiness');
need(wrapper,'if(!isOnline())return false','Offline delivery bridge');
if(/revoke\s+update\s+on\s+(table\s+)?public\.orders/i.test(fs.readFileSync('permissions-v2-owner-order-fulfillment.sql','utf8')+fs.readFileSync('permissions-v2-owner-order-driver-assignment.sql','utf8')+fs.readFileSync('permissions-v2-owner-website-payment-review.sql','utf8')))throw new Error('Premature Orders UPDATE revoke found');
console.log('PV2-F5E readiness audit PASS — final Orders UPDATE closure correctly BLOCKED by unresolved Offline order_status transport');
