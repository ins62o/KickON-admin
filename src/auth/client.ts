import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {adminApiUrl} from './api.ts';
import {createOperationGuard,finishEnvironmentSwitch} from "./environment-operation";
import type { AdminAuthPort } from "./policy";

export type Environment = "production" | "development";
export type PublicAuthConfig = { environment: Environment; url: string; publishableKey: string; providerAllowance: number | null };
export type AdminSettings = {defaultEnvironment: Environment; environments: Partial<Record<Environment,PublicAuthConfig>>;apiBaseUrl?:string};
export const authSettings = __ADMIN_SETTINGS__;
const requestedEnvironment = new URLSearchParams(window.location.search).get("environment");
export const authEnvironment: Environment = (requestedEnvironment === "development" || requestedEnvironment === "production") && authSettings.environments[requestedEnvironment] ? requestedEnvironment : authSettings.defaultEnvironment;
export const authConfig = authSettings.environments[authEnvironment] ?? null;
const clients = new Map<Environment,SupabaseClient>();
function clientFor(environment:Environment){
  const config=authSettings.environments[environment];if(!config)return null;
  if(!clients.has(environment))clients.set(environment,createClient(config.url,config.publishableKey,{auth:{storageKey:`kickon-admin-auth-${environment}`,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}}));
  return clients.get(environment)!;
}
export const authClient=clientFor(authEnvironment);
const logoutKey="kickon-admin-logout";
const readLogoutMarker=()=>{try{return localStorage.getItem(logoutKey)??"";}catch{return "";}};
const operations=createOperationGuard(readLogoutMarker);
window.addEventListener("storage",event=>{if(event.key===logoutKey)operations.invalidate();});
const logoutChannel=typeof BroadcastChannel!=="undefined"?new BroadcastChannel(logoutKey):null;
logoutChannel?.addEventListener("message",()=>operations.invalidate());
function beginLogout(){operations.invalidate();try{localStorage.setItem(logoutKey,crypto.randomUUID());}catch{/* Same-tab cancellation still works when storage is unavailable. */}logoutChannel?.postMessage("logout");}
export async function changeEnvironment(environment:string){
  if((environment!=="development"&&environment!=="production")||!authSettings.environments[environment]||environment===authEnvironment)return;
  const isCurrent=operations.begin();
  const navigate=()=>{if(!isCurrent())return;const url=new URL(window.location.href);url.searchParams.set("environment",environment);window.location.assign(url.href);};
  const session=await authClient?.auth.getSession();
  if(!isCurrent())return;
  if(session?.error)throw new Error("로그인 상태를 다시 확인해 주세요");
  if(session?.data.session){
    const target=clientFor(environment)!;
    const [sourceUser,targetUser]=await Promise.all([authClient!.auth.getUser(),target.auth.getUser()]);
    if(!isCurrent())return;
    const sameAccount=!sourceUser.error&&!targetUser.error&&sourceUser.data.user?.email&&sourceUser.data.user.email.toLowerCase()===targetUser.data.user?.email?.toLowerCase();
    if(!sameAccount){
      const result=await fetch(adminApiUrl('environment'),{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.data.session.access_token}`},body:JSON.stringify({environment:authEnvironment,target:environment})});
      const data=await result.json().catch(()=>({}));
      if(!result.ok||!data.access_token||!data.refresh_token){if(!isCurrent())return;throw new Error(data.error||"환경 전환 인증 서버를 확인해 주세요");}
      await finishEnvironmentSwitch({isCurrent,navigate,store:async()=>{const signed=await target.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token});if(signed.error)throw new Error("환경 전환 인증을 저장하지 못했어요");},discard:async()=>{
        const current=await target.auth.getSession();
        if(current.data.session?.access_token===data.access_token)await target.auth.signOut({scope:"local"});
        else await target.auth.admin.signOut(data.access_token,"local");
      }});
      return;
    }
  }
  navigate();
}
export const authPort: AdminAuthPort | null = authClient ? {
  async verifyUser() {
    const { data, error } = await authClient!.auth.getUser();
    if (error) throw new Error("로그인 상태를 확인할 수 없습니다. 다시 로그인해 주세요.");
    return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
  },
  async readMembership(userId) {
    const { data, error } = await authClient!.from("admin_users").select("role, display_name, is_active").eq("user_id", userId).maybeSingle();
    if (error) throw new Error("관리자 권한을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    return data;
  },
  async passwordSignIn(email, password) {
    const { data, error } = await authClient!.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw new Error("이메일 또는 비밀번호를 확인해 주세요.");
  },
  async signOut() {
    const {error}=await authClient!.auth.signOut({scope:"local"});
    if(error)throw new Error("로그아웃하지 못했어요 다시 시도해 주세요");
  },
} : null;

export async function signOutEveryEnvironment(){
  beginLogout();
  const results=await Promise.all(Object.keys(authSettings.environments).map(async environment=>{
    const client=clientFor(environment as Environment)!;
    return client.auth.signOut({scope:"local"});
  }));
  if(results.some(result=>result.error))throw new Error("일부 환경에서 로그아웃하지 못했어요 다시 시도해 주세요");
}
