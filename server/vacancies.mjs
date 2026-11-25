import { requireValue } from './identity.mjs'

const now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
export const approvedSeats =
  "(SELECT coalesce(sum(json_array_length(a.roster)),0) FROM entries a WHERE a.matchId=m.id AND a.status='approved')"
export const availableSeats = `(m.capacity-m.existing-${approvedSeats})`
const stateField = (key) => `json_extract(o.state,'$.${key}')`
const operationCount = `(SELECT count(*) FROM json_each(o.state,'$.people') p
  WHERE json_extract(p.value,'$.consent')='accepted' AND json_extract(p.value,'$.approved')=1)`
const beforeStart = (time = now) =>
  `m.kind='pickup' AND m.cancelledAt IS NULL AND m.start>${time}
    AND (m.endAt IS NULL OR m.endAt>${time})`
const operationActive = `${stateField('startedAt')} IS NULL AND ${stateField('endedAt')} IS NULL`
const closed = `CASE WHEN o.matchId IS NULL THEN ${availableSeats}<=0
  ELSE ${operationActive} AND (${stateField('closed')}=1 OR ${operationCount}>=${stateField('max')}) END`

function eligible(user) {
  return `m.hostId<>${user} AND CASE WHEN o.matchId IS NULL THEN
    NOT EXISTS(SELECT 1 FROM entries e WHERE e.matchId=m.id AND e.status IN ('pending','approved')
      AND (e.userId=${user} OR EXISTS(SELECT 1 FROM json_each(e.memberIds) p WHERE p.value=${user})
        OR EXISTS(SELECT 1 FROM json_each(e.proposedMemberIds) p WHERE p.value=${user})))
    ELSE
    NOT EXISTS(SELECT 1 FROM json_each(o.state,'$.people') p WHERE
      json_extract(p.value,'$.userId')=${user} AND json_extract(p.value,'$.consent') IN ('pending','accepted'))
    AND NOT EXISTS(SELECT 1 FROM json_each(o.state,'$.requests') r WHERE
      json_extract(r.value,'$.ownerId')=${user} AND json_extract(r.value,'$.status') IN ('pending','approved'))
    END`
}

export const vacancyMatchJoin = 'LEFT JOIN match_operations o ON o.matchId=m.id'
export const vacancyFields = `
  EXISTS(SELECT 1 FROM vacancy_subscriptions v WHERE v.matchId=m.id AND v.userId=?1) AS vacancySubscribed,
  (${beforeStart()} AND ${closed} AND ${eligible('?1')}) AS vacancyCanSubscribe`

export async function vacancyCommand(db, actor, command) {
  const { matchId } = command
  requireValue(typeof matchId === 'string' && matchId.length > 0, 400, '경기를 확인해 주세요.')
  if (command.type === 'vacancyUnsubscribe') {
    await db.prepare('DELETE FROM vacancy_subscriptions WHERE matchId=? AND userId=?')
      .bind(matchId, actor).run()
    return
  }

  const [inserted, existing] = await db.batch([
    db.prepare(`INSERT INTO vacancy_subscriptions(id,matchId,userId)
      SELECT ?3,m.id,?1 FROM matches m ${vacancyMatchJoin}
      WHERE m.id=?2 AND ${beforeStart()} AND ${closed} AND ${eligible('?1')}
      ON CONFLICT(matchId,userId) DO NOTHING`).bind(actor, matchId, crypto.randomUUID()),
    db.prepare('SELECT id FROM vacancy_subscriptions WHERE matchId=? AND userId=?')
      .bind(matchId, actor),
  ])
  requireValue(inserted.meta.changes || existing.results.length, 409,
    '지금은 빈자리 알림을 등록할 수 없어요.')
}

function deliver(db, condition, values, time = now) {
  return db.prepare(`INSERT INTO notices(id,recipient,matchId,text,at)
    SELECT 'vacancy:' || v.id,v.userId,m.id,m.title || ' · 빈자리가 생겼어요.',${now}
    FROM vacancy_subscriptions v JOIN matches m ON m.id=v.matchId ${vacancyMatchJoin}
    WHERE ${beforeStart(time)} AND ${eligible('v.userId')} AND ${condition}`).bind(...values)
}

function consume(db, match, value) {
  return db.prepare(`DELETE FROM vacancy_subscriptions WHERE matchId=${match}
    AND EXISTS(SELECT 1 FROM notices n WHERE n.id='vacancy:' || vacancy_subscriptions.id)`).bind(value)
}

export function operationVacancyNotices(db, matchId, mutation, departingUser) {
  return [
    deliver(db, `m.id=? AND o.mutation=? AND v.userId<>? AND ${operationActive}
      AND ${stateField('closed')}=0 AND ${stateField('delegation')} IS NULL
      AND ${operationCount}<${stateField('max')}`, [matchId, mutation, departingUser]),
    consume(db, '?', matchId),
  ]
}

// This runs immediately before the matching legacy UPDATE in the same batch.
export function legacyVacancyNotice(db, entryId, actor, revision, at) {
  return deliver(db, `o.matchId IS NULL AND ${availableSeats}<=0 AND EXISTS(
    SELECT 1 FROM entries e WHERE e.matchId=m.id AND e.id=? AND e.userId=? AND e.status='approved'
    AND (? IS NULL OR e.rosterRevision=?) AND ${availableSeats}+json_array_length(e.roster)>0
  )`, [at, at, entryId, actor, revision, revision], '?')
}
export function consumeLegacyVacancyNotices(db, entryId) {
  return consume(db, '(SELECT matchId FROM entries WHERE id=?)', entryId)
}
