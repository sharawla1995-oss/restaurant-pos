const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');

const targets=[
  {
    name:'open_pos_shift_idempotent',
    signature:'open_pos_shift_idempotent(bigint,numeric,text)',
    expected:['supabase-v10-3-windows-offline-shifts.sql']
  },
  {
    name:'close_pos_shift_idempotent',
    signature:'close_pos_shift_idempotent(bigint,numeric,jsonb,text)',
    expected:[
      'supabase-v10-3-windows-offline-shifts.sql',
      'supabase-beta58-13-legacy-shift-close-custody-guard.sql'
    ]
  },
  {
    name:'close_pos_shift_v2',
    signature:'close_pos_shift_v2(bigint,numeric,jsonb,text)',
    expected:[
      'supabase-beta55-delivery-settlement-shift-cash.sql',
      'supabase-beta58-12-shift-close-custody-guard.sql'
    ]
  },
  {
    name:'create_pos_expense_idempotent',
    signature:'create_pos_expense_idempotent(bigint,text,numeric,text)',
    expected:['supabase-v9-8-1-offline-operations.sql']
  }
];

function walk(dir,out=[]){
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    if(['.git','node_modules','dist'].includes(ent.name))continue;
    const p=path.join(dir,ent.name);
    if(ent.isDirectory())walk(p,out);
    else if(ent.isFile()&&/\.sql$/i.test(ent.name))out.push(p);
  }
  return out;
}
function rel(p){return path.relative(root,p).replace(/\\/g,'/')}
function lineOf(src,idx){return src.slice(0,idx).split('\n').length}

const rows={};
for(const t of targets)rows[t.name]=[];

for(const p of walk(root)){
  const src=fs.readFileSync(p,'utf8');
  for(const t of targets){
    const re=new RegExp('create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?'+t.name+'\\s*\\(','ig');
    for(const m of src.matchAll(re)){
      rows[t.name].push({path:rel(p),line:lineOf(src,m.index),kind:rel(p).startsWith('evidence/')?'evidence':'source'});
    }
  }
}

let bad=false;
for(const t of targets){
  const actual=[...new Set(rows[t.name].filter(x=>x.kind==='source').map(x=>x.path))].sort();
  const expected=[...t.expected].sort();
  console.log('OWNER_PROVENANCE '+t.signature);
  for(const r of rows[t.name])console.log('  '+r.kind+' '+r.path+':'+r.line);
  if(JSON.stringify(actual)!==JSON.stringify(expected)){
    console.error('OWNER_PROVENANCE_DRIFT '+t.signature);
    console.error('  expected='+JSON.stringify(expected));
    console.error('  actual='+JSON.stringify(actual));
    bad=true;
  }
}

const p4=path.join(root,'supabase-point4-transitive-offline-same-context-v1.sql');
if(!fs.existsSync(p4)){
  console.error('POINT4_SAME_CONTEXT_ARTIFACT_MISSING');
  bad=true;
}else{
  const src=fs.readFileSync(p4,'utf8');
  for(const t of targets){
    const def=new RegExp('create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?'+t.name+'\\s*\\(','i');
    if(def.test(src)){console.error('POINT4_OWNER_REDEFINITION_UNEXPECTED '+t.name);bad=true}
    if(['open_pos_shift_idempotent','close_pos_shift_idempotent','create_pos_expense_idempotent'].includes(t.name)&&!src.includes(t.name)){
      console.error('POINT4_EXPECTED_REFERENCE_MISSING '+t.name);bad=true;
    }
  }
}

if(bad)process.exit(1);
console.log('PV2 Shift/Expense owner provenance NEGATIVE REPLACEMENT SCAN PASS');
