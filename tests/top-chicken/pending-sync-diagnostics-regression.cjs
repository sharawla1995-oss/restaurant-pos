'use strict';
// SH-0008-only UI diagnosis: read-only local queue visibility, PII redaction, explicit temporary pause.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const a=fs.readFileSync('app.js','utf8');
const begin=a.indexOf("const TOP_CHICKEN_SYNC_PAUSE_KEY=");
const end=a.indexOf('function updatePendingSyncBadge(',begin);
assert.ok(begin>0&&end>begin,'Top Chicken sync diagnostic must exist');
const src=a.slice(begin,end);
assert.ok(src.includes("replace(/\\/$/,'')"),'trailing URL slash normalized');
const mockQueue=[{type:'sale',client_tx_id:'test-tx-55abc','created_at':'2026-10-14T22:00:00Z',p_order:{customer_name:'SECRET NAME',customer_phone:'01011112222'}}];
const persisted=[{client_tx_id:'test-tx-55abc',attempts:6,last_error:'Cloud error for 01011112222 or private@example.com'}];
const keys=new Map(),nodes=[],toasts=[],state={employee:{business_id:'5358328c-9724-49aa-affc-1bce8be90f92'}};
let branch=22,persistentWrites=0;
const ctx={cfg:{url:'https://xihcxydjnzemflhedzor.supabase.co'},state,currentBranchId:()=>branch,
 localStorage:{getItem:k=>keys.get(k)||null,setItem:(k,v)=>keys.set(k,v),removeItem:k=>keys.delete(k)},
 offlineQueue:async()=>mockQueue,
 window:{topBurgerDesktop:{operations:{list:async()=>persisted,status:async()=>{persistentWrites++},put:async()=>{persistentWrites++}}}},
 navigator:{onLine:true},esc:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 document:{createElement:()=>({className:'',innerHTML:'',querySelector:()=>({textContent:''}),onclick:null}),body:{appendChild:v=>nodes.push(v)}},
 toast:t=>toasts.push(t),console};
vm.createContext(ctx);
vm.runInContext(src,ctx);
(async()=>{
 assert.equal(vm.runInContext('isTopChickenSyncDiagnosticsScope()',ctx),true);
 assert.equal(vm.runInContext('isTopChickenSyncPaused()',ctx),false);
 await vm.runInContext('showTopChickenSyncDiagnostics()',ctx);
 assert.equal(nodes.length,1);
 const html=nodes[0].innerHTML;
 assert.match(html,/فاتورة بيع/);
 assert.match(html,/المحاولات المسجلة: 6/);
 assert.match(html,/\[رقم محجوب\]/);
 assert.match(html,/\[بريد محجوب\]/);
 assert.ok(!html.includes('SECRET NAME'),'never expose private payload');
 assert.ok(!html.includes('01011112222'),'customer phone must be hidden');
 assert.ok(!html.includes('private@example.com'),'email must be hidden');
 assert.equal(persistentWrites,0,'read-only diagnosis must not touch local receipts');
 nodes[0].onclick({target:{closest:q=>q==='[data-tc-sync-pause]'?{}:null}});
 assert.equal(vm.runInContext('isTopChickenSyncPaused()',ctx),true);
 assert.equal(keys.get('top-chicken-sh0008-sync-diagnostics-paused-v1'),'1');
 nodes[0].onclick({target:{closest:q=>q==='[data-tc-sync-pause]'?{}:null}});
 assert.equal(vm.runInContext('isTopChickenSyncPaused()',ctx),false);
 assert.equal(persistentWrites,0);
 branch=1;
 assert.equal(vm.runInContext('isTopChickenSyncDiagnosticsScope()',ctx),false,'foreign branch blocked');
 state.employee.business_id='91826502-590e-4afa-8826-2c0f4b99c490';branch=22;
 assert.equal(vm.runInContext('isTopChickenSyncDiagnosticsScope()',ctx),false,'foreign tenant blocked');
 await vm.runInContext('showTopChickenSyncDiagnostics()',ctx);
 assert.equal(nodes.length,1,'foreign tenant sees no diagnostic');
 assert.ok(a.includes("async function syncOfflineQueue(){if(!navigator.onLine||!session?.access_token||isTopChickenSyncPaused())return;"));
 assert.ok(a.includes("for(const job of [...q]){if(isTopChickenSyncPaused())break;try{"),'pause checked between queued operations');
 assert.ok(a.includes("el.onclick=()=>{if(isTopChickenSyncDiagnosticsScope())showTopChickenSyncDiagnostics()"),'pending badge opens dialog only for TC');
 console.log('PASS: SH-0008 pending sync diagnostics read-only, PII masked, reversible pause, other tenant/branch blocked');
})().catch(err=>{console.error(err);process.exitCode=1});
