import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import {URL} from 'node:url';
const {PGlite}=await import(process.env.PGLITE_MODULE_PATH||'@electric-sql/pglite');
const db=new PGlite();
await db.exec('create role anon;create role authenticated;create role service_role;create schema storage;create table storage.objects(metadata jsonb);');
await db.exec(await fs.readFile(new URL('../../supabase/migrations/202610200007_admin_file_storage_size.sql',import.meta.url),'utf8'));
for(const role of ['anon','authenticated']){
 await db.exec(`set role ${role}`);await assert.rejects(db.query('select public.admin_file_storage_size()'),/permission denied/);await db.exec('reset role');
}
const read=async()=>{await db.exec('set role service_role');const result=(await db.query('select public.admin_file_storage_size() as size')).rows[0].size;await db.exec('reset role');return result;};
assert.deepEqual(await read(),{bytes:0});
await db.exec(`insert into storage.objects values ('{"size":12}'),('{"size":"30"}')`);assert.deepEqual(await read(),{bytes:42});
for(const value of [{},null,{size:null},{size:-1},{size:'unknown'},{size:1.5},{size:true},{size:9007199254740992}]){
 await db.query('insert into storage.objects values ($1)',[value]);assert.deepEqual(await read(),{bytes:null});await db.exec('truncate storage.objects');
}
await db.exec('set role service_role');await assert.rejects(db.query('select metadata from storage.objects'),/permission denied/);
await db.close();console.log('PASS file storage size SQL: aggregate-only service access, real empty zero, complete sizes, null for missing/invalid/unsafe sizes');
