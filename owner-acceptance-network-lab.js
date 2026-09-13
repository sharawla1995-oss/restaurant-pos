(function(global){
'use strict';
const VERSION='10.5.4-beta.51';
const STATE_KEY='sharawlaAcceptanceNetworkLabV1';
const TEST_HOST='xihcxydjnzemflhedzor.supabase.co',CLOUD_HOST='ikppryeavoabnugcijeq.supabase.co';
const TARGETS=new Set([TEST_HOST,CLOUD_HOST]);
const originalFetch=global.fetch.bind(global);
let state={enabled:false,mode:'online',delay_ms:0,run_id:null,expires_at:0,sequence:0,one_shot:false};
const now=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),text=v=>String(v??'').trim();
function saved(){try{return JSON.parse(localStorage.getItem(STATE_KEY)||'null')}catch{return null}}
function persist(){try{localStorage.setItem(STATE_KEY,JSON.stringify(state))}catch{};renderBadge()}
function clearSaved(){try{localStorage.removeItem(STATE_KEY)}catch{}}
function target(input){try{const raw=typeof input==='string'?input:input?.url||String(input||'');const u=new URL(raw,location.href);return TARGETS.has(u.host)?u:null}catch{return null}}
function failure(message='Failed to fetch',code='ACCEPTANCE_NETWORK_OFFLINE'){const e=new TypeError(message);e.code=code;e.acceptance_network_lab=true;return e}
async function lock(requireOwner=true){const r=global.__SharawlaAcceptanceRegistry;if(!r?.sandboxLock)return {ok:false,reasons:['registry_unavailable']};return r.sandboxLock({requireOwner})}
function snapshot(){return {...state}}
function isBlocking(){return state.enabled&&['offline','timeout','http500'].includes(state.mode)}
function mode(){return state.enabled?state.mode:'online'}
async function mainSet(next,opts){const a=global.topBurgerDesktop?.acceptance;if(!a?.networkSet)throw new Error('Main acceptance network bridge unavailable');return a.networkSet({mode:next,delay_ms:opts.delay_ms,run_id:opts.run_id,ttl_ms:opts.ttl_ms,one_shot:opts.one_shot})}
async function enable(next='offline',opts={}){
 const allowed=new Set(['online','offline','timeout','http500','slow','flap','lost_ack']);next=text(next).toLowerCase();if(!allowed.has(next))throw new Error(`Unsupported network lab mode: ${next}`);
 const gate=await lock(opts.requireOwner!==false);if(!gate.ok)throw new Error(`Sandbox network lock failed: ${gate.reasons.join(', ')}`);
 const delay=Math.max(0,Number(opts.delay_ms??(next==='slow'?1200:next==='timeout'?5000:0))||0),ttl=Math.min(15*60*1000,Math.max(60_000,Number(opts.ttl_ms||10*60*1000)));
 if(next!=='slow')await mainSet(next,{...opts,delay_ms:delay,ttl_ms:ttl});
 state={enabled:next!=='online',mode:next,delay_ms:delay,run_id:text(opts.run_id)||null,expires_at:now()+ttl,sequence:0,one_shot:opts.one_shot===true||next==='lost_ack'};persist();return snapshot();
}
async function disable(reason='manual'){state={enabled:false,mode:'online',delay_ms:0,run_id:null,expires_at:0,sequence:0,one_shot:false,last_disabled_reason:text(reason)};clearSaved();renderBadge();try{await global.topBurgerDesktop?.acceptance?.networkDisable?.(reason)}catch{}return snapshot()}
function valid(){if(!state.enabled)return true;if(state.expires_at&&state.expires_at<now()){disable('expired').catch(()=>{});return false}return true}
async function decision(){if(!valid()||!state.enabled)return {action:'pass'};state.sequence++;if(state.mode==='flap')return state.sequence%2?{action:'block'}:{action:'pass'};if(state.mode==='offline')return {action:'block'};if(state.mode==='timeout')return {action:'timeout',delay:state.delay_ms||5000};if(state.mode==='http500')return {action:'http500'};if(state.mode==='slow')return {action:'slow',delay:state.delay_ms||1200};return {action:'pass'}}
async function labFetch(input,init){
 if(!target(input))return originalFetch(input,init);const d=await decision();if(d.action==='pass')return originalFetch(input,init);if(d.action==='slow'){await sleep(d.delay);return originalFetch(input,init)}if(d.action==='timeout'){await sleep(d.delay);throw failure('Failed to fetch','ACCEPTANCE_NETWORK_TIMEOUT')}if(d.action==='http500')return new Response(JSON.stringify({message:'Acceptance Network Lab synthetic 503'}),{status:503,statusText:'Service Unavailable',headers:{'Content-Type':'application/json','X-Sharawla-Acceptance-Fault':'http500'}});throw failure();
}
async function mainState(){try{return await global.topBurgerDesktop?.acceptance?.networkState?.()||null}catch{return null}}
function renderBadge(){let el=document.getElementById('sharawlaAcceptanceNetworkBadge');if(!state.enabled){el?.remove();return}if(!el){el=document.createElement('button');el.id='sharawlaAcceptanceNetworkBadge';el.type='button';el.style.cssText='position:fixed;left:12px;bottom:58px;z-index:2147483646;padding:8px 10px;border:2px solid #b91c1c;border-radius:10px;background:#fff;color:#991b1b;font-weight:800;box-shadow:0 4px 20px #0002';el.onclick=()=>{disable('badge-click');try{global.toast?.('تم إلغاء Test Network Fault')}catch{}};document.body.appendChild(el)}el.textContent=`🧪 NET: ${state.mode.toUpperCase()} — اضغط للإلغاء`;el.title='Sharawla Acceptance Network Lab — يعزل Sharawla فقط ولا يقطع AnyDesk أو إنترنت Windows'}
async function restore(){
 const local=saved(),main=await mainState();const candidate=main?.enabled?main:local;
 if(!candidate?.enabled||Number(candidate.expires_at||0)<now())return disable('no-resume');const gate=await lock(false);if(!gate.ok)return disable('resume-lock-failed');state={...candidate,sequence:0};persist();return snapshot();
}
global.fetch=labFetch;
const api=Object.freeze({version:VERSION,enable,disable,state:snapshot,mainState,mode,isBlocking,targetHost:u=>!!target(u),restore,originalFetch});
global.__SharawlaAcceptanceNetworkLab=api;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{restore().catch(()=>disable('restore-error'));renderBadge()},{once:true});else{restore().catch(()=>disable('restore-error'));renderBadge()}
setInterval(()=>{valid();renderBadge()},5000);
})(window);
