import fs from 'node:fs';
import {setupIntegration} from './integration-fixture.mjs';
import {runBrowserFlows} from './browser-flow.mjs';
import {fakeAuth,runStaffChecks} from './staff-integration.mjs';
const results=[];
async function test(name,fn){try{await fn();results.push({name,result:'PASS'});console.log('PASS',name);}catch(e){results.push({name,result:'FAIL',error:e.message,code:e.code});console.error('FAIL',name,e.message,e.code);throw e;}}
try{
 await setupIntegration();const auth=await fakeAuth();await runStaffChecks(auth,test);const browser=await runBrowserFlows(auth,test);
 fs.writeFileSync('evidence/top-chicken/new-staff-local-results.json',JSON.stringify({auth:'SIMULATED ONLY; new native CI job separately exercises real GoTrue',rls:'NOT EXECUTED: native CI required for role/RLS enforcement',results,browser},null,2));process.exit(0);
}catch(e){console.error(e.stack);fs.writeFileSync('evidence/top-chicken/new-staff-local-results.json',JSON.stringify({results,error:e.message,code:e.code},null,2));process.exit(1);}
