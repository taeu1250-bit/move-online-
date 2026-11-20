import { buildPushPayload } from '@block65/webcrypto-web-push'
import { requireValue } from './identity.mjs'
import { settleNoShows } from './conduct.mjs'

const hour = 3600000
const providers = [
  'fcm.googleapis.com',
  'web.push.apple.com',
  'push.services.mozilla.com',
  'notify.windows.com',
  'push.microsoft.com',
]
function validEndpoint(value) {
  try {
    const u = new URL(value)
    return (
      typeof value === 'string' &&
      value.length <= 2200 &&
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.port &&
      !u.hash &&
      providers.some((p) => u.hostname === p || u.hostname.endsWith('.' + p))
    )
  } catch {
    return false
  }
}
async function deviceId(endpoint) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)),
  )
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
export async function pushCommand(db, actor, c, env) {
  const endpoint =
    c.type === 'pushSubscribe' ? c.subscription?.endpoint : c.endpoint
  requireValue(
    validEndpoint(endpoint),
    400,
    '지원하는 브라우저의 알림 구독을 확인해 주세요.',
  )
  const id = await deviceId(endpoint)
  if (c.type === 'pushUnsubscribe') {
    await db
      .prepare('DELETE FROM push_devices WHERE id=? AND userId=?')
      .bind(id, actor)
      .run()
    return
  }
  requireValue(
    env.MOOV_REMINDERS_ENABLED==='1' && env.WEB_PUSH_PUBLIC_KEY && env.WEB_PUSH_PRIVATE_KEY,
    503,
    '푸시 설정을 준비 중이에요.',
  )
  const keys = c.subscription?.keys
  requireValue(
    keys &&
      /^[A-Za-z\d_-]{87}$/.test(keys.p256dh) &&
      /^[A-Za-z\d_-]{22}$/.test(keys.auth),
    400,
    '알림 구독 키를 확인해 주세요.',
  )
  const subscription = JSON.stringify({
    endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
  })
  const result = await db
    .prepare(
      `INSERT INTO push_devices(id,userId,subscription,updatedAt)
    SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM push_devices WHERE id=?) OR (SELECT count(*) FROM push_devices WHERE userId=?)<10
    ON CONFLICT(id) DO UPDATE SET subscription=excluded.subscription,updatedAt=excluded.updatedAt WHERE push_devices.userId=excluded.userId`,
    )
    .bind(id, actor, subscription, new Date().toISOString(), id, actor)
    .run()
  requireValue(
    result.meta.changes,
    409,
    '기기의 이전 알림 구독을 해제한 뒤 다시 등록해 주세요.',
  )
}
const recipients = `WITH recipients(matchId,userId) AS (
  SELECT id,hostId FROM matches UNION SELECT m.id,j.value FROM matches m,json_each(m.homeMemberIds) j WHERE j.type='text'
  UNION SELECT matchId,userId FROM entries WHERE status='approved'
  UNION SELECT e.matchId,j.value FROM entries e,json_each(e.memberIds) j WHERE e.status='approved' AND j.type='text'
), windows(h) AS (VALUES(24),(3)), due AS (
  SELECT m.id,m.start,m.sport,m.title,m.venue,r.userId,w.h FROM recipients r JOIN matches m ON m.id=r.matchId CROSS JOIN windows w
  WHERE m.cancelledAt IS NULL AND m.start>?1 AND m.start<=strftime('%Y-%m-%dT%H:%M:%fZ',?1,'+'||w.h||' hours')
  AND m.start>strftime('%Y-%m-%dT%H:%M:%fZ',?1,'+'||(w.h*60-30)||' minutes')
)`
export async function runReminders(
  db,
  env,
  { time = Date.now(), send = fetch } = {},
) {
  await settleNoShows(db)
  const at = new Date(time).toISOString()
  const notice = await db
    .prepare(
      recipients +
        ` INSERT INTO notices(id,recipient,matchId,text,at)
    SELECT 'rem:'||id||':'||start||':'||h||':'||userId,userId,id,title||' · 경기 시작 '||h||'시간 전 · '||venue,?1 FROM due WHERE 1 ON CONFLICT(id) DO NOTHING`,
    )
    .bind(at)
    .run()
  if (!env.WEB_PUSH_PRIVATE_KEY || !env.WEB_PUSH_PUBLIC_KEY)
    return { inbox: notice.meta.changes, sent: 0 }
  const deliveryKey = "('web:'||due.id||':'||due.start||':'||due.h||':'||d.id)"
  const jobs = await db
    .prepare(
      recipients +
        ` SELECT due.*,d.id AS deviceId,d.subscription,${deliveryKey} AS key FROM due JOIN push_devices d ON d.userId=due.userId
    WHERE NOT EXISTS(SELECT 1 FROM push_deliveries p WHERE p.id=${deliveryKey} AND (p.status<>'retry' OR p.at>strftime('%Y-%m-%dT%H:%M:%fZ',?1,'-2 minutes'))) LIMIT 40`,
    )
    .bind(at)
    .all()
  let sent = 0
  for (const job of jobs.results) {
    const lock = await db
      .prepare(
        recipients +
          ` INSERT INTO push_deliveries(id,matchId,deviceId,start,hours,status,at)
      SELECT ?2,due.id,d.id,due.start,due.h,'sending',?1 FROM due JOIN push_devices d ON d.userId=due.userId
      WHERE due.id=?3 AND due.start=?4 AND due.h=?5 AND d.id=?6 AND d.subscription=?7
      ON CONFLICT(id) DO UPDATE SET status='sending',at=excluded.at WHERE push_deliveries.status='retry' AND push_deliveries.at<=strftime('%Y-%m-%dT%H:%M:%fZ',?1,'-2 minutes')`,
      )
      .bind(
        at,
        job.key,
        job.id,
        job.start,
        job.h,
        job.deviceId,
        job.subscription,
      )
      .run()
    if (!lock.meta.changes) continue
    let status = 'unknown'
    try {
      const sub = JSON.parse(job.subscription)
      const clock = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(job.start))
      const message = {
        title:
          job.h === 24
            ? 'moov. | 내일 경기 안내'
            : 'moov. | 경기 시작 3시간 전',
        body: clock + ' ' + job.sport + ' · ' + job.venue,
        matchId: job.id,
        tag: job.key,
      }
      const request = await buildPushPayload(
        { data: JSON.stringify(message), options: { ttl: 900 } },
        sub,
        {
          subject: 'https://moov-mirae-online-dev.jj04020985.chatgpt.site',
          publicKey: env.WEB_PUSH_PUBLIC_KEY,
          privateKey: env.WEB_PUSH_PRIVATE_KEY,
        },
      )
      const res = await send(sub.endpoint, { ...request, redirect: 'error' })
      if (res.ok) {
        status = 'sent'
        sent++
      } else if (res.status === 404 || res.status === 410) {
        status = 'expired'
        await db
          .prepare('DELETE FROM push_devices WHERE id=? AND subscription=?')
          .bind(job.deviceId, job.subscription)
          .run()
      } else
        status = res.status === 429 || res.status >= 500 ? 'retry' : 'refused'
    } catch {
      /* Ambiguous delivery stays terminal to avoid a duplicate push. */
    }
    await db
      .prepare('UPDATE push_deliveries SET status=? WHERE id=?')
      .bind(status, job.key)
      .run()
  }
  return { inbox: notice.meta.changes, sent }
}
