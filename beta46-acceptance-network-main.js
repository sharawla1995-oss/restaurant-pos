'use strict';
const {app,ipcMain}=require('electron');
const fs=require('fs'),path=require('path'),https=require('https');
const {EventEmitter}=require('events');
const VERSION='10.5.4-beta.46-main-network-lab-v1';
const TEST_HOST='xihcxydjnzemflhedzor.supabase.co';
const BETA_BUSINESS_ID='91826502-590e-4afa-8826-2c0f4b99c490',BETA_SUPPORT='SH-0007';
const originalRequest=https.request.bind(https);
let installed=false,state={enabled:false,mode:'online',delay_ms:0,run_id:null,expires_at:0,sequence:0,one_shot:false};
function statePath(){return path.join(app.getPath('userData'),'acceptance-network-lab.json')}
function licensePath(){return path.join(app.getPath('userData'),'data','sharawla-license-state.json')}
function text(v){return String(v??'').trim()}
function lock(){try{const st=JSON.parse(fs.readFileSync(licensePath(),'utf8'));const reasons=[];if(text(st.support_code)!==BETA_SUPPORT)reasons.push('support_not_SH-0007');if(text(st.business_id)!==BETA_BUSINESS_ID)reasons.push('business_not_sandbox');return {ok:!reasons.length,reasons,support_code:text(st.support_code),business_id:text(st.business_id)}}catch(e){return {ok:false,reasons:['license_unavailable'],error:String(e&&e.message||e)}}}
function safeState(){return {...state}}
function persist(){try{fs.writeFileSync(statePath(),JSON.stringify(state),'utf8')}catch{}return safeState()}
function disable(reason='manual'){state={enabled:false,mode:'online',delay_ms:0,run_id:null,expires_at:0,sequence:0,one_shot:false,last_disabled_reason:text(reason)};try{if(fs.existsSync(statePath()))fs.unlinkSync(statePath())}catch{}return safeState()}
function restore(){try{const s=JSON.parse(fs.readFileSync(statePath(),'utf8'));if(!s?.enabled||Number(s.expires_at||0)<Date.now()||!lock().ok)return disable('resume-invalid');state={...s,sequence:Number(s.sequence||0)};return safeState()}catch{return safeState()}}
function setState(input={}){const gate=lock();if(!gate.ok)throw Object.assign(new Error(`Acceptance network sandbox lock failed: ${gate.reasons.join(',')}`),{code:'ACCEPTANCE_SANDBOX_LOCK'});const mode=text(input.mode||'online').toLowerCase(),allowed=new Set(['online','offline','timeout','http500','flap','lost_ack']);if(!allowed.has(mode))throw new Error(`Unsupported acceptance network mode: ${mode}`);if(mode==='online')return disable('set-online');state={enabled:true,mode,delay_ms:Math.max(0,Number(input.delay_ms||0)),run_id:text(input.run_id)||null,expires_at:Date.now()+Math.min(15*60*1000,Math.max(60_000,Number(input.ttl_ms||10*60*1000))),sequence:0,one_shot:input.one_shot===true||mode==='lost_ack'};return persist()}
function active(){if(!state.enabled)return false;if(state.expires_at&&state.expires_at<Date.now()){disable('expired');return false}if(!lock().ok){disable('lock-lost');return false}return true}
function hostOf(options){try{if(typeof options==='string')return new URL(options).hostname;if(options instanceof URL)return options.hostname;return text(options?.hostname||options?.host).split(':')[0]}catch{return''}}
function netError(code='ACCEPTANCE_NETWORK_OFFLINE',message='Failed to fetch'){const e=new Error(message);e.code=code;e.kind='network';e.acceptance_network_lab=true;return e}
function fakeRequest(callback,action){const req=new EventEmitter();req.setTimeout=()=>req;req.write=()=>true;req.destroy=e=>{queueMicrotask(()=>req.emit('error',e||netError()));return req};req.end=()=>{const delay=Math.max(0,Number(state.delay_ms||0));if(action==='http500'){setTimeout(()=>{const res=new EventEmitter();res.statusCode=503;res.headers={'content-type':'application/json','x-sharawla-acceptance-fault':'http500'};res.setEncoding=()=>res;callback?.(res);queueMicrotask(()=>{res.emit('data',JSON.stringify({message:'Acceptance Network Lab synthetic 503',code:'ACCEPTANCE_HTTP_503'}));res.emit('end')})},delay);return}setTimeout(()=>req.emit('error',netError(action==='timeout'?'ETIMEDOUT':'ACCEPTANCE_NETWORK_OFFLINE',action==='timeout'?'Acceptance network timeout':'Acceptance network offline')),action==='timeout'?(delay||5000):delay)};return req}
function wrappedRequest(options,callback){
 if(!active()||hostOf(options)!==TEST_HOST)return originalRequest(options,callback);
 state.sequence=Number(state.sequence||0)+1;persist();
 let mode=state.mode;if(mode==='flap')mode=state.sequence%2?'offline':'online';
 if(mode==='online')return originalRequest(options,callback);
 if(mode==='offline'||mode==='timeout'||mode==='http500')return fakeRequest(callback,mode);
 if(mode==='lost_ack'){
  let req;const wrapped=res=>{const shouldDrop=(res.statusCode||0)>=200&&(res.statusCode||0)<300;if(!shouldDrop)return callback?.(res);let raw='';res.setEncoding?.('utf8');res.on('data',c=>raw+=c);res.on('end',()=>{if(state.one_shot)disable('lost-ack-consumed');queueMicrotask(()=>req.emit('error',netError('ECONNRESET','Acceptance Lab dropped ACK after server commit')))});};req=originalRequest(options,wrapped);return req;
 }
 return originalRequest(options,callback);
}
function install(){if(installed)return module.exports.api;installed=true;restore();https.request=wrappedRequest;
 ipcMain.handle('acceptance:network-set',(_e,input)=>setState(input||{}));
 ipcMain.handle('acceptance:network-state',()=>({version:VERSION,...safeState(),sandbox:lock()}));
 ipcMain.handle('acceptance:network-disable',(_e,reason)=>disable(reason||'renderer'));
 ipcMain.handle('acceptance:restart',(_e,input={})=>{const gate=lock();if(!gate.ok)throw Object.assign(new Error(`Acceptance restart sandbox lock failed: ${gate.reasons.join(',')}`),{code:'ACCEPTANCE_SANDBOX_LOCK'});const delay=Math.max(100,Math.min(3000,Number(input.delay_ms||350)));setTimeout(()=>{app.relaunch();app.exit(0)},delay);return {ok:true,restarting:true,delay_ms:delay}});
 return module.exports.api}
module.exports.api=Object.freeze({version:VERSION,install,state:safeState,setState,disable,lock,restore});
module.exports.installAcceptanceNetworkMain=install;
