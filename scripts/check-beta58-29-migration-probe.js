const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'beta46-acceptance-advanced-main.js'),'utf8');

for(const token of [
  "10.5.4-beta.58.29-migration-probe-v2",
  "for(let attempt=1;attempt<=5;attempt++)",
  "const afterSource=await metrics(source)",
  "source_changed_during_probe",
  "counts_preserved:sameSource?sameSnapshot:null",
  "reason:'source_changed_during_probe'"
]){
  if(!src.includes(token))throw new Error('beta58.29 migration probe contract missing: '+token);
}
if(!src.includes("VACUUM INTO"))throw new Error('beta58.29 must preserve VACUUM INTO snapshot semantics');
console.log('beta58.29 stable migration compatibility probe PASS');
