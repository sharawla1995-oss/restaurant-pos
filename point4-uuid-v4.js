(function(global){
'use strict';

const VERSION='1.0.0-secure-fallback';
const UUID_V4_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function normalize(v){return String(v||'').trim().toLowerCase()}
function bytesUuidV4(){
  const c=global.crypto;
  if(!c||typeof c.getRandomValues!=='function')return '';
  const b=new Uint8Array(16);
  c.getRandomValues(b);
  b[6]=(b[6]&0x0f)|0x40;
  b[8]=(b[8]&0x3f)|0x80;
  const h=Array.from(b,x=>x.toString(16).padStart(2,'0'));
  return `${h.slice(0,4).join('')}-${h.slice(4,6).join('')}-${h.slice(6,8).join('')}-${h.slice(8,10).join('')}-${h.slice(10,16).join('')}`;
}
function next(){
  const c=global.crypto;
  let v='';
  if(c&&typeof c.randomUUID==='function'){
    try{v=normalize(c.randomUUID())}catch{}
  }
  if(!UUID_V4_RE.test(v))v=normalize(bytesUuidV4());
  if(!UUID_V4_RE.test(v)){
    const e=new Error('Point 4 canonical UUIDv4 identity is unavailable');
    e.code='POINT4_IDENTITY_UUID_V4_REQUIRED';
    throw e;
  }
  return v;
}
function validate(v){return UUID_V4_RE.test(normalize(v))}

global.__SharawlaPoint4UuidV4=Object.freeze({
  version:VERSION,
  mode:'WEB_CRYPTO_SECURE_ONLY',
  next,
  validate
});
})(window);
