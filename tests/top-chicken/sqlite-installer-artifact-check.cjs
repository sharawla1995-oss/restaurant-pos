'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const asar=require('asar');
const archive=path.join('dist','win-unpacked','resources','app.asar');
assert.ok(fs.existsSync(archive),'Built app.asar is required');
for(const name of ['main.js','top-chicken-sqlite-durability.js','preload.js']){
  assert.deepEqual(asar.extractFile(archive,name),fs.readFileSync(name),name+' exact packaged source bytes');
}
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const packed=JSON.parse(asar.extractFile(archive,'package.json').toString());
assert.equal(pkg.version,'10.5.19-rc.9');
assert.equal(packed.version,pkg.version);
assert.equal(pkg.build.appId,'com.topburger.pos','fixed original in-place app identity');
assert.equal(pkg.name,'sharawla-pos-windows','fixed userData namespace');
const installers=fs.readdirSync('dist').filter(n=>n==='Top-Chicken-SH0008-Primary-10.5.19-rc.9.exe');
assert.equal(installers.length,1,'actual NSIS file name');
const exe=path.join('dist',installers[0]);
const result={status:'PASS',scope:'DO NOT INSTALL / NO DEPLOY',source:process.env.GITHUB_SHA,exe:installers[0],size:fs.statSync(exe).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex')};
fs.mkdirSync('evidence/top-chicken',{recursive:true});
fs.writeFileSync('evidence/top-chicken/sqlite-installer.json',JSON.stringify(result,null,2));
console.log('PASS PACKAGE '+JSON.stringify(result));
