import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fetchAllRows, fetchRowsForIds } from '../src/lib/data/pagination.ts';
import { CURRENT_SEASON, SUPPORTED_LEAGUES, playerHref, playerKey, readFootballScope, emptyLeagueMessage } from '../src/lib/football/config.ts';
import { handler, secretOperationBodies, secretOperationBody } from '../server/admin-api/lambda.ts';

test('verified player names survive later squad and lineup syncs',()=>{
  const migration=readFileSync(new URL('../supabase/migrations/202609120006_preserve_verified_player_names_on_sync.sql',import.meta.url),'utf8');
  assert.match(migration,/and localization\.is_verified/);
  assert.match(migration,/before insert or update on public\.team_players/);
  assert.match(migration,/before insert or update on public\.fixture_lineup_players/);
  assert.match(migration,/new\.display_name_ko := canonical_name/);
  assert.match(migration,/player\.display_name_ko is distinct from localization\.name_ko/);
});

test('team and player lists keep league controls compact',()=>{
  const standings=readFileSync(new URL('../src/app/(console)/standings/page.tsx',import.meta.url),'utf8');
  const leagueFilter=readFileSync(new URL('../src/components/admin/league-filter.tsx',import.meta.url),'utf8');
  const players=readFileSync(new URL('../src/components/players/players-table.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(standings,/STANDING_RULES|현재 순위 기준|공식 대회요강/);
  assert.doesNotMatch(leagueFilter,/시즌 ·|K리그1·2/);
  assert.match(leagueFilter,/h-11! w-40/);
  assert.match(leagueFilter,/font-medium tracking-normal/);
  assert.doesNotMatch(players,/row\.original\.leagueId\)\?\.badge/);
});

test('data management uses the combined league scope and stale K2 cleanup stays narrowly scoped',()=>{
  const page=readFileSync(new URL('../src/app/(console)/data-management/page.tsx',import.meta.url),'utf8');
  assert.match(page,/getSyncControlOptions\("all"\)/);
  assert.match(page,/getSyncOperationHistory\("all"\)/);
  assert.doesNotMatch(page,/<LeagueFilter/);

  const migration=readFileSync(new URL('../supabase/migrations/202609120005_replay_invalid_k2_squad_error_cleanup.sql',import.meta.url),'utf8');
  assert.match(migration,/set last_error = null/);
  assert.match(migration,/state\.last_error like '%squads\/seasons\/26894\/%'/);
  assert.match(migration,/standing\.league_id = 'kleague2'/);
  assert.match(migration,/standing\.season = 2026/);
});

for (const cap of [1000, 250]) test(`server limit ${cap}: 1,090 rows are read completely in stable pages`, async () => {
  const rows = Array.from({ length: 1090 }, (_, id) => ({ id }));
  const ranges: number[][] = [];
  const result = await fetchAllRows(async (from, to) => { ranges.push([from,to]); return { data: rows.slice(from, Math.min(to+1, from+cap)), error:null }; });
  assert.deepEqual(result.data, rows); assert.equal(new Set(result.data.map(row=>row.id)).size,1090);
  assert.ok(ranges.every(([from,to])=>to-from===999));
});
test('failed later page never exposes an incomplete successful list', async () => {
  const result = await fetchAllRows(async from => from===0 ? {data:[{id:1}],error:null} : {data:null,error:{message:'network failure'}});
  assert.deepEqual(result.data,[]); assert.equal(result.error?.message,'network failure');
});
test('empty K2 is a normal empty result', async()=>{
  assert.deepEqual(await fetchAllRows(async()=>({data:[],error:null})),{data:[],error:null});
  assert.equal(emptyLeagueMessage('kleague2'),'등록된 K리그2 데이터가 없습니다');
});
test('override IDs are batched without truncating after 200 entities', async()=>{
  const ids=Array.from({length:502},(_,id)=>String(id));
  const result=await fetchRowsForIds([...ids,ids[0]],async (batch,from,to)=>{assert.ok(batch.length<=100);return {data:batch.slice(from,to+1).map(id=>({id})),error:null};});
  assert.deepEqual(result.data.map(row=>row.id),ids);
});
test('duplicate player IDs keep independent league/season keys and URL identities',()=>{
  const a={id:'test/id?x=1&z',season:2026,leagueId:'kleague'};
  const b={...a,leagueId:'kleague2'}; const c={...b,season:2025};
  assert.equal(new Set([a,b,c].map(playerKey)).size,3);
  for(const player of [a,b,c]) {const url=new URL(playerHref(player),'https://example.test');assert.equal(url.searchParams.get('playerId'),player.id);assert.equal(url.searchParams.get('leagueId'),player.leagueId);assert.equal(url.searchParams.get('season'),String(player.season));}
});
test('mutations require explicit valid season and league',()=>{
  const form=new FormData();assert.equal(readFootballScope(form),null);
  form.set('season','2026');form.set('leagueId','all');assert.equal(readFootballScope(form),null);
  form.set('leagueId','kleague2');assert.deepEqual(readFootballScope(form),{season:2026,leagueId:'kleague2'});
});
test('provider sync operations use the selected provider mapping',()=>{
  for(const league of SUPPORTED_LEAGUES)for(const op of ['full','post-match','history-backfill']){
    const body=secretOperationBody(op,league.id,CURRENT_SEASON);
    assert.equal(body.leagueId,league.providerLeagueId);assert.equal(body.seasonId,league.seasons[CURRENT_SEASON]);assert.equal(body.season,CURRENT_SEASON);
  }
  for(const league of SUPPORTED_LEAGUES){
    const body=secretOperationBody('live',league.id,CURRENT_SEASON);
    assert.equal(body.leagueId,league.id);assert.equal(body.providerLeagueId,league.providerLeagueId);assert.equal(body.seasonId,league.seasons[CURRENT_SEASON]);assert.equal(body.season,CURRENT_SEASON);
  }
  const fullBodies=secretOperationBodies('full','all',CURRENT_SEASON);
  assert.deepEqual(fullBodies.map(body=>'leagueId' in body?body.leagueId:null),SUPPORTED_LEAGUES.map(league=>league.providerLeagueId));
  assert.deepEqual(secretOperationBodies('live','all',CURRENT_SEASON),[{mode:'live',pollCount:0}]);
  assert.throws(()=>secretOperationBody('full','kleague2',2025));
});

test('deployed full sync accepts K League 2 and writes every scoped row to K League 2',()=>{
  const source=readFileSync(new URL('../supabase/functions/sync-football-data/index.ts',import.meta.url),'utf8');
  assert.match(source,/const K_LEAGUE_2_ID = 1362/);
  assert.match(source,/const K_LEAGUE_2_SEASON_ID = 27443/);
  assert.match(source,/leagueId === K_LEAGUE_2_ID[\s\S]*seasonId === K_LEAGUE_2_SEASON_ID[\s\S]*\? 'kleague2'/);
  assert.match(source,/\.eq\('league_id', internalLeagueId\)/);
  assert.match(source,/league_id: internalLeagueId/g);
  assert.doesNotMatch(source,/Only K League 1 seasons 2024 through 2026 are enabled/);
  assert.match(source,/nameKo: '안산 와스타디움'/);
});

test('production bootstrap contains all 17 K League 2 provider team identities',()=>{
  const migration=readFileSync(new URL('../supabase/migrations/202609120009_bootstrap_k_league_2_teams.sql',import.meta.url),'utf8');
  const ids=['ansan-greeners','busan-ipark','cheonan-city','chungbuk-cheongju','chungnam-asan','daegu','gimhae','gimpo','gyeongnam','hwaseong','jeonnam','paju','seongnam','seoul-eland','suwon-bluewings','suwon-fc','yongin'];
  for(const id of ids) assert.match(migration,new RegExp(`\\('${id}',`));
  assert.match(migration,/1362,[\s\S]*27443/);
});
test('admin API infers a K2 target and carries scope through snapshots, invoke and sync audit',async()=>{
  const savedFetch=globalThis.fetch; const keys=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SPORTSMONKS_API_ALLOWANCE'];
  const previous=keys.map(key=>process.env[key]);
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='test-key';delete process.env.SPORTSMONKS_API_ALLOWANCE;
  const requests:Array<{url:URL;body:Record<string,unknown>}> = [];
  globalThis.fetch=async(input,init)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
    const body=typeof init?.body==='string'?JSON.parse(init.body):{};requests.push({url,body});
    let payload:unknown=[];
    if(url.pathname==='/auth/v1/user') payload={id:'11111111-1111-4111-8111-111111111111',email:'test@example.test'};
    else if(url.pathname.endsWith('/admin_users')) payload=[{role:'super_admin',is_active:true}];
    else if(url.pathname.endsWith('/league_standings')) {assert.equal(url.searchParams.get('team_id'),'eq.paju');assert.equal(url.searchParams.get('season'),'eq.2026');payload=[{team_id:'paju',league_id:'kleague2'}];}
    else if(url.pathname.endsWith('/sync_runs')) payload=[{id:'22222222-2222-4222-8222-222222222222'}];
    else if(url.pathname.endsWith('/sync-team-squad')) payload={status:'succeeded'};
    else if(url.pathname.endsWith('/sync-team-metrics')) payload={status:'succeeded'};
    else if(url.pathname.includes('/rpc/')) payload=url.pathname.endsWith('/get_admin_provider_usage')?[]:1;
    else throw new Error(`unexpected mock request ${url.pathname}`);
    return new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
  };
  const request=(payload:Record<string,unknown>)=>handler({rawPath:'/api/admin/actions',requestContext:{http:{method:'POST'}},headers:{authorization:'Bearer test-token'},body:JSON.stringify({action:'runSync',payload})});
  try {
    const missing=await request({operation:'team-squad',teamId:'paju',reason:'test reason'});assert.equal(missing.statusCode,400);
    requests.length=0;
    const result=await request({operation:'team-squad',teamId:'paju',season:2026,reason:'test reason'});assert.equal(result.statusCode,200,result.body);
    const snapshots=requests.filter(r=>r.url.pathname.endsWith('/capture_player_squad_snapshot'));
    assert.equal(snapshots.length,2);for(const row of snapshots){assert.equal(row.body.p_league_id,'kleague2');assert.equal(row.body.p_season,2026);}
    const invoke=requests.find(r=>r.url.pathname.endsWith('/sync-team-squad'))!;assert.equal(invoke.body.leagueId,'kleague2');assert.equal(invoke.body.providerSeasonId,27443);
    for(const run of requests.filter(r=>r.url.pathname.endsWith('/sync_runs')))assert.equal((run.body.metadata as Record<string,unknown>).leagueId,'kleague2');
    requests.length=0;
    const all=await request({operation:'team-metrics',season:2026,reason:'refresh both leagues'});assert.equal(all.statusCode,200,all.body);
    const allInvokes=requests.filter(r=>r.url.pathname.endsWith('/sync-team-metrics'));
    assert.deepEqual(allInvokes.map(r=>r.body.leagueId).sort(),['kleague','kleague2']);
    for(const run of requests.filter(r=>r.url.pathname.endsWith('/sync_runs')))assert.equal((run.body.metadata as Record<string,unknown>).leagueId,'all');
  } finally {globalThis.fetch=savedFetch;keys.forEach((key,i)=>{if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];});}
});
