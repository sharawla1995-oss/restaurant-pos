import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import {authorityHandler} from '../../../supabase/functions/top-chicken-authority/core.mjs';
import {signedAuthorityReader,signAuthorityBody,TC} from '../../../supabase/functions/top-chicken-staff/cloud-authority.mjs';
globalThis.crypto ||= webcrypto;
const secret='a'.repeat(64), publicKey='sb_publishable_'+'b'.repeat(40), now=new Date(),clock=()=>now,results=[];
let reads=0;
const handler=authorityHandler({secret,clock,readSnapshot:async()=>{reads++;return {business_id:TC,observed_at:now.toISOString()}}});
const fetchImpl=async(url,opts)=>{assert.equal(url,'https://ikppryeavoabnugcijeq.supabase.co/functions/v1/top-chicken-authority');assert.equal(opts.headers.apikey,publicKey);return handler(new Request(url,opts));};
async function test(name,fn){try{await fn();results.push({name,result:'PASS'});}catch(e){results.push({name,result:'FAIL',error:e.message});throw e;}}
async function request(overrides={},key=secret){const body=JSON.stringify({rpc:'top_chicken_staff_login_context_v1',nonce:crypto.randomUUID(),issued_at:now.toISOString(),...overrides});return handler(new Request('https://fixture.invalid',{method:'POST',headers:{'x-tc-authority-signature':await signAuthorityBody(body,key)},body}));}
try{
 await test('Real HMAC transport succeeds using only a public API key and dedicated TC secret',async()=>{const reader=signedAuthorityReader({publicKey,secret,clock,fetchImpl});assert.equal((await reader('top_chicken_staff_login_context_v1')).business_id,TC);assert.equal(reads,1);});
 await test('Wrong signature cannot reach the Cloud reader',async()=>{const before=reads;assert.equal((await request({},'c'.repeat(64))).status,403);assert.equal(reads,before);});
 for(const [name,patch] of [['stale request',{issued_at:new Date(+now-6000).toISOString()}],['future request',{issued_at:new Date(+now+6000).toISOString()}],['foreign business selector',{business_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}],['device selector',{device_id:'forbidden'}],['invalid nonce',{nonce:'bad'}],['arbitrary RPC',{rpc:'arbitrary_function'}]])await test(name+' is rejected before database reads',async()=>{const before=reads;assert.notEqual((await request(patch)).status,200);assert.equal(reads,before);});
 for(const [name,patch] of [['wrong nonce',{nonce:'wrong'}],['wrong RPC',{rpc:'wrong'}],['foreign business snapshot',{snapshot:{business_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}}]])await test(name+' response is rejected',async()=>{const reader=signedAuthorityReader({publicKey,secret,clock,fetchImpl:async(u,o)=>{const p=JSON.parse(o.body);return new Response(JSON.stringify({ok:true,nonce:p.nonce,rpc:p.rpc,snapshot:{business_id:TC},...patch}));}});await assert.rejects(()=>reader('top_chicken_staff_login_context_v1'));});
 await test('Cloud network failure is denied without fallback',async()=>{const reader=signedAuthorityReader({publicKey,secret,fetchImpl:async()=>{throw Error('isolated simulated outage')}});await assert.rejects(()=>reader('top_chicken_staff_login_context_v1'));});
 console.log('PASS signed channel',results.length);
}finally{fs.writeFileSync((process.env.TC_REVIEW_OUTPUT||'evidence/top-chicken/authority-review')+'/signed-channel-results.json',JSON.stringify({transport:'Local HTTP Request/Response with real WebCrypto HMAC; no hosted deployment',results},null,2));}
