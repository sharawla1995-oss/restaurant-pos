const fs=require('fs'),vm=require('vm'),assert=require('assert');
const app=fs.readFileSync('app.js','utf8');
const start=app.indexOf('async function updateNextBonBadge()');
const end=app.indexOf('\nfunction invoiceDisplay',start);
assert(start>=0&&end>start,'updateNextBonBadge source missing');
const fnSource=app.slice(start,end);

async function runCase({online=true,rpcResult,rpcError}){
  const el={innerHTML:''}; const calls=[];
  const ctx={
    console:{warn:()=>{}},
    navigator:{onLine:online},
    $:sel=>sel==='#nextBonBadge'?el:null,
    getOpenShift:async()=>({id:62}),
    isServerShiftId:()=>true,
    offlineQueue:async()=>[],
    rpc:async(name,args)=>{calls.push({name,args});if(rpcError)throw rpcError;return rpcResult;}
  };
  vm.createContext(ctx);vm.runInContext(fnSource+';this.updateNextBonBadge=updateNextBonBadge;',ctx);
  await ctx.updateNextBonBadge();
  return {html:el.innerHTML,calls};
}

(async()=>{
  // Exact field failure reproduced on SH-0007: Reset removed old orders, but
  // authoritative shift counter continued at 3. UI must use authority, not infer 1.
  let r=await runCase({rpcResult:{shift_id:62,branch_id:1,next_bon:3,authority:'shift_bon_counters'}});
  assert(r.html.includes('<b>3</b>'),'authoritative next BON 3 was not rendered');
  assert(!r.html.includes('<b>1</b>'),'UI regressed to guessed BON 1');
  assert.strictEqual(r.calls.length,1,'next BON must use one authoritative RPC');
  assert.strictEqual(r.calls[0].name,'pos_next_bon_v1');
  assert.strictEqual(r.calls[0].args.p_shift_id,62);

  // Missing/unavailable authority must fail visibly, never fabricate BON 1.
  r=await runCase({rpcError:new Error('function unavailable')});
  assert(r.html.includes('<b>—</b>'),'authority failure must render unknown');
  assert(r.html.includes('يُحدد عند حفظ البون'),'authority failure explanation missing');
  assert(!r.html.includes('<b>1</b>'),'authority failure fabricated BON 1');

  // Offline cannot promise a server BON before synchronization.
  r=await runCase({online:false,rpcResult:{next_bon:999}});
  assert(r.html.includes('بعد المزامنة'),'offline badge must defer official BON');
  assert.strictEqual(r.calls.length,0,'offline badge must not call server authority');

  const sql=fs.readFileSync('supabase-rc1-next-bon-authority-v1.sql','utf8');
  assert(sql.includes('from public.shift_bon_counters c'),'SQL authority must read shift counter');
  assert(!/from public\.orders/i.test(sql),'next BON authority must not infer from orders');
  assert(sql.includes("s.employee_id = v_emp"),'authority must bind current employee');
  assert(sql.includes('public.has_branch_access(s.branch_id)'),'authority must enforce branch access');
  console.log('RC1 authoritative next BON runtime gate: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
