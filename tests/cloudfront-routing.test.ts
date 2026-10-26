import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const handler=vm.runInNewContext(readFileSync(new URL('../infrastructure/cloudfront/viewer-request.js',import.meta.url),'utf8')+';handler');
test('deployed SPA routing preserves assets and old private APIs while serving the new entry for HTML routes',()=>{
 for(const uri of ['/','/login/','/users','/data-management/index.html'])assert.equal(handler({request:{uri}}).uri,'/index.html');
 for(const uri of ['/assets/index-hash.js','/branding/kickon-logo.svg','/api/admin/actions'])assert.equal(handler({request:{uri}}).uri,uri);
 assert.equal(handler({request:{uri:'/development/'}}).headers.location.value,'/?environment=development');
});
