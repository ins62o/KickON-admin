import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import type {SystemSample} from '../src/management/system-health.ts';
import type {RestartStatus} from '../src/management/system-health.ts';
export type RestartRecord={id:string;project:string;actor:string;environment:string;requestedAt:number;status:RestartStatus};
type RestartReservation={kind:'new'|'existing'|'cooldown';record:RestartRecord}|{kind:'conflict'};
import {restartCooldownMs} from './restart-policy.ts';
export {restartCooldownMs} from './restart-policy.ts';

export type SystemHistoryStore={
 append:(project:string,sample:SystemSample)=>void;
 read:(project:string,from:number,to:number)=>SystemSample[];
 reserveRestart:(project:string,actor:string,environment:string,id:string)=>RestartReservation;
 finishRestart:(id:string,status:RestartStatus)=>void;
 latestRestart:(project:string)=>RestartRecord|null;
 close:()=>void;
};
export function createSystemHistoryStore(path:string,now:()=>number=Date.now):SystemHistoryStore{
 let database:DatabaseSync|undefined;
 const open=()=>{
  if(database)return database;
  mkdirSync(dirname(path),{recursive:true,mode:0o700});
  const db=new DatabaseSync(path,{timeout:3000});
  try{
   chmodSync(path,0o600);
   db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS resource_samples (
     project TEXT NOT NULL, minute INTEGER NOT NULL, observed_at INTEGER NOT NULL,
     sample TEXT NOT NULL CHECK(json_valid(sample)), PRIMARY KEY(project,minute)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS resource_samples_time ON resource_samples(project,observed_at);
    CREATE TABLE IF NOT EXISTS project_restart_requests (
     id TEXT PRIMARY KEY, project TEXT NOT NULL, actor TEXT NOT NULL, environment TEXT NOT NULL,
     requested_at INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','accepted','unknown','failed')),
     updated_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS project_restart_requests_time ON project_restart_requests(project,requested_at DESC);`);
   database=db;return db;
  }catch(error){db.close();throw error;}
 };
 const record=(row:Record<string,unknown>|undefined):RestartRecord|null=>row?{id:String(row.id),project:String(row.project),actor:String(row.actor),environment:String(row.environment),requestedAt:Number(row.requested_at),status:String(row.status) as RestartStatus}:null;
 return {
  append(project,sample){
   const at=Date.parse(sample.observedAt);
   if(!Number.isFinite(at))throw Error('Invalid sample time');
   const db=open();db.exec('BEGIN IMMEDIATE');
   try{
    db.prepare(`INSERT INTO resource_samples(project,minute,observed_at,sample) VALUES(?,?,?,?)
     ON CONFLICT(project,minute) DO UPDATE SET observed_at=excluded.observed_at,sample=excluded.sample
     WHERE excluded.observed_at>resource_samples.observed_at`).run(project,Math.floor(at/60000),at,JSON.stringify(sample));
    // Keep an extra day so the oldest point in the seven-day view has averaging context.
    db.prepare('DELETE FROM resource_samples WHERE observed_at<?').run(now()-8*86400000);
    db.exec('COMMIT');
   }catch(error){db.exec('ROLLBACK');throw error;}
  },
  read(project,from,to){
   return open().prepare('SELECT observed_at,sample FROM resource_samples WHERE project=? AND observed_at>=? AND observed_at<=? ORDER BY observed_at').all(project,from,to).map(row=>{
    const sample=JSON.parse(String(row.sample)) as SystemSample;
    if(!sample||Date.parse(sample.observedAt)!==row.observed_at||!['healthy','warning','critical','unknown','unreachable'].includes(sample.status))throw Error('Invalid stored sample');
    return sample;
   });
  },
  reserveRestart(project,actor,environment,id){
   const db=open();db.exec('BEGIN IMMEDIATE');
   try{
    const existing=record(db.prepare('SELECT * FROM project_restart_requests WHERE id=?').get(id));
    if(existing){db.exec('COMMIT');return existing.project===project&&existing.actor===actor&&existing.environment===environment?{kind:'existing',record:existing}:{kind:'conflict'};}
    const recent=record(db.prepare("SELECT * FROM project_restart_requests WHERE project=? AND requested_at>? AND status!='failed' ORDER BY requested_at DESC LIMIT 1").get(project,now()-restartCooldownMs));
    if(recent){db.exec('COMMIT');return {kind:'cooldown',record:recent};}
    const at=now();db.prepare("INSERT INTO project_restart_requests VALUES(?,?,?,?,?,'pending',?)").run(id,project,actor,environment,at,at);
    db.exec('COMMIT');return {kind:'new',record:{id,project,actor,environment,requestedAt:at,status:'pending'}};
   }catch(error){db.exec('ROLLBACK');throw error;}
  },
  finishRestart(id,status){open().prepare('UPDATE project_restart_requests SET status=?,updated_at=? WHERE id=?').run(status,now(),id);},
  latestRestart(project){return record(open().prepare("SELECT * FROM project_restart_requests WHERE project=? AND status!='failed' ORDER BY requested_at DESC LIMIT 1").get(project));},
  close(){database?.close();database=undefined;},
 };
}
