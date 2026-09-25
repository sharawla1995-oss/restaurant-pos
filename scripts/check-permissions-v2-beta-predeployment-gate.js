'use strict';
const fs=require('fs');
const b=fs.readFileSync('permissions-v2-trusted-profile-binding.sql','utf8');
const e=fs.readFileSync('permissions-v2-effective-evaluator.sql','utf8');
const r=fs.readFileSync('permissions-v2-role-defaults.sql','utf8');
const o=fs.readFileSync('permissions-v2-offline-order-status-owner.sql','utf8');
function need(s,t,l){if(!s.includes(t))throw Error(l+' missing: '+t)}
need(b,'No Business/Profile binding row is inserted by this artifact.','binding must be external deployment input');
need(e,'No Cloud/Business/Feature binding rows are inserted by this artifact.','entitlement must be external deployment input');
need(r,"assert_operational_profile_v1('restaurant')",'Restaurant profile gate');
need(o,'delivery_mark_delivered_v2(v_order.id,v_order.payment_method,v_tx)','delivery owner dependency');
if(!fs.existsSync('docs/PERMISSIONS-V2-CONTROLLED-BETA-DEPLOYMENT-ORDER.md'))throw Error('deployment order missing');
console.log('Permissions V2 pre-deployment SOURCE contract PASS — live Beta read-only evidence still required before DB write');
