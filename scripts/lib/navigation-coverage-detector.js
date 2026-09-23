'use strict';

function uniq(xs){return [...new Set(xs)]}

function discoverCoverageSurface(sources,index=''){
  const datasetPage={};
  const dataPageAttrs={};
  const navIds={};
  const navWriters=[];
  const literalRoutes=new Set();

  const add=(obj,key,file)=>{
    if(!key)return;
    (obj[key]??=[]).push(file);
  };

  const scan=(file,src)=>{
    const text=String(src||'');
    for(const m of text.matchAll(/dataset\.([A-Za-z0-9_]*Page)\s*=/g))add(datasetPage,m[1],file);
    for(const m of text.matchAll(/data-([a-z0-9-]*page)(?=[=\"'\\s>\\]])/gi))add(dataPageAttrs,m[1],file);
    for(const m of text.matchAll(/#([A-Za-z0-9_-]*Nav)\b/g))add(navIds,m[1],file);
    for(const m of text.matchAll(/id\s*=\s*['"]([A-Za-z0-9_-]*Nav)['"]/g))add(navIds,m[1],file);
    for(const m of text.matchAll(/data-page\s*=\s*["']([A-Za-z][A-Za-z0-9_-]*)["']/g))literalRoutes.add(m[1]);
    for(const m of text.matchAll(/dataset\.page\s*=\s*["']([A-Za-z][A-Za-z0-9_-]*)["']/g))literalRoutes.add(m[1]);
    if(/(?:querySelector|qs|\$)\s*\(\s*['"]#nav['"]\s*\)/.test(text)&&/createElement\s*\(\s*['"]button['"]\s*\)/.test(text)){
      navWriters.push(file);
    }
  };

  scan('index.html',index);
  for(const [file,src] of Object.entries(sources||{}))scan(file,src);

  for(const obj of [datasetPage,dataPageAttrs,navIds]){
    for(const key of Object.keys(obj))obj[key]=uniq(obj[key]).sort();
  }

  return Object.freeze({
    datasetPage:Object.freeze(datasetPage),
    dataPageAttrs:Object.freeze(dataPageAttrs),
    navIds:Object.freeze(navIds),
    navWriters:Object.freeze(uniq(navWriters).sort()),
    literalRoutes:Object.freeze([...literalRoutes].sort())
  });
}

function unknownCoverageSurface(surface,contract){
  const allowedDataset=new Set(contract.allowedDatasetPageMechanisms||[]);
  const allowedAttrs=new Set(contract.allowedDataPageAttributes||[]);
  const allowedIds=new Set(Object.keys(contract.allowedNavIds||{}));
  const allowedWriters=new Set(Object.keys(contract.knownNavWriters||{}));
  return Object.freeze({
    datasetPage:Object.keys(surface.datasetPage||{}).filter(x=>!allowedDataset.has(x)).sort(),
    dataPageAttrs:Object.keys(surface.dataPageAttrs||{}).filter(x=>!allowedAttrs.has(x)).sort(),
    navIds:Object.keys(surface.navIds||{}).filter(x=>!allowedIds.has(x)).sort(),
    navWriters:(surface.navWriters||[]).filter(x=>!allowedWriters.has(x)).sort()
  });
}

module.exports=Object.freeze({discoverCoverageSurface,unknownCoverageSurface,uniq});
