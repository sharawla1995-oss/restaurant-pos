'use strict';
const fs=require('fs');
const app=fs.readFileSync('app.js','utf8');
const wrapper=fs.readFileSync('beta55-delivery-settlement-shift-cash.js','utf8');
const sql=fs.readFileSync('supabase-beta55-delivery-settlement-shift-cash.sql','utf8');
function need(s,t,l){if(!s.includes(t))throw new Error(l+' missing: '+t)}
need(sql,'create or replace function public.delivery_mark_delivered_v2','delivery owner');
need(sql,"has_action_permission_v2('delivery.mark_delivered')",'delivery action gate');
need(sql,"has_action_permission_v2('delivery.payment.change_at_delivery')",'payment-change action gate');
need(wrapper,"rpc('delivery_mark_delivered_v2'",'online routing');
need(wrapper,"if(!isOnline())return false",'offline bridge');
need(wrapper,"if(!isOnline())return;\n  const raw=btn.dataset.delivered",'offline click fallthrough');
need(wrapper,'e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();','online interception');
const direct=(app.match(/rest\(\s*['"]orders['"][\s\S]{0,260}?method\s*:\s*['"]PATCH['"]/g)||[]);
const delivered=direct.filter(x=>/status\s*:\s*['"]delivered['"]/.test(x)||/status\s*:\s*['"]delivered['"]/.test(x.replace(/"/g,"'")));
if(delivered.length!==2)throw new Error('PV2-F5C expected 2 legacy delivered PATCH bridges, found '+delivered.length);
const rpcCalls=(wrapper.match(/rpc\(\s*['"]delivery_mark_delivered_v2['"]/g)||[]).length;
if(rpcCalls!==2)throw new Error('PV2-F5C expected exactly 2 authoritative owner calls, found '+rpcCalls);
console.log('PV2-F5C Delivery Completion routing proof PASS — online owner calls='+rpcCalls+'; offline legacy bridges='+delivered.length);
