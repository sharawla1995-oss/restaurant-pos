import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {db,q,TC} from './integration-fixture.mjs';
import {makeHandler} from './staff-integration.mjs';
const meta=JSON.parse(fs.readFileSync('evidence/top-chicken/website-dependency-metadata.json','utf8'));
const tables=new Map(meta.tables.map(t=>[t.name,new Set(t.columns.map(c=>c.name))]));
const qi=s=>'"'+s.replaceAll('"','""')+'"';
const rpcNames={create_website_order:['p_branch_id','p_customer_name','p_customer_phone','p_customer_address','p_customer_notes','p_items','p_payment_method_code','p_payment_reference','p_payment_receipt_path','p_order_type','p_promo_code','p_delivery_zone_id'],accept_website_order:['p_website_order_id'],top_chicken_transition_order_status:['p_order_id','p_expected_status','p_new_status','p_request_id'],top_chicken_assign_order_driver:['p_order_id','p_driver_id','p_request_id'],review_order_payment:['p_order_id','p_status']};
export async function startLoopbackAPI(auth){
  const staff=makeHandler(auth);let queue=Promise.resolve();const trace=[];
  async function claims(headers){
    const token=String(headers.authorization||'').replace(/^Bearer\s+/i,'');
    const verified=token?await auth.api.getUser(token):null;
    const user=verified?.data?.user;
    const role=user?'authenticated':'anon';
    await db.exec('RESET ROLE');
    await q("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false),set_config('request.headers',$3,false)",[user?.id||'',role,JSON.stringify({'x-sharawla-business':headers['x-sharawla-business']||TC})]);
    await db.exec('SET ROLE '+role);
  }
  async function api(req,res,body){
    const u=new URL(req.url,'http://127.0.0.1');let result;
    if(u.pathname==='/functions/v1/top-chicken-staff'){
      await db.exec('RESET ROLE');const response=await staff(new Request('http://127.0.0.1/edge',{method:'POST',headers:req.headers,body}));
      res.writeHead(response.status,{'Content-Type':'application/json'});res.end(await response.text());return;
    }
    await claims(req.headers);
    if(u.pathname.startsWith('/rest/v1/rpc/')){
      const name=u.pathname.split('/').at(-1),keys=rpcNames[name];if(!keys)throw new Error('Unsupported fixture RPC '+name);
      const p=JSON.parse(body);const values=keys.map(k=>k==='p_items'?JSON.stringify(p[k]):p[k]??null);
      result=(await q(`select public.${name}(${keys.map((_,i)=>'$'+(i+1)).join(',')}) as value`,values))[0].value;
      trace.push({method:req.method,rpc:name,result_id:typeof result==='object'?result?.order_id:result});
    }else{
      const table=u.pathname.split('/').at(-1),allowed=tables.get(table);if(!allowed)throw new Error('Unsupported fixture table '+table);
      if(req.method!=='GET')throw new Error('Fixture forbids direct table mutation');
      let selected=u.searchParams.get('select')||'*';if(selected!=='*'){const cols=selected.split(',');if(cols.some(c=>!allowed.has(c)))throw new Error('Invalid fixture select');selected=cols.map(qi).join(',');}
      const values=[],filters=[];
      for(const [key,value] of u.searchParams){
        if(['select','order','limit','offset'].includes(key))continue;
        if(key==='or'){
          const clauses=value.replace(/^\(|\)$/g,'').split(',').map(v=>{const [c,op,...bits]=v.split('.');if(op!=='eq'||!allowed.has(c))throw new Error('Unsupported OR');values.push(bits.join('.'));return qi(c)+'=$'+values.length;});filters.push('('+clauses.join(' OR ')+')');continue;
        }
        if(!allowed.has(key))throw new Error('Invalid fixture filter '+key);
        if(value.startsWith('eq.')){values.push(value.slice(3));filters.push(qi(key)+'=$'+values.length);}
        else if(value==='is.null')filters.push(qi(key)+' IS NULL');
        else if(value.startsWith('in.(')){const a=value.slice(4,-1).split(',');const p=a.map(v=>{values.push(v);return '$'+values.length});filters.push(qi(key)+' IN ('+p.join(',')+')');}
        else throw new Error('Unsupported fixture filter '+value);
      }
      const order=u.searchParams.get('order');let ordering='';
      if(order)ordering=' ORDER BY '+order.split(',').map(v=>{const [col,direction]=v.split('.');if(!allowed.has(col))throw new Error('Invalid fixture order');return qi(col)+(direction==='desc'?' DESC':' ASC')}).join(',');
      const offset=Number(u.searchParams.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0)throw new Error('Invalid offset');
      const lim=Number(u.searchParams.get('limit')||1000);if(!Number.isSafeInteger(lim)||lim<0||lim>2000)throw new Error('Invalid limit');
      result=await q(`SELECT ${selected} FROM public.${qi(table)}${filters.length?' WHERE '+filters.join(' AND '):''}${ordering} LIMIT ${lim} OFFSET ${offset}`,values);
    }
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));
  }
  const server=http.createServer(async(req,res)=>{
    if(req.url.startsWith('/rest/v1/')||req.url.startsWith('/functions/v1/')){
      let body='';for await(const chunk of req)body+=chunk;
      const task=queue.then(()=>api(req,res,body));queue=task.catch(()=>{});
      try{await task;}catch(e){trace.push({error:e.message,code:e.code,path:req.url});res.writeHead(e.code==='42501'?403:400,{'Content-Type':'application/json'});res.end(JSON.stringify({message:e.message,code:e.code}));}return;
    }
    const u=new URL(req.url,'http://127.0.0.1');const isSite=u.pathname.startsWith('/site/');const base=isSite?'tests/top-chicken/website-source':'.';
    const relative=decodeURIComponent(u.pathname.replace(isSite?'/site/':'/pos/',''))||'index.html';
    const filename=path.resolve(base,relative);if(!filename.startsWith(path.resolve(base)+path.sep)){res.writeHead(403);res.end();return;}
    if(!fs.existsSync(filename)){res.writeHead(404);res.end();return;}
    const type=filename.endsWith('.js')?'application/javascript':filename.endsWith('.css')?'text/css':filename.endsWith('.svg')?'image/svg+xml':'text/html';res.writeHead(200,{'Content-Type':type});res.end(fs.readFileSync(filename));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {server,url:'http://127.0.0.1:'+server.address().port,trace};
}
