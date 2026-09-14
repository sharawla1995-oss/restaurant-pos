'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const crypto=require('crypto');
const c=require('../beta56-runtime-snapshot-consumer.js');

function signSnapshot(payload,keyId='test-key'){
  const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
  const ring={[keyId]:publicKey.export({format:'der',type:'spki'}).toString('base64')};
  const canonical=c.canonicalize(payload);
  return {snapshot:{...payload,payload_hash:crypto.createHash('sha256').update(canonical).digest('hex'),signature:crypto.sign(null,Buffer.from(canonical),privateKey).toString('base64'),signing_key_id:keyId},ring};
}
function expectCode(fn,code){let got=null;try{fn()}catch(e){got=e.code}assert.strictEqual(got,code,`expected ${code}, got ${got}`)}

const deviceId='8c580a23-8711-4540-b6ca-f5c1725d5fcf';
const businessId='91826502-590e-4afa-8826-2c0f4b99c490';
const fingerprint='beta56-test-fingerprint';
const now=Date.now();
const payload={
  profile:'restaurant',decisions:{'core.auth':{allowed:true,reason_code:'ALLOWED'}},
  device_id:deviceId,issued_at:new Date(now-1000).toISOString(),business_id:businessId,
  snapshot_id:crypto.randomUUID(),verified_at:new Date(now-1000).toISOString(),policy_version:1,
  baseline_version:'3A-2026-09-14-frozen-v1',signature_scheme:'ed25519-v1',snapshot_version:1,
  snapshot_sequence:6,composition_version:1,runtime_environment:'beta',
  device_fingerprint_hash:c.fingerprintHash(fingerprint),canonicalization_version:1,
  expires_at:new Date(now+3600000).toISOString()
};
const signed=signSnapshot(payload);
const expected={device_id:deviceId,business_id:businessId,device_fingerprint:fingerprint,runtime_environment:'beta'};
const ok=c.verifySnapshot(signed.snapshot,expected,{keyRing:signed.ring,highWaterMark:5,nowMs:now});
assert.strictEqual(ok.ok,true);assert.strictEqual(ok.sequence,6);

const tampered=JSON.parse(JSON.stringify(signed.snapshot));tampered.decisions['core.auth'].allowed=false;
expectCode(()=>c.verifySnapshot(tampered,expected,{keyRing:signed.ring,highWaterMark:5,nowMs:now}),'PAYLOAD_HASH_MISMATCH');
expectCode(()=>c.verifySnapshot({...signed.snapshot,signing_key_id:'unknown'},expected,{keyRing:signed.ring,highWaterMark:5,nowMs:now}),'SIGNING_KEY_UNKNOWN');
expectCode(()=>c.verifySnapshot(signed.snapshot,expected,{keyRing:signed.ring,highWaterMark:6,nowMs:now}),'SNAPSHOT_ROLLBACK');
expectCode(()=>c.verifySnapshot({...signed.snapshot,expires_at:new Date(now-1).toISOString()},expected,{keyRing:signed.ring,highWaterMark:5,nowMs:now}),'SNAPSHOT_EXPIRED');
expectCode(()=>c.verifySnapshot(signed.snapshot,{...expected,business_id:'00000000-0000-0000-0000-000000000000'},{keyRing:signed.ring,highWaterMark:5,nowMs:now}),'BUSINESS_BINDING_MISMATCH');
expectCode(()=>c.verifySnapshot(signed.snapshot,{...expected,device_fingerprint:'wrong'},{keyRing:signed.ring,highWaterMark:5,nowMs:now}),'FINGERPRINT_BINDING_MISMATCH');

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sharawla-beta56-'));
try{
  const store=c.createRuntimeSnapshotStore(temp);
  const accepted=store.acceptOnline(signed.snapshot,expected,{keyRing:signed.ring,nowMs:now});
  assert.strictEqual(accepted.sequence,6);assert.strictEqual(store.highWater(),6);
  assert.ok(fs.existsSync(store.snapshotPath));assert.ok(fs.existsSync(store.sequencePath));
  const offline=store.loadOffline(expected,{keyRing:signed.ring,nowMs:now});
  assert.strictEqual(offline.sequence,6);assert.strictEqual(offline.source,'offline-cache');
  expectCode(()=>store.acceptOnline(signed.snapshot,expected,{keyRing:signed.ring,nowMs:now}),'SNAPSHOT_ROLLBACK');
  const seq=JSON.parse(fs.readFileSync(store.sequencePath,'utf8'));seq.highest_trusted_sequence=7;fs.writeFileSync(store.sequencePath,JSON.stringify(seq));
  expectCode(()=>store.loadOffline(expected,{keyRing:signed.ring,nowMs:now}),'SNAPSHOT_ROLLBACK');
}finally{fs.rmSync(temp,{recursive:true,force:true})}

const mainWrapper=fs.readFileSync(path.join(__dirname,'..','main-beta44.js'),'utf8');
const mainRuntime=fs.readFileSync(path.join(__dirname,'..','beta56-runtime-snapshot-main.js'),'utf8');
const preload=fs.readFileSync(path.join(__dirname,'..','preload.js'),'utf8');
assert.ok(mainWrapper.includes("require('./beta56-runtime-snapshot-main.js').installRuntimeSnapshotMain()"),'main wrapper must install Beta56 runtime snapshot main consumer');
for(const token of ["runtimeSnapshot:{","runtime-snapshot:refresh","runtime-snapshot:state","runtime-snapshot:feature","st?.sandbox?.ok===true"]){assert.ok(preload.includes(token),`preload integration missing: ${token}`)}
assert.ok(preload.includes("window.addEventListener('online',refreshRuntimeSnapshot)"),'online refresh hook missing');
assert.ok(preload.includes("loginForm.addEventListener('submit'"),'login refresh hook missing');

for(const token of ["function offlineEligible(error)","OFFLINE_ELIGIBLE_CODES","if(!offlineEligible(error))","SNAPSHOT_VERIFICATION_FAILED"]){
  assert.ok(mainRuntime.includes(token),`main runtime fail-closed guard missing: ${token}`);
}
assert.ok(!/acceptOnline\(snap,expected\)[\s\S]{0,500}loadOffline\(expected\)/.test(mainRuntime),'verification failure must never fall back to offline cache');

assert.strictEqual(c.TRUSTED_PUBLIC_KEYS['sharawla-snapshot-2026-01'],'MCowBQYDK2VwAyEAkc/POo2GOBlTMZh2vwZ/MQOyk3m8B2ce0IeRNfScGxU=');
console.log('Beta56 Runtime Snapshot Consumer Static Acceptance: PASS');
console.log('signature/hash............... PASS');
console.log('tamper....................... PASS');
console.log('unknown signing key.......... PASS');
console.log('anti-rollback................ PASS');
console.log('expiry....................... PASS');
console.log('identity binding............. PASS');
console.log('atomic safe cache............ PASS');
console.log('offline last-known-safe...... PASS');
console.log('network-only fallback........ PASS');
console.log('verifier fail-closed......... PASS');
console.log('main IPC integration......... PASS');
console.log('preload renderer bridge...... PASS');
console.log('login/online refresh hooks... PASS');
