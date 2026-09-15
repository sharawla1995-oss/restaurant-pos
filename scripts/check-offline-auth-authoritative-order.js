'use strict';
const fs=require('fs');
const assert=require('assert');
const runtime=fs.readFileSync('beta45-offline-v2-safety-runtime.js','utf8');
const preload=fs.readFileSync('preload.js','utf8');

function must(re,msg){assert(re.test(runtime),msg)}

// Authoritative flow must verify persisted enrollment through authState.
must(/async function enrollOfflineCredential\([\s\S]*?a\.authEnroll\([\s\S]*?verifyOfflineReady\(identity\)/,'enrollment must be followed by authState readiness verification');
must(/state\?\.enrolled!==true\|\|state\?\.valid!==true/,'READY must require enrolled=true and valid=true');
must(/setOfflineReady\(false,'NOT_READY'/,'failures must be visible as NOT_READY');

// Ordering A: Login completes before bootstrap. Login records credentials and waits;
// authoritative cacheBootstrap then enrolls after base bootstrap persistence.
must(/const d=await baseSignIn\(email,password\);lastOnlineCredentials=/,'online login must retain credentials only for pending bootstrap completion');
must(/WAITING_FOR_BOOTSTRAP/,'login-first ordering must explicitly remain NOT_READY until bootstrap');
must(/cacheBootstrap=async function\(\)\{[\s\S]*?const out=await baseCacheBootstrap\(\);[\s\S]*?enrollOfflineCredential\(lastOnlineCredentials\.email,lastOnlineCredentials\.password,boot\)/,'login-first ordering must enroll after base cacheBootstrap completes');

// Ordering B: Bootstrap already exists when login succeeds. Enrollment is immediate.
must(/signIn=async function\(email,password\)[\s\S]*?const boot=await odbGet\('bootstrap'\);if\(boot\?\.employee\?\.id\)await enrollOfflineCredential\(email,password,boot\)/,'bootstrap-first ordering must enroll immediately after online login');

// Old late monkey patch must be gone from loader/source.
assert(!preload.includes('offline-auth-enrollment-55.1.js'),'preload still references superseded enrollment patch');
assert(!preload.includes('offlineAuthEnrollmentFix'),'preload still contains superseded patch marker');
assert(!runtime.includes("console.warn('Offline V2 auth enrollment'"),'old silent enrollment warning remains');

console.log('Offline Auth Authoritative Order Check: PASS');
console.log('A Login->Bootstrap->Enroll->authState: PASS');
console.log('B Bootstrap->Login->Enroll->authState: PASS');
console.log('Failure state Offline NOT READY: PASS');
console.log('Superseded monkey patch loader absent: PASS');
