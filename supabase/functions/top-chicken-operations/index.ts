import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import {cloudExecutor,signedAuthorityReader} from '../top-chicken-staff/cloud-authority.mjs';
import {operationHandler} from './core.mjs';
const url=Deno.env.get('SUPABASE_URL')||'',service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',secret=Deno.env.get('TC_CLOUD_AUTHORITY_SECRET')||'',publicKey=Deno.env.get('TC_CLOUD_PUBLIC_KEY')||'';
if(url!=='https://xihcxydjnzemflhedzor.supabase.co'||!service)throw Error('TC Beta server configuration required');

const opts={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(url,service,opts);
Deno.serve(operationHandler({admin,executeRPC:cloudExecutor({readSnapshot:signedAuthorityReader({publicKey,secret}),beta:admin})}));
