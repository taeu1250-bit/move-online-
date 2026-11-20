import { requireValue } from './identity.mjs'
import {
  conductPolicy as policy,
  praiseOptions,
  reportOptions,
} from '../src/domain/conduct.ts'

const hour = 3600000
const day = 24 * hour
const utc = (ms) => new Date(ms).toISOString()
const random = () => crypto.randomUUID()
const bound = (db, sql, ...args) => db.prepare(sql).bind(...args)
const list = (result) => result.results
const changed = (result) =>
  requireValue(
    result.meta.changes > 0,
    409,
    '다른 요청이 먼저 처리됐거나 현재 처리할 수 없는 상태예요.',
  )
const validText = (s, max) =>
  typeof s === 'string' && s.trim().length > 0 && s.length <= max
function admin(env, actor) {
  let ids
  try {
    ids = JSON.parse(env.MOOV_ADMIN_UIDS || '[]')
  } catch {
    return false
  }
  return Array.isArray(ids) && ids.includes(actor)
}

// A roster is frozen after kickoff. A representative is known from the authenticated
// application; every other account link was explicitly selected from accepted team members.
function rosterCTE(where = '1=1') {
  return `WITH eligible AS (SELECT m.*,o.state AS operationState,CASE WHEN o.matchId IS NULL THEN m.endAt ELSE strftime('%Y-%m-%dT%H:%M:%fZ',json_extract(o.state,'$.endedAt')/1000.0,'unixepoch') END AS evaluationEnd FROM matches m LEFT JOIN match_operations o ON o.matchId=m.id WHERE m.cancelledAt IS NULL AND CASE WHEN o.matchId IS NULL THEN m.endAt ELSE strftime('%Y-%m-%dT%H:%M:%fZ',json_extract(o.state,'$.endedAt')/1000.0,'unixepoch') END<=? AND coalesce(json_extract(o.state,'$.invalidated'),0)=0 AND NOT EXISTS(SELECT 1 FROM report_cases invalid WHERE invalid.matchId=m.id AND invalid.category='operation' AND invalid.state='confirmed') AND ${where}),
  slots AS (
    SELECT m.id AS matchId,m.hostId,m.title,m.evaluationEnd AS endAt,m.hostId AS rep,
      'h:'||slot.key AS slotKey,CASE WHEN slot.key=0 THEN m.hostId ELSE json_extract(m.homeMemberIds,'$['||slot.key||']') END AS uid,
      slot.value AS name FROM eligible m JOIN json_each(m.homeRoster) slot WHERE m.operationState IS NULL
    UNION ALL
    SELECT m.id,m.hostId,m.title,m.evaluationEnd AS endAt,e.userId,'e:'||e.id||':'||slot.key,
      CASE WHEN slot.key=0 THEN e.userId ELSE json_extract(e.memberIds,'$['||slot.key||']') END,
      slot.value FROM eligible m JOIN entries e ON e.matchId=m.id AND e.status='approved' JOIN json_each(e.roster) slot WHERE m.operationState IS NULL
    UNION ALL SELECT m.id,m.hostId,m.title,m.evaluationEnd,m.hostId,'u:'||json_extract(p.value,'$.userId'),json_extract(p.value,'$.userId'),json_extract(p.value,'$.name') FROM eligible m JOIN json_each(m.operationState,'$.people') p WHERE json_extract(p.value,'$.approved')=1 AND json_extract(p.value,'$.consent')='accepted'
  ), people AS (
    SELECT matchId,hostId,title,endAt,rep,uid,name,CASE WHEN uid IS NULL THEN slotKey ELSE 'u:'||uid END AS personKey
    FROM (SELECT slots.*,row_number() OVER (PARTITION BY matchId,coalesce('u:'||uid,slotKey)
       ORDER BY CASE WHEN uid=rep THEN 0 ELSE 1 END,slotKey) AS choice FROM slots) WHERE choice=1
  )`
}
function serveNotice(
  db,
  id,
  recipient,
  matchId,
  message,
  at,
  condition,
  args = [],
) {
  return bound(
    db,
    `INSERT OR IGNORE INTO notices(id,recipient,matchId,text,at)
    SELECT ?,?,?,?,? WHERE ${condition}`,
    id,
    recipient,
    matchId,
    message,
    utc(at),
    ...args,
  )
}
// The restriction is derived from confirmed decisions in chronological order.
// Dismissing a case therefore corrects later 7/30-day sanctions as well.
export function restrictionUntilSQL(userSql, nowMsSql) {
  return `(SELECT max(untilMs) FROM (SELECT a.confirmedAt + CASE
    WHEN (SELECT count(*) FROM noShows b WHERE b.subjectId=a.subjectId AND b.state='confirmed'
      AND b.confirmedAt>=a.confirmedAt-${policy.lookbackDays * day} AND (b.confirmedAt<a.confirmedAt OR (b.confirmedAt=a.confirmedAt AND b.id<=a.id)))>=3 THEN ${policy.repeatedBanDays * day}
    WHEN EXISTS(SELECT 1 FROM noShows b WHERE b.subjectId=a.subjectId AND b.state='confirmed'
      AND b.confirmedAt>=a.confirmedAt-${policy.lookbackDays * day} AND (b.confirmedAt<a.confirmedAt OR (b.confirmedAt=a.confirmedAt AND b.id<a.id))) THEN ${policy.secondBanDays * day}
    ELSE 0 END AS untilMs FROM noShows a WHERE a.subjectId=${userSql} AND a.state='confirmed')
    WHERE untilMs>${nowMsSql})`
}
function penaltyEvent(db, mutation, action, delta) {
  return bound(
    db,
    `INSERT OR IGNORE INTO conductEvents(id,userId,matchId,action,delta,source,at)
    SELECT lower(hex(randomblob(16))),subjectId,matchId,?,?,id,resolvedAt FROM noShows WHERE mutation=? AND subjectId IS NOT NULL`,
    action,
    delta,
    mutation,
  )
}
function decisionNotice(db, mutation, message) {
  return bound(
    db,
    `INSERT OR IGNORE INTO notices(id,recipient,matchId,text,at) SELECT 'case:'||mutation||':'||id,
    coalesce(subjectId,representativeId),matchId,?,strftime('%Y-%m-%dT%H:%M:%fZ',resolvedAt/1000.0,'unixepoch')
    FROM noShows WHERE mutation=?`,
    message,
    mutation,
  )
}
export async function settleNoShows(db) {
  const now = Date.now()
  const due = await bound(
    db,
    "SELECT 1 FROM noShows WHERE state='pending' AND deadline<=? LIMIT 1",
    now,
  ).first()
  if (!due) return
  const mutation = random()
  await db.batch([
    bound(
      db,
      "UPDATE noShows SET state='confirmed',confirmedAt=deadline,resolvedAt=deadline,mutation=? WHERE state='pending' AND deadline<=?",
      mutation,
      now,
    ),
    penaltyEvent(db, mutation, 'confirmed', policy.noShowTenths),
    decisionNotice(
      db,
      mutation,
      '이의제기 기간이 지나 노쇼가 확정됐어요. 내 활동에서 경고와 신청 제한을 확인하세요.',
    ),
  ])
}
async function attendanceCommand(db, actor, c, at) {
  const report = c.type === 'conductNoShow'
  requireValue(
    report
      ? c.acknowledged === true
      : ['present', 'unknown'].includes(c.status),
    400,
    '출석 상태와 신고 안내 확인이 필요해요.',
  )
  requireValue(
    validText(c.matchId, 128) && validText(c.personKey, 350),
    400,
    '참가자를 확인해 주세요.',
  )
  const person = await bound(
    db,
    rosterCTE('m.id=? AND m.hostId=?') +
      ' SELECT * FROM people WHERE personKey=?',
    utc(at),
    c.matchId,
    actor,
    c.personKey,
  ).first()
  requireValue(
    person,
    403,
    '종료된 경기의 모집자가 확정 참가자의 출석을 확인할 수 있어요.',
  )
  const authority =
    "EXISTS(SELECT 1 FROM matches m LEFT JOIN match_operations o ON o.matchId=m.id WHERE m.id='" +
    person.matchId.replaceAll("'", "''") +
    "' AND m.hostId='" +
    actor.replaceAll("'", "''") +
    "' AND m.cancelledAt IS NULL AND coalesce(json_extract(o.state,'$.invalidated'),0)=0 AND NOT EXISTS(SELECT 1 FROM report_cases invalid WHERE invalid.matchId=m.id AND invalid.category='operation' AND invalid.state='confirmed') AND (o.matchId IS NULL OR json_extract(o.state,'$.endedAt') IS NOT NULL))"
  const caseGuard =
    authority +
    ' AND ' +
    "NOT EXISTS(SELECT 1 FROM noShows n WHERE n.matchId=? AND n.personKey=? AND n.state<>'dismissed')"
  const id = random()
  if (!report) {
    const results = await db.batch([
      bound(
        db,
        `INSERT INTO attendance(id,matchId,personKey,userId,status,changedAt,mutation)
        SELECT ?,?,?,?,?,?,? WHERE ${caseGuard}
        ON CONFLICT(matchId,personKey) DO UPDATE SET status=excluded.status,changedAt=excluded.changedAt,mutation=excluded.mutation
        WHERE attendance.status<>excluded.status`,
        id,
        c.matchId,
        c.personKey,
        person.uid,
        c.status,
        at,
        id,
        c.matchId,
        c.personKey,
      ),
      bound(
        db,
        `INSERT INTO conductEvents(id,userId,matchId,action,delta,source,at)
        SELECT ?,userId,matchId,?, ?, ?,changedAt FROM attendance WHERE mutation=? AND userId IS NOT NULL AND
        (status='present' OR EXISTS(SELECT 1 FROM conductEvents ce WHERE ce.userId=attendance.userId AND ce.matchId=attendance.matchId
          AND ce.action IN ('present','unmark') GROUP BY ce.userId HAVING sum(ce.delta)>0))`,
        id,
        c.status === 'present' ? 'present' : 'unmark',
        c.status === 'present'
          ? policy.completedTenths
          : -policy.completedTenths,
        id,
        id,
      ),
    ])
    changed(results[0])
    await bound(
      db,
      "INSERT OR IGNORE INTO notices(id,recipient,matchId,text,at) SELECT 'evaluation:'||a.matchId||':'||a.userId,a.userId,a.matchId,'오늘 경기는 어떠셨나요? 함께 운동한 회원을 칭찬해 보세요. 칭찬은 경기 종료 후 24시간 동안 가능해요.',? FROM attendance a WHERE a.mutation=? AND a.status='present' AND a.userId IS NOT NULL",
      utc(at),
      id,
    ).run()
    return
  }
  requireValue(person.uid !== actor, 400, '본인을 노쇼로 신고할 수 없어요.')
  const pending = person.uid ? 'pending' : 'guest_warning'
  const results = await db.batch([
    bound(
      db,
      `INSERT INTO noShows(id,matchId,personKey,name,representativeId,subjectId,state,openedAt,deadline,mutation)
      SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${authority} AND NOT EXISTS(SELECT 1 FROM attendance WHERE matchId=? AND personKey=? AND status='present')
      ON CONFLICT(matchId,personKey) DO NOTHING`,
      id,
      c.matchId,
      c.personKey,
      person.name,
      person.rep,
      person.uid,
      pending,
      at,
      at + policy.appealHours * hour,
      id,
      c.matchId,
      c.personKey,
    ),
    serveNotice(
      db,
      id,
      person.uid || person.rep,
      c.matchId,
      person.uid
        ? '미참여 신고가 접수됐어요. 내 활동에서 48시간 이내에 이의제기할 수 있어요.'
        : '단체 비회원의 미참여 경고가 기록됐어요. 대표자의 매너온도는 유지돼요.',
      at,
      'EXISTS(SELECT 1 FROM noShows WHERE id=?)',
      [id],
    ),
  ])
  changed(results[0])
}
async function praiseCommand(db, actor, c, at) {
  requireValue(
    c.targetId !== actor &&
      validText(c.targetId, 128) &&
      validText(c.matchId, 128) &&
      praiseOptions.includes(c.reason),
    400,
    '칭찬할 참가자와 항목을 확인해 주세요.',
  )
  const id = random()
  const results = await db.batch([
    bound(
      db,
      `INSERT INTO praises(id,matchId,sender,recipient,reason,at)
      SELECT ?,m.id,?,?,?,? FROM matches m LEFT JOIN match_operations o ON o.matchId=m.id WHERE m.id=? AND m.cancelledAt IS NULL AND coalesce(json_extract(o.state,'$.invalidated'),0)=0 AND NOT EXISTS(SELECT 1 FROM report_cases invalid WHERE invalid.matchId=m.id AND invalid.category='operation' AND invalid.state='confirmed') AND CASE WHEN o.matchId IS NULL THEN m.endAt ELSE strftime('%Y-%m-%dT%H:%M:%fZ',json_extract(o.state,'$.endedAt')/1000.0,'unixepoch') END<=? AND CASE WHEN o.matchId IS NULL THEN m.endAt ELSE strftime('%Y-%m-%dT%H:%M:%fZ',json_extract(o.state,'$.endedAt')/1000.0,'unixepoch') END>?
        AND EXISTS(SELECT 1 FROM attendance a WHERE a.matchId=m.id AND a.userId=? AND a.status='present')
        AND EXISTS(SELECT 1 FROM attendance a WHERE a.matchId=m.id AND a.userId=? AND a.status='present')
        ON CONFLICT(matchId,sender,recipient) DO NOTHING`,
      id,
      actor,
      c.targetId,
      c.reason,
      at,
      c.matchId,
      utc(at),
      utc(at - policy.praiseHours * hour),
      actor,
      c.targetId,
    ),
    bound(
      db,
      `INSERT INTO conductEvents(id,userId,matchId,action,delta,source,at)
      SELECT id,recipient,matchId,'praise',?,id,at FROM praises WHERE id=?`,
      policy.praiseTenths,
      id,
    ),
    serveNotice(
      db,
      id,
      c.targetId,
      c.matchId,
      '함께한 회원의 칭찬을 받았어요. ' + c.reason,
      at,
      'EXISTS(SELECT 1 FROM praises WHERE id=?)',
      [id],
    ),
  ])
  changed(results[0])
}
async function caseCommand(db, actor, c, env, at) {
  requireValue(validText(c.caseId, 128), 400, '신고를 확인해 주세요.')
  const id = random()
  if (c.type === 'conductAppeal') {
    requireValue(
      validText(c.message, 500),
      400,
      '이의제기 사유를 500자 이내로 입력해 주세요.',
    )
    const result = await bound(
      db,
      "UPDATE noShows SET state='appealed',appeal=?,appealedAt=?,mutation=? WHERE id=? AND subjectId=? AND state='pending' AND deadline>?",
      c.message.trim(),
      at,
      id,
      c.caseId,
      actor,
      at,
    ).run()
    changed(result)
    return
  }
  requireValue(admin(env, actor), 403, '운영자 권한이 필요해요.')
  requireValue(
    ['confirm', 'dismiss'].includes(c.decision) && validText(c.reason, 500),
    400,
    '결정과 처리 사유가 필요해요.',
  )
  const confirm = c.decision === 'confirm'
  const results = await db.batch([
    bound(
      db,
      `UPDATE noShows SET state=?,resolvedBy=?,reason=?,resolvedAt=?,mutation=?,confirmedAt=${confirm ? '?' : 'confirmedAt'}
      WHERE id=? AND ${confirm ? "(state='appealed' OR (state='pending' AND deadline<=?))" : "state IN ('appealed','pending','confirmed','guest_warning')"}`,
      confirm ? 'confirmed' : 'dismissed',
      actor,
      c.reason.trim(),
      at,
      id,
      ...(confirm ? [at] : []),
      c.caseId,
      ...(confirm ? [at] : []),
    ),
    confirm
      ? penaltyEvent(db, id, 'confirmed', policy.noShowTenths)
      : bound(
          db,
          `INSERT OR IGNORE INTO conductEvents(id,userId,matchId,action,delta,source,at)
        SELECT ?,n.subjectId,n.matchId,'reversed',?,n.id,n.resolvedAt FROM noShows n JOIN conductEvents e ON e.source=n.id AND e.action='confirmed'
        WHERE n.mutation=?`,
          id,
          -policy.noShowTenths,
          id,
        ),
    decisionNotice(
      db,
      id,
      confirm
        ? '운영자 검토로 노쇼가 확정됐어요. 내 활동에서 경고와 신청 제한을 확인하세요.'
        : '노쇼 신고가 취소됐어요. 매너온도와 신청 제한에 반영했어요.',
    ),
  ])
  changed(results[0])
}
async function generalCommand(db, actor, c, env, at) {
  if (c.type === 'conductResolveReport') {
    requireValue(admin(env, actor), 403, '운영자 권한이 필요해요.')
    requireValue(
      ['reviewed', 'dismissed'].includes(c.decision) &&
        validText(c.reason, 500) &&
        validText(c.reportId, 128),
      400,
      '처리 결과를 확인해 주세요.',
    )
    changed(
      await bound(
        db,
        "UPDATE generalReports SET state=?,reviewer=?,resolvedAt=?,result=? WHERE id=? AND state='pending'",
        c.decision,
        actor,
        at,
        c.reason.trim(),
        c.reportId,
      ).run(),
    )
    return
  }
  const user = c.targetType === 'user'
  requireValue(
    (user || c.targetType === 'match') &&
      validText(c.targetId, 128) &&
      (!user || c.targetId !== actor) &&
      reportOptions.includes(c.reason),
    400,
    '신고 대상과 사유를 확인해 주세요.',
  )
  const result = await bound(
    db,
    `INSERT INTO generalReports(id,reporter,targetType,targetId,reason,at,state)
    SELECT ?,?,?,?,?,?,'pending' FROM ${user ? 'profiles' : 'matches'} t WHERE t.id=?
    AND NOT EXISTS(SELECT 1 FROM generalReports WHERE reporter=? AND targetType=? AND targetId=? AND (state='pending' OR at>?))
    AND (SELECT count(*) FROM generalReports WHERE reporter=? AND at>?) < ?`,
    random(),
    actor,
    c.targetType,
    c.targetId,
    c.reason,
    at,
    c.targetId,
    actor,
    c.targetType,
    c.targetId,
    at - policy.reportCooldownHours * hour,
    actor,
    at - day,
    policy.reportsPerDay,
  ).run()
  changed(result)
}
export async function executeConduct(db, actor, c, env = {}) {
  const at = Date.now()
  switch (c.type) {
    case 'conductAttendance':
    case 'conductNoShow':
      return attendanceCommand(db, actor, c, at)
    case 'conductPraise':
      return praiseCommand(db, actor, c, at)
    case 'conductAppeal':
    case 'conductDecide':
      return caseCommand(db, actor, c, env, at)
    case 'conductReport':
      requireValue(
        c.targetType === 'match' &&
          ['허위 경기 모집', '부적절한 게시물'].includes(c.reason),
        400,
        '경기 상세 또는 경기 평가에서 신고해 주세요.',
      )
      return generalCommand(db, actor, c, env, at)
    case 'conductResolveReport':
      return generalCommand(db, actor, c, env, at)
    default:
      requireValue(false, 400, '지원하지 않는 요청이에요.')
  }
}

export async function conductState(db, actor, env = {}, relatedUserIds = []) {
  const at = Date.now(),
    isAdmin = admin(env, actor)
  const [roster, cases, restriction, reports] = await db.batch([
    bound(
      db,
      rosterCTE() +
        `
      SELECT p.matchId,p.title,p.hostId,p.endAt,p.personKey,p.name,p.uid,
        CASE WHEN n.id IS NOT NULL AND n.state<>'dismissed' THEN 'absent' ELSE coalesce(a.status,'unknown') END AS status,
        CASE WHEN p.hostId=? OR p.uid=? THEN n.state END AS caseStatus,
        EXISTS(SELECT 1 FROM praises pr WHERE pr.matchId=p.matchId AND pr.sender=? AND pr.recipient=p.uid) AS praised,
        EXISTS(SELECT 1 FROM attendance own WHERE own.matchId=p.matchId AND own.userId=? AND own.status='present') AS actorPresent
      FROM people p LEFT JOIN attendance a ON a.matchId=p.matchId AND a.personKey=p.personKey
      LEFT JOIN noShows n ON n.matchId=p.matchId AND n.personKey=p.personKey
      WHERE p.hostId=? OR p.uid=? OR (a.status='present' AND p.uid IS NOT NULL AND ? IS NOT NULL AND
        EXISTS(SELECT 1 FROM attendance own WHERE own.matchId=p.matchId AND own.userId=? AND own.status='present'))
      ORDER BY p.endAt DESC,p.matchId,(p.uid IS NOT p.hostId),p.personKey`,
      utc(at),
      actor,
      actor,
      actor,
      actor,
      actor,
      actor,
      utc(at - policy.praiseHours * hour),
      actor,
    ),
    bound(
      db,
      `SELECT n.id,n.matchId,m.title,n.name,n.state,n.deadline,n.appeal,n.reason,n.subjectId,n.representativeId,n.confirmedAt
      FROM noShows n JOIN matches m ON n.matchId=m.id WHERE ?=1 OR n.subjectId=? OR (n.subjectId IS NULL AND n.representativeId=?)
      ORDER BY n.openedAt DESC`,
      Number(isAdmin),
      actor,
      actor,
    ),
    bound(db, `SELECT ${restrictionUntilSQL('?', '?')} AS untilMs`, actor, at),
    bound(
      db,
      `SELECT g.id,g.targetType,CASE WHEN g.targetType='match' THEN m.title ELSE p.name END AS label,g.reason,g.at,g.state,g.result
      FROM generalReports g LEFT JOIN matches m ON g.targetType='match' AND m.id=g.targetId
      LEFT JOIN profiles p ON g.targetType='user' AND p.id=g.targetId WHERE ?=1 ORDER BY (g.state='pending') DESC,g.at DESC`,
      Number(isAdmin),
    ),
  ])
  const rooms = new Map()
  const ids = new Set([actor, ...relatedUserIds])
  for (const row of list(roster)) {
    const room = rooms.get(row.matchId) || {
      matchId: row.matchId,
      title: row.title,
      endAt: row.endAt,
      canManage: row.hostId === actor,
      participants: [],
    }
    const canPraise =
      !!row.actorPresent &&
      row.status === 'present' &&
      row.uid !== null &&
      row.uid !== actor &&
      at < Date.parse(row.endAt) + policy.praiseHours * hour
    room.participants.push({
      personKey: row.personKey,
      name: row.name,
      userId: row.uid,
      status: row.status,
      caseStatus: row.caseStatus,
      praised: !!row.praised,
      canPraise,
      canReport:
        !!row.actorPresent &&
        row.status === 'present' &&
        row.uid !== actor &&
        row.uid !== null,
    })
    rooms.set(row.matchId, room)
    if (row.uid) ids.add(row.uid)
  }
  // Replay the current valid source events chronologically so a reversed decision restores
  // the correct balance even when the original penalty had reached the temperature floor.
  const events = await bound(
    db,
    `WITH wanted AS (SELECT value AS id FROM json_each(?)),
    effective AS (
      SELECT a.userId,'present' AS action,a.changedAt AS at,a.id,? AS delta FROM attendance a JOIN wanted w ON w.id=a.userId WHERE a.status='present'
      UNION ALL SELECT p.recipient,'praise',p.at,p.id,? FROM praises p JOIN wanted w ON w.id=p.recipient
        WHERE EXISTS(SELECT 1 FROM attendance a WHERE a.matchId=p.matchId AND a.userId=p.sender AND a.status='present')
        AND EXISTS(SELECT 1 FROM attendance a WHERE a.matchId=p.matchId AND a.userId=p.recipient AND a.status='present')
      UNION ALL SELECT n.subjectId,'confirmed',n.confirmedAt,n.id,? FROM noShows n JOIN wanted w ON w.id=n.subjectId WHERE n.state='confirmed'
      UNION ALL SELECT ce.userId,ce.action,ce.at,ce.id,ce.delta FROM conductEvents ce JOIN wanted w ON w.id=ce.userId WHERE ce.action='late_cancel' OR (ce.action='report_penalty' AND EXISTS(SELECT 1 FROM report_cases rc WHERE rc.id=ce.source AND rc.state='confirmed'))
    ) SELECT userId,action,delta FROM effective ORDER BY at,id`,
    JSON.stringify([...ids]),
    policy.completedTenths,
    policy.praiseTenths,
    policy.noShowTenths,
  ).all()
  const scores = Object.fromEntries(
    [...ids].map((id) => [
      id,
      { temperature: policy.baseTenths / 10, completions: 0, praises: 0 },
    ]),
  )
  for (const event of list(events)) {
    const score = scores[event.userId]
    score.temperature =
      Math.max(
        policy.floorTenths,
        Math.min(
          policy.ceilingTenths,
          Math.round(score.temperature * 10) + event.delta,
        ),
      ) / 10
    if (event.action === 'present') score.completions++
    if (event.action === 'praise') score.praises++
  }
  return {
    scores,
    rooms: [...rooms.values()],
    cases: list(cases),
    restrictionUntil: list(restriction)[0]?.untilMs ?? null,
    isAdmin,
    reports: list(reports),
  }
}
