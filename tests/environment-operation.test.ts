import test from "node:test";
import assert from "node:assert/strict";
import {createOperationGuard,finishEnvironmentSwitch} from "../src/auth/environment-operation.ts";
test("logout before a handoff response prevents storage and redirect",async()=>{
  let marker="",stored=false,discarded=false,navigated=false;
  const guard=createOperationGuard(()=>marker),isCurrent=guard.begin();marker="logout-from-another-tab";
  await finishEnvironmentSwitch({isCurrent,store:async()=>{stored=true;},discard:async()=>{discarded=true;},navigate:()=>{navigated=true;}});
  assert.equal(stored,false);assert.equal(discarded,true);assert.equal(navigated,false);
});
test("logout during asynchronous SDK storage discards the late session",async()=>{
  const guard=createOperationGuard(()=>""),isCurrent=guard.begin();let discarded=false,navigated=false,release!:()=>void;
  const storage=new Promise<void>(resolve=>{release=resolve;});
  const pending=finishEnvironmentSwitch({isCurrent,store:()=>storage,discard:async()=>{discarded=true;},navigate:()=>{navigated=true;}});
  guard.invalidate();release();await pending;
  assert.equal(discarded,true);assert.equal(navigated,false);
});

test("failed target session storage revokes the unused handoff",async()=>{
  let discarded=false,navigated=false;
  await assert.rejects(finishEnvironmentSwitch({isCurrent:()=>true,store:async()=>{throw new Error("storage failed");},discard:async()=>{discarded=true;},navigate:()=>{navigated=true;}}));
  assert.equal(discarded,true);assert.equal(navigated,false);
});
