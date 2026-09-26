'use strict';
const fs=require('fs');
function must(c,m){if(!c)throw new Error(m)}
const take=fs.readFileSync('beta45-offline-v2-runtime-takeover.js','utf8');
const test=fs.readFileSync('owner-acceptance-offline-shift-v58.js','utf8');
const loader=fs.readFileSync('owner-acceptance-lazy-loader-v47.js','utf8');
must(take.includes('saveShiftOpen:saveShiftOpenV2'),'shift open owner is not explicitly exposed');
must(take.includes('saveShiftClose:saveShiftCloseV2'),'shift close owner is not explicitly exposed');
must(test.includes("id:'offline.shift-lifecycle-runtime-e2e'"),'focused shift acceptance id missing');
must(test.includes("net().enable('offline'"),'focused shift acceptance must force offline commit');
must(test.includes("client_close_tx_id"),'shift close cloud idempotency evidence missing');
must(test.includes("client_open_tx_id"),'shift open cloud idempotency evidence missing');
must(test.includes("explicit_ack=2"),'explicit ACK evidence missing');
must(test.includes("replay=stable"),'replay evidence missing');
must(loader.includes('owner-acceptance-offline-shift-v58.js'),'focused shift acceptance is not loaded');
console.log('Offline shift lifecycle acceptance static gate PASS');
