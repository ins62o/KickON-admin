type Row=Record<string,unknown>;
const finished=new Set(['FT','AET','FT_PEN','FINISHED']);

// Post-match repair must not race the live writer or rewrite future fixtures.
export function selectPostMatchRows(rows:Row[],snapshots:Row[],now=Date.now()):Row[]{
 const due=snapshots.filter(row=>row.status==='FINISHED'&&row.post_match_synced_at===null&&Number.isFinite(Date.parse(String(row.post_match_sync_due_at)))&&Date.parse(String(row.post_match_sync_due_at))<=now);
 if(!due.length)throw Error('CRON46_RETRY:NO_DUE_FINISHED_FIXTURES');
 const byId=new Map(rows.map(row=>[row.id,row]));
 if(byId.size!==rows.length)throw Error('CRON46_BLOCKED:DUPLICATE_SNAPSHOT');
 return due.map(expected=>{
  const row=byId.get(expected.id);
  if(!row||!finished.has(String(row._historyProviderState).trim().toUpperCase())||row.status!=='FINISHED')throw Error('CRON46_RETRY:PROVIDER_FINISHED_REQUIRED');
  if(['id','sportmonks_id','league_id','home_team_id','away_team_id'].some(key=>row[key]!==expected[key]))throw Error('CRON46_BLOCKED:IDENTITY_REVIEW_REQUIRED');
  if(expected.provider_status==='LIVE')throw Error('CRON46_RETRY:LIVE_WRITER_NOT_FINISHED');
  if([row.home_score,row.away_score].some(score=>!Number.isSafeInteger(score)||Number(score)<0))throw Error('CRON46_BLOCKED:INVALID_RESULT');
  return row;
 });
}
