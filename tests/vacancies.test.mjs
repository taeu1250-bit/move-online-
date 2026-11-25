import assert from 'node:assert/strict'
import test from 'node:test'
import { migrateLocal, testRuntime } from '../scripts/local-runtime.mjs'
import { execute, snapshot } from '../server/store.mjs'
import { loadOperation } from '../server/operations.mjs'
import { policyVersion } from '../src/domain/feedback.ts'

test('vacancy alerts use the match transaction on temporary D1', async (t) => {
  const runtime = testRuntime()
  t.after(() => runtime.dispose())
  const db = await migrateLocal(runtime)
  const q = (sql, ...args) => db.prepare(sql).bind(...args)
  const env = {}
  for (const user of ['host', 'a', 'b', 'watcher', 'unsubscribed', 'pending']) {
    await db.batch([
      q("INSERT INTO profiles(id,name,year,dept,levels) VALUES(?,?,2024,'학과','{}')", user, user),
      q('INSERT INTO policy_consents(id,userId,version,at) VALUES(?,?,?,?)',
        crypto.randomUUID(), user, policyVersion, new Date().toISOString()),
    ])
  }
  const act = (user, command) => execute(db, user, command, env)
  const subscribe = (user, matchId) => act(user, { type: 'vacancySubscribe', matchId })
  const unsubscribe = (user, matchId) => act(user, { type: 'vacancyUnsubscribe', matchId })
  const alerts = (user, matchId) => q(
    "SELECT id,matchId FROM notices WHERE recipient=? AND matchId=? AND id LIKE 'vacancy:%'", user, matchId,
  ).all().then(result => result.results)
  const view = async (user, matchId) =>
    (await snapshot(db, user, env, [matchId])).matches[0].vacancyAlert
  const reject = (promise) => assert.rejects(promise, { status: 409 })
  const create = async (capacity = 2) => {
    const id = crypto.randomUUID()
    const time = Date.now() + 6 * 3600000
    await act('host', { type: 'create', id, fields: {
      kind: 'pickup', sport: '농구', title: '빈자리 검증', venue: '농구장',
      start: new Date(time).toISOString(), endAt: new Date(time + 7200000).toISOString(),
      capacity, minCapacity: 2, minFormat: '3vs3', maxFormat: '5vs5', existing: 1,
      members: [], memberIds: [], fee: 0, level: '모든 레벨', description: '',
    } })
    return id
  }
  async function apply(user, matchId, approve = true) {
    await act(user, { type: 'apply', matchId, note: '' })
    const entryId = (await loadOperation(db, matchId)).state.requests.findLast(r => r.ownerId === user).id
    if (approve) await act('host', { type: 'review', entryId, decision: 'approve' })
    return entryId
  }
  const leave = (user, matchId) => act(user, { type: 'ops.leave', matchId })

  await t.test('registers once, supports removal and delivers once per full-to-open transition', async () => {
    const matchId = await create(3)
    await reject(subscribe('watcher', matchId))
    await apply('pending', matchId, false)
    const aEntry = await apply('a', matchId)
    await apply('b', matchId)
    await reject(subscribe('host', matchId))
    await reject(subscribe('pending', matchId))
    await reject(subscribe('a', matchId))
    assert.deepEqual(await view('watcher', matchId), { canSubscribe: true, subscribed: false })
    await Promise.all([subscribe('watcher', matchId), subscribe('watcher', matchId)])
    await subscribe('unsubscribed', matchId)
    await unsubscribe('unsubscribed', matchId)
    await unsubscribe('pending', matchId)
    assert.equal(await view('watcher', matchId).then(v => v.subscribed), true)

    await leave('pending', matchId)
    assert.equal((await alerts('watcher', matchId)).length, 0)
    const cancel = { type: 'review', entryId: aEntry, decision: 'cancel' }
    const results = await Promise.allSettled([act('a', cancel), act('a', cancel)])
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
    assert.equal((await alerts('watcher', matchId)).length, 1)
    assert.equal((await alerts('unsubscribed', matchId)).length, 0)
    const inbox = await snapshot(db, 'watcher', env)
    const [notice] = inbox.notices.filter(n => n.id.startsWith('vacancy:'))
    assert.equal(notice.matchId, matchId)
    assert.match(notice.text, /빈자리가 생겼어요/)
    assert.deepEqual(await view('watcher', matchId), { canSubscribe: false, subscribed: false })

    await apply('a', matchId)
    await subscribe('watcher', matchId)
    await leave('b', matchId)
    assert.equal((await alerts('watcher', matchId)).length, 2)
  })

  await t.test('skips active applicants at delivery and skips whole-match cancellation', async () => {
    const matchId = await create(3)
    await apply('a', matchId)
    await act('host', { type: 'ops.close', matchId, closed: true })
    await subscribe('watcher', matchId)
    await act('host', { type: 'ops.close', matchId, closed: false })
    await apply('watcher', matchId, false)
    await apply('b', matchId)
    await subscribe('unsubscribed', matchId)
    await leave('a', matchId)
    assert.equal((await alerts('watcher', matchId)).length, 0)
    assert.equal((await alerts('unsubscribed', matchId)).length, 1)
    await apply('a', matchId)
    await subscribe('unsubscribed', matchId)
    await act('host', { type: 'ops.cancel', matchId, reason: '우천 및 기상악화' })
    assert.equal((await alerts('unsubscribed', matchId)).length, 1)
    await reject(subscribe('pending', matchId))
  })

  await t.test('excludes started and ended matches and friendly recruitment', async () => {
    const matchId = await create()
    await apply('a', matchId)
    await subscribe('watcher', matchId)
    const endedAt = Date.now()
    await q(`UPDATE match_operations SET state=json_set(state,'$.startedAt',?,'$.endedAt',?)
      WHERE matchId=?`, endedAt - 1000, endedAt, matchId).run()
    await reject(leave('a', matchId))
    await reject(subscribe('pending', matchId))
    assert.equal((await alerts('watcher', matchId)).length, 0)
    await db.batch([
      q(`UPDATE match_operations SET state=json_set(state,'$.startedAt',NULL,'$.endedAt',NULL)
        WHERE matchId=?`, matchId),
      q("UPDATE matches SET kind='friendly' WHERE id=?", matchId),
    ])
    await reject(subscribe('pending', matchId))
  })

  await t.test('legacy cancellation only delivers when an approved roster frees a seat', async () => {
    const matchId = crypto.randomUUID()
    const at = new Date().toISOString()
    const start = new Date(Date.now() + 21600000).toISOString()
    await db.batch([
      q(`INSERT INTO matches(id,hostId,kind,sport,title,venue,start,capacity,existing,fee,level,description,createdAt,homeRoster)
        VALUES(?,'host','pickup','농구','기존 경기','농구장',?,2,1,0,'모든 레벨','',?,'["host"]')`, matchId, start, at),
      ...[['a', 'approved'], ['pending', 'pending']].map(([user, status]) => q(
        'INSERT INTO entries(id,matchId,userId,note,status,at,roster,mutation) VALUES(?,?,?,?,?,?,?,?)',
        matchId + user, matchId, user, '', status, at, JSON.stringify([user]), crypto.randomUUID(),
      )),
    ])
    await subscribe('watcher', matchId)
    await act('pending', { type: 'review', entryId: matchId + 'pending', decision: 'cancel' })
    assert.equal((await alerts('watcher', matchId)).length, 0)
    await reject(act('a', { type: 'review', entryId: matchId + 'a', decision: 'cancel', revision: 99 }))
    assert.equal((await alerts('watcher', matchId)).length, 0)
    await act('a', { type: 'review', entryId: matchId + 'a', decision: 'cancel' })
    assert.equal((await alerts('watcher', matchId)).length, 1)
  })
})
