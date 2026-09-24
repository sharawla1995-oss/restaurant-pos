'use strict';
const fs=require('fs');
const js=fs.readFileSync('beta55-delivery-settlement-shift-cash.js','utf8');
const sql=fs.readFileSync('supabase-beta58-12-shift-close-custody-guard.sql','utf8');

const uiMetric="const unsettled=num(fresh.driverCustodyUnsettled);";
const uiGuard="if(unsettled>0.005){toastLocal(\`يوجد عهدة مناديب غير مسواة بقيمة \${moneyLocal(unsettled)} — سوّي العهدة قبل قفل الوردية\`);return}";
const rpcCall="global.rpc('close_pos_shift_v2'";

const checks=[
 ['UI reads fresh unsettled custody before close',js.includes(uiMetric)],
 ['UI blocks close on positive unsettled custody',js.includes(uiGuard)],
 ['UI guard executes before close_pos_shift_v2',js.indexOf(uiGuard)>=0&&js.indexOf(uiGuard)<js.indexOf(rpcCall)],
 ['offline branch no longer bypasses custody precheck',!js.includes("if(!isOnline())return legacyClose?.();\n     const actual=")],
 ['SQL recomputes shift cash metrics',sql.includes("v_cash:=public.shift_cash_metrics_v2(p_shift_id);")],
 ['SQL extracts driver custody unsettled',sql.includes("v_unsettled:=coalesce((v_cash->>'driver_custody_unsettled')::numeric,0);")],
 ['SQL fails closed before update',sql.indexOf("if v_unsettled>0.005 then")>=0&&sql.indexOf("if v_unsettled>0.005 then")<sql.indexOf("update public.shifts set")],
 ['SQL blocks with explicit settlement message',sql.includes("سوّي العهدة قبل قفل الوردية")],
 ['settlement RPC runtime remains untouched',js.includes("delivery_driver_settle_v2")]
];
let bad=0;
for(const [name,ok] of checks){console.log((ok?'PASS':'FAIL')+' — '+name);if(!ok)bad++}
if(bad)process.exit(1);
console.log('Shift close pending custody guard PASS');
