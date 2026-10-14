// Deploy only to Cloud Central after independent approval; never to Beta or Production backends.
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import {cloudSnapshotReader} from '../top-chicken-staff/cloud-authority.mjs';
import {authorityHandler} from './core.mjs';
const url=Deno.env.get('SUPABASE_URL')||'',service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',secret=Deno.env.get('TC_CLOUD_AUTHORITY_SECRET')||'';
if(url!=='https://ikppryeavoabnugcijeq.supabase.co'||!service)throw Error('Cloud Central TC reader only');
const cloud=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(authorityHandler({readSnapshot:cloudSnapshotReader({cloud}),secret}));
