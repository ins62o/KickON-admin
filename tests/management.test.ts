import test from "node:test";
import assert from "node:assert/strict";
import {filterMembers,teamLeague,enrichMembers,type Member,type Standing} from "../src/management/model.ts";
const standings=[{team_id:"one",league_id:"kleague",season:2026},{team_id:"two",league_id:"kleague2",season:2026},{team_id:"old",league_id:"kleague",season:2025}] as Standing[];
const members=[{user_id:"1",nickname:"서울 팬",team_id:"one",team_name:"서울"},{user_id:"2",nickname:"두 번째",team_id:"two",team_name:"인천"},{user_id:"3",nickname:"무소속",team_id:null}] as Member[];
test("league, team and text filters combine without assigning unknown teams to K2",()=>{
  assert.deepEqual(filterMembers(members,standings,"kleague2","all","").map(u=>u.user_id),["2"]);
  assert.equal(filterMembers(members,standings,"kleague","two","").length,0);
  assert.equal(filterMembers(members,standings,"all","all"," 서울 ").length,1);
  assert.equal(teamLeague(standings,"old"),null);
  assert.equal(teamLeague([...standings,{team_id:"one",league_id:"kleague2",season:2026} as Standing],"one"),null);
});

test("moving activity pages cannot duplicate the stable roster or invent missing statistics",()=>{
  const roster=members.map(row=>({...row,joined_at:"2026-01-01"}));
  const result=enrichMembers(roster,[{...members[0],post_count:1},{...members[0],post_count:2}] as Member[]);
  assert.equal(result.length,3);assert.deepEqual(result.map(row=>row.user_id),["1","2","3"]);
  assert.equal(result[0].post_count,2);assert.equal(result[1].post_count,null);assert.equal(result[1].account_status,"UNKNOWN");
});

test('member count sorting is numeric, keeps unknowns last in both directions, and preserves input order',async()=>{
  const {sortMembers}=await import('../src/management/model.ts');
  const rows=[
    {...members[0],post_count:2,attendance_count:null},
    {...members[1],post_count:100,attendance_count:3},
    {...members[2],post_count:null,attendance_count:0},
  ] as Member[];
  assert.deepEqual(sortMembers(rows,'post_count','desc').map(row=>row.user_id),['2','1','3']);
  assert.deepEqual(sortMembers(rows,'post_count','asc').map(row=>row.user_id),['1','2','3']);
  assert.deepEqual(sortMembers(rows,'attendance_count','asc').map(row=>row.user_id),['3','2','1']);
  assert.deepEqual(sortMembers(rows,'attendance_count','desc').map(row=>row.user_id),['2','3','1']);
  assert.deepEqual(rows.map(row=>row.user_id),['1','2','3']);
});

test('club cards rank by real supporter count with deterministic name order for ties',async()=>{
  const {rankTeamsByMembers}=await import('../src/management/model.ts');
  const teams=[{id:'low',name:'가'},{id:'high',name:'나'},{id:'empty-b',name:'라'},{id:'empty-a',name:'다'}] as import('../src/management/model.ts').Team[];
  const ranked=rankTeamsByMembers(teams,new Map([['low',2],['high',20]]));
  assert.deepEqual(ranked.map(row=>row.id),['high','low','empty-a','empty-b']);
  assert.equal(teams[0].id,'low');
});

test('club standings follow provider ranks and exclude past or conflicting league assignments without inventing missing ranks',async()=>{
  const {rankTeamsByStanding,teamStanding}=await import('../src/management/model.ts');
  const teams=[{id:'second',name:'가'},{id:'first',name:'나'},{id:'unknown',name:'다'},{id:'old',name:'라'},{id:'conflict',name:'마'},{id:'missing',name:'바'}] as import('../src/management/model.ts').Team[];
  const rows=[
    {team_id:'second',season:2026,league_id:'kleague',rank:2,points:0},
    {team_id:'first',season:2026,league_id:'kleague',rank:1},
    {team_id:'old',season:2025,league_id:'kleague',rank:1},
    {team_id:'conflict',season:2026,league_id:'kleague',rank:1},
    {team_id:'conflict',season:2026,league_id:'kleague2',rank:1},
    {team_id:'missing',season:2026,league_id:'kleague2',rank:null},
  ] as Standing[];
  assert.deepEqual(rankTeamsByStanding(teams,rows).map(row=>row.team.id),['first','second','unknown','old','conflict','missing']);
  assert.equal(teamStanding(rows,'old'),undefined);assert.equal(teamStanding(rows,'conflict'),undefined);
  assert.equal(teamStanding(rows,'second')?.points,0);assert.equal(teamStanding(rows,'missing')?.rank,null);
  assert.deepEqual(teams.map(team=>team.id),['second','first','unknown','old','conflict','missing']);
});


test('account status filters combine with club and search without treating unknown accounts as suspended',async()=>{
  const {memberAccountState}=await import('../src/management/model.ts');
  const rows=[
    {...members[0],account_status:'ACTIVE'},
    {...members[1],account_status:'ACCOUNT_SUSPENDED'},
    {...members[0],user_id:'4',account_status:'COMMUNITY_SUSPENDED'},
    {...members[0],user_id:'5',account_status:'UNKNOWN'},
  ] as Member[];
  assert.equal(memberAccountState('ACTIVE'),'active');
  assert.equal(memberAccountState('ACCOUNT_SUSPENDED'),'suspended');
  assert.equal(memberAccountState('COMMUNITY_SUSPENDED'),'suspended');
  assert.equal(memberAccountState('UNKNOWN'),'unknown');
  assert.deepEqual(filterMembers(rows,standings,'all','all','','active').map(row=>row.user_id),['1']);
  assert.deepEqual(filterMembers(rows,standings,'all','all','','suspended').map(row=>row.user_id),['2','4']);
  assert.deepEqual(filterMembers(rows,standings,'kleague','one','서울','suspended').map(row=>row.user_id),['4']);
  assert.equal(filterMembers(rows,standings,'all','all','','all').length,4);
});

test('join dates use Korean time and end with a period',async()=>{
  const {dateLabel}=await import('../src/management/model.ts');
  assert.equal(dateLabel('2026-09-17T16:00:00Z'),'2026. 09. 18.');
  assert.equal(dateLabel(null),'—');
});


test('members sort by exact join time with missing dates last and a stable order across pages',async()=>{
  const {sortMembers}=await import('../src/management/model.ts');
  const rows=[
    {...members[0],joined_at:'2026-10-17T18:00:00Z'},
    {...members[1],joined_at:'2026-10-18T04:00:00+09:00'},
    {...members[2],joined_at:'invalid'},
    {...members[0],user_id:'4',joined_at:'2026-10-18T04:00:00+09:00'},
  ] as Member[];
  assert.deepEqual(sortMembers(rows,'joined_at','desc').map(row=>row.user_id),['2','4','1','3']);
  assert.deepEqual(sortMembers(rows,'joined_at','asc').map(row=>row.user_id),['1','2','4','3']);
  assert.deepEqual(rows.map(row=>row.user_id),['1','2','3','4']);
});
