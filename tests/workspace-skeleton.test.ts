import test from "node:test";
import assert from "node:assert/strict";
import {readdirSync,readFileSync} from "node:fs";

const files=readdirSync("src",{recursive:true,encoding:"utf8"}).filter(file=>file.endsWith(".tsx")).map(file=>({file,text:readFileSync(`src/${file}`,"utf8")}));

test("every loading skeleton is shaped like the feature it stands in for",()=>{
  for(const {file,text} of files)for(const [usage] of text.matchAll(/<WorkspaceSkeleton[^>]*\/>/g)){
    if(file.endsWith("WorkspaceSkeleton.tsx"))continue;
    assert.match(usage,/shape=|rowHeight=/,`${file}: ${usage}`);
  }
  const dashboard=readFileSync("src/dashboard/Dashboard.tsx","utf8");
  assert.doesNotMatch(dashboard,/fallback=\{<WorkspaceSkeleton/);
  assert.equal([...dashboard.matchAll(/<Suspense fallback=\{[^}]*WorkspacePageSkeleton/g)].length,2);
});

test("workspace summary cards show a skeleton while loading instead of the failure dash",()=>{
  for(const file of ["management/OperationsWorkspace.tsx","management/UsersWorkspace.tsx","management/DataWorkspace.tsx","management/PushWorkspace.tsx"]){
    const text=readFileSync(`src/${file}`,"utf8");
    for(const [usage] of text.matchAll(/<Stat\b[\s\S]*?\/>/g))assert.match(usage,/loading=/,`${file}: ${usage.slice(0,80)}`);
  }
});
