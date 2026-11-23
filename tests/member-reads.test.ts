import test from 'node:test';
import assert from 'node:assert/strict';
import {readMemberRoster,readMemberActivity} from '../src/management/member-reads.ts';

function fixture({failExclusions=false,failActivity=false,activity=[] as unknown[]}={}){
  const calls:string[]=[];
  const client={
    rpc(name:string){
      calls.push(name);
      if(name==='admin_get_user_activity')return Promise.resolve({data:failActivity?null:activity,error:failActivity?{message:'failed'}:null});
      const result={data:[{user_id:name==='admin_get_admin_user_ids'?'admin':'service'}],error:failExclusions?{message:'failed'}:null};
      return name==='admin_get_admin_user_ids'?Promise.resolve(result):{eq:async()=>result};
    },
    from(){
      const query={select(){return this;},not(){return this;},order(){return this;},limit(){return this;},gt(){return this;},then(resolve:(value:unknown)=>unknown){return Promise.resolve({data:[
        {id:'member',nickname:'팬',team_id:'seoul',team:{name:'서울'},registration_completed_at:'2026-01-01'},
        {id:'admin',nickname:'관리자'}, {id:'service',nickname:'서비스'},
      ],error:null}).then(resolve);}};
      return query;
    },
  };
  return {client:client as never,calls};
}

test('member totals are ready without waiting for activity pages and still exclude service accounts',async()=>{
  const {client,calls}=fixture();
  const roster=await readMemberRoster(client);
  assert.deepEqual(roster.map(row=>row.user_id),['member']);
  assert.equal(roster[0].team_name,'서울');
  assert.equal(roster[0].post_count,null);
  assert.ok(!calls.includes('admin_get_user_activity'));
});

test('failed exclusion reads cannot become plausible member totals',async()=>{
  await assert.rejects(readMemberRoster(fixture({failExclusions:true}).client));
});

test('activity failures remain separate from the completed roster',async()=>{
  const {client}=fixture({failActivity:true});
  assert.equal((await readMemberRoster(client)).length,1);
  await assert.rejects(readMemberActivity(client));
});

test('all member activity arrives in one call and malformed rows are rejected',async()=>{
  const row={user_id:'member',nickname:'팬',team_id:'seoul',team_name:'서울',joined_at:'2026-01-01',post_count:2,comment_count:1,attendance_count:0,received_report_count:0,recent_activity_at:null,account_status:'ACTIVE',suspended_until:null,warning_count:0};
  const {client,calls}=fixture({activity:[row,{...row,user_id:'other'}]});
  const activity=await readMemberActivity(client);
  assert.deepEqual(activity.map(item=>item.user_id),['member','other']);
  assert.deepEqual(calls,['admin_get_user_activity']);
  await assert.rejects(readMemberActivity(fixture({activity:[{nickname:'아이디 없음'}]}).client));
});
