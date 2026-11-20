import assert from 'node:assert/strict'
import test from 'node:test'
import { SignJWT, generateKeyPair, exportJWK } from 'jose'
import { randomUUID } from 'node:crypto'
import { testRuntime, migrateLocal } from '../scripts/local-runtime.mjs'
const project = 'demo-moov-dev',
  domain = '@yonsei.ac.kr'
const actual = process.env.MOOV_TEST_AUTH_EMULATOR === '1'
const origin = 'http://127.0.0.1:9099'
const signingKeys = await generateKeyPair('RS256', { extractable: true })
const key = {
  ...(await exportJWK(signingKeys.publicKey)),
  use: 'sig',
  alg: 'RS256',
  kid: 'moov-test',
}
const sign = (claims) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: key.kid })
    .setIssuedAt()
    .sign(signingKeys.privateKey)
async function emulatorCall(action, body) {
  const r = await fetch(
    origin +
      '/identitytoolkit.googleapis.com/v1/accounts:' +
      action +
      '?key=local-test-key',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'error',
    },
  )
  assert.equal(r.status, 200, action)
  return r.json()
}
async function identity(label, mailDomain, verified, registry, cleanup) {
  const email = 'moov-' + randomUUID() + mailDomain
  if (actual) {
    const password = randomUUID()
    const result = await emulatorCall('signUp', {
      email,
      password,
      returnSecureToken: true,
    })
    let token = result.idToken
    if (verified) {
      await emulatorCall('sendOobCode', {
        idToken: token,
        requestType: 'VERIFY_EMAIL',
      })
      const { oobCodes } = await (
        await fetch(origin + '/emulator/v1/projects/' + project + '/oobCodes')
      ).json()
      const code = oobCodes.find(
        (c) => c.email === email && c.requestType === 'VERIFY_EMAIL',
      )
      await emulatorCall('update', { oobCode: code.oobCode })
      token = (
        await emulatorCall('signInWithPassword', {
          email,
          password,
          returnSecureToken: true,
        })
      ).idToken
    }
    cleanup.push(() => emulatorCall('delete', { idToken: token }))
    return { label, id: result.localId, token }
  }
  // Synthetic identities are accepted only by this test's outbound service.
  const id = randomUUID(),
    now = Math.floor(Date.now() / 1000)
  const claims = {
    aud: project,
    iss: 'https://securetoken.google.com/' + project,
    sub: id,
    exp: now + 3600,
    auth_time: now,
    email,
    email_verified: verified,
    firebase: { sign_in_provider: 'password' },
  }
  const token = await sign(claims)
  registry.set(token, { localId: id, email, emailVerified: verified })
  return { label, id, token }
}
test('Worker authentication, D1 permissions, concurrent approvals and participant privacy', async (t) => {
  const registry = new Map(),
    cleanup = []
  t.after(async () => {
    await Promise.all(cleanup.map((fn) => fn()))
  })
  const [host, a, b, other, unverified, outsider] = await Promise.all(
    [
      ['모집자', domain, true],
      ['선수A', domain, true],
      ['선수B', domain, true],
      ['관찰자', domain, true],
      ['미확인', domain, false],
      ['타학교', '@example.test', true],
    ].map((args) => identity(...args, registry, cleanup)),
  )
  const leaders = {
    [host.id]: { name: '리베로', sport: '축구' },
    [a.id]: { name: '비즈 FC', sport: '축구' },
    [b.id]: { name: '개발팀', sport: '축구' },
  }
  const identityStub = async (req) => {
    if (new URL(req.url).hostname === 'www.googleapis.com')
      return Response.json({ keys: [key] })
    const { idToken } = await req.json()
    const account = registry.get(idToken)
    return new Response(JSON.stringify({ users: account ? [account] : [] }), {
      status: account ? 200 : 400,
    })
  }
  const runtime = testRuntime({
    leaders,
    scriptPath: actual
      ? '.sites-runtime/emulator/index.js'
      : 'dist/server/index.js',
    identity: actual ? undefined : identityStub,
  })
  t.after(() => runtime.dispose())
  await migrateLocal(runtime)
  const req = (who, path, body) =>
    runtime.dispatchFetch('http://moov.test' + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(who ? { 'X-Moov-ID-Token': who.token } : {}),
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  const cmd = (who, c) => req(who, '/api/command', c)
  const state = async (who) => {
    const r = await req(who, '/api/state')
    assert.equal(r.status, 200)
    return r.json()
  }
  const fields = {
    kind: 'pickup',
    sport: '축구',
    title: '개발 경기',
    venue: '대운동장',
    start: new Date(Date.now() + 86400000).toISOString(),
    capacity: 2,
    minCapacity:2,minFormat:'7vs7',maxFormat:'11vs11',
    endAt:new Date(Date.now()+90000000).toISOString(),
    existing: 1,
    members: [],
    fee: 0,
    level: '누구나 환영',
    description: '',
  }
  const game = randomUUID(),
    friendly = randomUUID()
  await t.test(
    'private API requires verified school account and assets remain available',
    async () => {
      assert.equal((await req(null, '/')).status, 200)
      for (const url of [
        '/manifest.webmanifest',
        '/sw.js',
        '/icons/icon-192.png',
      ])
        assert.equal((await req(null, url)).status, 200)
      assert.equal((await req(null, '/api/state')).status, 401)
      assert.equal((await req(unverified, '/api/state')).status, 403)
      assert.equal((await req(outsider, '/api/state')).status, 403)
      if (!actual) {
        const claims = {
          sub: a.id,
          aud: project,
          iss: 'https://securetoken.google.com/' + project,
          auth_time: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 300,
          email_verified: true,
          firebase: { sign_in_provider: 'password' },
        }
        const badTokens = [
          'invalid',
          await sign({ ...claims, aud: 'other' }),
          await sign({ ...claims, exp: 1 }),
          await sign({ ...claims, iss: 'wrong' }),
        ]
        for (const token of badTokens) {
          registry.set(token, { localId: a.id, emailVerified: true })
          assert.equal((await req({ token }, '/api/state')).status, 401)
        }
      }
      assert.equal((await state(a)).needsProfile, true)
      for (const p of [host, a, b, other]) {
        assert.equal(
          (
            await req(p, '/api/profile', {
              name: p.label,
              year: 2024,
              dept: '시험학과',
              skillLevel: '입문',
              role: 'leader',
              id: host.id,
            })
          ).status,
          200,
        )
      }
      const policy = (await state(a)).policy
      assert.equal(policy.accepted, false)
      assert.equal(
        (await cmd(a, { type: 'acceptPolicy', version: 'old' })).status,
        409,
      )
      for (const p of [a, b, host, other])
        assert.equal(
          (await cmd(p, { type: 'acceptPolicy', version: policy.version }))
            .status,
          200,
        )
      assert.equal((await state(other)).users[0].role, 'student')
      assert.equal(
        (await state(host)).users.find((u) => u.id === host.id).name,
        host.label,
      )
    },
  )
  let ae, be
  await t.test(
    'two devices see one match, duplicate application and editing another applicant are rejected',
    async () => {
      assert.equal(
        (await cmd(host, { type: 'create', id: game, fields })).status,
        200,
      )
      assert.equal((await state(a)).matches[0].id, game)
      const apply = (p) =>
        cmd(p, { type: 'apply', matchId: game, note: '개인 메모', members: [] })
      assert.deepEqual(
        (await Promise.all([apply(a), apply(a)])).map((r) => r.status).sort(),
        [200, 409],
      )
      assert.equal((await apply(b)).status, 200)
      const hostView = await state(host)
      ae = hostView.entries.find((e) => e.userId === a.id).id
      be = hostView.entries.find((e) => e.userId === b.id).id
      assert.equal(
        (
          await cmd(b, {
            type: 'editEntry',
            entryId: ae,
            note: '수정',
            members: [],
          })
        ).status,
        403,
      )
      assert.equal(
        (
          await cmd(a, {
            type: 'editEntry',
            entryId: ae,
            note: '수정한 메모',
            members: [],
          })
        ).status,
        200,
      )
      assert.equal(
        (await cmd(other, { type: 'review', decision: 'approve', entryId: ae }))
          .status,
        403,
      )
      const outsiderView = await state(other)
      assert.equal(outsiderView.entries.length, 0)
      assert.equal(outsiderView.notices.length, 0)
      assert.equal(outsiderView.matches[0].homeRoster, undefined)
      assert.ok(!JSON.stringify(outsiderView).includes('수정한 메모'))
      assert.equal((await state(a)).entries.length, 1)
    },
  )
  await t.test(
    'last seat is approved once, withdrawal reopens it, reject and cancel are persisted',
    async () => {
      const responses = await Promise.all(
        [ae, be].map((entryId) =>
          cmd(host, { type: 'review', decision: 'approve', entryId }),
        ),
      )
      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409])
      let view = await state(host)
      const approved = view.entries.find((e) => e.status === 'approved'),
        pending = view.entries.find((e) => e.status === 'pending')
      assert.equal(view.matches[0].approvals, 1)
      assert.equal(
        (
          await cmd(other, {
            type: 'review',
            decision: 'cancel',
            entryId: approved.id,
          })
        ).status,
        403,
      )
      assert.equal(
        (
          await cmd(approved.userId === a.id ? a : b, {
            type: 'review',
            decision: 'cancel',
            entryId: approved.id,
          })
        ).status,
        200,
      )
      assert.equal((await state(other)).matches[0].approvals, 0)
      assert.equal(
        (
          await cmd(host, {
            type: 'review',
            decision: 'reject',
            entryId: pending.id,
          })
        ).status,
        200,
      )
      assert.equal(
        (await cmd(a, { type: 'apply', matchId: game, note: '', members: [] }))
          .status,
        200,
      )
      assert.equal(
        (await cmd(other, { type: 'cancelMatch', matchId: game,reason:'기타' })).status,
        403,
      )
      assert.equal(
        (await cmd(host, { type: 'cancelMatch', matchId: game,reason:'기타' })).status,
        200,
      )
      view = await state(a)
      assert.ok(view.matches[0].cancelledAt)
      assert.equal(
        view.entries.filter((e) => ['approved', 'pending'].includes(e.status))
          .length,
        0,
      )
      assert.ok(view.notices.some((n) => n.matchId===game&&n.text.includes('취소')))
      assert.equal((await cmd(a, { type: 'readNotices' })).status, 200)
      assert.ok((await state(a)).notices.every((n) => n.read))
    },
  )
  await t.test('legacy name-only roster input is rejected and basketball friendly uses registered representatives',async()=>{
    const f={...fields,kind:'friendly',sport:'축구',capacity:4}
    assert.equal((await cmd(other,{type:'create',id:friendly,fields:f})).status,403)
    assert.equal((await cmd(host,{type:'create',id:friendly,fields:f})).status,200)
    assert.equal((await cmd(a,{type:'apply',matchId:friendly,note:'',members:['가명']})).status,400)
    assert.equal((await cmd(a,{type:'apply',matchId:friendly,note:'',members:[],memberIds:[]})).status,200)
    assert.equal((await state(other)).matches.find(m=>m.id===friendly).operations.participants.length,0)
  })
  await t.test(
    'online service enforces per-sport levels, current consent, public profile scope and active application restrictions',
    async () => {
      const id = randomUUID(),
        user = a,
        otherActor = other
      const f = {
        ...fields,
        kind: 'pickup',
        sport: '농구',minFormat:'3vs3',maxFormat:'5vs5',
        level: '고수',
        endAt: new Date(Date.parse(fields.start) + 3600000).toISOString(),
        info: { gender: '남녀모두', format: '3vs3' },
      }
      assert.equal(
        (await cmd(host, { type: 'create', id, fields: f })).status,
        200,
      )
      assert.equal(
        (
          await cmd(user, {
            type: 'setLevels',
            id: host.id,
            levels: { 농구: '초보', 러닝: '고수' },
          })
        ).status,
        200,
      )
      const view = await state(user),
        m = view.matches.find((m) => m.id === id)
      assert.deepEqual(m.info, f.info)
      assert.equal(m.endAt, f.endAt)
      assert.equal(view.users.find((u) => u.id === user.id).levels.농구, '초보')
      assert.equal(view.users.find((u) => u.id === host.id).dept, '시험학과')
      const body = { type: 'apply', matchId: id, note: '', members: [] }
      assert.equal((await cmd(user, body)).status, 409)
      assert.equal(
        (
          await cmd(user, {
            ...body,
            levelAcknowledged: true,
            memberIds: [host.id],
            members: ['무단 연결'],
          })
        ).status,
        403,
      )
      assert.equal(
        (await cmd(user, { ...body, levelAcknowledged: true })).status,
        200,
      )
      const db = await runtime.getD1Database('DB')
      await db
        .prepare('DELETE FROM policy_consents WHERE userId=?')
        .bind(otherActor.id)
        .run()
      assert.equal((await cmd(otherActor, body)).status, 403)
      assert.equal(
        (
          await cmd(otherActor, {
            type: 'acceptPolicy',
            version: view.policy.version,
          })
        ).status,
        200,
      )
      const now = Date.now()
      for (let j = 0; j < 2; j++) {
        await db
          .prepare(
            "INSERT INTO noShows(id,matchId,personKey,name,representativeId,subjectId,state,openedAt,deadline,confirmedAt,mutation) VALUES(?,?,?,?,?,?,'confirmed',?,?,?,?)",
          )
          .bind(
            randomUUID(),
            j ? game : friendly,
            'u:' + otherActor.id,
            '시험',
            otherActor.id,
            otherActor.id,
            now - 400000000,
            now - 200000000,
            now - j * 3600000,
            randomUUID(),
          )
          .run()
      }
      assert.ok((await state(otherActor)).conduct.restrictionUntil > now)
      assert.equal((await cmd(otherActor, {...body,levelAcknowledged:true})).status, 403)
    },
  )
})
