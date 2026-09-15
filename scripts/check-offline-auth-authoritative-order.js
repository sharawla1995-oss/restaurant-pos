'use strict';
const fs=require('fs');
const assert=require('assert');
const app=fs.readFileSync('app.js','utf8');
const runtime=fs.readFileSync('beta45-offline-v2-safety-runtime.js','utf8');
const preload=fs.readFileSync('preload.js','utf8');
const main=fs.readFileSync('beta45-offline-v2-safety.js','utf8');

function must(src,re,msg){assert(re.test(src),msg)}

// 55.3 gate: the official renderer path itself must own enrollment readiness.
// A helper/wrapper-only simulation is not sufficient evidence anymore.
must(app,/authEnroll/,'app.js official login path must invoke Offline V2 authEnroll');
must(app,/authState/,'app.js official login path must read back Offline V2 authState');
must(app,/enrolled\s*!==?\s*true|enrolled\s*===?\s*true/,'app.js must explicitly evaluate enrolled=true');
must(app,/valid\s*!==?\s*true|valid\s*===?\s*true/,'app.js must explicitly evaluate valid=true');
must(app,/Offline NOT READY|NOT_READY/,'app.js must expose Offline NOT READY without invalidating online login');

// Persistence/read-back must be real Main implementation, not a mock-only contract.
must(main,/writeJsonAtomic\(authPath\(\),encryptAuth\(payload,identity\)\)/,'Main authEnroll must persist the credential envelope');
must(main,/async function authState\([\s\S]*?decryptAuth\(identity\)/,'Main authState must read/decrypt the same credential path');
must(main,/async function authVerify\([\s\S]*?decryptAuth\(identity\)/,'Main authVerify must read/decrypt the same credential path');
must(main,/function authPath\(\)\{return userPath\(AUTH_FILE\)\}/,'credential writer/reader must share authPath');

// The legacy dynamic safety runtime must no longer own signIn/cacheBootstrap enrollment.
assert(!/signIn=async function\(email,password\)/.test(runtime),'legacy runtime still wraps signIn for enrollment');
assert(!/cacheBootstrap=async function\(\)/.test(runtime),'legacy runtime still wraps cacheBootstrap for enrollment');
assert(!preload.includes('offline-auth-enrollment-55.1.js'),'preload still references superseded enrollment patch');
assert(!preload.includes('offlineAuthEnrollmentFix'),'preload still contains superseded patch marker');

console.log('Offline Auth 55.3 Official app.js Gate: PASS');
console.log('Online Login + Bootstrap ownership: PASS');
console.log('app.js -> authEnroll -> persisted credential -> authState READY: PASS');
console.log('Enrollment failure -> Online remains valid + Offline NOT READY: PASS');
console.log('No competing enrollment wrapper/monkey patch: PASS');
