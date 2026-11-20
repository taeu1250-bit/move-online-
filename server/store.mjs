import {
  operationCommand,
  enrichOperations,
  runLifecycle,
} from './operations.mjs'
import { reportCommand, reportState, mannerHistory } from './reports-v2.mjs'
import {
  teamState,
  teamCommand,
  getActiveTeam,
  rosterLinksGuard,
} from './teams.mjs'
import {
  executeConduct,
  conductState,
  settleNoShows,
  restrictionUntilSQL,
} from './conduct.mjs'
import {
  policyVersion,
  matchLevels,
  validEndAt,
  validMatchInfo,
} from '../src/domain/feedback.ts'
import {
  acceptPolicy,
  checkLevel,
  companionIds,
  makeRoster,
  noOverlap,
  onlyRosterRemovals,
  setLevels,
} from './match-feedback.mjs'
import { pushCommand } from './reminders.mjs'
import { requireValue } from './identity.mjs'
import { sports, venues, canRepresentSport } from '../src/domain/model.ts'

const now = () => new Date().toISOString()
const random = () => crypto.randomUUID()
const sqlNow = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
const openMatch = `m.cancelledAt IS NULL AND m.start > ${sqlNow}`
const approvedSeats =
  "(SELECT coalesce(sum(json_array_length(a.roster)),0) FROM entries a WHERE a.matchId=m.id AND a.status='approved')"
const available = `(m.capacity-m.existing-${approvedSeats})`
const openOpponent =
  "NOT EXISTS(SELECT 1 FROM entries a WHERE a.matchId=m.id AND a.status='approved')"
const vacanciesFor = (size) =>
  `((m.kind='friendly' AND ${openOpponent}) OR (m.kind='pickup' AND ${size} <= ${available}))`
const active = "('approved','pending')"
const textValue = (v, min, max) =>
  typeof v === 'string' && v.trim().length >= min && v.length <= max
const whole = (v, min, max) => Number.isInteger(v) && v >= min && v <= max
const list = (v) => JSON.parse(v || '[]')
const confirmChange = (result) =>
  requireValue(
    result.meta.changes > 0,
    409,
    '권한이나 경기 상태가 변경됐어요. 최신 정보를 확인해 주세요.',
  )
function validNames(names) {
  return (
    Array.isArray(names) &&
    names.length <= 29 &&
    names.every((n) => textValue(n, 1, 30))
  )
}
export async function saveProfile(db, actor, input) {
  requireValue(
    textValue(input.name, 1, 30) &&
      whole(input.year, 2000, new Date().getUTCFullYear()) &&
      textValue(input.dept, 1, 60) &&
      ['', '입문', '중급', '숙련'].includes(input.skillLevel ?? ''),
    400,
    '이름, 입학연도, 학과와 운동 수준을 확인해 주세요.',
  )
  await db
    .prepare(
      'INSERT INTO profiles(id,name,year,dept,skillLevel) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,year=excluded.year,dept=excluded.dept,skillLevel=excluded.skillLevel',
    )
    .bind(
      actor,
      input.name.trim(),
      input.year,
      input.dept.trim(),
      input.skillLevel ?? '',
    )
    .run()
}
export async function snapshot(db, actor, env) {
  await runLifecycle(db)
  await settleNoShows(db)
  const query = (sql, ...args) => db.prepare(sql).bind(...args)
  const [own, games, applications, inbox] = await db.batch([
    query(
      'SELECT id,name,year,dept,skillLevel,levels FROM profiles WHERE id=?',
      actor,
    ),
    query(
      `SELECT m.id,m.hostId,m.kind,m.sport,m.title,m.venue,m.start,m.capacity,m.existing,m.fee,m.level,m.description,m.createdAt,m.homeTeam,m.hostTeamId,m.cancelledAt,m.endAt,m.info,p.name AS hostName,p.dept AS hostDept,p.year AS hostYear,p.levels AS hostLevels,
      CASE WHEN m.hostId=?1 THEN m.homeRoster END AS homeRoster,CASE WHEN m.hostId=?1 THEN m.homeMemberIds END AS homeMemberIds,
      CASE WHEN m.kind='friendly' THEN (SELECT count(*) FROM entries e WHERE e.matchId=m.id AND status='approved') ELSE ${approvedSeats} END AS approvals,
      (SELECT count(*) FROM entries e WHERE e.matchId=m.id AND status='pending') AS pendingCount,
      (SELECT team FROM entries e WHERE e.matchId=m.id AND status='approved' AND team IS NOT NULL LIMIT 1) AS opponent
      FROM matches m JOIN profiles p ON p.id=m.hostId WHERE m.start >= strftime('%Y-%m-%dT00:00:00Z','now','-30 days') OR m.hostId=?
      OR EXISTS(SELECT 1 FROM entries e WHERE e.matchId=m.id AND (e.userId=? OR (e.status='approved' AND ?1 IN (SELECT value FROM json_each(e.memberIds))))) OR ?1 IN (SELECT value FROM json_each(m.homeMemberIds)) ORDER BY m.start`,
      actor,
      actor,
      actor,
    ),
    query(
      `SELECT e.id,e.matchId,e.userId,e.team,e.note,e.status,e.at,e.roster,e.proposedRoster,e.proposedNote,e.rosterRevision,e.teamId,e.memberIds,e.proposedMemberIds,p.name,p.levels
      FROM entries e JOIN matches m ON m.id=e.matchId JOIN profiles p ON p.id=e.userId
      WHERE e.userId=? OR m.hostId=? ORDER BY e.at DESC,e.id`,
      actor,
      actor,
    ),
    query(
      'SELECT id,recipient AS "to",matchId,text,at,seen FROM notices WHERE recipient=? ORDER BY at DESC,rowid DESC',
      actor,
    ),
  ])
  const self = own.results[0]
  if (!self) return { needsProfile: true }
  const team = await getActiveTeam(db, actor, env)
  const users = new Map()
  function related(id, name, teamName) {
    const person = users.get(id) || {
      id,
      name: '모집자',
      dept: '',
      year: 0,
      role: 'student',
    }
    if (name) person.name = name
    if (teamName) person.team = teamName
    users.set(id, person)
  }
  const matches = games.results.map(
    ({ hostName, hostDept, hostYear, hostLevels, homeMemberIds, ...m }) => {
      related(m.hostId, hostName, m.homeTeam)
      Object.assign(users.get(m.hostId), {
        dept: hostDept,
        year: hostYear,
        levels: JSON.parse(hostLevels || '{}'),
      })
      const roster = m.homeRoster ? list(m.homeRoster) : undefined
      return {
        ...m,
        info: JSON.parse(m.info || '{}'),
        homeRoster: roster,
        homeMemberIds: roster ? companionIds(homeMemberIds, roster) : undefined,
      }
    },
  )
  const entries = applications.results.map(
    ({
      name,
      levels,
      roster,
      memberIds,
      proposedRoster,
      proposedMemberIds,
      ...e
    }) => {
      related(e.userId, name, e.team)
      Object.assign(users.get(e.userId), { levels: JSON.parse(levels || '{}') })
      const names = list(roster),
        proposed = proposedRoster ? list(proposedRoster) : undefined
      return {
        ...e,
        roster: names,
        memberIds: companionIds(memberIds, names),
        proposedRoster: proposed,
        proposedMemberIds: proposed
          ? companionIds(proposedMemberIds, proposed)
          : undefined,
      }
    },
  )
  users.set(actor, {
    ...self,
    levels: JSON.parse(self.levels || '{}'),
    role: team ? 'leader' : 'student',
    team: team?.name,
    teamSport: team?.sport,
  })
  const [hub, conduct, consent] = await Promise.all([
    teamState(db, actor, env),
    conductState(db, actor, env, [...users.keys()]),
    query(
      'SELECT at FROM policy_consents WHERE userId=? AND version=?',
      actor,
      policyVersion,
    ).first(),
  ])
  return enrichOperations(db, actor, {
    mannerHistory: await mannerHistory(db, actor),
    reportCases: await reportState(db, actor, env),
    teamHub: hub,
    conduct,
    policy: { version: policyVersion, accepted: !!consent },
    pushPublicKey:
      env.MOOV_REMINDERS_ENABLED === '1' ? env.WEB_PUSH_PUBLIC_KEY || '' : '',
    version: 1,
    currentId: actor,
    users: [...users.values()],
    matches,
    entries,
    notices: inbox.results.map(({ seen, ...n }) => ({ ...n, read: !!seen })),
  })
}
export async function execute(db, actor, c, env) {
  const stmt = (sql, ...v) => db.prepare(sql).bind(...v)
  const self = await stmt(
    'SELECT name,dept,levels FROM profiles WHERE id=?',
    actor,
  ).first()
  requireValue(self?.dept, 403, '프로필을 먼저 등록해 주세요.')
  requireValue(typeof c.type === 'string', 400, '요청 종류를 확인해 주세요.')
  if (await reportCommand(db, actor, c, env)) return
  if (
    [
      'create',
      'apply',
      'review',
      'editEntry',
      'editMatch',
      'cancelMatch',
      'finishMatch',
      'reviewRoster',
    ].includes(c.type) ||
    c.type.startsWith('ops.')
  ) {
    if (await operationCommand(db, actor, c, env)) return
  }
  if (c.type === 'apply' || c.type === 'editEntry')
    requireValue(
      (c.members || []).length === (c.memberIds || []).length &&
        (c.memberIds || []).every((x) => typeof x === 'string'),
      400,
      '가입한 회원만 참가자로 선택할 수 있어요.',
    )
  if (c.type.startsWith('team.')) return teamCommand(db, actor, c, env)
  if (c.type.startsWith('conduct')) return executeConduct(db, actor, c, env)
  if (c.type === 'acceptPolicy') return acceptPolicy(db, actor, c.version)
  if (c.type === 'setLevels') return setLevels(db, actor, c.levels)
  if (c.type === 'pushSubscribe' || c.type === 'pushUnsubscribe')
    return pushCommand(db, actor, c, env)
  if (c.type === 'finishMatch') {
    confirmChange(
      await stmt(
        `UPDATE matches SET endAt=? WHERE id=? AND hostId=? AND endAt IS NULL AND cancelledAt IS NULL AND start<=${sqlNow}`,
        now(),
        c.matchId,
        actor,
      ).run(),
    )
    return
  }
  const role = await getActiveTeam(db, actor, env),
    event = random(),
    at = now()
  if (c.type === 'readNotices') {
    await stmt(
      'UPDATE notices SET seen=1 WHERE recipient=? AND seen=0',
      actor,
    ).run()
    return
  }
  // Every notice and related write is tied to the mutation that actually won the conditional write.
  // D1 executes each batch in a single transaction. Roster totals are derived from approved rows.
  const notices = (message, condition, args, recipient = 'e.userId') =>
    stmt(
      `INSERT INTO notices(id,recipient,matchId,text,at)
    SELECT lower(hex(randomblob(16))),${recipient},m.id,m.title || ' · ' || ?,?
    FROM entries e JOIN matches m ON m.id=e.matchId WHERE ${condition}`,
      message,
      at,
      ...args,
    )
  if (c.type === 'create' || c.type === 'editMatch') {
    const f = c.fields
    requireValue(
      f &&
        /^[a-f0-9-]{20,40}$/.test(c.type === 'create' ? c.id : c.matchId) &&
        textValue(f.title, 1, 40) &&
        sports.includes(f.sport) &&
        venues.includes(f.venue) &&
        ['pickup', 'friendly'].includes(f.kind) &&
        (f.level === '' ||
          [...matchLevels, '누구나 환영', '숙련자 위주'].includes(f.level)) &&
        validEndAt(f.start, f.endAt) &&
        validMatchInfo(f.sport, f.info) &&
        textValue(f.description, 0, 500) &&
        whole(f.capacity, 2, 30) &&
        whole(f.existing, 1, f.capacity) &&
        whole(f.fee, 0, 1000000) &&
        typeof f.start === 'string' &&
        Date.parse(f.start) > Date.now() &&
        validNames(f.members) &&
        f.members.length === f.existing - 1,
      400,
      '경기 정보와 기존 참가자 명단을 확인해 주세요.',
    )
    let savedMatch
    if (c.type === 'editMatch') {
      savedMatch = await stmt(
        'SELECT hostTeamId,homeRoster,homeMemberIds,kind,homeTeam FROM matches WHERE id=? AND hostId=?',
        c.matchId,
        actor,
      ).first()
      requireValue(savedMatch, 409, '본인의 모집글만 수정할 수 있어요.')
    }
    const teamId = savedMatch ? savedMatch.hostTeamId : (role?.id ?? null)
    const previous = savedMatch
      ? {
          names: list(savedMatch.homeRoster).slice(1),
          ids: companionIds(
            savedMatch.homeMemberIds,
            list(savedMatch.homeRoster),
          ),
        }
      : undefined
    const home = await makeRoster(
      db,
      actor,
      teamId,
      self.name,
      f.members,
      f.memberIds,
      previous,
    )
    if (f.kind === 'friendly' && !savedMatch)
      requireValue(
        role &&
          canRepresentSport(role.sport, f.sport) &&
          f.capacity === f.existing,
        403,
        '해당 종목의 팀 대표만 친선경기를 열 수 있어요.',
      )
    if (c.type === 'editMatch') {
      const result = await db.batch([
        stmt(
          `UPDATE matches AS m SET title=?,venue=?,start=?,capacity=?,existing=?,fee=?,level=?,description=?,homeRoster=?,homeMemberIds=?,endAt=?,info=?,mutation=?
          WHERE id=? AND hostId=? AND kind=? AND sport=? AND ${openMatch}
          AND (kind='friendly' OR ? + ${approvedSeats} <= ?) AND ${rosterLinksGuard} AND ${noOverlap('?', "''", false)}`,
          f.title.trim(),
          f.venue,
          new Date(f.start).toISOString(),
          f.capacity,
          f.existing,
          f.fee,
          f.level,
          f.description.trim(),
          JSON.stringify(home.names),
          JSON.stringify(home.ids),
          f.endAt ? new Date(f.endAt).toISOString() : null,
          JSON.stringify(f.info || {}),
          event,
          c.matchId,
          actor,
          f.kind,
          f.sport,
          f.existing,
          f.capacity,
          home.fresh,
          actor,
          teamId,
          JSON.stringify(home.ids),
        ),
        notices(
          '경기 정보가 변경됐어요.',
          `m.mutation=? AND e.status IN ${active}`,
          [event],
        ),
      ])
      confirmChange(result[0])
      return
    }
    const row = await stmt(
      `INSERT INTO matches(id,hostId,kind,sport,title,venue,start,capacity,existing,fee,level,description,createdAt,homeTeam,homeRoster,hostTeamId,homeMemberIds,endAt,info)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${rosterLinksGuard} ON CONFLICT(id) DO NOTHING`,
      c.id,
      actor,
      f.kind,
      f.sport,
      f.title.trim(),
      f.venue,
      new Date(f.start).toISOString(),
      f.capacity,
      f.existing,
      f.fee,
      f.level,
      f.description.trim(),
      at,
      role?.name || null,
      JSON.stringify(home.names),
      teamId,
      JSON.stringify(home.ids),
      f.endAt ? new Date(f.endAt).toISOString() : null,
      JSON.stringify(f.info || {}),
      home.fresh,
      actor,
      teamId,
    ).run()
    confirmChange(row)
    return
  }
  if (c.type === 'cancelMatch') {
    const result = await db.batch([
      stmt(
        `UPDATE matches AS m SET cancelledAt=?,mutation=? WHERE id=? AND hostId=? AND ${openMatch}`,
        at,
        event,
        c.matchId,
        actor,
      ),
      notices(
        '모집자가 경기를 취소했어요.',
        `m.mutation=? AND e.status IN ${active}`,
        [event],
      ),
      stmt(
        `UPDATE entries SET status='cancelled',mutation=?,proposedRoster=NULL,proposedNote=NULL,proposedMemberIds=NULL,rosterRevision=rosterRevision+1 WHERE matchId IN(SELECT id FROM matches WHERE mutation=?) AND status IN ${active}`,
        event,
        event,
      ),
    ])
    confirmChange(result[0])
    return
  }
  if (c.type === 'apply' || c.type === 'editEntry') {
    requireValue(
      textValue(c.note, 0, 200) && validNames(c.members),
      400,
      '신청 한마디와 참가자 이름을 확인해 주세요.',
    )
    const members = c.members.map((name) => name.trim().normalize('NFC'))
    if (c.type === 'editEntry') {
      const entry = await stmt(
        `SELECT roster,status,rosterRevision,teamId,memberIds FROM entries
        WHERE id=? AND userId=? AND status IN ${active}`,
        c.entryId,
        actor,
      ).first()
      requireValue(
        entry &&
          (c.revision === undefined || c.revision === entry.rosterRevision),
        409,
        '신청 상태가 변경됐어요. 최신 명단을 확인해 주세요.',
      )
      const before = list(entry.roster)
      const beforeIds = [actor, ...companionIds(entry.memberIds, before)]
      const group = await makeRoster(
        db,
        actor,
        entry.teamId,
        before[0],
        members,
        c.memberIds,
        { names: before.slice(1), ids: beforeIds.slice(1) },
      )
      const names = group.names
      const needsReview =
        entry.status === 'approved' &&
        !onlyRosterRemovals(before, beforeIds, names, group.ids)
      const assignment = needsReview
        ? 'proposedRoster=?,proposedMemberIds=?,proposedNote=?'
        : 'roster=?,memberIds=?,note=?,proposedRoster=NULL,proposedNote=NULL,proposedMemberIds=NULL'
      const result = await db.batch([
        stmt(
          `UPDATE entries SET ${assignment},rosterRevision=rosterRevision+1,mutation=?
          WHERE id=? AND userId=? AND status=? AND rosterRevision=?
          AND EXISTS(SELECT 1 FROM matches m WHERE m.id=entries.matchId AND ${openMatch}
            AND (entries.status='approved' OR m.kind='friendly' OR ? <= ${available})) AND ${rosterLinksGuard}`,
          JSON.stringify(names),
          JSON.stringify(group.ids),
          c.note.trim(),
          event,
          c.entryId,
          actor,
          entry.status,
          entry.rosterRevision,
          names.length,
          group.fresh,
          actor,
          entry.teamId,
        ),
        notices(
          needsReview
            ? '참가 명단 변경 승인을 요청했어요.'
            : '참가 신청 내용이 변경됐어요.',
          'e.mutation=?',
          [event],
          'm.hostId',
        ),
      ])
      confirmChange(result[0])
      return
    }
    const target = await stmt(
      'SELECT sport,level FROM matches WHERE id=?',
      c.matchId,
    ).first()
    requireValue(target, 409, '경기를 확인해 주세요.')
    requireValue(
      await stmt(
        'SELECT 1 AS ok FROM policy_consents WHERE userId=? AND version=?',
        actor,
        policyVersion,
      ).first(),
      403,
      '경기 참가 및 매너 안내를 확인해 주세요.',
    )
    checkLevel(target.level, self.levels, target.sport, c.levelAcknowledged)
    await settleNoShows(db)
    const group = await makeRoster(
      db,
      actor,
      role?.id ?? null,
      self.name,
      members,
      c.memberIds,
    )
    const roster = JSON.stringify(group.names)
    const id = random()
    const results = await db.batch([
      stmt(
        `INSERT INTO entries(id,matchId,userId,team,roster,note,status,at,mutation,teamId,memberIds)
      SELECT ?,m.id,?,CASE WHEN m.kind='friendly' THEN ? END,?,?,'pending',?,?,?,?
      FROM matches m WHERE m.id=? AND m.hostId<>? AND ${openMatch} AND ${vacanciesFor('?')}
      AND m.level=? AND ${rosterLinksGuard} AND COALESCE(${restrictionUntilSQL('?', "unixepoch('now')*1000")},0) <= unixepoch('now')*1000
      AND (m.kind='pickup' OR (m.kind='friendly' AND ? IS NOT NULL AND (CASE WHEN m.hostTeamId IS NOT NULL THEN m.hostTeamId<>? ELSE m.homeTeam<>? END) AND NOT EXISTS(SELECT 1 FROM entries e WHERE e.matchId=m.id AND e.teamId=? AND e.status IN ${active}) AND
        (m.sport=? OR (m.sport IN ('축구','풋살') AND ? IN ('축구','풋살'))))) ON CONFLICT DO NOTHING`,
        id,
        actor,
        role?.name || null,
        roster,
        c.note.trim(),
        at,
        event,
        role?.id ?? null,
        JSON.stringify(group.ids),
        c.matchId,
        actor,
        members.length + 1,
        target.level,
        group.fresh,
        actor,
        role?.id ?? null,
        actor,
        role?.name || null,
        role?.id ?? null,
        role?.name || null,
        role?.id ?? null,
        role?.sport || null,
        role?.sport || null,
      ),
      notices(
        '새 참가 신청이 도착했어요.',
        'e.mutation=?',
        [event],
        'm.hostId',
      ),
      notices('신청을 접수했어요.', 'e.mutation=?', [event]),
    ])
    confirmChange(results[0])
    return
  }
  if (c.type === 'reviewRoster') {
    requireValue(
      ['approve', 'reject'].includes(c.decision) &&
        Number.isSafeInteger(c.revision),
      400,
      '명단 변경 요청을 확인해 주세요.',
    )
    const approve = c.decision === 'approve'
    const result = await db.batch([
      stmt(
        `UPDATE entries SET ${approve ? 'roster=proposedRoster,memberIds=proposedMemberIds,note=proposedNote,' : ''}proposedRoster=NULL,proposedNote=NULL,proposedMemberIds=NULL,rosterRevision=rosterRevision+1,mutation=?
        WHERE id=? AND status='approved' AND proposedRoster IS NOT NULL AND rosterRevision=?
        AND EXISTS(SELECT 1 FROM matches m WHERE m.id=entries.matchId AND m.hostId=? AND ${openMatch}
        ${approve ? `AND (m.kind='friendly' OR json_array_length(entries.proposedRoster)-json_array_length(entries.roster) <= ${available}) AND ${noOverlap('entries.proposedMemberIds', 'entries.id')}` : ''})`,
        event,
        c.entryId,
        c.revision,
        actor,
      ),
      notices(
        approve
          ? '참가 명단 변경이 승인됐어요.'
          : '명단 변경이 거절됐어요. 기존 명단으로 참가해요.',
        'e.mutation=?',
        [event],
      ),
    ])
    confirmChange(result[0])
    return
  }
  requireValue(
    c.type === 'review' && ['approve', 'reject', 'cancel'].includes(c.decision),
    400,
    '지원하지 않는 요청이에요.',
  )
  const cancel = c.decision === 'cancel',
    approve = c.decision === 'approve'
  const result = await db.batch([
    stmt(
      `UPDATE entries SET status=?,mutation=?,proposedRoster=NULL,proposedNote=NULL,proposedMemberIds=NULL,rosterRevision=rosterRevision+1 WHERE id=? AND status IN ${cancel ? active : "('pending')"}
      AND EXISTS(SELECT 1 FROM matches m WHERE m.id=entries.matchId AND ${openMatch}
        AND ${cancel ? 'entries.userId' : 'm.hostId'}=? ${approve ? 'AND ' + vacanciesFor('json_array_length(entries.roster)') + ' AND ' + noOverlap('COALESCE(entries.memberIds,json_array(entries.userId))', 'entries.id') : ''})
        AND (? IS NULL OR rosterRevision=?)`,
      approve ? 'approved' : cancel ? 'cancelled' : 'rejected',
      event,
      c.entryId,
      actor,
      c.revision ?? null,
      c.revision ?? null,
    ),
    notices(
      approve
        ? '참가가 확정됐어요.'
        : cancel
          ? '참가가 취소됐어요.'
          : '신청이 거절됐어요.',
      'e.mutation=?',
      [event],
    ),
    ...(cancel
      ? [
          notices(
            '참가 신청이 취소됐어요.',
            'e.mutation=? AND e.userId=?',
            [event, actor],
            'm.hostId',
          ),
        ]
      : []),
    ...(approve
      ? [
          stmt(
            `UPDATE entries SET status='unselected',mutation=? WHERE status='pending' AND matchId IN
        (SELECT matchId FROM entries WHERE id=? AND mutation=? AND team IS NOT NULL)`,
            event,
            c.entryId,
            event,
          ),
          notices(
            '다른 상대팀이 선정됐어요.',
            "e.mutation=? AND e.status='unselected'",
            [event],
          ),
        ]
      : []),
  ])
  confirmChange(result[0])
}
