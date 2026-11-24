import test from 'node:test'
import assert from 'node:assert/strict'
import { testRuntime, migrateLocal } from '../scripts/local-runtime.mjs'
import { execute, saveProfile, snapshot } from '../server/store.mjs'
import { activityPage } from '../server/activity.mjs'
import { policyVersion } from '../src/domain/feedback.ts'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

test('activity windows, hosted deduplication, archive and inbox deletion on D1', async t => {
  const mf = testRuntime(); t.after(() => mf.dispose())
  const db = await migrateLocal(mf), now = Date.now(), H = 3600000
  const q = (sql,...args) => db.prepare(sql).bind(...args)
  for (const id of ['host','member','other']) {
    await saveProfile(db,id,{name:id,year:2024,dept:'학과',skillLevel:''})
    await q('INSERT INTO policy_consents VALUES(?,?,?,?)',id,id,policyVersion,new Date().toISOString()).run()
  }
  const add = async (id,start,end,status='approved',cancelled=false) => {
    await q("INSERT INTO matches(id,hostId,kind,sport,title,venue,start,endAt,capacity,existing,fee,level,description,createdAt,homeRoster,homeMemberIds,cancelledAt) VALUES(?,'host','pickup','테니스',?,'대운동장',?,?,4,1,0,'모든 레벨','',?,'[\"host\"]','[\"host\"]',?)",id,id,new Date(start).toISOString(),new Date(end).toISOString(),new Date(now).toISOString(),cancelled?new Date(now).toISOString():null).run()
    await q("INSERT INTO entries(id,matchId,userId,note,status,at,roster,memberIds,mutation) VALUES(?,?,'member','',?,?,'[\"member\"]','[]',?)",id+'e',id,status,new Date(now).toISOString(),id).run()
  }
  await add('upcoming',now+H,now+3*H,'pending')
  await add('ongoing',now-H,now+H)
  await add('recent',now-3*H,now-H)
  await add('old',now-30*H,now-25*H)
  await add('cancelled',now+H,now+3*H,'approved',true)
  await add('rejected',now+H,now+3*H,'rejected')
  await t.test('only pending/confirmed upcoming and last 24-hour completed activity',async()=>{
    const current = await activityPage(db,'member',{}, {scope:'current'})
    assert.deepEqual(new Set(current.items.map(i=>i.id)),new Set(['upcoming','ongoing','recent']))
    assert.equal((await activityPage(db,'host',{}, {tab:'joined'})).items.length,0)
    assert.equal((await activityPage(db,'other',{}, {})).items.length,0)
    const history = await activityPage(db,'member',{}, {scope:'history'})
    assert.deepEqual(new Set(history.items.map(i=>i.id)),new Set(['recent','old','cancelled','rejected']))
    const hostHistory = await activityPage(db,'host',{}, {tab:'hosted',scope:'history'})
    assert.deepEqual(new Set(hostHistory.items.map(i=>i.id)),new Set(['recent','old','cancelled']))
    assert.equal((await q('SELECT count(*) n FROM matches').first()).n,6)
    await assert.rejects(()=>activityPage(db,'member',{}, {scope:'other'}),e=>e.status===400)
  })
  await t.test('inbox clearing is owner-only, idempotent, and cannot resurrect delivery IDs',async()=>{
    for(const id of ['host','member']) await q('INSERT INTO notices(id,recipient,matchId,text,at) VALUES(?,?,?,?,?)',id+'notice',id,'recent','알림 원문',new Date(now).toISOString()).run()
    await Promise.all([execute(db,'member',{type:'clearNotices',recipient:'host'},{}),execute(db,'member',{type:'clearNotices'}, {})])
    assert.equal((await snapshot(db,'member',{})).notices.length,0)
    assert.equal((await snapshot(db,'host',{})).notices.length,1)
    const tombstone=await q("SELECT * FROM notices WHERE id='membernotice'").first()
    assert.equal(tombstone.text,'');assert.ok(tombstone.dismissedAt)
    await q("INSERT OR IGNORE INTO notices(id,recipient,matchId,text,at) VALUES('membernotice','member','recent','재발송','2026-01-01')").run()
    assert.equal((await snapshot(db,'member',{})).notices.length,0)
    await q("INSERT INTO notices(id,recipient,matchId,text,at) VALUES('newnotice','member','recent','새 알림','2026-01-02')").run()
    assert.equal((await snapshot(db,'member',{})).notices.length,1)
    assert.equal((await q('SELECT count(*) n FROM matches').first()).n,6)
    assert.equal((await q('SELECT count(*) n FROM entries').first()).n,6)
  })
})

test('PWA navigation loads fresh HTML, keeps an offline fallback, and bypasses API caching',async()=>{
  const events={}, storage=new Map([['./',new Response('<html>old</html>',{headers:{'Content-Type':'text/html','Content-Security-Policy':"frame-ancestors 'self'"}})]])
  let offline=false, fetches=0
  const cache={match:async k=>storage.get(k)?.clone(),put:async(k,v)=>storage.set(k,v),addAll:async()=>{}}
  const self={registration:{scope:'https://moov.test/'},addEventListener:(type,fn)=>events[type]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}}
  vm.runInNewContext(await readFile('.client-build/sw.js','utf8'),{self,clients:self.clients,caches:{open:async()=>cache,keys:async()=>[],delete:async()=>true},URL,Set,Promise,AbortController,setTimeout,clearTimeout,fetch:async()=>{
    fetches++;if(offline)throw Error('offline');return new Response('<html>new</html>',{headers:{'Content-Type':'text/html','Content-Security-Policy':"frame-ancestors 'self'"}})
  }})
  let result
  const event=url=>({request:{method:'GET',url,mode:'navigate'},respondWith:p=>{result=p}})
  events.fetch(event('https://moov.test/'));assert.equal(await (await result).text(),'<html>new</html>')
  offline=true;events.fetch(event('https://moov.test/'));assert.equal(await (await result).text(),'<html>new</html>')
  assert.equal((await result).headers.get('Content-Security-Policy'),"frame-ancestors 'self'")
  result=null;events.fetch(event('https://moov.test/api/state'));assert.equal(result,null);assert.equal(fetches,2)
})
