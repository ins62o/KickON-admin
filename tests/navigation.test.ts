import test from "node:test";
import assert from "node:assert/strict";
import * as navigation from "../src/dashboard/navigation.ts";

test("refresh restores every known admin page and rejects unknown page names",()=>{
  for(const page of Object.keys(navigation.pages)){
    assert.equal(navigation.pageFromUrl(`https://admin.example/?environment=production&page=${page}`),page);
  }
  for(const query of ["", "?page=missing", "?page=constructor", "?page=__proto__"]){
    assert.equal(navigation.pageFromUrl(`https://admin.example/${query}`),"dashboard");
  }
});

test("navigation preserves environment and other URL state and can reset to the login landing page",()=>{
  const current="https://admin.example/?environment=production&view=compact#dashboard-main";
  const users=navigation.pageUrl(current,"users");
  assert.equal(navigation.pageFromUrl(users),"users");
  assert.equal(new URL(users).searchParams.get("environment"),"production");
  assert.equal(new URL(users).searchParams.get("view"),"compact");
  assert.equal(new URL(users).hash,"#dashboard-main");
  assert.equal(navigation.pageUrl(users,"dashboard"),current);
});

test("operation list links restore their section and leaving operations clears it",()=>{
  assert.equal(typeof navigation.operationTabFromUrl,"function");
  const current="https://admin.example/?environment=production&view=compact";
  for(const tab of ["community","attendances","marketing","notices","inquiries","reports","app-updates"] as const){
    const href=navigation.pageUrl(current,"operations",tab);
    assert.equal(navigation.pageFromUrl(href),"operations");
    assert.equal(navigation.operationTabFromUrl(href),tab);
    assert.equal(new URL(href).searchParams.get("environment"),"production");
    assert.equal(new URL(href).searchParams.get("view"),"compact");
    assert.equal(new URL(navigation.pageUrl(href,"users")).searchParams.has("tab"),false);
    assert.equal(navigation.operationTabFromUrl(navigation.pageUrl(href,"operations")),"community");
  }
  for(const query of ["?page=operations","?page=operations&tab=missing","?page=operations&tab=constructor","?page=users&tab=inquiries"]){
    assert.equal(navigation.operationTabFromUrl(`https://admin.example/${query}`),"community");
  }
});

test('club detail URLs restore their data section, preserve environment and clear details when navigating away',()=>{
 const current='https://admin.example/?environment=production&view=compact';
 for(const tab of ['monitoring','sync','push','fixtures','teams'] as const){
  const href=navigation.dataPageUrl(current,tab);
  assert.equal(navigation.pageFromUrl(href),'data');assert.equal(navigation.dataTabFromUrl(href),tab);assert.equal(navigation.teamIdFromUrl(href),null);
 }
 const href=navigation.dataPageUrl(current,'teams','fc_seoul');
 assert.equal(navigation.teamIdFromUrl(href),'fc_seoul');assert.equal(new URL(href).searchParams.get('environment'),'production');assert.equal(new URL(href).searchParams.get('view'),'compact');
 for(const page of ['dashboard','users','operations','data'] as const)assert.equal(new URL(navigation.pageUrl(href,page)).searchParams.has('team'),false);
 assert.equal(navigation.teamIdFromUrl(navigation.dataPageUrl(href,'monitoring')),null);
 for(const suffix of ['?page=data&tab=teams&team=bad%2Fid','?page=data&tab=teams&team=','?page=data&tab=teams&team='+ 'a'.repeat(161),'?page=users&tab=teams&team=seoul','?page=data&tab=missing&team=seoul'])assert.equal(navigation.teamIdFromUrl('https://admin.example/'+suffix),null);
});

test('retired data overview links open server monitoring',()=>{
 assert.equal(navigation.dataTabFromUrl('https://admin.example/?page=data&tab=overview'),'monitoring');
 assert.equal(navigation.dataTabFromUrl('https://admin.example/?page=data'),'monitoring');
});
test('push detail routes restore a valid kind, preserve the environment and clear when leaving',()=>{
 const current='https://admin.example/?environment=production&view=compact';
 for(const kind of ['match','goal','lineup','community','attendance','system'] as const){
  const href=navigation.pushPageUrl(current,kind);
  assert.equal(navigation.dataTabFromUrl(href),'push');assert.equal(navigation.pushKindFromUrl(href),kind);
  assert.equal(new URL(href).searchParams.get('environment'),'production');
  assert.equal(navigation.pushKindFromUrl(navigation.pushPageUrl(href)),null);
  assert.equal(new URL(navigation.dataPageUrl(href,'teams')).searchParams.has('push'),false);
  assert.equal(new URL(navigation.pageUrl(href,'users')).searchParams.has('push'),false);
 }
 for(const suffix of ['?page=data&tab=push&push=unknown','?page=data&tab=teams&push=goal','?page=users&tab=push&push=goal'])assert.equal(navigation.pushKindFromUrl('https://admin.example/'+suffix),null);
});

test('automatic sync dialog routes restore a job and clear it when leaving the section',()=>{
 const current='https://admin.example/?environment=production&view=compact&push=match&team=seoul';
 const href=navigation.syncPageUrl(current,'kickon-live-football-sync');
 assert.equal(navigation.dataTabFromUrl(href),'sync');assert.equal(navigation.syncJobFromUrl(href),'kickon-live-football-sync');
 assert.equal(new URL(href).searchParams.get('environment'),'production');assert.equal(new URL(href).searchParams.get('view'),'compact');
 assert.equal(new URL(href).searchParams.has('push'),false);assert.equal(new URL(href).searchParams.has('team'),false);
 assert.equal(navigation.syncJobFromUrl(navigation.syncPageUrl(href)),null);
 for(const tab of ['monitoring','teams','push','fixtures'] as const)assert.equal(new URL(navigation.dataPageUrl(href,tab)).searchParams.has('sync'),false);
 assert.equal(new URL(navigation.pageUrl(href,'users')).searchParams.has('sync'),false);
 for(const suffix of ['?page=data&tab=sync&sync=','?page=data&tab=sync&sync=bad%2Fname','?page=data&tab=sync&sync='+'a'.repeat(201),'?page=data&tab=push&sync=kickon-live-football-sync','?page=users&tab=sync&sync=kickon-live-football-sync'])assert.equal(navigation.syncJobFromUrl('https://admin.example/'+suffix),null);
});
