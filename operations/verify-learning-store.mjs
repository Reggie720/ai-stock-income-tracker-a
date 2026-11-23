import {PGlite} from '../../sql-test-runtime/node_modules/@electric-sql/pglite/dist/index.js';
import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');await db.exec(await fs.readFile(new URL('./learning-lab.sql',import.meta.url),'utf8'));
const row=(await db.query('select version,data from public.stock_tracker_learning_lab')).rows[0];assert.equal(row.version,0);
await db.exec('set role service_role');let updated=await db.query('select public.stock_tracker_learning_cas($1,$2) as ok',[0,{...row.data,status:'Checked'}]);assert.equal(updated.rows[0].ok,true);assert.equal((await db.query('select public.stock_tracker_learning_cas($1,$2) as ok',[0,row.data])).rows[0].ok,false);await db.exec('reset role');
await assert.rejects(db.exec('update public.stock_tracker_learning_lab set version=0'));
await db.exec('set role anon');await assert.rejects(db.query('select * from public.stock_tracker_learning_lab'));await assert.rejects(db.query('select public.stock_tracker_learning_cas($1,$2)',[1,row.data]));await db.exec('reset role');
assert.equal((await db.query('select version from public.stock_tracker_learning_lab')).rows[0].version,1);console.log('PASS private research table, service-only CAS, version rollback guard and anonymous denial');await db.close();
