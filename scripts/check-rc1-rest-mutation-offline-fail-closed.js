'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('app.js','utf8');
assert(source.includes("e.code='REST_MUTATION_OFFLINE_BLOCKED'"),'stable REST Offline error code missing');
assert(source.includes("method!=='GET'&&method!=='HEAD'&&globalThis.navigator?.onLine===false"),'central non-read REST Offline guard missing');
assert(source.includes("return req(`/rest/v1/${table}${query?`?${query}`:''}`,opt)"),'REST request path changed unexpectedly');
new vm.Script(source,{filename:'app.js'});
console.log('RC1 direct REST mutation Offline fail-closed gate PASS');
