'use strict';
const fs=require('fs');
const app=fs.readFileSync('app.js','utf8');
const js=fs.readFileSync('beta55-delivery-settlement-shift-cash.js','utf8');
const sqlV2=fs.readFileSync('supabase-beta58-12-shift-close-custody-guard.sql','utf8');
const sqlLegacy=fs.readFileSync('supabase-beta58-13-legacy-shift-close-custody-guard.sql','utf8');
const checks=[
 ['Shifts route delegates to live runtime owner',app.includes("shifts:(...args)=>window.renderShifts(...args)")],
 ['Static shifts renderer ownership removed',!app.includes("shifts:renderShifts,")],
 ['Wrapper resolves current shift through getOpenShift',js.includes("const open=typeof global.getOpenShift==='function'?await global.getOpenShift():null;")],
 ['Wrapper no longer looks up current employee through window.state',!js.includes("global.state?.employee?.id||0")],
 ['Wrapper cache key uses resolved employee',js.includes("openShift:${open.employee_id}:${bid}")],
 ['UI custody guard remains present',js.includes('if(unsettled>0.005)')&&js.includes('سوّي العهدة قبل قفل الوردية')],
 ['Close handler catches runtime failures',js.includes("closeBtn.disabled=false;\n      toastLocal(err?.message||String(err));")],
 ['Legacy close surfaces backend rejection',app.includes("if(!isNetError(err)){toast(err?.message||String(err));return}")],
 ['V2 backend custody guard remains present',sqlV2.includes('if v_unsettled>0.005 then')],
 ['Legacy backend custody guard remains present',sqlLegacy.includes('if v_unsettled>0.005 then')]
];
let bad=0;
for(const [name,ok] of checks){console.log((ok?'PASS':'FAIL')+' — '+name);if(!ok)bad++}
if(bad)process.exit(1);
console.log('Shift close runtime feedback hotfix PASS');
