import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, randomBytes, createECDH } from 'node:crypto'
import { testRuntime, migrateLocal } from '../scripts/local-runtime.mjs'
import { runReminders, pushCommand } from '../server/reminders.mjs'
test('reminders select confirmed accounts, encrypt once per device/window, reschedule and stop after cancellation', async (t) => {
  const runtime = testRuntime()
  t.after(() => runtime.dispose())
  const db = await migrateLocal(runtime),
    q = (s, ...p) => db.prepare(s).bind(...p)
  const key = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  }).privateKey.export({ format: 'jwk' })
  const publicKey = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(key.x, 'base64url'),
    Buffer.from(key.y, 'base64url'),
  ]).toString('base64url')
  const env = { MOOV_REMINDERS_ENABLED:"1", WEB_PUSH_PUBLIC_KEY: publicKey, WEB_PUSH_PRIVATE_KEY: key.d }
  const base = Date.now(),
    hour = 3600000,
    iso = (n) => new Date(base + n * hour).toISOString()
  for (const uid of ['host', 'a', 'pending', 'teammate'])
    await q(
      "INSERT INTO profiles(id,name,year,dept) VALUES(?,?,2024,'학과')",
      uid,
      uid,
    ).run()
  await q(
    "INSERT INTO matches(id,hostId,kind,sport,title,venue,start,capacity,existing,fee,level,description,createdAt,homeRoster) VALUES('g','host','pickup','러닝','달리기','대운동장',?,8,1,0,'모든 레벨','',?,'[\"host\"]')",
    iso(24),
    iso(-3),
  ).run()
  await q(
    "INSERT INTO entries(id,matchId,userId,roster,memberIds,note,status,at,mutation) VALUES('g1','g','a','[\"a\",\"팀원\"]','[\"a\",\"teammate\"]','','approved',?,'m'),('g2','g','pending','[\"pending\"]',NULL,'','pending',?,'n')",
    iso(-4),
    iso(-4),
  ).run()
  const makeSubscription = (id) => ({
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-' + id,
    keys: {
      auth: randomBytes(16).toString('base64url'),
      p256dh: createECDH('prime256v1').generateKeys().toString('base64url'),
    },
  })
  const subscriptions = {}
  await assert.rejects(pushCommand(db,'host',{type:'pushSubscribe',subscription:makeSubscription('off')},{...env,MOOV_REMINDERS_ENABLED:'0'}),e=>e.status===503)
  for (const id of ['host', 'a', 'pending', 'teammate']) {
    const sub = makeSubscription(id)
    subscriptions[id] = sub
    await pushCommand(db, id, { type: 'pushSubscribe', subscription: sub }, env)
  }
  const delivered = []
  async function send(url, body) {
    assert.ok(body.headers.authorization.startsWith('vapid '))
    assert.equal(body.headers['content-encoding'], 'aes128gcm')
    assert.ok(body.body.byteLength > 100)
    delivered.push(url)
    return new Response(null, { status: 201 })
  }
  const run = (time) => runReminders(db, env, { time, send })
  await Promise.all([run(base), run(base)])
  assert.equal(delivered.length, 3)
  assert.ok(!delivered.includes(subscriptions.pending.endpoint))
  assert.equal((await q('SELECT count(*) AS n FROM notices').first()).n, 3)
  await pushCommand(
    db,
    'a',
    { type: 'pushUnsubscribe', endpoint: subscriptions.a.endpoint },
    env,
  )
  await q("UPDATE matches SET start=? WHERE id='g'", iso(25)).run()
  await run(base + 21 * hour)
  assert.equal(delivered.length, 3)
  await run(base + 22 * hour)
  assert.equal(delivered.length, 5)
  await q(
    "UPDATE matches SET start=?,cancelledAt=? WHERE id='g'",
    iso(30),
    iso(23),
  ).run()
  await run(base + 27 * hour)
  assert.equal(delivered.length, 5)
  await assert.rejects(
    pushCommand(
      db,
      'host',
      {
        type: 'pushSubscribe',
        subscription: {
          ...subscriptions.host,
          endpoint: 'https://example.invalid/',
        },
      },
      env,
    ),
  )
  assert.equal(
    (
      await runtime.dispatchFetch('http://moov.test/api/reminders/run', {
        method: 'POST',
      })
    ).status,
    403,
  )
})
