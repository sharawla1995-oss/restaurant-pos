'use strict';
const fs=require('fs');
const vm=require('vm');
const src=fs.readFileSync('point4-uuid-v4.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const acc=fs.readFileSync('owner-acceptance-beta55-restaurant-v55.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const fail=[]; const need=(ok,msg)=>{if(!ok)fail.push(msg)};

need(src.includes("VERSION='1.0.0-secure-fallback'"),'secure UUID provider marker missing');
need(src.includes("mode:'WEB_CRYPTO_SECURE_ONLY'"),'secure-only mode marker missing');
need(src.includes("typeof c.randomUUID==='function'"),'native randomUUID path missing');
need(src.includes("typeof c.getRandomValues!=='function'"),'getRandomValues fallback guard missing');
need(src.includes("b[6]=(b[6]&0x0f)|0x40"),'UUID v4 version bits missing');
need(src.includes("b[8]=(b[8]&0x3f)|0x80"),'UUID variant bits missing');
need(!src.includes('Math.random'),'Point4 provider must not use Math.random');
need(!src.includes('Date.now'),'Point4 provider must not use timestamp fallback');
need(app.includes("window.__SharawlaPoint4UuidV4"),'app does not delegate Point4 UUID');
need(!app.includes("function point4UuidV4(){const v=String(uuid())"),'legacy Point4 UUID fallback still present');
need(acc.includes("global.__SharawlaPoint4UuidV4"),'Acceptance fixture does not use shared provider');

const fakeCrypto={getRandomValues(a){for(let i=0;i<a.length;i++)a[i]=(i*17+3)&255;return a}};
const context={window:{crypto:fakeCrypto},crypto:fakeCrypto,Uint8Array,Array,Object,String,Error};
context.window.window=context.window;
vm.createContext(context);
vm.runInContext(src,context);
const provider=context.window.__SharawlaPoint4UuidV4;
need(provider&&provider.mode==='WEB_CRYPTO_SECURE_ONLY','provider failed to initialize');
for(let i=0;i<8;i++){
  const id=provider.next();
  need(provider.validate(id),'fallback emitted invalid UUID v4: '+id);
  need(id[14]==='4','fallback UUID version nibble invalid: '+id);
  need(/[89ab]/.test(id[19]),'fallback UUID variant nibble invalid: '+id);
}

const ref='point4-uuid-v4.js?v='+pkg.version;
need(html.includes(ref),'versioned Point4 UUID ref missing');
need(html.indexOf(ref)<html.indexOf('app.js?v='),'Point4 UUID provider must load before app.js');
need(/^10\.5\.4-beta\.58\.\d+$/.test(pkg.version),'expected Beta58 line');

if(fail.length){console.error('Point4 Secure UUID V4 Fallback: FAIL');fail.forEach(x=>console.error('- '+x));process.exit(1)}
console.log('Point4 Secure UUID V4 Fallback: PASS');
console.log('native=randomUUID; fallback=getRandomValues; insecure-fallback=none');
