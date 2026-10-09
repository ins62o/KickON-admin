import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import React, { act, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { build } from "esbuild";
import type { ConsoleEnvironment } from "../src/lib/environment.ts";
import type { getBrowserSupabaseClient } from "../src/lib/supabase/browser.ts";
const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");
// Run real AuthProvider, existing route guard, page, panel and Supabase SDK.
// Only Next navigation and external HTTP responses are test doubles.
const code = (await build({
  stdin: {contents:`export { default as Page } from './src/app/(console)/data-management/membership-diagnostic/page';
    export { default as DataPage } from './src/app/(console)/data-management/page';
    export { AdminAuthProvider } from './src/components/auth/admin-auth-provider';
    export * from './src/lib/environment'; export * from './src/lib/supabase/browser';`,resolveDir:process.cwd()},
  bundle:true,platform:"node",format:"cjs",write:false,external:["react","react/jsx-runtime","react-dom"],
  plugins:[{name:"synthetic-next-boundaries",setup(build){
    build.onResolve({filter:/^next\/(navigation|link)$/},args=>({path:args.path,namespace:"test-boundary"}));
    build.onResolve({filter:/^@\/lib\/client-data$/},args=>({path:args.path,namespace:"test-boundary"}));
    build.onLoad({filter:/.*/,namespace:"test-boundary"},args=>({contents:args.path==="next/navigation" ? `export function useRouter(){return globalThis.__diagnosticRouter;} export function useSearchParams(){return new URLSearchParams();} export function usePathname(){return '/data-management/membership-diagnostic';}` : args.path==="next/link" ? `import React from 'react'; export default function Link({href,children,...props}){return React.createElement('a',{href,...props},children);}` : `export function invalidateAdminData(){} export function useClientData(){return {data:{usage:null,syncOptions:null,syncHistory:null,audit:null,jobs:[]},loading:false,error:null,reload(){}};}`,loader:"js"}));
  }}],
  define:{"process.env.NODE_ENV":JSON.stringify("test"),"process.env.NEXT_PUBLIC_KICKON_DEVELOPMENT_ONLY":JSON.stringify("false"),"process.env.NEXT_PUBLIC_KICKON_ENVIRONMENT":JSON.stringify("production"),"process.env.NEXT_PUBLIC_KICKON_DEFAULT_ENVIRONMENT":JSON.stringify("production"),
    ...Object.fromEntries(["DEVELOPMENT","PRODUCTION"].flatMap(env=>[[`process.env.NEXT_PUBLIC_KICKON_${env}_SUPABASE_URL`,JSON.stringify(`https://${env.toLowerCase()}.example`)],[`process.env.NEXT_PUBLIC_KICKON_${env}_SUPABASE_PUBLISHABLE_KEY`,JSON.stringify(`test-${env}`)]]))},
})).outputFiles[0].text;
const valid={authenticated:true,active_super_admin:true,native_actor_match:true,transaction_isolation:"repeatable read",read_only:true,schema_compatible:true,diagnostic_version:"KICKON_PHASE6D_R3C_V1"};
type Options={role?:string;active?:boolean;rpcWait?:Promise<void>;rpcError?:boolean;payload?:unknown};
type App={Page:ComponentType;DataPage:ComponentType;AdminAuthProvider:ComponentType<{children:ReactNode}>;getBrowserSupabaseClient:typeof getBrowserSupabaseClient;setActiveConsoleEnvironment:(env:ConsoleEnvironment)=>void};
async function screen(options:Options={},dataPage=false){
 const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost/data-management/membership-diagnostic/"});
 const win=dom.window as Window & typeof globalThis;const requests:{path:string;method:string}[]=[];const redirects:string[]=[];const logs:unknown[][]=[];
 let generation=1;
 const overrides:Record<string,unknown>={window:win,document:win.document,navigator:win.navigator,CustomEvent:win.CustomEvent,BroadcastChannel:undefined,IS_REACT_ACT_ENVIRONMENT:true,__diagnosticRouter:{replace:(url:string)=>redirects.push(url),push:()=>undefined},
   fetch:async(input:string|URL|Request,init?:RequestInit)=>{
     const u=new URL(String(input));assert.ok(["production.example","development.example"].includes(u.hostname),"Synthetic UI tests must never send production HTTP");const env=u.hostname.split(".")[0];requests.push({path:u.pathname,method:init?.method??"GET"});
     const user={id:`${env}-user-${generation}`,email:"qa@example.invalid",aud:"authenticated",role:"authenticated",created_at:"2026-01-01T00:00:00Z",app_metadata:{},user_metadata:{}};
     let body:unknown={};let status=200;
     if(u.pathname==="/auth/v1/token")body={access_token:`test-${env}-${generation}`,refresh_token:`refresh-${env}-${generation}`,expires_in:3600,token_type:"bearer",user};
     else if(u.pathname==="/auth/v1/user")body=user;
     else if(u.pathname==="/rest/v1/admin_users")body={role:options.role??"super_admin",display_name:"Synthetic",is_active:options.active??true};
     else if(u.pathname==="/rest/v1/rpc/diagnose_canonical_membership_auth_isolation_v1"){await options.rpcWait;if(options.rpcError){body={message:"sensitive-ui-error",code:"42501",details:"qa@example.invalid"};status=403;}else body=options.payload??valid;}
     else assert.equal(u.pathname,"/auth/v1/logout","Unexpected RPC/mutation path");
     return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
   },
 };
 const original=new Map(Object.keys(overrides).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const [k,value]of Object.entries(overrides))Object.defineProperty(globalThis,k,{configurable:true,writable:true,value});
 const previousConsole={log:console.log,error:console.error,warn:console.warn};console.log=(...v)=>logs.push(v);console.error=(...v)=>logs.push(v);console.warn=(...v)=>logs.push(v);
 const bundleModule={exports:{}};new Function("require","module","exports",code)(require,bundleModule,bundleModule.exports);const app=bundleModule.exports as App;
 const clients=[app.getBrowserSupabaseClient("production")!,app.getBrowserSupabaseClient("development")!];for(const c of clients){await c.auth.getSession();await c.auth.stopAutoRefresh();}
 const client=clients[0];await client.auth.signInWithPassword({email:"qa@example.invalid",password:"synthetic"});await client.auth.stopAutoRefresh();
 const root=createRoot(win.document.getElementById("root")!);const Page=dataPage?app.DataPage:app.Page;
 try{await act(async()=>{root.render(React.createElement(app.AdminAuthProvider,null,React.createElement(Page)));});}catch(error){await act(async()=>root.unmount());for(const c of clients)await c.auth.stopAutoRefresh();dom.window.close();Object.assign(console,previousConsole);for(const[k,d]of original){if(d)Object.defineProperty(globalThis,k,d);else Reflect.deleteProperty(globalThis,k);}throw error;}
 const rpcCount=()=>requests.filter(r=>r.path.includes("/rpc/")).length;
 async function waitFor(predicate:()=>boolean){for(let i=0;i<200;i++){await act(async()=>{await new Promise(r=>setTimeout(r,5));});if(predicate())return;}assert.ok(predicate(),"UI condition did not become true");}
 async function click(){const button=win.document.querySelector('button')!;assert.ok(button);await act(async()=>{button.dispatchEvent(new win.MouseEvent("click",{bubbles:true}));});}
 async function cleanup(){await act(async()=>root.unmount());for(const c of clients)await c.auth.stopAutoRefresh();dom.window.close();Object.assign(console,previousConsole);for(const[k,d]of original){if(d)Object.defineProperty(globalThis,k,d);else Reflect.deleteProperty(globalThis,k);}}
 return{app,win,client,requests,redirects,logs,rpcCount,waitFor,click,cleanup,replaceSession:async()=>{generation++;await act(async()=>{await client.auth.signInWithPassword({email:"qa@example.invalid",password:"synthetic"});});}};
}
test("direct super_admin URL mounts real UI with 7 NOT_VERIFIED fields and no automatic RPC",async()=>{const s=await screen();try{await s.waitFor(()=>Boolean(s.win.document.querySelector('button')));assert.equal(s.rpcCount(),0);assert.equal(s.win.document.querySelectorAll('dt').length,7);assert.ok([...s.win.document.querySelectorAll('dd')].every(x=>x.textContent==="NOT_VERIFIED"));assert.ok(s.win.document.body.textContent?.includes("운영 서버"));}finally{await s.cleanup();}});
for(const role of ["admin","viewer","operator","support","moderator","data_editor"])test(`direct ${role} URL refuses panel and redirects through existing guard`,async()=>{const s=await screen({role});try{await s.waitFor(()=>s.redirects.includes("/?reason=forbidden"));assert.equal(s.win.document.querySelector('button'),null);assert.equal(s.win.document.querySelectorAll('dt').length,0);assert.equal(s.rpcCount(),0);}finally{await s.cleanup();}});
test("inactive super_admin direct URL is cleared by real AuthProvider and returns to login",async()=>{const s=await screen({active:false});try{await s.waitFor(()=>s.redirects.some(x=>x.startsWith('/login')));assert.equal(s.win.document.querySelector('button'),null);assert.equal(s.rpcCount(),0);}finally{await s.cleanup();}});
test("navigation link is visible for super_admin without diagnostic invocation",async()=>{const s=await screen({},true);try{await s.waitFor(()=>Boolean(s.win.document.querySelector('a[href="/data-management/membership-diagnostic"]')));assert.equal(s.rpcCount(),0);}finally{await s.cleanup();}});
test("navigation link is absent for general admin",async()=>{const s=await screen({role:"admin"},true);try{await s.waitFor(()=>s.win.document.body.textContent?.includes("데이터 관리")??false);assert.equal(s.win.document.querySelector('a[href="/data-management/membership-diagnostic"]'),null);assert.equal(s.rpcCount(),0);}finally{await s.cleanup();}});
test("click renders only seven returned values and false remains FAIL",async()=>{const s=await screen({payload:{...valid,native_actor_match:false,schema_compatible:false}});try{await s.waitFor(()=>Boolean(s.win.document.querySelector('button')));await s.click();await s.waitFor(()=>s.win.document.body.textContent?.includes("KICKON_PHASE6D_R3C_V1")??false);assert.equal(s.win.document.querySelectorAll('dt').length,7);assert.equal([...s.win.document.querySelectorAll('dd')].filter(x=>x.textContent==="FAIL").length,2);assert.equal(s.rpcCount(),1);const body=s.win.document.body.textContent??"";assert.ok(!body.includes("qa@")&&!body.includes("test-production")&&!body.includes("production-user"));assert.equal(s.logs.length,0);}finally{await s.cleanup();}});
test("pending actual UI click disables button and duplicate clicks make one RPC",async()=>{let release!:()=>void;const pending=new Promise<void>(r=>{release=r;});const s=await screen({rpcWait:pending});try{await s.waitFor(()=>Boolean(s.win.document.querySelector('button')));await s.click();await s.waitFor(()=>s.rpcCount()===1);const b=s.win.document.querySelector('button')!;assert.equal(b.disabled,true);await s.click();assert.equal(s.rpcCount(),1);release();await s.waitFor(()=>!s.win.document.querySelector('button')?.disabled);}finally{release();await s.cleanup();}});
for(const scenario of ["environment","environment ABA","logout","session replacement"]as const)test(`${scenario} while RPC is pending removes old result and prevents stale display`,async()=>{let release!:()=>void;const pending=new Promise<void>(r=>{release=r;});const s=await screen({rpcWait:pending});try{await s.waitFor(()=>Boolean(s.win.document.querySelector('button')));await s.click();await s.waitFor(()=>s.rpcCount()===1);
 if(scenario==="environment")await act(async()=>s.app.setActiveConsoleEnvironment("development"));
 else if(scenario==="environment ABA")await act(async()=>{s.app.setActiveConsoleEnvironment("development");s.app.setActiveConsoleEnvironment("production");});
 else if(scenario==="logout")await act(async()=>{await s.client.auth.signOut({scope:"local"});});
 else await s.replaceSession();
 release();await s.waitFor(()=>scenario==="session replacement"?Boolean(s.win.document.querySelector('button')):s.win.document.querySelector('button')===null);assert.ok(!(s.win.document.body.textContent??"").includes("KICKON_PHASE6D_R3C_V1"));assert.equal(s.rpcCount(),1);
 }finally{release();await s.cleanup();}});
test("raw RPC error is not rendered or logged and retry is manual",async()=>{const s=await screen({rpcError:true});try{await s.waitFor(()=>Boolean(s.win.document.querySelector('button')));await s.click();await s.waitFor(()=>Boolean(s.win.document.querySelector('[role="alert"]')));assert.ok(!(s.win.document.body.textContent??"").includes("sensitive-ui-error"));assert.equal(s.rpcCount(),1);assert.equal(s.logs.length,0);}finally{await s.cleanup();}});
