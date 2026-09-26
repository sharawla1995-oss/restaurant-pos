(function(global){
'use strict';
const VERSION='10.5.4-beta.58.31';
let queued=false,observer=null;
function reconcile(){
 const panels=[...document.querySelectorAll('#page [data-advanced-purchasing]')];
 if(panels.length>1)panels.slice(1).forEach(x=>x.remove());
 const group=document.querySelector('[data-beta55-hr-group]');
 const employee=group?.querySelector('button[data-beta54-page="employees"]');
 if(employee&&employee.textContent.trim()!=='📋 بيانات الموظفين')employee.textContent='📋 بيانات الموظفين';
 const parent=group?.querySelector('[data-beta55-hr-toggle]');
 const children=group?.querySelector('[data-beta55-hr-children]');
 if(parent&&children){
   const visible=[...children.querySelectorAll('button[data-beta54-page]')].filter(x=>!x.classList.contains('hidden'));
   group.classList.toggle('hidden',visible.length===0);
 }
}
function start(){reconcile();observer=new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;reconcile()})});observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});global.__SharawlaBeta55UiHardening=Object.freeze({version:VERSION,reconcile})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
