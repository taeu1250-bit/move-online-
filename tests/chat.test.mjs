import test from 'node:test'
import assert from 'node:assert/strict'
import { testRuntime, migrateLocal } from '../scripts/local-runtime.mjs'
import { execute } from '../server/store.mjs'
import { loadOperation } from '../server/operations.mjs'
import { readChat, chatCommand } from '../server/chat.mjs'
import { conductState, executeConduct } from '../server/conduct.mjs'
import { policyVersion } from '../src/domain/feedback.ts'
import { chatPolicy as P, chatReportReasons } from '../src/domain/chat.ts'

test('ephemeral chat: D1 authorization, concurrency, erasure and reports', async t => {
  const mf = testRuntime(); t.after(() => mf.dispose())
  const db = await migrateLocal(mf), env = { MOOV_ADMIN_UIDS: '["admin"]' }, now = Date.now(), H = 3600000
  const q = (sql, ...args) => db.prepare(sql).bind(...args)
  for (const uid of ['host','a','b','other','admin']) await db.batch([
    q("INSERT INTO profiles(id,name,year,dept,levels) VALUES(?,?,2024,'학과','{}')",uid,uid),
    q('INSERT INTO policy_consents(id,userId,version,at) VALUES(?,?,?,?)',crypto.randomUUID(),uid,policyVersion,new Date().toISOString()),
  ])
  const create = async () => {
    const id = crypto.randomUUID()
    await execute(db,'host',{type:'create',id,fields:{kind:'pickup',sport:'농구',title:'채팅 검증 경기',venue:'농구장',start:new Date(now+6*H).toISOString(),endAt:new Date(now+8*H).toISOString(),capacity:8,minCapacity:2,minFormat:'3vs3',maxFormat:'4vs4',existing:1,members:[],memberIds:[],fee:0,level:'모든 레벨',description:'',info:{}}},env)
    await execute(db,'a',{type:'apply',matchId:id,note:'',members:[],memberIds:[]},env)
    const state=(await loadOperation(db,id)).state
    await execute(db,'host',{type:'review',entryId:state.requests[0].id,decision:'approve'},env)
    return id
  }
  const patch=async(id,fn)=>{const row=await loadOperation(db,id);fn(row.state);await q('UPDATE match_operations SET state=?,revision=revision+1 WHERE matchId=?',JSON.stringify(row.state),id).run()}
  const send=(uid,id,body='안녕하세요',at=now)=>chatCommand(db,uid,{type:'send',matchId:id,body,nonce:crypto.randomUUID()},env,at)
  const command=(uid,id,type,over={},at=now)=>chatCommand(db,uid,{type,matchId:id,...over},env,at)
  const read=(uid,id,after=0,at=now)=>readChat(db,uid,id,after,env,at)
  const denied=(fn,status)=>assert.rejects(fn,e=>status?e.status===status:!!e.status)
  const erased=async id=>{assert.equal((await q('SELECT count(*) n FROM chat_messages WHERE matchId=?',id).first()).n,0);const r=await q('SELECT * FROM chat_rooms WHERE matchId=?',id).first();assert.ok(r.closedAt);assert.equal(r.announcement,null)}

  await t.test('HTTP authentication and cross-origin gate',async()=>{
    const response=await mf.dispatchFetch('http://localhost/api/chat?matchId=x')
    assert.equal(response.status,401)
    assert.match(response.headers.get('Cache-Control'),/no-store/)
    const cross=await mf.dispatchFetch('http://localhost/api/chat',{method:'POST',headers:{Origin:'https://evil.invalid','Content-Type':'application/json'},body:'{}'})
    assert.equal(cross.status,403)
  })
  await t.test('host and confirmed accounts only; consent and revocation are rechecked',async()=>{
    const id=await create()
    assert.equal((await read('host',id)).canManage,true)
    assert.equal((await read('a',id)).canPost,true)
    await denied(()=>read('other',id),403)
    await denied(()=>read('admin',id),403)
    await execute(db,'b',{type:'apply',matchId:id,note:'',members:[],memberIds:[]},env)
    await denied(()=>send('b',id),403)
    await patch(id,s=>{s.people.find(p=>p.userId==='a').consent='pending'})
    await denied(()=>read('a',id),403)
    await patch(id,s=>{s.people.find(p=>p.userId==='a').consent='accepted'})
    await send('a',id,'확정 회원 메시지',now)
    await patch(id,s=>{s.people.find(p=>p.userId==='a').approved=false})
    await denied(()=>read('a',id),403)
    await denied(()=>send('a',id,'접근 불가',now+4000),403)
  })
  await t.test('send validation, idempotency, throttling and incremental reads',async()=>{
    const id=await create(), at=now+100000
    await denied(()=>send('host',id,' '.repeat(5),at),400)
    await denied(()=>send('host',id,'x'.repeat(501),at),400)
    const action={type:'send',matchId:id,body:'<script>alert(1)</script>',nonce:crypto.randomUUID()}
    await Promise.all([chatCommand(db,'host',action,env,at),chatCommand(db,'host',action,env,at)])
    const room=await read('a',id)
    assert.equal(room.messages.length,1)
    assert.equal(room.messages[0].body,action.body)
    assert.equal((await read('a',id,room.messages[0].seq)).messages.length,0)
    await denied(()=>send('host',id,'연속 전송',at+1000),409)
    const race=await Promise.allSettled([send('host',id,'하나',at+4000),send('host',id,'둘',at+4000)])
    assert.equal(race.filter(r=>r.status==='fulfilled').length,1)
    await denied(()=>command('a',id,'announce',{body:'사칭'},at),403)
    await command('host',id,'announce',{body:'농구장 입구에서 만나요'},at)
    assert.equal((await read('a',id)).announcement,'농구장 입구에서 만나요')
  })
  await t.test('recent 50 and hard room limit remain bounded under concurrent sends',async()=>{
    const id=await create();await command('host',id,'announce',{body:'공지'})
    await db.batch(Array.from({length:P.messagesPerRoom-1},(_,i)=>q('INSERT INTO chat_messages(nonce,matchId,senderId,body,at) VALUES(?,?,?,?,?)',crypto.randomUUID(),id,'host','과거 메시지 '+i,now-1000000)))
    assert.equal((await read('a',id)).messages.length,50)
    const race=await Promise.allSettled([send('a',id,'마지막 자리',now+200000),send('host',id,'동시 전송',now+200000)])
    assert.equal(race.filter(r=>r.status==='fulfilled').length,1)
    assert.equal((await q('SELECT count(*) n FROM chat_messages WHERE matchId=?',id).first()).n,500)
  })
  await t.test('room reports retain metadata only and admins need a pending report',async()=>{
    const id=await create(); await send('a',id,'DELETION-SENTINEL',now+300000)
    await denied(()=>command('other',id,'report',{reason:chatReportReasons[0]}),403)
    await command('a',id,'report',{reason:chatReportReasons[0]})
    await denied(()=>command('a',id,'report',{reason:chatReportReasons[0]}),409)
    const mod=await read('admin',id)
    assert.equal(mod.moderation,true);assert.equal(mod.canPost,false)
    await denied(()=>send('admin',id,'관리자 글'),409)
    await patch(id,s=>{s.cancelledAt=now});await erased(id)
    assert.equal((await read('admin',id)).closed,true)
    const report=await q("SELECT * FROM generalReports WHERE targetType='chat' AND targetId=?",id).first()
    assert.ok(report);assert.equal(JSON.stringify(report).includes('DELETION-SENTINEL'),false)
    const adminState=await conductState(db,'admin',env,[])
    assert.ok(adminState.reports.some(r=>r.targetType==='chat'&&r.targetId===id))
    await executeConduct(db,'admin',{type:'conductResolveReport',reportId:report.id,decision:'dismissed',reason:'원문 확인 불가'},env)
    await denied(()=>read('admin',id),403)
    assert.equal((await q('SELECT count(*) n FROM conductEvents').first()).n,0)
  })
  await t.test('manual close is removed; expiry racing a send cannot retain content',async()=>{
    const id=await create();await command('host',id,'announce',{body:'삭제될 공지'})
    await denied(()=>command('host',id,'close'),400)
    assert.equal((await read('host',id)).closed,false)
    await patch(id,s=>{s.startedAt=now})
    await send('a',id,'경기 시작 후 대화',now+H)
    await Promise.allSettled([send('a',id,'경계 전송',now+2*H),read('host',id,0,now+2*H)])
    await erased(id);assert.equal((await read('a',id)).messages.length,0)
    await denied(()=>send('host',id,'재개 금지',now+3*H),409)
  })
  await t.test('actual start plus two hours; scheduled start and early finish do not close',async()=>{
    const id=await create();await command('host',id,'announce',{body:'유지할 공지'})
    await send('a',id,'유지할 대화',now+600000)
    assert.equal((await read('host',id,0,now+10*H)).closed,false)
    await patch(id,s=>{s.startedAt=now+10*H})
    await patch(id,s=>{s.endedAt=now+11*H})
    assert.equal((await read('host',id,0,now+12*H-1)).messages.length,1)
    assert.equal((await read('host',id,0,now+12*H-1)).closesAt,now+12*H)
    assert.equal((await read('host',id,0,now+12*H)).closed,true)
    await erased(id)
  })
  await t.test('cancellation triggers erase without anyone polling, including racing sends',async()=>{
    const id=await create();await command('host',id,'announce',{body:'삭제'})
    await send('a',id,'삭제',now+600000)
    await Promise.allSettled([send('host',id,'경합',now+700000),patch(id,s=>{s.cancelledAt=now})])
    await erased(id)
    const legacy=await create();await command('host',legacy,'announce',{body:'이전 경기 취소'})
    await q('UPDATE matches SET cancelledAt=? WHERE id=?',new Date(now).toISOString(),legacy).run()
    await erased(legacy)
  })
  await t.test('delegation transfers announcement permissions; expired room is not reopened',async()=>{
    const id=await create();await command('host',id,'announce',{body:'승계'})
    await q('UPDATE matches SET hostId=? WHERE id=?','a',id).run()
    await patch(id,s=>{s.hostId='a';s.people=s.people.filter(p=>p.userId!=='host')})
    await denied(()=>command('host',id,'announce',{body:'이전 권한'}),403)
    await command('a',id,'announce',{body:'새 모집자'})
    assert.equal((await read('a',id)).canManage,true)
    await patch(id,s=>{s.startedAt=now+6*H})
    assert.equal((await read('a',id,0,now+9*H)).closed,true)
    await erased(id)
  })
})
