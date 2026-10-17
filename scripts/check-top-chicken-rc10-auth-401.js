'use strict';
// Top Chicken RC10 offline-only regression checks, no network calls.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
assert(src.includes('sessionRefreshInFlight'));
assert(src.includes('unverifiedRead'));
console.log('TOP_CHICKEN_RC10_AUTH_401_STATIC_PASS');
