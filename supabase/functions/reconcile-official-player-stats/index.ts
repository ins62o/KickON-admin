import {createOfficialStatsReconciler} from '../_shared/official-player-stats.ts';
declare const Deno:{env:{get:(name:string)=>string|undefined};serve:(handler:(request:Request)=>Promise<Response>)=>void};
// Called by pg_cron with the same Vault-held cron secret as collect-admin-resources; deploy with --no-verify-jwt.
Deno.serve(createOfficialStatsReconciler({url:Deno.env.get('SUPABASE_URL')??'',serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',cronSecret:Deno.env.get('KICKON_MONITORING_CRON_SECRET')??''}));
