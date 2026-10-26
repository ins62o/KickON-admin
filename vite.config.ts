import {createSystemMetricsMonitor} from "./server/system-metrics.ts";
import {createCloudSystemMetricsMonitor} from './server/cloud-system-metrics.ts';
import {createSystemHistoryStore} from './server/system-history.ts';
import {createProjectRestartController} from './server/project-restart.ts';
import {resolve} from 'node:path';
import {defineConfig,loadEnv,type Plugin} from "vite";
import react from "@vitejs/plugin-react";
import {seedDesignPlugin} from "@seed-design/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import {resolveAdminSettings} from "./public-auth-config.ts";
import {createAdminMiddleware,type ServerTargets} from "./server/admin-api.ts";
export default defineConfig(({mode})=>{
  const settings=resolveAdminSettings(loadEnv(mode,process.cwd(),""),mode);
  const targets:ServerTargets={};
  const cloudTargets=new Set<string>();
  if(mode!=="design-preview")for(const environment of ["development","production"] as const){
    const config=settings.environments[environment],privateEnv=loadEnv(environment,process.cwd(),"");
    if(config&&privateEnv.SUPABASE_METRICS_SECRET_KEY){targets[environment]={url:config.url,publishableKey:config.publishableKey,secret:privateEnv.SUPABASE_METRICS_SECRET_KEY,syncSecret:privateEnv.FOOTBALL_SYNC_SECRET,sportmonksToken:privateEnv.SPORTMONKS_API_TOKEN||privateEnv.SPORTSMONKS_API_TOKEN,managementToken:privateEnv.SUPABASE_MANAGEMENT_ACCESS_TOKEN};if(privateEnv.SUPABASE_MONITORING_SOURCE==='cloud')cloudTargets.add(config.url);}
  }
  const history=createSystemHistoryStore(resolve(process.cwd(),'.data/system-metrics.sqlite'));
  const localMonitor=createSystemMetricsMonitor(fetch,Date.now,history),cloudMonitor=createCloudSystemMetricsMonitor(fetch,Date.now,history);
  const monitor={read:(url:string,secret:string,range?:Parameters<typeof localMonitor.read>[2])=>(cloudTargets.has(url)?cloudMonitor:localMonitor).read(url,secret,range),start:(configured:{url:string;secret:string}[])=>localMonitor.start(configured.filter(target=>!cloudTargets.has(target.url)))};
  const restarts=createProjectRestartController(history);
  const api:Plugin={name:"kickon-private-admin-api",configureServer(server){const stop=monitor.start(Object.values(targets));server.httpServer?.once("close",()=>{stop();history.close();});server.middlewares.use(createAdminMiddleware(targets,monitor,restarts));},configurePreviewServer(server){const stop=monitor.start(Object.values(targets));server.httpServer.once("close",()=>{stop();history.close();});server.middlewares.use(createAdminMiddleware(targets,monitor,restarts));}};
  return {base:mode==='production'?'/':'./',server:{fs:{deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/.data/**','**/*.sqlite*']}},plugins:[react(),seedDesignPlugin({colorMode:"light-only",injectColorSchemeTag:false}),tailwindcss(),api],define:{__ADMIN_SETTINGS__:JSON.stringify(settings)}};
});
