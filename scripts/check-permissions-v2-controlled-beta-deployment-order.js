'use strict';
const fs=require('fs');
const order=[
'permissions-v2-profile-feature-applicability.sql','permissions-v2-trusted-profile-binding.sql','permissions-v2-effective-evaluator.sql','permissions-v2-sh0007-cloud-projection.sql','permissions-v2-ui-filtering.sql','permissions-v2-role-defaults.sql','permissions-v2-owner-customers-create.sql','permissions-v2-owner-customers-edit-address.sql','permissions-v2-owner-shifts-expenses.sql','permissions-v2-owner-delivery-settings.sql','permissions-v2-owner-order-fulfillment.sql','permissions-v2-owner-order-driver-assignment.sql','permissions-v2-owner-website-payment-review.sql','permissions-v2-offline-order-status-owner.sql','permissions-v2-orders-privilege-closure.sql'];
for(const p of order)if(!fs.existsSync(p))throw Error('PV2 deploy plan missing '+p);
const last=fs.readFileSync(order.at(-1),'utf8');
if(!/drop policy if exists orders_branch_update on public\.orders/i.test(last)||!/revoke update on table public\.orders from authenticated/i.test(last))throw Error('PV2 final closure contract mismatch');
for(const p of order.slice(0,-1)){const s=fs.readFileSync(p,'utf8');if(/revoke\s+update\s+on\s+(table\s+)?public\.orders\s+from\s+authenticated/i.test(s))throw Error('Premature Orders UPDATE closure in '+p)}
const idx=n=>order.indexOf(n);
if(idx('permissions-v2-trusted-profile-binding.sql')>idx('permissions-v2-effective-evaluator.sql'))throw Error('Trusted profile must precede evaluator');
if(idx('permissions-v2-effective-evaluator.sql')>idx('permissions-v2-sh0007-cloud-projection.sql'))throw Error('Evaluator tables must precede SH-0007 Cloud projection');
if(idx('permissions-v2-sh0007-cloud-projection.sql')>idx('permissions-v2-role-defaults.sql'))throw Error('SH-0007 Cloud projection must precede role defaults');
if(idx('permissions-v2-effective-evaluator.sql')>idx('permissions-v2-role-defaults.sql'))throw Error('Evaluator must precede role defaults');
if(idx('permissions-v2-offline-order-status-owner.sql')>idx('permissions-v2-orders-privilege-closure.sql'))throw Error('Offline owner must precede closure');
console.log('Permissions V2 controlled Beta deployment order PASS — 15 artifacts; Orders closure last; SOURCE PLAN ONLY');
