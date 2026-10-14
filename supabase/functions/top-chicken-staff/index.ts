import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import {createTopChickenStaffHandler} from './core.mjs';
const url=Deno.env.get('SUPABASE_URL')||'';
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const anon=Deno.env.get('SUPABASE_ANON_KEY')||'';
if(url!=='https://xihcxydjnzemflhedzor.supabase.co'||!service||!anon)throw new Error('Top Chicken Beta project required');
const options={auth:{persistSession:false,autoRefreshToken:false}};
Deno.serve(createTopChickenStaffHandler({admin:createClient(url,service,options),authClient:createClient(url,anon,options),digestSecret:service}));
