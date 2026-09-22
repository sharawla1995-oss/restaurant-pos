'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const dir=path.resolve(__dirname,'..','evidence/point4-runtime-recovery-2026-09-22');
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
const expected=new Map(manifest.functions.map(x=>[x.id,x]));
const files=fs.readdirSync(dir).filter(x=>/^(11|12|35|36|37)-.*\.sql$/.test(x)).sort();
if(files.length!==5) throw new Error('RECOVERY_EVIDENCE_COUNT:'+files.length);
const seen=new Set();
for(const file of files){
 const id=Number(file.split('-')[0]), meta=expected.get(id); if(!meta) throw new Error('EXTRA:'+file); if(seen.has(id)) throw new Error('DUP:'+id); seen.add(id);
 const raw=fs.readFileSync(path.join(dir,file),'utf8');
 const md5=crypto.createHash('md5').update(raw,'utf8').digest('hex');
 if(md5!==meta.md5) throw new Error('MD5:'+id+':'+md5+'!='+meta.md5);
 const sig='CREATE OR REPLACE FUNCTION public.'+meta.signature;
 if(!raw.startsWith(sig)) throw new Error('SIGNATURE:'+id);
 if(/inventory_stock_assert_legacy_write_allowed_v2|POINT\s*4.*GUARD|point4.*guard/i.test(raw)) throw new Error('GUARD_CONTAMINATION:'+id);
}
if(seen.size!==expected.size) throw new Error('MISSING');
console.log('POINT4_RUNTIME_RECOVERY_INTEGRITY_PASS bodies=5 signatures=5 md5=5 extras=0 guards=0');
