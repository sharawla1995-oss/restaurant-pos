'use strict';
const fs=require('fs'),assert=require('assert');
const ui=fs.readFileSync('universal-dashboard-v1.js','utf8');
const engine=fs.readFileSync('universal-dashboard-engine-v1.js','utf8');
assert(!/select=[^\n\x60'"]*offline_reference/.test(ui),'Dashboard Cloud select requests local-only orders.offline_reference');
assert(ui.includes('row.offline_reference'),'local/offline order reference rendering was removed');
assert(engine.includes("'offline_reference'")||engine.includes('"offline_reference"'),'local reconciliation must retain offline_reference identity support');
console.log('UNIVERSAL DASHBOARD CLOUD SCHEMA GATE PASS — cloud_offline_reference=ABSENT local_identity=PRESERVED');
