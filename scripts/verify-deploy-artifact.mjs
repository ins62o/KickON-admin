import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import console from 'node:console';
const html=readFileSync('dist/index.html','utf8');
assert.match(html,/src="\/assets\/[^"\s]+\.js"/);
const files=[];
function walk(dir){for(const name of readdirSync(dir)){const file=join(dir,name);if(statSync(file).isDirectory())walk(file);else files.push(file);}}
walk('dist');
for(const file of files){
 assert.ok(!/(?:^|\/)(?:\.env|\.data|server|supabase)(?:\.|\/|$)/.test(file),`Private file in public artifact: ${file}`);
 if(!/\.(?:js|html|css|json|txt)$/.test(file))continue;
 const content=readFileSync(file,'utf8');
 assert.ok(!/sbp_[a-z0-9]{30,}|sb_secret_[A-Za-z0-9_-]{20,}/i.test(content),`Private credential in public artifact: ${file}`);
 for(const [token] of content.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)){
  let payload;try{payload=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());}catch{continue;}
  assert.notEqual(payload.role,'service_role',`Private service token in public artifact: ${file}`);
 }
}
assert.ok(files.some(file=>/\.js$/.test(file)&&readFileSync(file,'utf8').includes('smihjaucucffmsbktnmp.supabase.co')),'Missing configured production authentication');
console.log(`PASS production artifact: ${files.length} public files, root asset paths and no server credentials`);
