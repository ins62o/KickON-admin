import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, symlinkSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath, URL} from 'node:url';
import {spawnSync} from 'node:child_process';
import process from 'node:process';

const publisher = fileURLToPath(new URL('../scripts/publish-admin-static.sh', import.meta.url));
const verifier = fileURLToPath(new URL('../scripts/verify-deploy-artifact.mjs', import.meta.url));
const sha = 'a'.repeat(40);
const fakeCli = `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2),env=process.env,root=env.FAKE_BUCKET;
const name=path.basename(process.argv[1]);
const record={name,args};fs.appendFileSync(env.FAKE_LOG,JSON.stringify(record)+'\\n');
const local=p=>p.startsWith('s3://kickon-admin/')?path.join(root,p.slice(18)):p;
const cp=(a,b)=>{fs.mkdirSync(path.dirname(b),{recursive:true});fs.copyFileSync(a,b);};
if(name==='aws'){
 if(args[0]==='sts'){process.stdout.write(env.FAKE_ACCOUNT||'896421757212');process.exit(0);}
 if(args[0]==='s3'&&args[1]==='cp'){
  if(args[3].includes('/releases/')&&env.FAKE_FAIL==='backup')process.exit(1);
  if(args[2]==='dist/index.html'){
   if(!fs.existsSync(path.join(root,'assets/new.js'))||!fs.existsSync(path.join(root,'assets/new.css'))||!fs.existsSync(path.join(root,'releases/123-1/index.html')))process.exit(91);
  }
  cp(local(args[2]),local(args[3]));process.exit(0);
 }
 if(args[0]==='s3'&&args[1]==='sync'){
  if(env.FAKE_FAIL==='assets'&&args[2]==='dist/assets/')process.exit(1);
  if(args.includes('--delete'))process.exit(92);
  const source=args[2],dest=local(args[3]),exclude=[];
  for(let i=0;i<args.length;i++)if(args[i]==='--exclude')exclude.push(args[i+1]);
  function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){
   const full=path.join(dir,item.name),rel=path.relative(source,full);
   if(exclude.some(x=>x.endsWith('/*')?rel.startsWith(x.slice(0,-1)):rel===x))continue;
   if(item.isDirectory())walk(full);else cp(full,path.join(dest,rel));
  }}walk(source);process.exit(0);
 }
 if(args[0]==='cloudfront'&&args[1]==='create-invalidation'){process.stdout.write('I123');process.exit(0);}
 if(args[0]==='cloudfront'&&args[1]==='wait')process.exit(0);
 process.exit(93);
}
if(name==='curl'){
 const url=args.find(x=>x.startsWith('https://')),out=args[args.indexOf('-o')+1];
 const file=new URL(url).pathname;
 cp(path.join(root,file==='/'?'index.html':file),out);
 if(env.FAKE_FAIL==='published'&&file.endsWith('.js'))fs.appendFileSync(out,'stale');
 process.exit(0);
}
process.exit(94);
`;

function setup(t, extra = {}) {
  const root = mkdtempSync(join(tmpdir(), 'kickon-static-test-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  for (const dir of ['bin', 'dist/assets', 'scripts', 'bucket/assets', 'runner']) mkdirSync(join(root, dir), {recursive:true});
  writeFileSync(join(root, 'bin/cli'), fakeCli, {mode:0o755});
  for (const command of ['aws', 'curl']) symlinkSync('cli', join(root, 'bin', command));
  copyFileSync(verifier, join(root, 'scripts/verify-deploy-artifact.mjs'));
  writeFileSync(join(root, 'dist/index.html'), '<script src="/assets/new.js"></script><link rel="stylesheet" href="/assets/new.css">');
  writeFileSync(join(root, 'dist/assets/new.js'), '/* smihjaucucffmsbktnmp.supabase.co */');
  writeFileSync(join(root, 'dist/assets/new.css'), 'body{color:black}');
  writeFileSync(join(root, 'dist/build-info.json'), JSON.stringify({commit:sha,run:'123'}));
  writeFileSync(join(root, 'bucket/index.html'), 'previous entry');
  writeFileSync(join(root, 'bucket/build-info.json'), '{"commit":"previous"}');
  writeFileSync(join(root, 'bucket/assets/old.js'), 'previous asset');
  const env = {PATH:`${join(root,'bin')}:${process.env.PATH}`,GITHUB_REF:'refs/heads/Prod',GITHUB_SHA:sha,GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',GITHUB_STEP_SUMMARY:join(root,'summary'),RUNNER_TEMP:join(root,'runner'),SITE_URL:'https://admin.kickon.kr',S3_BUCKET:'kickon-admin',DISTRIBUTION_ID:'E13XNKB0IQ56OZ',FAKE_BUCKET:join(root,'bucket'),FAKE_LOG:join(root,'calls.jsonl'),...extra};
  return {root, run:()=>spawnSync('bash',[publisher],{cwd:root,env,encoding:'utf8'}), read:(name)=>readFileSync(join(root,'bucket',name),'utf8'), calls:()=>existsSync(env.FAKE_LOG)?readFileSync(env.FAKE_LOG,'utf8').trim().split('\n').map(line=>JSON.parse(line)):[]};
}

test('publishes assets before the entry, preserves the previous release, and verifies served files', t => {
  const fixture = setup(t), result = fixture.run();
  assert.equal(result.status,0,result.stderr);
  assert.equal(fixture.read('index.html'),'<script src="/assets/new.js"></script><link rel="stylesheet" href="/assets/new.css">');
  assert.equal(fixture.read('releases/123-1/index.html'),'previous entry');
  assert.equal(fixture.read('releases/123-1/build-info.json'),'{"commit":"previous"}');
  assert.equal(fixture.read('assets/old.js'),'previous asset');
  assert.equal(JSON.parse(fixture.read('build-info.json')).commit,sha);
  assert.equal(fixture.calls().filter(call=>call.name==='curl').length,4);
});

for (const failure of ['backup','assets']) test(`${failure} failure keeps the previous entry and stops publication`, t => {
  const fixture = setup(t,{FAKE_FAIL:failure}), result = fixture.run();
  assert.notEqual(result.status,0);
  assert.equal(fixture.read('index.html'),'previous entry');
  assert.ok(fixture.calls().some(call=>call.name==='aws'),'must reach the intended storage failure');
  assert.ok(!fixture.calls().some(call=>call.args[0]==='cloudfront'));
});

for (const invalid of [{S3_BUCKET:'another-site'},{DISTRIBUTION_ID:'another-distribution'},{SITE_URL:'https://other.example'},{GITHUB_REF:'refs/heads/Dev'}]) test(`rejects an unapproved deployment target: ${Object.keys(invalid)[0]}`, t => {
  const fixture = setup(t,invalid), result = fixture.run();
  assert.notEqual(result.status,0);
  assert.equal(fixture.read('index.html'),'previous entry');
  assert.equal(fixture.calls().length,0);
});

test('rejects a different AWS account before changing storage', t => {
  const fixture = setup(t,{FAKE_ACCOUNT:'000000000000'}), result = fixture.run();
  assert.notEqual(result.status,0);
  assert.equal(fixture.calls().length,1);
  assert.equal(fixture.calls()[0].args[0],'sts');
  assert.equal(fixture.read('index.html'),'previous entry');
});

test('fails verification when the served asset differs and does not retry publication', t => {
  const fixture = setup(t,{FAKE_FAIL:'published'}), result = fixture.run();
  assert.notEqual(result.status,0);
  assert.equal(fixture.calls().filter(call=>call.args[2]==='dist/index.html').length,1);
  assert.equal(fixture.read('releases/123-1/index.html'),'previous entry');
});

test('rejects a build belonging to a different commit before contacting AWS', t => {
  const fixture = setup(t,{GITHUB_SHA:'b'.repeat(40)}), result = fixture.run();
  assert.notEqual(result.status,0);
  assert.equal(fixture.calls().length,0);
  assert.equal(fixture.read('index.html'),'previous entry');
});
