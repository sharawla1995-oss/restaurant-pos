(function(global){
  'use strict';

  function runtimeConfig(){
    try{return global.sharawlaRuntimeConfig||null}catch{return null}
  }

  function isRetail(){
    try{return typeof global.runtimeAllPages==='function'&&global.runtimeAllPages().includes('marketSettings')}catch{return false}
  }

  function hideNode(el){
    if(!el)return;
    el.classList.add('hidden');
    el.setAttribute('aria-hidden','true');
  }

  function enforceRetailParity(root=document){
    if(!isRetail())return;

    // Preparation receipts are a Restaurant concern. Customer invoices remain Core.
    root.querySelectorAll?.('[data-prep]').forEach(hideNode);

    // Keep Restaurant preparation-printer controls out of Retail settings without
    // changing the stored Restaurant settings or the shared printing engine.
    ['#prPrepCopies','#prPrepPrinter','#prAutoPrep'].forEach(sel=>{
      const el=root.querySelector?.(sel);
      if(el)hideNode(el.closest('label')||el.closest('.setting-switch')||el);
    });
    root.querySelectorAll?.('.setting-switch').forEach(row=>{
      if(/ريسيت التحضير|طباعة ريسيت التحضير/.test(row.textContent||''))hideNode(row);
    });

    wireRetailShiftClose(root);
  }

  function closeBlockers(orders){
    try{
      const core=global.SharawlaRuntimeCore;
      if(core?.shiftCloseBlockers)return core.shiftCloseBlockers(runtimeConfig(),orders||[]);
    }catch{}
    return [];
  }

  function wireRetailShiftClose(root=document){
    if(!isRetail())return;
    const btn=(root.matches?.('#closeShift')?root:root.querySelector?.('#closeShift'))||document.querySelector('#closeShift');
    if(!btn||btn.dataset.retailShiftCloseWired==='1')return;
    btn.dataset.retailShiftCloseWired='1';

    // Replace only Retail's close action. Restaurant keeps app.js behavior unchanged.
    btn.onclick=async()=>{
      const actual=Number(document.querySelector('#closingCash')?.value);
      if(!Number.isFinite(actual)||actual<0)return global.toast?.('اكتب الكاش الفعلي عند القفل بقيمة صفر أو أكبر');

      let open=null,metrics=null;
      try{
        open=await global.getOpenShift?.();
        if(!open)return global.toast?.('لا توجد وردية مفتوحة');
        metrics=await global.shiftMetrics?.(open);
        if(!metrics)throw new Error('تعذر قراءة بيانات الوردية');
      }catch(e){return global.toast?.(e?.message||String(e))}

      const pending=closeBlockers(metrics.orders||[]);
      if(pending.length)return global.toast?.(`فيه ${pending.length} عملية معلقة تمنع قفل الوردية`);

      const diff=actual-Number(metrics.expected||0);
      let closedShift;
      try{
        closedShift=await global.rpc('close_pos_shift_idempotent',{
          p_shift_id:Number(open.id),
          p_closing_cash:actual,
          p_metrics:{
            sales_total:metrics.sales,
            cash_sales:metrics.cash,
            wallet_sales:metrics.wallet,
            instapay_sales:metrics.instapay,
            expenses_total:metrics.exp,
            expected_cash:metrics.expected,
            cash_difference:diff,
            orders_count:metrics.count
          },
          p_client_tx_id:global.uuid()
        });
        try{await global.odbSet?.(`openShift:${open.employee_id}:${open.branch_id}`,null)}catch{}
        global.toast?.(diff===0?'تم قفل الوردية — الخزنة مظبوطة':`تم القفل — ${diff>0?'زيادة':'عجز'} ${global.money?global.money(Math.abs(diff)):Math.abs(diff)}`);
      }catch(err){
        if(!(global.isNetError?.(err)))return global.toast?.(err?.message||String(err));
        try{
          closedShift=await global.saveOfflineShiftClose(open,metrics,actual);
          global.toast?.(`تم قفل الوردية محليًا — ${diff===0?'الخزنة مظبوطة':(diff>0?'زيادة ':'عجز ')+(global.money?global.money(Math.abs(diff)):Math.abs(diff))} — ستتم المزامنة تلقائيًا`);
        }catch(e){return global.toast?.(e?.message||String(e))}
      }

      try{if(global.topBurgerDesktop?.backup?.create)await global.topBurgerDesktop.backup.create('shift-close')}catch{}
      if(navigator.onLine&&global.topBurgerDesktop?.isDesktop){
        try{global.createDesktopFullBackup?.('shift-close-full')?.catch?.(()=>{})}catch{}
      }

      try{await global.renderShifts?.()}catch{}
      if(navigator.onLine&&closedShift){
        try{
          const employees=await global.rest('employees','select=id,name,branch_id,role,active&order=name');
          await global.openShiftReport?.(closedShift,employees||[]);
        }catch{}
      }
    };
  }

  const observer=new MutationObserver(records=>{
    if(!isRetail())return;
    for(const r of records)for(const n of r.addedNodes){
      if(n.nodeType===1)enforceRetailParity(n);
    }
  });

  function start(){
    enforceRetailParity(document);
    observer.observe(document.body,{childList:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})(window);
