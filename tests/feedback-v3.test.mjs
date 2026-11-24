import test from 'node:test'
import assert from 'node:assert/strict'
import { testRuntime, migrateLocal } from '../scripts/local-runtime.mjs'
import { activityPage, matchDetail, matchesByDay } from '../server/activity.mjs'
import { execute, saveProfile, snapshot } from '../server/store.mjs'
import { policyVersion } from '../src/domain/feedback.ts'
import { frameAncestors } from '../server/security.mjs'

test('feedback: real D1 pagination, historical preservation, profiles and added sports', async t => {
  const mf=testRuntime()
  t.after(()=>mf.dispose())
  const db=await migrateLocal(mf), env={}
  const q=(sql,...args)=>db.prepare(sql).bind(...args)
  for(const id of ['host','member','other']) {
    await saveProfile(db,id,{name:id,year:2024,dept:'학과',skillLevel:''})
    await q('INSERT INTO policy_consents(id,userId,version,at) VALUES(?,?,?,?)',id,id,policyVersion,new Date().toISOString()).run()
  }
  const seed=[]
  for(let i=0;i<25;i++){
    const id='past-'+String(i).padStart(2,'0'), start=new Date(Date.UTC(2025,0,1+Math.floor(i/2))).toISOString()
    seed.push(id)
    await q("INSERT INTO matches(id,hostId,kind,sport,title,venue,start,endAt,capacity,existing,fee,level,description,createdAt,homeRoster) VALUES(?,?,'pickup','풋살',?,'풋살장',?,?,12,1,0,'모든 레벨','',?,?)",id,'host',id,start,new Date(Date.parse(start)+3600000).toISOString(),start,JSON.stringify(['host'])).run()
    await q("INSERT INTO entries(id,matchId,userId,note,status,at,roster,memberIds,mutation) VALUES(?,?,?,'',?,?,?,'[]',?)",id+'e',id,'member',i%2?'approved':'pending',start,JSON.stringify(['member']),id).run()
  }
  await t.test('10 + 10 + 5, ties, filters, cursor validation and per-user isolation',async()=>{
    let cursor='',all=[]
    for(const size of [10,10,5]){
      const page=await activityPage(db,'host',env,{tab:'hosted',cursor,scope:'history'})
      assert.equal(page.items.length,size);assert.equal(page.data.matches.length,size)
      assert.equal(page.data.entries.length,size)
      assert.ok(page.data.conduct.rooms.length<=10)
      all.push(...page.items.map(i=>i.id));cursor=page.nextCursor
    }
    assert.equal(cursor,null);assert.equal(new Set(all).size,25)
    const first=await activityPage(db,'member',env,{status:'pending',scope:'history'})
    assert.equal(first.items.length,10);assert.ok(first.items.every(i=>i.status==='pending'))
    const second=await activityPage(db,'member',env,{status:'pending',cursor:first.nextCursor,scope:'history'})
    assert.equal(second.items.length,3)
    assert.equal((await activityPage(db,'other',env)).items.length,0)
    await assert.rejects(()=>activityPage(db,'host',env,{cursor:'broken'}),e=>e.status===400)
    await assert.rejects(()=>activityPage(db,'host',env,{tab:'anything'}),e=>e.status===400)
    const state=await snapshot(db,'host',env)
    assert.equal(state.matches.length,0);assert.equal(state.entries.length,0);assert.equal(state.conduct.rooms.length,0)
    assert.equal(state.activityCounts.hosted,25)
    const detail=await matchDetail(db,'host',env,seed[0])
    assert.equal(detail.matches.length,1);assert.equal(detail.entries.length,1)
    const publicDetail=await matchDetail(db,'other',env,seed[0])
    assert.equal(publicDetail.entries.length,0);assert.equal(publicDetail.matches[0].homeRoster,undefined)
    assert.equal((await matchesByDay(db,'host',env,'2025-01-01')).matches.length,2)
    await assert.rejects(()=>matchesByDay(db,'host',env,'bad'),e=>e.status===400)
    assert.equal((await q('SELECT count(*) AS n FROM matches').first()).n,25)
    assert.equal((await q('SELECT count(*) AS n FROM entries').first()).n,25)
  })
  await t.test('concurrent profile saves cannot duplicate UID or overwrite another account',async()=>{
    await Promise.all(Array.from({length:5},(_,i)=>saveProfile(db,'member',{id:'host',name:'member'+i,year:2024,dept:'학과',skillLevel:''})))
    assert.equal((await q("SELECT count(*) AS n FROM profiles WHERE id='member'").first()).n,1)
    assert.equal((await q("SELECT name FROM profiles WHERE id='host'").first()).name,'host')
  })
  await t.test('added sports and custom venue round trip; unsafe URL and free-text sport rejected',async()=>{
    const fields=sport=>({kind:'pickup',sport,title:sport+' 같이 해요',venue:'원주 외부 체육관',start:new Date(Date.now()+86400000).toISOString(),endAt:new Date(Date.now()+90000000).toISOString(),capacity:4,minCapacity:2,minFormat:'',maxFormat:'',existing:1,members:[],memberIds:[],fee:0,level:'모든 레벨',description:'',info:{venueAddress:'원주시',venueMapUrl:'https://map.naver.com/',venueMeeting:'정문'}})
    for(const sport of ['탁구','테니스','수영','배드민턴']){
      const id=crypto.randomUUID()
      await execute(db,'host',{type:'create',id,fields:fields(sport)},env)
      const m=(await matchDetail(db,'host',env,id)).matches[0]
      assert.equal(m.sport,sport);assert.equal(m.venue,'원주 외부 체육관');assert.equal(m.info.venueMeeting,'정문')
      await assert.rejects(()=>execute(db,'host',{type:'create',id:crypto.randomUUID(),fields:{...fields(sport),kind:'friendly'}},env))
    }
    for(const bad of [
      {...fields('직접입력')},
      {...fields('테니스'),venue:' '},
      {...fields('테니스'),info:{venueMapUrl:'javascript:alert(1)'}},
      {...fields('테니스'),info:{venueMapUrl:'https://user:password@example.com/'}},
    ])await assert.rejects(()=>execute(db,'host',{type:'create',id:crypto.randomUUID(),fields:bad},env),e=>e.status===400)
  })
  await t.test('HTML GET/HEAD framing policy and PWA files',async()=>{
    for(const method of ['GET','HEAD']){
      const r=await mf.dispatchFetch('http://moov.test/',{method})
      assert.equal(r.status,200);assert.equal(r.headers.get('Content-Security-Policy'),frameAncestors)
    }
    assert.ok(!frameAncestors.includes('*'))
    assert.equal((await mf.dispatchFetch('http://moov.test/sw.js')).status,200)
  })
})
