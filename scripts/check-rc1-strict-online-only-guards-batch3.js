'use strict';
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const files=["commerce-orders-v2-ui.js","finance-b2b-ui.js","logistics-v1-ui.js","membership-v1-ui.js","hr-attendance-admin-v1.js","landed-cost-posting-v1.js","pharmacy-ui.js"];
for(const f of files){const s=fs.readFileSync(f,'utf8');assert(s.includes("code='ONLINE_ONLY_GUARD_UNAVAILABLE'"),f+' strict unavailable code missing');assert(!/__SharawlaRC1OnlineOnlyGuard\?\.requireCloud\?\./.test(s),f+' optional cloud mutation guard remains');new vm.Script(s,{filename:f});}
console.log('RC1 strict Online-only guards batch 3 PASS');
