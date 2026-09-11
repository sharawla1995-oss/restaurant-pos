(function(global){
  'use strict';

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
