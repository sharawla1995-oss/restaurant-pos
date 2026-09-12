'use strict';

// Beta44 compatibility wrapper for the legacy fixed SQLite temp path used by
// main.js persistDb(). Only the exact topburger-pos.sqlite.tmp path is remapped
// to a unique temp file; all other fs behavior is untouched.
const fs=require('fs');
const crypto=require('crypto');

const original={
  writeFileSync:fs.writeFileSync.bind(fs),
  openSync:fs.openSync.bind(fs),
  copyFileSync:fs.copyFileSync.bind(fs),
  unlinkSync:fs.unlinkSync.bind(fs),
  existsSync:fs.existsSync.bind(fs)
};
const active=new Map();
function isLegacyDbTmp(p){return typeof p==='string'&&/[\\/]topburger-pos\.sqlite\.tmp$/i.test(p)}
function mapped(p){return isLegacyDbTmp(p)?(active.get(p)||p):p}

fs.writeFileSync=function(file,data,options){
  if(!isLegacyDbTmp(file))return original.writeFileSync(file,data,options);
  const unique=`${file}-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  active.set(file,unique);
  return original.writeFileSync(unique,data,options);
};
fs.openSync=function(file,...args){return original.openSync(mapped(file),...args)};
fs.copyFileSync=function(src,dst,...args){return original.copyFileSync(mapped(src),dst,...args)};
fs.existsSync=function(file){return original.existsSync(mapped(file))};
fs.unlinkSync=function(file,...args){
  const target=mapped(file);
  try{return original.unlinkSync(target,...args)}
  finally{if(isLegacyDbTmp(file))active.delete(file)}
};

require('./main-beta23.js');
