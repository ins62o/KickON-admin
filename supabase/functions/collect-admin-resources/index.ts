import {createMonitoringCollector} from '../_shared/monitoring-collector.ts';
declare const Deno:{env:{get:(name:string)=>string|undefined};serve:(handler:(request:Request)=>Promise<Response>)=>void};
const metricsKey=Deno.env.get('KICKON_MONITORING_METRICS_KEY')??'';
Deno.serve(createMonitoringCollector({url:Deno.env.get('SUPABASE_URL')??'',serviceKey:metricsKey,metricsKey,cronSecret:Deno.env.get('KICKON_MONITORING_CRON_SECRET')??''}));
