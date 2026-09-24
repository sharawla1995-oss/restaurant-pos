'use strict';
const fs=require('fs');
const app=fs.readFileSync('app.js','utf8');
const js=fs.readFileSync('beta55-delivery-settlement-shift-cash.js','utf8');
const sqlV2=fs.readFileSync('supabase-beta58-12-shift-close-custody-guard.sql','utf8');
const sqlLegacy=fs.readFileSync('supabase-beta58-13-legacy-shift-close-custody-guard.sql','utf8');

const uiMetric="const unsettled=num(fresh.driverCustodyUnsettled);";
const uiGuard="if(unsettled>0.005){toastLocal(\`يوجد عهدة مناديب غير مسواة بقيمة \${moneyLocal(unsettled)} — سوّي العهدة قبل قفل الوردية\`);return}";
const v2Call="global.rpc('close_pos_shift_v2'";

const checks=[
 ['Shifts route delegates to live runtime owner',app.includes("shifts:(...args)=>window.renderShifts(...args)")],
 ['Static shifts renderer ownership removed',!app.includes("shifts:renderShifts," )],
 ['Post-close rerender stays on live owner',app.includes("await window.renderShifts();if(navigator.onLine)await openShiftReport")],
 ['Post-open rerender stays on live owner',app.includes("window.renderShifts()};")],
 ['UI reads fresh unsettled custody before close',js.includes(uiMetric)],
 ['UI blocks close on positive unsettled custody',js.includes(uiGuard)],
 ['UI guard executes before close_pos_shift_v2',js.indexOf(uiGuard)>=0&&js.indexOf(uiGuard)<js.indexOf(v2Call)],
 ['V2 backend guard remains present',sqlV2.includes("if v_unsettled>0.005 then")&&sqlV2.includes("سوّي العهدة قبل قفل الوردية")],
 ['Legacy close backend recomputes V2 cash metrics',sqlLegacy.includes("v_cash:=public.shift_cash_metrics_v2(p_shift_id);")],
 ['Legacy close backend fails closed on custody',sqlLegacy.includes("if v_unsettled>0.005 then")&&sqlLegacy.includes("سوّي العهدة قبل قفل الوردية")],
 ['Legacy close guard precedes shift update',sqlLegacy.indexOf("if v_unsettled>0.005 then")>=0&&sqlLegacy.indexOf("if v_unsettled>0.005 then")<sqlLegacy.indexOf("update public.shifts set")]
];
let bad=0;
for(const [name,ok] of checks){console.log((ok?'PASS':'FAIL')+' — '+name);if(!ok)bad++}
if(bad)process.exit(1);
console.log('Shift close runtime ownership + custody guards PASS');
