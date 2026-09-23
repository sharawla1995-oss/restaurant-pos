'use strict';

const fs=require('fs');
const path=require('path');

function uniq(xs){return [...new Set(xs)]}

function extractRendererBindings(fileName,source,routeKeys){
  const allowed=new Set(routeKeys||[]);
  const out=[];
  const re=/(?:^|[,{]\s*)([A-Za-z_$][\w$]*)\s*:\s*(render[A-Za-z0-9_$]+)/gm;
  let m;
  while((m=re.exec(String(source||'')))){
    const routeKey=m[1];
    if(!allowed.has(routeKey))continue;
    out.push({routeKey,renderer:m[2],ownerLayer:fileName,mechanism:'renderer-map'});
  }
  return out;
}

function addKnownCustomOwners(bindings,sources,routeKeys){
  const allowed=new Set(routeKeys||[]);
  const add=(routeKey,renderer,ownerLayer,mechanism)=>{
    if(allowed.has(routeKey))bindings.push({routeKey,renderer,ownerLayer,mechanism});
  };

  const beta54=sources['beta54-shared-core-ui.js']||'';
  for(const routeKey of ['employees','advances','adjustments','payroll','treasury']){
    const cap=routeKey[0].toUpperCase()+routeKey.slice(1);
    if(new RegExp('\\b'+routeKey+'\\s*:').test(beta54)&&new RegExp('render'+cap+'\\b').test(beta54)){
      add(routeKey,'render'+cap,'beta54-shared-core-ui.js','beta54-page-owner');
    }
  }

  const supply=sources['beta55-central-warehouse-ui.js']||'';
  if((supply.includes('beta55SupplyPage')||supply.includes('data-beta55-supply-page'))&&
     (supply.includes('function render(')||supply.includes('async function render('))){
    add('internalSupply','render','beta55-central-warehouse-ui.js','custom-supply-owner');
  }

  return bindings;
}

function discoverRendererOwners(sources,routeKeys){
  let bindings=[];
  for(const [fileName,source] of Object.entries(sources||{})){
    bindings.push(...extractRendererBindings(fileName,source,routeKeys));
  }
  bindings=addKnownCustomOwners(bindings,sources,routeKeys);
  const byRoute=new Map();
  for(const b of bindings){
    if(!byRoute.has(b.routeKey))byRoute.set(b.routeKey,[]);
    const arr=byRoute.get(b.routeKey);
    if(!arr.some(x=>x.ownerLayer===b.ownerLayer&&x.renderer===b.renderer))arr.push(b);
  }
  return {bindings,byRoute};
}

function discoverNavigationEvidence(sources){
  const evidence=[];
  const app=sources['app.js']||'';
  if(app.includes('function showPage(')&&app.includes('#nav button[data-page]')){
    evidence.push({ownerLayer:'app.js',mechanism:'showPage+data-page'});
  }

  const closure=sources['beta55-restaurant-closure-ui.js']||'';
  if(closure.includes("button[data-page]")&&closure.includes('stopImmediatePropagation()')&&closure.includes('openPage(')){
    evidence.push({ownerLayer:'beta55-restaurant-closure-ui.js',mechanism:'capture+openPage'});
  }

  const beta54=sources['beta54-shared-core-ui.js']||'';
  if((beta54.includes('beta54Page')||beta54.includes('data-beta54-page'))&&beta54.includes('stopImmediatePropagation()')){
    evidence.push({ownerLayer:'beta54-shared-core-ui.js',mechanism:'beta54-capture'});
  }

  const supply=sources['beta55-central-warehouse-ui.js']||'';
  if((supply.includes('beta55SupplyPage')||supply.includes('data-beta55-supply-page'))&&supply.includes('stopImmediatePropagation()')){
    evidence.push({ownerLayer:'beta55-central-warehouse-ui.js',mechanism:'supply-capture'});
  }

  const workflow=sources['beta55-ui-workflow-fixes.js']||'';
  if(workflow.includes('beta55HrGroup'))evidence.push({ownerLayer:'beta55-ui-workflow-fixes.js',mechanism:'hr-group-augmentation'});

  if(app.includes('data-site-tool')||app.includes('dataset.siteTool')){
    evidence.push({ownerLayer:'websiteManagement hub',mechanism:'hub-child'});
  }
  return evidence;
}

function loadRootSources(root){
  const out={};
  for(const name of fs.readdirSync(root)){
    const full=path.join(root,name);
    if(!name.endsWith('.js'))continue;
    if(!fs.statSync(full).isFile())continue;
    out[name]=fs.readFileSync(full,'utf8');
  }
  return out;
}

function unexpectedRendererOwners(observedByRoute,expectedByRoute){
  const unexpected=[];
  for(const [routeKey,rows] of observedByRoute.entries()){
    const expected=new Set(expectedByRoute[routeKey]||[]);
    for(const row of rows){
      if(!expected.has(row.ownerLayer))unexpected.push(row);
    }
  }
  return unexpected;
}

module.exports=Object.freeze({
  extractRendererBindings,
  discoverRendererOwners,
  discoverNavigationEvidence,
  loadRootSources,
  unexpectedRendererOwners,
  uniq
});
