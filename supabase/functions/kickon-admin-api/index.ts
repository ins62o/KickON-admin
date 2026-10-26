import {createAdminFetchHandler} from '../../../server/fetch-api.ts';
import type {ServerTargets} from '../../../server/admin-api.ts';
declare const Deno:{env:{get:(name:string)=>string|undefined};serve:(handler:(request:Request)=>Promise<Response>)=>void};
const targets:ServerTargets={};
for(const environment of ['development','production'] as const){
 const prefix=`KICKON_ADMIN_${environment.toUpperCase()}_`,get=(name:string)=>Deno.env.get(prefix+name);
 const url=get('URL'),publishableKey=get('PUBLISHABLE_KEY'),secret=get('SECRET');
 if(url&&publishableKey&&secret)targets[environment]={url,publishableKey,secret,syncSecret:get('SYNC_SECRET'),sportmonksToken:get('SPORTMONKS_TOKEN'),managementToken:get('MANAGEMENT_TOKEN')};
}
Deno.serve(createAdminFetchHandler(targets,(Deno.env.get('KICKON_ADMIN_ORIGINS')??'').split(',').map(value=>value.trim()).filter(Boolean)));
