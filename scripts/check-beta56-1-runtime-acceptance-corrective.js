'use strict';
const fs=require('fs');
function read(p){return fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')}
function must(v,msg){if(!v)throw new Error(msg)}
const e2e=read('owner-acceptance-e2e-v3.js');
const adv=read('owner-acceptance-advanced-v4.js');
const main=read('main.js');
const sql=read('supabase-beta56-1-runtime-acceptance-corrective.sql');
must(e2e.includes("point4_identity_contract='sharawla.point4.identity.v1'"),'E2E Point4 identity contract missing');
must(e2e.includes('effect_line_key:`v1:stock:sale:'),'E2E effect_line_key missing');
must(adv.includes("point4_identity_contract:'sharawla.point4.identity.v1'"),'Advanced Point4 identity contract missing');
must(adv.includes("canonicalTx(run,'DUP20')"),'DUP20 canonical UUID tx missing');
must(main.includes("candidate.exec('pragma quick_check')"),'Local DB quick_check recovery missing');
must(main.includes('skipLastGoodCopyOnce=true'),'Last-good overwrite guard missing');
must(main.includes('topburger-pos-recovery-rejected-'),'Rejected DB preservation missing');
must(sql.includes("jsonb_typeof(v_envelope)<>'null'"),'JSON-null Point4 envelope normalization missing');
for(const code of ['inventory.supply.request.emergency','inventory.supply.shortages.view','inventory.supply.shortages.create'])must(sql.includes(code),'Permission corrective missing: '+code);
must(!/activate\s+v2|takeover\s*=\s*true|cutover\s*=\s*true/i.test(sql),'Corrective SQL must not activate takeover/cutover');
console.log('Beta56.1 corrective static contract PASS');
