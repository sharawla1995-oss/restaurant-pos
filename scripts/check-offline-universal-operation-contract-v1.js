'use strict';
const fs=require('fs');
const assert=(v,m)=>{if(!v)throw new Error(m)};
const read=p=>fs.readFileSync(p,'utf8');
const contract=read('docs/OFFLINE-UNIVERSAL-OPERATION-CONTRACT-V1.md');
const matrix=read('docs/RESTAURANT-RC1-OFFLINE-ACTION-MATRIX-2026-09-26.md');
const app=read('app.js');
const takeover=read('beta45-offline-v2-runtime-takeover.js');
const required=[
 'OFFLINE_MUTATION','OFFLINE_READ','ONLINE_ONLY','NOT_APPLICABLE',
 'durable local transaction','explicit ACK','Restart','exactly once',
 'Takeover is an ownership migration mechanism','Static string assertions alone are insufficient evidence'
];
for(const x of required)assert(contract.includes(x),`universal offline contract missing: ${x}`);
assert(matrix.includes('| P038 |'),'Restaurant matrix must retain bon continuity coverage');
assert(matrix.includes('| O009 |'),'Restaurant matrix must retain return lookup coverage');
assert(matrix.includes('| D006 |'),'Restaurant matrix must retain delivery status coverage');
assert(matrix.includes('| D004 |'),'Restaurant matrix must retain delivery detail coverage');
assert(app.includes('async function cacheOrderRows(rows)'), 'order local projection owner missing');
assert(app.includes("await updateNextBonBadge()"), 'bon reconciliation hook missing');
assert(takeover.includes('saveOrderStatusV2'), 'order-status durable owner missing');
assert(!takeover.includes('RESET_PROTECTED_DEVICE_SEQUENCES'), 'runtime must not reintroduce reset protected sequence special-case');
const failRows=matrix.split(/\r?\n/).filter(x=>/^\|\s*[A-Z]\d{3}\s*\|/.test(x)&&x.includes('| FAIL |'));
assert(failRows.length>0,'matrix unexpectedly lost all known real-device/source gaps');
console.log(`OFFLINE UNIVERSAL CONTRACT V1 GATE PASS — tracked_fail_rows=${failRows.length}`);
