import test from 'node:test';
import assert from 'node:assert/strict';
import {createProviderUsageReader} from '../server/provider-usage.ts';

const payload = (remaining: unknown = 1991, resets: unknown = 1702, entity = 'Fixture') => ({rate_limit:{remaining,resets_in_seconds:resets,requested_entity:entity}});

test('reads the real Fixture limit without putting the provider token in the URL', async () => {
  const read = createProviderUsageReader(async (url, init) => {
    assert.equal(String(url), 'https://api.sportmonks.com/v3/football/fixtures?select=id&per_page=1');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'private-token');
    return Response.json(payload());
  }, () => 1000);
  assert.deepEqual(await read('private-token'), {observed_at:new Date(1000).toISOString(),requested_entity:'Fixture',remaining:1991,resets_in_seconds:1702});
});

test('deduplicates concurrent reads and refreshes after one minute or a provider reset', async () => {
  let now=1000, calls=0;
  const read=createProviderUsageReader(async()=>{calls++;return Response.json(payload(1991,30));},()=>now);
  await Promise.all([read('token'),read('token')]);
  assert.equal(calls,1);
  now+=29000; await read('token'); assert.equal(calls,1);
  now+=1000; await read('token'); assert.equal(calls,2);
  now+=60001; await read('token'); assert.equal(calls,3);
});

test('zero remaining is measured even on 429; malformed or unrelated limits stay unavailable', async () => {
  const exhausted=createProviderUsageReader(async()=>Response.json(payload(0,45),{status:429}));
  assert.equal((await exhausted('token')).remaining,0);
  for (const response of [payload(null),payload(-1),payload(10,null),payload(10,0),payload(10,60,'Team'),payload(true)]) {
    const read=createProviderUsageReader(async()=>Response.json(response));
    await assert.rejects(read('token'),/사용량/);
  }
});

test('provider failures do not expose tokens or cache a failed read', async () => {
  let calls=0;
  const read=createProviderUsageReader(async()=>{if(calls++===0)throw Error('https://provider?api_token=private-token');return Response.json(payload());});
  await assert.rejects(read('private-token'),error=>error instanceof Error&&!error.message.includes('private-token'));
  assert.equal((await read('private-token')).remaining,1991);
});
