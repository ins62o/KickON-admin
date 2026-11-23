import test from "node:test";
import assert from "node:assert/strict";
import {readdirSync,readFileSync} from "node:fs";
import {isSeedStylesheet,withoutSeedStyles} from "../seed-styles.ts";

test("SEED stylesheets resolve to an empty module before they can reach any bundle",()=>{
  const recipe="/app/node_modules/@seed-design/css/recipes/tabs.mjs";
  for(const [source,importer] of [["./tabs.css",recipe],["@seed-design/css/base.css","/app/src/main.tsx"],["/app/node_modules/@seed-design/css/recipes/select.css?direct",undefined],[".\\action-button.css","C:\\app\\node_modules\\@seed-design\\css\\recipes\\action-button.mjs"]] as const)assert.equal(isSeedStylesheet(source,importer),true,source);
  for(const [source,importer] of [["./kickon-ui.css","/app/src/main.tsx"],["./shared.mjs",recipe],["./seed.css","/app/node_modules/other/index.js"],["@seed-design/react","/app/src/main.tsx"]] as const)assert.equal(isSeedStylesheet(source,importer),false,source);
  const plugin=withoutSeedStyles(),resolve=plugin.resolveId as (source:string,importer?:string)=>string|undefined,load=plugin.load as (id:string)=>string|undefined;
  const id=resolve("./tabs.css",recipe);
  assert.ok(id?.startsWith("\0"));
  assert.equal(load(id!),"export {};");
  assert.equal(resolve("./styles.css","/app/src/main.tsx"),undefined);
  assert.equal(load("/app/src/styles.css"),undefined);
});

test("only KICKON stylesheets style the admin and its components load before the screen styles",()=>{
  const main=readFileSync("src/main.tsx","utf8");
  const foundations=main.indexOf('"./kickon-ui.css"');
  assert.ok(foundations>=0&&foundations<main.indexOf('"./styles.css"'));
  assert.ok(foundations<main.indexOf('import App'),"screen stylesheets imported through App must come after the component foundations");
  const sources=readdirSync("src",{recursive:true,encoding:"utf8"}).filter(file=>/\.(tsx?|css)$/.test(file));
  for(const file of sources)assert.doesNotMatch(readFileSync(`src/${file}`,"utf8"),/@seed-design\/css|--seed-color-|data-seed-color-mode/,file);
  const config=readFileSync("vite.config.ts","utf8");
  assert.match(config,/plugins:\[withoutSeedStyles\(\)/);
  assert.doesNotMatch(config,/seedDesignPlugin/);
});
