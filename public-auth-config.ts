import { Buffer } from "node:buffer";

export function resolvePublicAuthConfig(env: Record<string, string>, mode: string) {
  if (mode === "design-preview") return null;
  const environment = env.KICKON_ENVIRONMENT === "production" ? "production" : "development";
  const scope = environment === "production" ? "PRODUCTION" : "DEVELOPMENT";
  const url = env.VITE_SUPABASE_URL || env[`NEXT_PUBLIC_KICKON_${scope}_SUPABASE_URL`] || env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env[`NEXT_PUBLIC_KICKON_${scope}_SUPABASE_PUBLISHABLE_KEY`] || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return null;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))) throw new Error("Supabase 인증 주소는 HTTPS를 사용해야 합니다.");
  let safeKey = publishableKey.startsWith("sb_publishable_");
  if (!safeKey) {
    try { safeKey = JSON.parse(Buffer.from(publishableKey.split(".")[1], "base64url").toString()).role === "anon"; }
    catch { safeKey = false; }
  }
  if (!safeKey) throw new Error("인증 화면에는 Supabase 공개 키만 사용할 수 있습니다.");
  return { environment, url, publishableKey };
}

type Environment = 'development' | 'production';
export function resolveAdminSettings(env: Record<string, string>, mode: string) {
  const apiBaseUrl=env.VITE_ADMIN_API_BASE_URL?.replace(/\/$/,'');
  if(apiBaseUrl){const url=new URL(apiBaseUrl);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('관리자 API 주소는 인증 정보 없는 HTTPS 주소를 사용해야 합니다');}
  const configuredEnvironment: Environment = env.KICKON_ENVIRONMENT === 'production' ? 'production' : 'development';
  const requestedLogin = env.KICKON_LOGIN_ENVIRONMENT;
  const configuredLogin = requestedLogin === 'development' || requestedLogin === 'production' ? requestedLogin : undefined;
  if (requestedLogin && !configuredLogin) throw Error('관리자 로그인 환경을 확인해 주세요');
  const environments: Partial<Record<Environment, NonNullable<ReturnType<typeof resolvePublicAuthConfig>> & {providerAllowance: number | null}>> = {};
  if (mode === 'design-preview') return {defaultEnvironment:configuredEnvironment, environments};
  for (const environment of ['development','production'] as const) {
    const scoped: Record<string,string> = {...env, KICKON_ENVIRONMENT:environment};
    if (environment !== configuredEnvironment) {
      delete scoped.VITE_SUPABASE_URL; delete scoped.VITE_SUPABASE_PUBLISHABLE_KEY;
      delete scoped.NEXT_PUBLIC_SUPABASE_URL; delete scoped.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    }
    const config=resolvePublicAuthConfig(scoped,mode);
    if (!config) continue;
    const allowance=Number(env[`NEXT_PUBLIC_KICKON_${environment.toUpperCase()}_SPORTSMONKS_API_ALLOWANCE`] || env.NEXT_PUBLIC_SPORTSMONKS_API_ALLOWANCE || env.SPORTSMONKS_API_ALLOWANCE);
    environments[environment]={...config,environment,providerAllowance:Number.isSafeInteger(allowance)&&allowance>0?allowance:null};
  }
  if(configuredLogin&&!environments[configuredLogin])throw Error('관리자 로그인 연결이 설정되지 않았어요');
  // Keep the shared administrator identity stable across local and deployed workspaces.
  const loginEnvironment=configuredLogin??(environments.development?'development':environments.production?'production':undefined);
  const defaultEnvironment:Environment=environments.production?'production':configuredEnvironment;
  return {defaultEnvironment,environments,...(loginEnvironment?{loginEnvironment}:{}),...(apiBaseUrl?{apiBaseUrl}:{})};
}
