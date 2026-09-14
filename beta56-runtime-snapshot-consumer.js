'use strict';

const fs=require('fs');
const path=require('path');
const crypto=require('crypto');

const SNAPSHOT_VERSION=1;
const CANONICALIZATION_VERSION=1;
const SIGNATURE_SCHEME='ed25519-v1';
const TRUSTED_PUBLIC_KEYS=Object.freeze({
  'sharawla-snapshot-2026-09-final':'MCowBQYDK2VwAyEAESbdbfUuawLv+tY5d6pioNpLV4aYVeNl9f4pJmE6vWA='
});

function fail(code,message,extra={}){
  const e=new Error(message||code);
  e.code=code;
  Object.assign(e,extra);
  throw e;
}
function text(v){return String(v??'').trim()}
function int(v){return Number.isSafeInteger(v)?v:null}
function sha256Hex(data){return crypto.createHash('sha256').update(data).digest('hex')}
function fingerprintHash(raw){return sha256Hex(Buffer.from(text(raw),'utf8'))}

function canonicalize(value){
  if(value===null)return 'null';
  if(value===true)return 'true';
  if(value===false)return 'false';
  if(typeof value==='string')return JSON.stringify(value);
  if(typeof value==='number'){
    if(!Number.isSafeInteger(value))fail('CANONICALIZATION_NUMERIC_INVALID','Only safe integers are allowed in canonicalization v1');
    return String(value);
  }
  if(Array.isArray(value))return '['+value.map(canonicalize).join(',')+']';
  if(value&&typeof value==='object'){
    const keys=Object.keys(value).sort();
    return '{'+keys.map(k=>JSON.stringify(k)+':'+canonicalize(value[k])).join(',')+'}';
  }
  fail('CANONICALIZATION_TYPE_INVALID',`Unsupported canonicalization type: ${typeof value}`);
}

function unsignedPayload(snapshot){
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))fail('SNAPSHOT_INVALID','Snapshot object required');
  const out={};
  for(const [k,v] of Object.entries(snapshot)){
    if(k==='payload_hash'||k==='signature'||k==='signing_key_id')continue;
    out[k]=v;
  }
  return out;
}

function trustedPublicKey(signingKeyId,keyRing=TRUSTED_PUBLIC_KEYS){
  const b64=keyRing?.[text(signingKeyId)];
  if(!b64)fail('SIGNING_KEY_UNKNOWN','Unknown signing_key_id');
  let der;
  try{der=Buffer.from(String(b64),'base64')}catch{fail('SIGNING_KEY_INVALID','Trusted public key is invalid base64')}
  if(der.length!==44)fail('SIGNING_KEY_INVALID','Trusted Ed25519 public key must be 44-byte SPKI DER');
  try{return crypto.createPublicKey({key:der,format:'der',type:'spki'})}catch(e){fail('SIGNING_KEY_INVALID','Trusted public key import failed',{cause:String(e&&e.message||e)})}
}

function verifySnapshot(snapshot,expected={},options={}){
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))fail('SNAPSHOT_INVALID','Snapshot object required');
  if(snapshot.snapshot_version!==SNAPSHOT_VERSION)fail('SNAPSHOT_VERSION_UNSUPPORTED','Unsupported snapshot version');
  if(snapshot.canonicalization_version!==CANONICALIZATION_VERSION)fail('CANONICALIZATION_VERSION_UNSUPPORTED','Unsupported canonicalization version');
  if(snapshot.signature_scheme!==SIGNATURE_SCHEME)fail('SIGNATURE_SCHEME_UNSUPPORTED','Unsupported signature scheme');
  const sequence=int(snapshot.snapshot_sequence);
  if(sequence===null||sequence<=0)fail('SNAPSHOT_SEQUENCE_INVALID','Snapshot sequence must be a positive safe integer');

  if(expected.device_id&&text(snapshot.device_id)!==text(expected.device_id))fail('DEVICE_BINDING_MISMATCH','Snapshot device_id mismatch');
  if(expected.business_id&&text(snapshot.business_id)!==text(expected.business_id))fail('BUSINESS_BINDING_MISMATCH','Snapshot business_id mismatch');
  if(expected.runtime_environment&&text(snapshot.runtime_environment)!==text(expected.runtime_environment))fail('ENVIRONMENT_BINDING_MISMATCH','Snapshot runtime_environment mismatch');
  if(expected.device_fingerprint){
    const want=fingerprintHash(expected.device_fingerprint);
    if(text(snapshot.device_fingerprint_hash).toLowerCase()!==want)fail('FINGERPRINT_BINDING_MISMATCH','Snapshot fingerprint hash mismatch');
  }

  const nowMs=Number.isFinite(options.nowMs)?Number(options.nowMs):Date.now();
  const expMs=Date.parse(text(snapshot.expires_at));
  if(!Number.isFinite(expMs))fail('SNAPSHOT_EXPIRY_INVALID','Snapshot expires_at is invalid');
  if(expMs<=nowMs)fail('SNAPSHOT_EXPIRED','Snapshot has expired');

  const highWater=Number(options.highWaterMark||0);
  if(!Number.isSafeInteger(highWater)||highWater<0)fail('HIGH_WATER_INVALID','Invalid local high-water mark');
  if(options.allowEqualSequence===true){
    if(sequence<highWater)fail('SNAPSHOT_ROLLBACK','Snapshot sequence is below local high-water mark');
  }else if(sequence<=highWater){
    fail('SNAPSHOT_ROLLBACK','Snapshot sequence is not newer than local high-water mark');
  }

  const unsigned=unsignedPayload(snapshot);
  const canonical=canonicalize(unsigned);
  const computedHash=sha256Hex(Buffer.from(canonical,'utf8'));
  const suppliedHash=text(snapshot.payload_hash).toLowerCase();
  if(!/^[0-9a-f]{64}$/.test(suppliedHash)||suppliedHash!==computedHash)fail('PAYLOAD_HASH_MISMATCH','Snapshot payload hash mismatch');

  let signature;
  try{signature=Buffer.from(text(snapshot.signature),'base64')}catch{fail('SIGNATURE_INVALID','Snapshot signature is invalid base64')}
  if(signature.length!==64)fail('SIGNATURE_INVALID','Ed25519 signature must be 64 bytes');
  const publicKey=trustedPublicKey(snapshot.signing_key_id,options.keyRing||TRUSTED_PUBLIC_KEYS);
  const ok=crypto.verify(null,Buffer.from(canonical,'utf8'),publicKey,signature);
  if(!ok)fail('SIGNATURE_VERIFY_FAILED','Snapshot signature verification failed');

  if(!snapshot.decisions||typeof snapshot.decisions!=='object'||Array.isArray(snapshot.decisions))fail('DECISIONS_INVALID','Snapshot decisions object missing');
  return {ok:true,sequence,payloadHash:computedHash,unsigned,canonical,expiresAt:new Date(expMs).toISOString(),signingKeyId:text(snapshot.signing_key_id)};
}

function atomicWriteJson(target,value){
  fs.mkdirSync(path.dirname(target),{recursive:true});
  const tmp=`${target}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  let exists=false;
  try{
    fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{encoding:'utf8',flag:'wx'});exists=true;
    try{const fd=fs.openSync(tmp,'r');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}catch{}
    fs.copyFileSync(tmp,target);
    try{const fd=fs.openSync(target,'r+');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}catch{}
    const check=JSON.parse(fs.readFileSync(target,'utf8'));
    if(!check||typeof check!=='object')fail('ATOMIC_WRITE_VERIFY_FAILED','Atomic JSON verification failed');
    return check;
  }finally{if(exists)try{fs.unlinkSync(tmp)}catch{}}
}

function readJson(p){try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch{return null}}

function createRuntimeSnapshotStore(rootDir){
  const root=path.resolve(String(rootDir||'.'));
  const snapshotPath=path.join(root,'runtime-access-snapshot.safe.json');
  const sequencePath=path.join(root,'runtime-access-snapshot.high-water.json');
  function highWater(){const s=readJson(sequencePath);const n=Number(s?.highest_trusted_sequence||0);return Number.isSafeInteger(n)&&n>=0?n:0}
  function acceptOnline(snapshot,expected,options={}){
    const current=highWater();
    const verified=verifySnapshot(snapshot,expected,{...options,highWaterMark:current,allowEqualSequence:false});
    const envelope={schema:1,accepted_at:new Date().toISOString(),snapshot};
    atomicWriteJson(snapshotPath,envelope);
    atomicWriteJson(sequencePath,{schema:1,highest_trusted_sequence:verified.sequence,updated_at:new Date().toISOString(),snapshot_id:text(snapshot.snapshot_id),business_id:text(snapshot.business_id),device_id:text(snapshot.device_id)});
    return {ok:true,source:'online',sequence:verified.sequence,snapshot};
  }
  function loadOffline(expected,options={}){
    const envelope=readJson(snapshotPath);
    if(!envelope?.snapshot)fail('SAFE_SNAPSHOT_MISSING','No last-known-safe snapshot');
    const current=highWater();
    const verified=verifySnapshot(envelope.snapshot,expected,{...options,highWaterMark:current,allowEqualSequence:true});
    if(verified.sequence!==current)fail('SAFE_SNAPSHOT_SEQUENCE_MISMATCH','Cached snapshot does not match local high-water mark');
    return {ok:true,source:'offline-cache',sequence:verified.sequence,snapshot:envelope.snapshot};
  }
  function clear(){for(const p of [snapshotPath,sequencePath])try{if(fs.existsSync(p))fs.unlinkSync(p)}catch{}return true}
  return Object.freeze({root,snapshotPath,sequencePath,highWater,acceptOnline,loadOffline,clear});
}

module.exports=Object.freeze({
  SNAPSHOT_VERSION,CANONICALIZATION_VERSION,SIGNATURE_SCHEME,TRUSTED_PUBLIC_KEYS,
  canonicalize,unsignedPayload,fingerprintHash,verifySnapshot,createRuntimeSnapshotStore
});
