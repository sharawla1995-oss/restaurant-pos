'use strict';
const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync('owner-acceptance-sh0007-readonly-preflight-v58.js','utf8');
for(const t of ["mode:'readonly'","critical:true","api.health()","api.syncStats()","api.inboxStats()","api.guardState()","api.outbox(null)","[293,304,316]"])assert(src.includes(t),'preflight contract missing '+t);
for(const forbidden of ['manualRetry','resetTestQueue','resetTestGroups','resetTestAll','syncNow','inboxApply','inboxReceive','commitOperation','guardAssert','backupCreate'])assert(!src.includes(forbidden),'read-only preflight contains mutating API '+forbidden);
assert(src.includes("PROTECTED.includes(Number(x?.device_sequence))"),'protected sequences must be observed by device_sequence only');
const loader=fs.readFileSync('owner-acceptance-lazy-loader-v47.js','utf8');assert(loader.includes('owner-acceptance-sh0007-readonly-preflight-v58.js'),'preflight pack not loaded');
console.log('RC1 SH-0007 read-only preflight gate PASS — protected Seq293/304/316 observe-only');
