import test from "node:test";
import assert from "node:assert/strict";
import {activeAdmin,sameVerifiedIdentity,canRunSync} from "../server/identity.ts";
test("environment handoff accepts only existing active recognized administrators",()=>{
  assert.equal(activeAdmin({is_active:true,role:"admin"}),true);
  for(const row of [null,{is_active:false,role:"admin"},{is_active:true,role:"__proto__"},{is_active:true,role:"unknown"}])assert.equal(activeAdmin(row),false);
});
test("cross-environment identity requires verified matching emails and no active ban",()=>{
  const source={id:"source",email:"Admin@example.com",email_confirmed_at:"2026-01-01"};
  assert.equal(sameVerifiedIdentity(source,{...source,id:"target",email:"admin@example.com"}),true);
  assert.equal(sameVerifiedIdentity(source,{...source,email:"other@example.com"}),false);
  assert.equal(sameVerifiedIdentity(source,{...source,email_confirmed_at:undefined}),false);
  assert.equal(sameVerifiedIdentity(source,{...source,banned_until:"2099-01-01"}),false);
  assert.equal(sameVerifiedIdentity({...source,email:undefined},{...source}),false);
});
test("only data-writing administrators can start provider jobs",()=>{
  assert.equal(canRunSync("data_editor"),true);
  for(const role of ["viewer","support","moderator","__proto__"])assert.equal(canRunSync(role),false);
});
