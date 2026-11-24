import test from 'node:test'
import assert from 'node:assert/strict'
import { shiftEndInput, fromKoreanInput } from '../src/domain/schedule.ts'
import { automaticEndAt } from '../src/domain/operations.ts'
import { matchInfoTags, validEndAt, policyVersion } from '../src/domain/feedback.ts'
import { participantPreview } from '../src/domain/participants.ts'
import { createLivePoll } from '../src/data/live.ts'
import { advance, loadOperation, runLifecycle } from '../server/operations.mjs'
import { execute, saveProfile, snapshot } from '../server/store.mjs'
import { testRuntime, migrateLocal } from '../scripts/local-runtime.mjs'
const H=3600000

test('changing start retains duration across day/month/midnight and rejects accidental 31.5 hours',()=>{
  assert.equal(shiftEndInput('2026-11-24T18:00','2026-11-23T12:30','2026-11-24T20:00'),'2026-11-23T14:30')
  assert.equal(shiftEndInput('2026-11-23T18:00','2026-11-30T23:30','2026-11-23T20:30'),'2026-12-01T02:00')
  assert.equal(shiftEndInput('2026-11-23T12:30','2026-11-23T13:00','2026-11-24T20:00'),'2026-11-23T15:00')
  assert.equal(fromKoreanInput(''),'')
  const start=fromKoreanInput('2026-11-23T12:30'),end=fromKoreanInput('2026-11-24T20:00')
  assert.equal(validEndAt(start,end),false)
  assert.equal(validEndAt(start,new Date(Date.parse(start)+3*H).toISOString()),true)
  const tags=matchInfoTags({sport:'테니스',kind:'pickup',level:'',start,endAt:end,capacity:6})
  assert.ok(tags.includes('최대 3시간'));assert.ok(!tags.includes('31시간 30분'))
})

test('actual-start three-hour deadline, earlier planned finish, exact boundary, late read and replay',()=>{
  const start=1800000000000
  const base=()=>({startedAt:start,start:start-H,end:start+31.5*H,endedAt:null,cancelledAt:null,people:[],min:2,requests:[],hostId:'h',outbox:[]})
  const s=base();advance(s,start+3*H-1);assert.equal(s.endedAt,null)
  advance(s,start+3*H);assert.equal(s.endedAt,start+3*H)
  const notices=s.outbox.length;advance(s,start+12*H);assert.equal(s.endedAt,start+3*H);assert.equal(s.outbox.length,notices)
  const late=base();advance(late,start+12*H);assert.equal(late.endedAt,start+3*H)
  assert.equal(automaticEndAt(start,start+2*H),start+2*H)
  assert.equal(automaticEndAt(start,NaN),start+3*H)
  const cancelled=base();cancelled.cancelledAt=start;advance(cancelled,start+12*H);assert.equal(cancelled.endedAt,null)
})

function fakeClock(){let n=0;const timers=new Map();return {timers,set(fn,ms){timers.set(++n,{fn,ms});return n},clear(id){timers.delete(id)},async fire(){assert.equal(timers.size,1);const[id,item]=[...timers][0];timers.delete(id);item.fn();await new Promise(r=>setImmediate(r));return item.ms}}}
test('live updates retry failures, back off when idle, pause, resume and do not overlap requests',async()=>{
  const clock=fakeClock();let calls=0,release
  const poll=createLivePoll(async()=>{calls++;if(calls===1)throw Error('offline');if(calls===2)return false;if(calls===3)await new Promise(r=>release=r)},3000,clock)
  poll.resume();await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.equal([...clock.timers.values()][0].ms,6000)
  await clock.fire();assert.equal(calls,2);assert.equal([...clock.timers.values()][0].ms,6000)
  await clock.fire();assert.equal(calls,3)
  poll.refresh();poll.refresh();assert.equal(calls,3)
  release();await new Promise(r=>setImmediate(r));assert.equal(clock.timers.size,1);assert.equal([...clock.timers.values()][0].ms,0)
  await clock.fire();assert.equal(calls,4)
  poll.pause();assert.equal(clock.timers.size,0);await poll.refresh();assert.equal(calls,4)
  poll.resume();await new Promise(r=>setImmediate(r));assert.equal(calls,5)
  poll.dispose();assert.equal(clock.timers.size,0)
})

test('delegated host counted once and three-hour finish persists atomically without deleting records',async t=>{
  const mf=testRuntime();t.after(()=>mf.dispose());const db=await migrateLocal(mf)
  const q=(s,...a)=>db.prepare(s).bind(...a),env={}
  for(const id of ['old','new','member']){await saveProfile(db,id,{name:id,year:2024,dept:'학과',skillLevel:''});await q('INSERT INTO policy_consents VALUES(?,?,?,?)',id,id,policyVersion,new Date().toISOString()).run()}
  const fields={kind:'pickup',sport:'테니스',title:'위임 시간 검증',venue:'대운동장',start:new Date(Date.now()+6*H).toISOString(),endAt:new Date(Date.now()+8*H).toISOString(),capacity:6,minCapacity:2,minFormat:'',maxFormat:'',existing:1,members:[],memberIds:[],fee:0,level:'',description:'',info:{}}
  await assert.rejects(()=>execute(db,'old',{type:'create',id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',fields:{...fields,endAt:new Date(Date.parse(fields.start)+31.5*H).toISOString()}},env),e=>e.status===400)
  await execute(db,'old',{type:'create',id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',fields},env)
  for(const actor of ['new','member']){await execute(db,actor,{type:'apply',matchId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',note:'',members:[],memberIds:[]},env);const op=(await loadOperation(db,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).state;await execute(db,'old',{type:'review',entryId:op.requests.find(r=>r.ownerId===actor).id,decision:'approve'},env)}
  await execute(db,'old',{type:'ops.leave',matchId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'},env)
  await execute(db,'new',{type:'ops.delegate',matchId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',accept:true},env)
  const data=await snapshot(db,'new',env,['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']),m=data.matches[0]
  assert.equal(m.hostId,'new');assert.equal(m.operations.count,2)
  assert.deepEqual(participantPreview(data,m).people.map(p=>p.id).sort(),['member','new'])
  const privateData=await snapshot(db,'old',env,['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']);const privatePreview=participantPreview(privateData,privateData.matches[0]);assert.deepEqual(privatePreview.people.map(p=>p.id),['new']);assert.equal(privatePreview.hidden,1)
  const row=await loadOperation(db,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),s=row.state,now=Date.now()
  s.start=now-12.5*H;s.startedAt=now-12*H;s.end=s.start+31.5*H
  await q('UPDATE match_operations SET state=? WHERE matchId=?',JSON.stringify(s),'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa').run()
  const originalPeople=JSON.stringify(s.people),originalEnd=s.end
  const audit=(await q('SELECT count(*) n FROM operation_audit').first()).n
  await Promise.all([runLifecycle(db,now,['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']),runLifecycle(db,now,['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'])])
  const done=(await loadOperation(db,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).state
  assert.equal(done.endedAt,s.startedAt+3*H);assert.equal(done.end,originalEnd);assert.equal(JSON.stringify(done.people),originalPeople)
  assert.equal((await q('SELECT count(*) n FROM operation_audit').first()).n,audit+1)
  assert.equal((await q('SELECT count(*) n FROM attendance').first()).n,0)
  assert.equal((await q('SELECT count(*) n FROM matches').first()).n,1)
  assert.equal((await q('SELECT count(*) n FROM entries').first()).n,2)
  const notices=(await q('SELECT count(*) n FROM notices').first()).n
  await runLifecycle(db,now+H,['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']);assert.equal((await q('SELECT count(*) n FROM notices').first()).n,notices)
})
