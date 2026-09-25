'use strict';
const path=require('path');
const registry=require(path.join('..','sharawla-navigation-registry.js'));

const required=[
 'routeKey','navigationType','title','group','profile','locationMode',
 'rendererOwner','navigationOwner','dispatchMechanism','conflictStatus','migrationStatus'
];
const allowedStates=new Set(['REGISTERED_SHADOW','CONFLICT_BLOCKED','DEFERRED_FIX','LOCKED_ACCEPTED_OWNER','NEW_TARGET']);
const errors=[];
const keys=new Set();

if(!registry||registry.mode!=='shadow')errors.push('registry must exist in shadow mode');
for(const r of registry.routes||[]){
 if(!r.routeKey)errors.push('route without routeKey');
 if(keys.has(r.routeKey))errors.push('duplicate routeKey: '+r.routeKey);
 keys.add(r.routeKey);
 for(const k of required){
   if(r.migrationStatus==='NEW_TARGET'&&['rendererOwner','navigationOwner','dispatchMechanism'].includes(k))continue;
   if(r[k]===undefined||r[k]===null||r[k]==='')errors.push(r.routeKey+': missing '+k);
 }
 if(!allowedStates.has(r.migrationStatus))errors.push(r.routeKey+': invalid migrationStatus '+r.migrationStatus);
 if(r.conflictStatus==='CONFIRMED_MULTI_OWNER'&&r.migrationStatus!=='CONFLICT_BLOCKED')errors.push(r.routeKey+': confirmed conflict must be blocked');
}
for(const k of ['home','pos','orders','purchasing','employees','treasury','internalSupply','websiteManagement','websitePayments','marketSettings','retailOffers']){
 if(!keys.has(k))errors.push('required discovered route missing: '+k);
}
const purchasing=registry.routes.find(r=>r.routeKey==='purchasing');
if(purchasing?.migrationStatus!=='CONFLICT_BLOCKED')errors.push('purchasing must remain CONFLICT_BLOCKED');
const orders=registry.routes.find(r=>r.routeKey==='orders');
if(orders?.migrationStatus!=='LOCKED_ACCEPTED_OWNER')errors.push('orders must remain LOCKED_ACCEPTED_OWNER');
const wp=registry.routes.find(r=>r.routeKey==='websitePayments');
if(wp?.conflictStatus!=='KNOWN_PERMISSION_MISMATCH'||wp?.migrationStatus!=='DEFERRED_FIX')errors.push('websitePayments known permission mismatch must remain deferred');

if(errors.length){
 console.error('Unified Navigation Registry 1A: FAIL');
 errors.forEach(e=>console.error(' - '+e));
 process.exit(1);
}
console.log('Unified Navigation Registry 1A: PASS');
console.log('routes='+registry.routes.length+'; mode='+registry.mode+'; conflicts='+registry.routes.filter(r=>r.migrationStatus==='CONFLICT_BLOCKED').length+'; deferred='+registry.routes.filter(r=>r.migrationStatus==='DEFERRED_FIX').length);
