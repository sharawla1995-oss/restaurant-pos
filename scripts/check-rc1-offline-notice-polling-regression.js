'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

function offlineNoticeHarness(){
  const source=fs.readFileSync('beta55-5-runtime-hardening.js','utf8');
  const raf=[];
  const timeouts=[];
  const windowEvents=new Map();
  let observerCallback=null;

  function notify(record){if(observerCallback)observerCallback([record])}
  class FakeClassList{
    constructor(node){this.node=node;this.values=new Set()}
    toggle(name,on){if(on)this.values.add(name);else this.values.delete(name)}
    contains(name){return this.values.has(name)}
  }
  class FakeElement{
    constructor(tag='div'){
      this.tagName=String(tag).toUpperCase();this.nodeType=1;this.dataset={};this.style={};this.children=[];this.parentNode=null;this.id='';this.className='';this.classList=new FakeClassList(this);this._innerHTML='';
    }
    set innerHTML(value){this._innerHTML=String(value)}
    get innerHTML(){return this._innerHTML}
    matches(selector){
      if(selector==='[data-beta555-offline-note]')return this.dataset.beta555OfflineNote!==undefined;
      return false;
    }
    closest(selector){let node=this;while(node){if(node.matches?.(selector))return node;node=node.parentNode}return null}
    querySelectorAll(selector){
      const found=[];const walk=node=>{for(const child of node.children){if(child.matches?.(selector))found.push(child);walk(child)}};walk(this);return found;
    }
    querySelector(selector){return this.querySelectorAll(selector)[0]||null}
    prepend(node){
      if(node.parentNode){const i=node.parentNode.children.indexOf(node);if(i>=0)node.parentNode.children.splice(i,1)}
      node.parentNode=this;this.children.unshift(node);notify({target:this,addedNodes:[node],removedNodes:[]});
    }
    appendChild(node){node.parentNode=this;this.children.push(node);return node}
    remove(){
      if(!this.parentNode)return;const parent=this.parentNode;const i=parent.children.indexOf(this);if(i>=0)parent.children.splice(i,1);this.parentNode=null;notify({target:parent,addedNodes:[],removedNodes:[this]});
    }
  }

  const page=new FakeElement('main');page.id='page';
  const body=new FakeElement('body');
  const head=new FakeElement('head');
  const navButton=new FakeElement('button');navButton.dataset.page='home';
  const documentEvents=new Map();
  const document={
    readyState:'complete',body,head,
    createElement:tag=>new FakeElement(tag),
    getElementById:id=>[...head.children,...body.children,page].find(x=>x.id===id)||null,
    querySelector(selector){
      if(selector==='#page')return page;
      if(selector.startsWith('#page '))return page.querySelector(selector.slice(6));
      return null;
    },
    querySelectorAll(selector){
      if(selector==='#nav button.active[data-page]')return [navButton];
      if(selector.startsWith('#page '))return page.querySelectorAll(selector.slice(6));
      return [];
    },
    addEventListener(type,fn){const rows=documentEvents.get(type)||[];rows.push(fn);documentEvents.set(type,rows)}
  };
  class FakeMutationObserver{
    constructor(fn){observerCallback=fn}
    observe(){}
  }
  class FakeCustomEvent{constructor(type,options={}){this.type=type;this.detail=options.detail}}
  const context={
    console,document,navigator:{onLine:true},MutationObserver:FakeMutationObserver,CustomEvent:FakeCustomEvent,
    requestAnimationFrame(fn){raf.push(fn);return raf.length},
    setTimeout(fn){timeouts.push(fn);return timeouts.length},
    getComputedStyle:()=>({display:'block'}),
    addEventListener(type,fn){const rows=windowEvents.get(type)||[];rows.push(fn);windowEvents.set(type,rows)},
    dispatchEvent(event){for(const fn of windowEvents.get(event.type)||[])fn(event);return true}
  };
  context.window=context;
  vm.runInNewContext(source,context,{filename:'beta55-5-runtime-hardening.js'});
  const flushRaf=()=>{while(raf.length)raf.shift()()};
  while(timeouts.length)timeouts.shift()();
  flushRaf();
  const notes=()=>page.querySelectorAll('[data-beta555-offline-note]');
  const emit=type=>context.dispatchEvent(new FakeCustomEvent(type));
  const externalMutation=()=>observerCallback([{target:page,addedNodes:[new FakeElement('section')],removedNodes:[]}]);
  return {context,raf,flushRaf,notes,emit,externalMutation};
}

async function checkOfflineNotice(){
  const h=offlineNoticeHarness();
  assert.strictEqual(h.notes().length,0,'Online startup must not render an Offline notice');

  h.context.navigator.onLine=false;h.emit('offline');h.flushRaf();
  assert.strictEqual(h.notes().length,1,'Online → Offline must render exactly one notice');
  const first=h.notes()[0];
  assert.strictEqual(h.raf.length,0,'notice insertion must not reschedule its own MutationObserver');

  for(let i=0;i<8;i++)h.externalMutation();
  assert.strictEqual(h.raf.length,1,'continued Offline mutation bursts must coalesce to one frame');
  h.flushRaf();
  assert.strictEqual(h.notes().length,1,'continued Offline must not add notices');
  assert.strictEqual(h.notes()[0],first,'continued Offline must reuse the same notice node');
  assert.strictEqual(h.raf.length,0,'existing notice must not create an observer loop');

  h.context.navigator.onLine=true;h.emit('online');h.flushRaf();
  assert.strictEqual(h.notes().length,0,'Offline → Online must remove the notice');
  h.context.navigator.onLine=false;h.emit('offline');h.flushRaf();
  assert.strictEqual(h.notes().length,1,'second Online → Offline transition must render one notice');
  assert.notStrictEqual(h.notes()[0],first,'a new connectivity cycle may create one new notice node');
  assert.strictEqual(h.raf.length,0,'second notice insertion must not self-trigger the observer');
}

function websiteWatchHarness(){
  const app=fs.readFileSync('app.js','utf8');
  const start=app.indexOf('let websiteOrderWatchTimer=null;');
  const end=app.indexOf('const money=',start);
  assert(start>=0&&end>start,'website watcher source block missing');
  const source=app.slice(start,end)+`\nthis.__watchApi={checkWebsiteOrders,startWebsiteOrderWatch,stopWebsiteOrderWatch,bindWebsiteOrderWatchListeners};`;
  const windowEvents=new Map();
  const documentEvents=new Map();
  const intervals=new Map();
  const pending=[];
  let nextInterval=1;
  let calls=0;
  let active=0;
  let maxActive=0;
  class FakeAbortController{constructor(){this.signal={aborted:false}}abort(){this.signal.aborted=true}}
  const context={
    console,Set,String,Number,Object,Promise,AbortController:FakeAbortController,
    navigator:{onLine:true},session:{access_token:'token'},
    state:{employee:{id:7},activeBranchId:1},
    canAccessPage:()=>true,currentBranchId:()=>context.state.activeBranchId,
    rest(){
      calls++;active++;maxActive=Math.max(maxActive,active);
      return new Promise(resolve=>pending.push(()=>{active--;resolve([])}));
    },
    setInterval(fn){const id=nextInterval++;intervals.set(id,fn);return id},
    clearInterval(id){intervals.delete(id)},
    setTimeout(){return 1},clearTimeout(){},requestAnimationFrame(fn){fn()},
    document:{hidden:false,querySelectorAll:()=>[],createElement:()=>({}),body:{appendChild(){}},addEventListener(type,fn){const rows=documentEvents.get(type)||[];rows.push(fn);documentEvents.set(type,rows)}},
    addEventListener(type,fn){const rows=windowEvents.get(type)||[];rows.push(fn);windowEvents.set(type,rows)}
  };
  context.window=context;
  vm.runInNewContext(source,context,{filename:'website-order-watch.js'});
  const emitWindow=type=>{for(const fn of windowEvents.get(type)||[])fn({type})};
  const settleOne=async()=>{assert(pending.length>0,'expected one pending website request');pending.shift()();await new Promise(resolve=>setImmediate(resolve))};
  return {context,api:context.__watchApi,windowEvents,documentEvents,intervals,pending,emitWindow,settleOne,stats:()=>({calls,active,maxActive})};
}

async function checkWebsitePolling(){
  const h=websiteWatchHarness();
  assert.strictEqual(h.windowEvents.get('focus').length,1,'focus listener must be bound once');
  assert.strictEqual(h.windowEvents.get('offline').length,1,'offline listener must be bound once');
  assert.strictEqual(h.windowEvents.get('online').length,1,'online listener must be bound once');
  assert.strictEqual(h.documentEvents.get('visibilitychange').length,1,'visibility listener must be bound once');
  h.api.bindWebsiteOrderWatchListeners();
  assert.strictEqual(h.windowEvents.get('focus').length,1,'rebinding must not duplicate focus listener');
  assert.strictEqual(h.documentEvents.get('visibilitychange').length,1,'rebinding must not duplicate visibility listener');

  h.api.startWebsiteOrderWatch();
  assert.strictEqual(h.intervals.size,1,'watcher must create one timer');
  assert.strictEqual(h.stats().calls,1,'watcher must start one initial request');
  h.api.startWebsiteOrderWatch();
  for(const poll of h.intervals.values()){poll();poll();poll()}
  h.api.checkWebsiteOrders();h.api.checkWebsiteOrders();
  assert.strictEqual(h.intervals.size,1,'repeated starts must not create duplicate timers');
  assert.strictEqual(h.stats().calls,1,'in-flight guard must coalesce concurrent polls');
  assert.strictEqual(h.stats().maxActive,1,'no more than one website poll may be active');
  await h.settleOne();

  h.context.navigator.onLine=false;h.emitWindow('offline');
  assert.strictEqual(h.intervals.size,0,'Offline transition must stop the polling timer');
  await h.api.checkWebsiteOrders();
  assert.strictEqual(h.stats().calls,1,'Offline polling must not issue a request');

  h.context.navigator.onLine=true;h.emitWindow('online');
  assert.strictEqual(h.intervals.size,1,'Online transition must resume one polling timer');
  assert.strictEqual(h.stats().calls,2,'Online transition must issue one fresh request');
  h.api.checkWebsiteOrders();
  assert.strictEqual(h.stats().calls,2,'reconnect poll must still honor the in-flight guard');
  assert.strictEqual(h.stats().maxActive,1,'reconnect must not overlap website requests');
  await h.settleOne();
  h.api.stopWebsiteOrderWatch(true);
  assert.strictEqual(h.intervals.size,0,'explicit stop must clear the timer');
}

(async()=>{
  await checkOfflineNotice();
  await checkWebsitePolling();
  console.log('RC1 Offline notice and polling regression gate PASS');
})().catch(error=>{console.error(error.stack||error);process.exit(1)});
