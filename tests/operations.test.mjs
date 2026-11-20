import test from 'node:test'
import assert from 'node:assert/strict'
import { testRuntime, migrateLocal } from '../scripts/local-runtime.mjs'
import { execute, snapshot } from '../server/store.mjs'
import {
  loadOperation,
  runLifecycle,
  advance,
  confirmedPeople,
} from '../server/operations.mjs'
import { teamCommand, teamState } from '../server/teams.mjs'
import { executeConduct, conductState } from '../server/conduct.mjs'
import { reportCommand, reportState } from '../server/reports-v2.mjs'
import { inviteLink } from '../server/invite-links.mjs'
import { policyVersion } from '../src/domain/feedback.ts'
import { praiseOptions } from '../src/domain/conduct.ts'
const H = 3600000
test('v2 registered participation, lifecycle, atomic decisions and moderation on D1', async (t) => {
  const mf = testRuntime()
  t.after(() => mf.dispose())
  const db = await migrateLocal(mf)
  const q = (sql, ...a) => db.prepare(sql).bind(...a),
    env = { MOOV_ADMIN_UIDS: '["admin"]' }
  const users = [
    'host',
    'a',
    'b',
    'c',
    'd',
    'e',
    'other',
    'admin',
    'invite1',
    'invite2',
  ]
  for (const u of users)
    await db.batch([
      q(
        "INSERT INTO profiles(id,name,year,dept,levels) VALUES(?,?,2024,'학과','{}')",
        u,
        u,
      ),
      q(
        'INSERT INTO policy_consents(id,userId,version,at) VALUES(?,?,?,?)',
        crypto.randomUUID(),
        u,
        policyVersion,
        new Date().toISOString(),
      ),
    ])
  const act = (u, c) => execute(db, u, c, env),
    state = (u) => snapshot(db, u, env),
    op = async (id) => (await loadOperation(db, id)).state
  const reject = async (fn, code) =>
    assert.rejects(fn, (e) => (code ? e.status === code : !!e.status))
  const fields = (over = {}) => ({
    kind: 'pickup',
    sport: '농구',
    title: '검증 경기',
    venue: '농구장',
    start: new Date(Date.now() + 6 * H).toISOString(),
    endAt: new Date(Date.now() + 8 * H).toISOString(),
    capacity: 8,
    minCapacity: 2,
    minFormat: '3vs3',
    maxFormat: '5vs5',
    existing: 1,
    members: [],
    memberIds: [],
    info: {},
    fee: 0,
    level: '모든 레벨',
    description: '',
    ...over,
  })
  const create = async (over = {}) => {
    const id = crypto.randomUUID()
    await act('host', { type: 'create', id, fields: fields(over) })
    return id
  }
  const apply = async (u, m, ids = []) => {
    await act(u, {
      type: 'apply',
      matchId: m,
      note: '',
      members: ids,
      memberIds: ids,
    })
    return (await op(m)).requests.filter((r) => r.ownerId === u).at(-1).id
  }
  const approve = (m, e) =>
    act('host', { type: 'review', entryId: e, decision: 'approve' })
  const patch = async (id, fn) => {
    const row = await loadOperation(db, id)
    fn(row.state)
    await db.batch([
      q(
        'UPDATE match_operations SET state=?,revision=revision+1 WHERE matchId=?',
        JSON.stringify(row.state),
        id,
      ),
      q(
        'UPDATE matches SET start=?,endAt=? WHERE id=?',
        new Date(row.state.start).toISOString(),
        new Date(row.state.end).toISOString(),
        id,
      ),
    ])
  }
  const team = async (owner, name, members = []) => {
    const id = crypto.randomUUID()
    await teamCommand(
      db,
      owner,
      {
        type: 'team.create',
        id,
        fields: { name, sport: '농구', affiliation: '', bio: '' },
        guests: [],
      },
      {},
    )
    for (const userId of members) {
      await teamCommand(
        db,
        owner,
        { type: 'team.inviteMember', teamId: id, userId },
        {},
      )
      const invitation = (await teamState(db, userId)).memberships.find(
        (m) => m.teamId === id,
      )
      await reject(
        () =>
          teamCommand(
            db,
            'other',
            { type: 'team.reply', memberId: invitation.id, accept: true },
            {},
          ),
        409,
      )
      await teamCommand(
        db,
        userId,
        { type: 'team.reply', memberId: invitation.id, accept: true },
        {},
      )
    }
    return id
  }
  const homeTeam = await team('host', '홈팀', ['e'])
  await team('a', '상대팀A', ['c', 'd'])
  await team('b', '상대팀B')
  await t.test(
    'invite links expire, require explicit acceptance, hide raw tokens in DB and allow one consumer',
    async () => {
      await reject(() => inviteLink(db, 'other', { teamId: homeTeam }), 403)
      const link = await inviteLink(db, 'host', { teamId: homeTeam })
      const stored = await q(
        'SELECT * FROM team_invite_links WHERE id=?',
        link.id,
      ).first()
      assert.notEqual(stored.tokenHash, link.token)
      assert.equal('token' in stored, false)
      await inviteLink(db, 'other', { token: link.token }, true)
      assert.equal((await teamState(db, 'other')).memberships.length, 0)
      await reject(
        () => inviteLink(db, 'other', { token: link.token, accept: false }),
        400,
      )
      const race = await Promise.allSettled(
        ['invite1', 'invite2'].map((u) =>
          inviteLink(db, u, { token: link.token, accept: true }),
        ),
      )
      assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1)
      await reject(() =>
        inviteLink(db, 'c', { token: link.token, accept: true }),
      )
      const expired = await inviteLink(db, 'host', { teamId: homeTeam })
      await q(
        'UPDATE team_invite_links SET expiresAt=0 WHERE id=?',
        expired.id,
      ).run()
      await reject(
        () => inviteLink(db, 'c', { token: expired.token }, true),
        410,
      )
      const revoked = await inviteLink(db, 'host', { teamId: homeTeam })
      await inviteLink(db, 'host', { revokeId: revoked.id })
      await reject(
        () => inviteLink(db, 'c', { token: revoked.token }, true),
        410,
      )
    },
  )
  await t.test(
    'minimum, maximum, real registered membership and basketball friendly validation',
    async () => {
      await reject(() => create({ minCapacity: 9, capacity: 8 }), 400)
      await reject(() => create({ members: ['가명'], memberIds: [] }), 400)
      await reject(
        () => create({ members: ['타인'], memberIds: ['other'] }),
        403,
      )
      await reject(
        () => create({ start: new Date(Date.now() - 1000).toISOString() }),
        400,
      )
      const m = await create({ kind: 'friendly' }),
        a = await apply('a', m, ['c']),
        b = await apply('b', m)
      const race = await Promise.allSettled([approve(m, a), approve(m, b)])
      assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1)
      const s = await op(m)
      assert.equal(s.requests.filter((r) => r.status === 'approved').length, 1)
      assert.equal(confirmedPeople(s).length, 2)
      assert.equal(
        (await state('other')).matches.find((x) => x.id === m).operations
          .participants.length,
        0,
      )
    },
  )
  await t.test(
    'last seat concurrent approvals, duplicate applications and cancellation idempotency',
    async () => {
      const m = await create({ capacity: 2 }),
        a = await apply('a', m),
        b = await apply('b', m)
      await reject(() => apply('a', m), 409)
      const r = await Promise.allSettled([approve(m, a), approve(m, b)])
      assert.equal(r.filter((x) => x.status === 'fulfilled').length, 1)
      assert.equal(confirmedPeople(await op(m)).length, 2)
      const winner = (await op(m)).requests.find(
        (r) => r.status === 'approved',
      ).ownerId
      await reject(() => act('other', { type: 'ops.leave', matchId: m }), 403)
      await act(winner, { type: 'ops.leave', matchId: m })
      assert.equal(confirmedPeople(await op(m)).length, 1)
      await reject(() => act(winner, { type: 'ops.leave', matchId: m }))
      assert.equal(
        (
          await q(
            "SELECT count(*) n FROM conductEvents WHERE matchId=? AND action='late_cancel'",
            m,
          ).first()
        ).n,
        0,
      )
    },
  )
  await t.test(
    'team consent is independent of membership and approval; slot races cannot overbook',
    async () => {
      const m = await create({ capacity: 3 }),
        a = await apply('a', m, ['c']),
        b = await apply('b', m)
      await approve(m, a)
      assert.equal(confirmedPeople(await op(m)).length, 2)
      await reject(
        () => act('other', { type: 'ops.consent', matchId: m, accept: true }),
        403,
      )
      const race = await Promise.allSettled([
        act('c', { type: 'ops.consent', matchId: m, accept: true }),
        approve(m, b),
      ])
      assert.equal(race.filter((x) => x.status === 'fulfilled').length, 1)
      assert.equal(confirmedPeople(await op(m)).length, 3)
      const before = (await op(m)).people.find((p) => p.userId === 'c')
      if (before.consent === 'pending')
        await reject(
          () => act('c', { type: 'ops.consent', matchId: m, accept: true }),
          409,
        )
      const joined = (await state('c')).matches.find(
        (x) => x.id === m,
      ).operations
      assert.equal(joined.joined, true)
      await reject(
        () =>
          act('a', {
            type: 'editEntry',
            entryId: a,
            members: [],
            memberIds: [],
            note: '',
          }),
        403,
      )
    },
  )
  await t.test(
    'roster additions require approval again and keep existing confirmations',
    async () => {
      const m = await create(),
        a = await apply('a', m, ['c'])
      await approve(m, a)
      await act('c', { type: 'ops.consent', matchId: m, accept: true })
      await act('a', {
        type: 'editEntry',
        entryId: a,
        members: ['c', 'd'],
        memberIds: ['c', 'd'],
        note: '추가',
      })
      assert.equal(confirmedPeople(await op(m)).length, 3)
      await act('d', { type: 'ops.consent', matchId: m, accept: true })
      assert.equal(confirmedPeople(await op(m)).length, 3)
      await approve(m, a)
      assert.equal(confirmedPeople(await op(m)).length, 4)
    },
  )
  await t.test(
    'friendly roster revision never frees the opposing-team lock',
    async () => {
      const m = await create({ kind: 'friendly' }),
        a = await apply('a', m, ['c'])
      await approve(m, a)
      await act('a', {
        type: 'editEntry',
        entryId: a,
        members: ['c', 'd'],
        memberIds: ['c', 'd'],
        note: '추가 선수',
      })
      await reject(() => apply('b', m), 403)
      await act('d', { type: 'ops.consent', matchId: m, accept: true })
      assert.equal(confirmedPeople(await op(m)).length, 2)
      await approve(m, a)
      assert.equal(confirmedPeople(await op(m)).length, 3)
    },
  )
  await t.test(
    'late cancellation debits once; weather cancellation exempts; cancelled records remain',
    async () => {
      const m = await create(),
        a = await apply('a', m)
      await approve(m, a)
      await patch(m, (s) => {
        s.start = Date.now() + 2 * H
        s.end = s.start + 2 * H
      })
      await act('a', { type: 'ops.leave', matchId: m })
      await reject(() => act('a', { type: 'ops.leave', matchId: m }))
      assert.equal(
        (
          await q(
            "SELECT sum(delta) n FROM conductEvents WHERE matchId=? AND action='late_cancel'",
            m,
          ).first()
        ).n,
        -10,
      )
      await act('host', {
        type: 'ops.cancel',
        matchId: m,
        reason: '우천 및 기상악화',
      })
      assert.equal(
        (
          await q(
            "SELECT count(*) n FROM conductEvents WHERE matchId=? AND userId='host'",
            m,
          ).first()
        ).n,
        0,
      )
      await reject(() => apply('b', m))
      await reject(() => approve(m, a))
      await patch(m, (s) => {
        s.cancelledAt = Date.now() - H - 1000
      })
      const view = (await state('a')).matches.find((x) => x.id === m)
      assert.equal(view.operations.hidden, true)
      assert.equal(view.operations.joined, true)
    },
  )
  await t.test(
    'delegation asks earliest confirmed, freezes old host, accepts once and applies cancellation after transfer',
    async () => {
      const m = await create(),
        a = await apply('a', m),
        b = await apply('b', m)
      await approve(m, a)
      await approve(m, b)
      await patch(m, (s) => {
        s.start = Date.now() + 2 * H
        s.end = s.start + 2 * H
      })
      await act('host', { type: 'ops.leave', matchId: m })
      assert.equal((await op(m)).hostId, 'host')
      assert.equal(
        (
          await q(
            'SELECT count(*) n FROM conductEvents WHERE matchId=?',
            m,
          ).first()
        ).n,
        0,
      )
      await reject(
        () => act('host', { type: 'ops.close', matchId: m, closed: true }),
        409,
      )
      await reject(
        () => act('other', { type: 'ops.delegate', matchId: m, accept: true }),
        403,
      )
      const first = (await op(m)).delegation.target
      await act(first, { type: 'ops.delegate', matchId: m, accept: false })
      const second = (await op(m)).delegation.target
      assert.notEqual(first, second)
      const responses = await Promise.allSettled([
        act(second, { type: 'ops.delegate', matchId: m, accept: true }),
        act(second, { type: 'ops.delegate', matchId: m, accept: true }),
      ])
      assert.equal(responses.filter((x) => x.status === 'fulfilled').length, 1)
      assert.equal((await op(m)).hostId, second)
      await reject(
        () => act('host', { type: 'ops.close', matchId: m, closed: true }),
        403,
      )
      assert.equal(
        (
          await q(
            "SELECT sum(delta) n FROM conductEvents WHERE matchId=? AND userId='host'",
            m,
          ).first()
        ).n,
        -10,
      )
    },
  )
  await t.test(
    'delegation exhaustion and deadline cancel safely without transferring involuntarily',
    async () => {
      const m = await create(),
        a = await apply('a', m)
      await approve(m, a)
      await act('host', { type: 'ops.leave', matchId: m })
      await act('a', { type: 'ops.delegate', matchId: m, accept: false })
      assert.ok((await op(m)).cancelledAt)
      const n = await create(),
        b = await apply('b', n)
      await approve(n, b)
      await act('host', { type: 'ops.leave', matchId: n })
      await runLifecycle(db, (await op(n)).delegation.expiresAt + 1)
      assert.ok((await op(n)).cancelledAt)
    },
  )
  await t.test(
    'lightning -2h/-1h thresholds, ever-met exception and new-within-hour exception',
    async () => {
      const m = await create({ minCapacity: 4 }),
        s = await op(m)
      await runLifecycle(db, s.start - 2 * H)
      assert.equal((await op(m)).lightningSource, 'converted')
      assert.equal((await op(m)).cancelledAt, null)
      await runLifecycle(db, s.start - H)
      assert.ok((await op(m)).cancelledAt)
      const n = await create(),
        x = await apply('a', n)
      await approve(n, x)
      await act('a', { type: 'ops.leave', matchId: n })
      const ns = await op(n)
      await runLifecycle(db, ns.start - H)
      assert.equal((await op(n)).cancelledAt, null)
      const fresh = await create({
        start: new Date(Date.now() + H / 2).toISOString(),
        endAt: new Date(Date.now() + 2 * H).toISOString(),
      })
      assert.equal((await op(fresh)).lightningSource, 'new')
      const fs = await op(fresh)
      await runLifecycle(db, fs.start + H / 2)
      assert.equal((await op(fresh)).cancelledAt, null)
      assert.equal((await op(fresh)).startedAt, null)
    },
  )
  let completed
  await t.test(
    'direct start acknowledgement, automatic start/end, manual end delay, no automatic attendance',
    async () => {
      const m = await create({
        start: new Date(Date.now() + H / 2).toISOString(),
        endAt: new Date(Date.now() + 2 * H).toISOString(),
      })
      await patch(m, (s) => {
        s.start = Date.now() - 1000
      })
      await reject(
        () =>
          act('host', { type: 'ops.start', matchId: m, acknowledged: false }),
        400,
      )
      await act('host', { type: 'ops.start', matchId: m, acknowledged: true })
      assert.equal((await op(m)).manualBelowMinimum, true)
      await reject(() => act('host', { type: 'ops.end', matchId: m }), 409)
      await patch(m, (s) => {
        s.startedAt = Date.now() - H - 1000
      })
      await act('host', { type: 'ops.end', matchId: m })
      await reject(() => act('host', { type: 'ops.end', matchId: m }), 409)
      const n = await create(),
        a = await apply('a', n),
        b = await apply('b', n),
        c = await apply('c', n),
        d = await apply('d', n)
      for (const e of [a, b, c, d]) await approve(n, e)
      await patch(n, (s) => {
        s.start = Date.now() - H
        s.end = Date.now() + H
      })
      await runLifecycle(db)
      assert.ok((await op(n)).startedAt)
      assert.equal(
        (
          await q(
            'SELECT count(*) n FROM attendance WHERE matchId=?',
            n,
          ).first()
        ).n,
        0,
      )
      await patch(n, (s) => {
        s.end = Date.now() - 1000
      })
      await runLifecycle(db)
      assert.ok((await op(n)).endedAt)
      completed = n
    },
  )
  await t.test(
    'actual attendees praise mutually once within 24h and receive one evaluation notice',
    async () => {
      for (const u of ['host', 'a', 'b', 'c', 'd'])
        await executeConduct(
          db,
          'host',
          {
            type: 'conductAttendance',
            matchId: completed,
            personKey: 'u:' + u,
            status: 'present',
          },
          env,
        )
      for (const [sender, target] of [
        ['a', 'host'],
        ['host', 'b'],
        ['b', 'a'],
      ])
        await executeConduct(
          db,
          sender,
          {
            type: 'conductPraise',
            matchId: completed,
            targetId: target,
            reason: praiseOptions[0],
          },
          env,
        )
      await reject(
        () =>
          executeConduct(
            db,
            'b',
            {
              type: 'conductPraise',
              matchId: completed,
              targetId: 'a',
              reason: praiseOptions[0],
            },
            env,
          ),
        409,
      )
      await reject(
        () =>
          executeConduct(
            db,
            'a',
            {
              type: 'conductPraise',
              matchId: completed,
              targetId: 'a',
              reason: praiseOptions[0],
            },
            env,
          ),
        400,
      )
      assert.equal(
        (
          await q(
            'SELECT count(*) n FROM notices WHERE id LIKE ?',
            'evaluation:' + completed + ':%',
          ).first()
        ).n,
        5,
      )
      const original = (await op(completed)).endedAt
      await patch(completed, (s) => (s.endedAt = Date.now() - 25 * H))
      await reject(
        () =>
          executeConduct(
            db,
            'a',
            {
              type: 'conductPraise',
              matchId: completed,
              targetId: 'c',
              reason: praiseOptions[0],
            },
            env,
          ),
        409,
      )
      await patch(completed, (s) => (s.endedAt = original))
    },
  )
  await t.test(
    'shared-attendance reports, priority at three, admin-only penalties, correction and reporter privacy',
    async () => {
      const report = (u) =>
        reportCommand(
          db,
          u,
          {
            type: 'ops.report',
            matchId: completed,
            category: 'user',
            targetId: 'a',
            reason: '심한 지각',
          },
          env,
        )
      await reject(() => report('other'), 403)
      const initial = (await conductState(db, 'a', env)).scores.a.temperature
      await report('b')
      await report('c')
      await report('d')
      await reject(() => report('b'), 409)
      const r = (await reportState(db, 'admin', env)).find(
        (x) => x.matchId === completed,
      )
      assert.equal(r.reporters, 3)
      assert.equal(r.priority, true)
      assert.equal(
        (await conductState(db, 'a', env)).scores.a.temperature,
        initial,
      )
      await reject(
        () =>
          reportCommand(
            db,
            'host',
            {
              type: 'ops.reportDecision',
              caseId: r.id,
              decision: 'confirm',
              reason: '확인',
            },
            env,
          ),
        403,
      )
      await reportCommand(
        db,
        'admin',
        {
          type: 'ops.reportDecision',
          caseId: r.id,
          decision: 'confirm',
          reason: '실제 참가자 진술 확인',
        },
        env,
      )
      await reject(
        () =>
          reportCommand(
            db,
            'admin',
            {
              type: 'ops.reportDecision',
              caseId: r.id,
              decision: 'confirm',
              reason: '중복',
            },
            env,
          ),
        409,
      )
      assert.equal(
        (await conductState(db, 'a', env)).scores.a.temperature,
        initial - 2,
      )
      const own = (await reportState(db, 'a', env))[0]
      assert.equal('reporter' in own, false)
      assert.equal('reviewer' in own, false)
      assert.equal('audit' in own, false)
      assert.ok((await reportState(db, 'admin', env))[0].audit.length > 0)
      await reportCommand(
        db,
        'a',
        {
          type: 'ops.reportAppeal',
          caseId: r.id,
          message: '다시 확인해 주세요.',
        },
        env,
      )
      await reportCommand(
        db,
        'admin',
        {
          type: 'ops.reportDecision',
          caseId: r.id,
          decision: 'correct',
          reason: '제재 취소',
        },
        env,
      )
      assert.equal(
        (await conductState(db, 'a', env)).scores.a.temperature,
        initial,
      )
      await reportCommand(
        db,
        'a',
        {
          type: 'ops.report',
          matchId: completed,
          category: 'user',
          targetId: 'b',
          reason: '비매너 행동',
        },
        env,
      )
      const single = (await reportState(db, 'admin', env)).find(
        (x) => x.targetId === 'b' && x.category === 'user',
      )
      assert.equal(single.reporters, 1)
      assert.equal(single.priority, false)
      await reportCommand(
        db,
        'admin',
        {
          type: 'ops.reportDecision',
          caseId: single.id,
          decision: 'confirm',
          reason: '1명 신고지만 사실 확인 완료',
        },
        env,
      )
      assert.equal(
        (
          await q(
            "SELECT sum(delta) n FROM conductEvents WHERE source=? AND action='report_penalty'",
            single.id,
          ).first()
        ).n,
        -20,
      )
    },
  )
  await t.test(
    'fraudulent operation confirmation corrects attendance without deleting historical evidence',
    async () => {
      await reportCommand(
        db,
        'b',
        {
          type: 'ops.report',
          matchId: completed,
          category: 'operation',
          reason: '실제로 진행되지 않은 경기',
        },
        env,
      )
      const r = (await reportState(db, 'admin', env)).find(
        (x) => x.category === 'operation',
      )
      await reportCommand(
        db,
        'admin',
        {
          type: 'ops.reportDecision',
          caseId: r.id,
          decision: 'confirm',
          reason: '실제 경기 미진행 확인',
        },
        env,
      )
      assert.equal(
        (
          await q(
            "SELECT count(*) n FROM attendance WHERE matchId=? AND status='present'",
            completed,
          ).first()
        ).n,
        0,
      )
      assert.equal(
        (
          await q(
            'SELECT count(*) n FROM praises WHERE matchId=?',
            completed,
          ).first()
        ).n,
        3,
      )
      await reject(
        () =>
          executeConduct(
            db,
            'host',
            {
              type: 'conductAttendance',
              matchId: completed,
              personKey: 'u:host',
              status: 'present',
            },
            env,
          ),
        403,
      )
      assert.ok((await state('a')).mannerHistory.every((x) => !('userId' in x)))
    },
  )
})
