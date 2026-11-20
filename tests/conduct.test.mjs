import test from 'node:test'
import assert from 'node:assert/strict'
import { testRuntime, migrateLocal } from '../scripts/local-runtime.mjs'
import {
  conductState,
  executeConduct,
  settleNoShows,
  restrictionUntilSQL,
} from '../server/conduct.mjs'
import { praiseOptions } from '../src/domain/conduct.ts'

test('post-match attendance, private reports, appeals and rolling sanctions on D1', async (t) => {
  const runtime = testRuntime()
  t.after(() => runtime.dispose())
  const db = await migrateLocal(runtime)
  const env = { MOOV_ADMIN_UIDS: '["mod"]' },
    hour = 3600000,
    day = 24 * hour
  const q = (sql, ...args) => db.prepare(sql).bind(...args)
  const act = (actor, c) => executeConduct(db, actor, c, env)
  const state = (actor) => conductState(db, actor, env, ['host', 'member'])
  const expectDenied = async (promise, status) =>
    assert.rejects(promise, (e) => e.status === status)
  await db.batch(
    ['mod', 'host', 'rep', 'member', 'outsider'].map((id) =>
      q(
        "INSERT INTO profiles(id,name,year,dept,skillLevel) VALUES(?,?,2025,'학과','')",
        id,
        id,
      ),
    ),
  )
  const create = async (id, offset = -hour, cancelled = false) => {
    const end = new Date(Date.now() + offset).toISOString(),
      start = new Date(Date.parse(end) - hour).toISOString()
    await db.batch([
      q(
        `INSERT INTO matches(id,hostId,kind,sport,title,venue,start,endAt,capacity,existing,fee,level,description,createdAt,homeRoster,cancelledAt)
        VALUES(?,'host','pickup','풋살',?,'대운동장',?,?,10,1,0,'모든 레벨','',?,'["모집자"]',?)`,
        id,
        id,
        start,
        end,
        start,
        cancelled ? start : null,
      ),
      q(
        `INSERT INTO entries(id,matchId,userId,roster,memberIds,note,status,at,mutation)
        VALUES(?,?,'rep','["대표","이름입력","초대수락"]','["rep",null,"member"]','','approved',?,'test')`,
        'e' + id,
        id,
        start,
      ),
      q(
        `INSERT INTO entries(id,matchId,userId,roster,note,status,at,mutation)
        VALUES(?,?,'outsider','["대기자"]','','pending',?,'test')`,
        'p' + id,
        id,
        start,
      ),
    ])
  }
  const mark = (actor, matchId, personKey, status = 'present') =>
    act(actor, { type: 'conductAttendance', matchId, personKey, status })
  const absent = (actor, matchId, personKey, acknowledged = true) =>
    act(actor, { type: 'conductNoShow', matchId, personKey, acknowledged })
  const praise = (actor, matchId, targetId) =>
    act(actor, {
      type: 'conductPraise',
      matchId,
      targetId,
      reason: praiseOptions[0],
    })
  const appeal = (actor, caseId) =>
    act(actor, { type: 'conductAppeal', caseId, message: '참가했어요.' })
  const decide = (actor, caseId, decision) =>
    act(actor, {
      type: 'conductDecide',
      caseId,
      decision,
      reason: '운영자가 출석을 다시 확인했습니다.',
    })
  const cid = async (matchId, personKey) =>
    (
      await q(
        'SELECT id FROM noShows WHERE matchId=? AND personKey=?',
        matchId,
        personKey,
      ).first()
    ).id
  await create('one')
  await create('future', hour)
  await create('cancel', -hour, true)
  await t.test(
    'only host can confirm approved people after end; registered members and guests remain separate',
    async () => {
      assert.equal((await state('member')).scores.member.temperature, 36.5)
      assert.deepEqual((await state('outsider')).rooms, [])
      await expectDenied(mark('member', 'one', 'u:member'), 403)
      await expectDenied(mark('host', 'one', 'u:outsider'), 403)
      await expectDenied(mark('host', 'future', 'u:member'), 403)
      await expectDenied(mark('host', 'cancel', 'u:member'), 403)
      const concurrent = await Promise.allSettled([
        mark('host', 'one', 'u:member'),
        mark('host', 'one', 'u:member'),
      ])
      assert.deepEqual(concurrent.map((x) => x.status).sort(), [
        'fulfilled',
        'rejected',
      ])
      assert.equal((await state('member')).scores.member.temperature, 36.7)
      assert.equal((await state('member')).scores.member.completions, 1)
      await expectDenied(praise('member', 'one', 'member'), 400)
      await expectDenied(praise('member', 'one', 'host'), 409)
      await mark('host', 'one', 'u:host')
      await praise('host', 'one', 'member')
      await praise('member', 'one', 'host')
      await expectDenied(praise('host', 'one', 'member'), 409)
      await expectDenied(praise('outsider', 'one', 'member'), 409)
      const view = await state('member')
      assert.equal(view.scores.member.temperature, 36.8)
      assert.equal(view.scores.member.praises, 1)
      assert.equal(
        view.rooms[0].participants.some((p) => p.name === '이름입력'),
        false,
      )
      await q(
        'UPDATE matches SET endAt=? WHERE id=?',
        new Date(Date.now() - 25 * hour).toISOString(),
        'one',
      ).run()
      await expectDenied(praise('member', 'one', 'rep'), 409)
    },
  )
  await t.test(
    'general reports have private receipt and bounded duplicates, admin verdict has no temperature effect',
    async () => {
      const command = {
        type: 'conductReport',
        targetType: 'match',
        targetId: 'one',
        reason: '부적절한 게시물',
      }
      await act('outsider', command)
      await expectDenied(act('outsider', command), 409)
      for (const actor of ['member', 'rep', 'outsider'])
        assert.deepEqual((await state(actor)).reports, [])
      const ops = await state('mod'),
        reportId = ops.reports[0].id
      assert.equal(ops.isAdmin, true)
      assert.equal(ops.reports[0].reason, '부적절한 게시물')
      await expectDenied(
        act('host', {
          type: 'conductResolveReport',
          reportId,
          decision: 'dismissed',
          reason: '확인',
        }),
        403,
      )
      await act('mod', {
        type: 'conductResolveReport',
        reportId,
        decision: 'dismissed',
        reason: '확인',
      })
      assert.equal((await state('mod')).reports[0].state, 'dismissed')
      assert.equal((await state('member')).scores.member.temperature, 36.8)
    },
  )
  await t.test(
    'guest warning is restricted to the representative and never debits a member',
    async () => {
      const guest = 'e:eone:1'
      await expectDenied(absent('rep', 'one', guest), 403)
      await expectDenied(absent('host', 'one', guest, false), 400)
      await absent('host', 'one', guest)
      assert.equal((await state('rep')).cases[0].state, 'guest_warning')
      assert.equal((await state('rep')).scores.rep.temperature, 36.5)
      assert.equal((await state('outsider')).cases.length, 0)
      assert.equal((await state('member')).cases.length, 0)
      assert.equal(
        (
          await q(
            "SELECT count(*) n FROM notices WHERE recipient='rep'",
          ).first()
        ).n,
        1,
      )
    },
  )
  await t.test(
    'appeal blocks passive penalties; only administrator can confirm, correct and recompute restrictions',
    async () => {
      await absent('host', 'one', 'u:rep')
      const first = await cid('one', 'u:rep')
      await expectDenied(absent('host', 'one', 'u:rep'), 409)
      await expectDenied(decide('mod', first, 'confirm'), 409)
      await expectDenied(appeal('outsider', first), 409)
      await appeal('rep', first)
      await q(
        'UPDATE noShows SET deadline=? WHERE id=?',
        Date.now() - 1,
        first,
      ).run()
      await settleNoShows(db)
      assert.equal((await state('rep')).scores.rep.temperature, 36.5)
      await expectDenied(decide('host', first, 'confirm'), 403)
      await decide('mod', first, 'confirm')
      assert.equal((await state('rep')).scores.rep.temperature, 33.5)
      assert.equal((await state('rep')).restrictionUntil, null)
      await create('two')
      await create('three')
      await create('old')
      for (const match of ['two', 'three', 'old'])
        await absent('host', match, 'u:rep')
      const old = await cid('old', 'u:rep')
      await q(
        'UPDATE noShows SET deadline=? WHERE id=?',
        Date.now() - 95 * day,
        old,
      ).run()
      await settleNoShows(db)
      assert.equal((await state('rep')).restrictionUntil, null)
      await q(
        'UPDATE noShows SET deadline=? WHERE matchId=?',
        Date.now(),
        'two',
      ).run()
      await settleNoShows(db)
      let snapshot = await state('rep')
      assert.ok(
        snapshot.restrictionUntil > Date.now() + 6 * day &&
          snapshot.restrictionUntil <= Date.now() + 7 * day,
      )
      const gate = (
        await q(
          'SELECT ' + restrictionUntilSQL('?', '?') + ' AS untilMs',
          'rep',
          Date.now(),
        ).first()
      ).untilMs
      assert.equal(gate, snapshot.restrictionUntil)
      await q(
        'UPDATE noShows SET deadline=? WHERE matchId=?',
        Date.now(),
        'three',
      ).run()
      await expectDenied(appeal('rep', await cid('three', 'u:rep')), 409)
      await Promise.all([settleNoShows(db), settleNoShows(db)])
      snapshot = await state('rep')
      assert.ok(
        snapshot.restrictionUntil > Date.now() + 29 * day &&
          snapshot.restrictionUntil <= Date.now() + 30 * day,
      )
      assert.equal(snapshot.scores.rep.temperature, 24.5)
      await decide('mod', first, 'dismiss')
      assert.equal((await state('rep')).scores.rep.temperature, 27.5)
      assert.ok((await state('rep')).restrictionUntil <= Date.now() + 7 * day)
      await decide('mod', await cid('two', 'u:rep'), 'dismiss')
      assert.equal((await state('rep')).restrictionUntil, null)
      await expectDenied(decide('mod', first, 'dismiss'), 409)
    },
  )
})
