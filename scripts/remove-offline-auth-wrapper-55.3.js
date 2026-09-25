'use strict';
const fs=require('fs');
const p='beta45-offline-v2-safety-runtime.js';
let s=fs.readFileSync(p,'utf8');
if(s.includes('SHARAWLA_OFFLINE_AUTH_55_3_WRAPPER_REMOVED')){console.log('55.3 wrapper ownership already removed');process.exit(0)}
const start=s.indexOf("  signIn=async function(email,password){");
const end=s.indexOf("  loadOfflineBootstrap=async function()",start);
if(start<0||end<0)throw new Error('55.3 wrapper removal refused: expected signIn/cacheBootstrap wrapper block not found');
const preserved=`  // SHARAWLA_OFFLINE_AUTH_55_3_WRAPPER_REMOVED — app.js owns online enrollment/read-back.\n  // Phase 8 keeps only offline verification and safety/report guards.\n`;
s=s.slice(0,start)+preserved+s.slice(end);
fs.writeFileSync(p,s,'utf8');
console.log('55.3 competing signIn/cacheBootstrap enrollment wrapper removed');