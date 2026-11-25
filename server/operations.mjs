import { operationVacancyNotices } from './vacancies.mjs'
import { requireValue } from './identity.mjs'
import { getActiveTeam } from './teams.mjs'
import { restrictionUntilSQL } from './conduct.mjs'
import {
  policyVersion,
  validEndAt,
  validMatchInfo,
  formats,
  matchLevels,
} from '../src/domain/feedback.ts'
import { checkLevel } from './match-feedback.mjs'
import { sports, validVenue, canRepresentSport } from '../src/domain/model.ts'
import {
  operationPolicy as P,
  automaticEndAt,
  cancelReasons,
} from '../src/domain/operations.ts'
const H = 3600000,
  M = 60000
const q = (db, sql, ...v) => db.prepare(sql).bind(...v)
const iso = (n) => new Date(n).toISOString()
const id = () => crypto.randomUUID()
const ok = (
  v,
  message = '경기 상태가 변경됐어요. 새로고침 후 다시 시도해 주세요.',
  code = 409,
) => requireValue(v, code, message)
const text = (s, n) => typeof s === 'string' && s.length <= n
export const confirmedPeople = (s) =>
  s.people.filter((p) => p.consent === 'accepted' && p.approved)
const count = (s) => confirmedPeople(s).length
const available = (s) => !s.cancelledAt && !s.startedAt && !s.endedAt
const allRecipients = (s) => [
  ...new Set([s.hostId, ...s.people.map((p) => p.userId)]),
]
function notify(s, message) {
  s.outbox.push(...allRecipients(s).map((userId) => ({ userId, message })))
}
function cancel(s, reason, at) {
  s.cancelledAt = at
  s.cancelledReason = reason
  s.closed = true
  s.delegation = null
  notify(s, '경기가 취소됐어요. · ' + reason)
}
function nextDelegate(s, at) {
  const d = s.delegation
  const target = confirmedPeople(s)
    .filter((p) => p.userId !== d.from && !d.declined.includes(p.userId))
    .sort(
      (a, b) =>
        a.confirmedAt - b.confirmedAt || a.userId.localeCompare(b.userId),
    )[0]
  if (!target || at >= s.start) {
    cancel(s, '모집자 위임 불가', at)
    return
  }
  d.target = target.userId
  d.requestedAt = at
  d.expiresAt = Math.min(at + P.delegationMinutes * M, s.start)
  s.outbox.push({
    userId: target.userId,
    message: '모집자 권한 위임 요청 · 새로운 모집자로 활동하시겠습니까?',
  })
}
export function advance(s, at) {
  s.outbox ||= []
  if (s.cancelledAt || s.endedAt) return s
  if (s.delegation && at >= s.delegation.expiresAt) {
    s.delegation.declined.push(s.delegation.target)
    nextDelegate(s, at)
  }
  if (s.cancelledAt) return s
  const n = count(s)
  if (n >= s.min) s.everMet = true
  if (!s.startedAt) {
    if (!s.lightningSource && at >= s.start - P.lightningHours * H && n < s.min)
      s.lightningSource = 'converted'
    if (
      s.lightningSource === 'converted' &&
      !s.everMet &&
      at >= s.start - P.autoCancelHours * H
    ) {
      cancel(s, '시스템 자동 취소 · 최소 인원 부족', at)
      return s
    }
    if (
      !s.delegation &&
      n >= s.min &&
      (s.kind !== 'friendly' ||
        s.requests.some((r) => r.status === 'approved')) &&
      at >= s.start + P.autoStartMinutes * M &&
      at < s.end
    ) {
      s.startedAt = at
      s.autoStarted = true
      notify(
        s,
        '경기가 자동으로 진행 중 상태로 변경됐어요. 출석은 별도로 확인해요.',
      )
    }
  }
  if (s.startedAt && at >= automaticEndAt(s.startedAt, s.end)) {
    s.endedAt = automaticEndAt(s.startedAt, s.end)
    notify(s, '경기가 종료됐어요. 출석 확인 후 함께한 회원을 칭찬해 보세요.')
  }
  return s
}
function penalty(s, userId, source, at) {
  s.events.push({
    userId,
    source,
    action: 'late_cancel',
    delta: P.lateCancelTenths,
    at,
  })
}
function leavePerson(s, userId, at, penaltyAt = at) {
  const p = s.people.find(
    (p) => p.userId === userId && ['pending', 'accepted'].includes(p.consent),
  )
  ok(p, '취소할 참가 내역이 없어요.')
  if (
    p.approved &&
    p.consent === 'accepted' &&
    penaltyAt >= s.start - P.lateCancelHours * H
  )
    penalty(s, userId, `cancel:${s.id}:${userId}:${p.requestId || 'home'}`, at)
  p.consent = 'cancelled'
  p.approved = false
  if (p.requestId) {
    const r = s.requests.find((r) => r.id === p.requestId)
    if (
      !s.people.some(
        (p) =>
          p.requestId === r.id && ['accepted', 'pending'].includes(p.consent),
      )
    )
      r.status = 'cancelled'
  }
  s.closed = false
}
function validateFields(f, at) {
  ok(
    f &&
      sports.includes(f.sport) &&
      validVenue(f.venue) &&
      ['pickup', 'friendly'].includes(f.kind),
    '종목과 장소를 확인해 주세요.',
    400,
  )
  ok(
    text(f.title, 40) &&
      f.title.trim() &&
      text(f.description, 500) &&
      Number.isInteger(f.fee) &&
      f.fee >= 0 &&
      f.fee <= 1000000,
    '경기 정보를 확인해 주세요.',
    400,
  )
  ok(
    (f.level === '' ||
      [...matchLevels, '누구나 환영', '숙련자 위주'].includes(f.level)) &&
      validMatchInfo(f.sport, f.info),
    '운동 수준과 경기 방식을 확인해 주세요.',
    400,
  )
  ok(
    Date.parse(f.start) > at && f.endAt && validEndAt(f.start, f.endAt),
    '미래의 시작 시각과 시작 후 ' + P.maxPlayHours + '시간 이내의 종료 시각을 입력해 주세요.',
    400,
  )
  ok(
    Number.isInteger(f.capacity) &&
      f.capacity >= 2 &&
      f.capacity <= 30 &&
      Number.isInteger(f.minCapacity) &&
      f.minCapacity >= 2 &&
      f.minCapacity <= f.capacity,
    '최소·최대 인원은 2~30명이며 최소가 최대보다 클 수 없어요.',
    400,
  )
  if (formats[f.sport])
    ok(
      formats[f.sport].includes(f.minFormat) &&
        formats[f.sport].includes(f.maxFormat),
      '최소·최대 경기 방식을 선택해 주세요.',
      400,
    )
}
async function selectedMembers(db, actor, teamId, ids, names) {
  ok(
    Array.isArray(ids) &&
      ids.length <= 29 &&
      new Set(ids).size === ids.length &&
      ids.every((x) => typeof x === 'string' && x !== actor),
    '가입한 팀원만 선택해 주세요.',
    400,
  )
  ok(
    !names || names.length === ids.length,
    '이름으로만 참가자를 등록할 수 없어요.',
    400,
  )
  const records = []
  for (const uid of ids) {
    const p = await q(
      db,
      `SELECT p.id,p.name FROM profiles p JOIN team_members tm ON tm.userId=p.id JOIN teams t ON t.id=tm.teamId WHERE p.id=? AND t.id=? AND t.ownerId=? AND tm.status='accepted' AND t.archivedAt IS NULL`,
      uid,
      teamId,
      actor,
    ).first()
    ok(p, '수락한 팀 회원만 선택할 수 있어요.', 403)
    records.push(p)
  }
  return records
}
export async function loadOperation(db, matchId) {
  const row = await q(
    db,
    'SELECT * FROM match_operations WHERE matchId=?',
    matchId,
  ).first()
  return row
    ? { ...row, originalState: row.state, state: JSON.parse(row.state) }
    : null
}
async function persist(db, row, s, actor, action, at, extra = []) {
  const mutation = id(),
    revision = row.revision + 1
  const out = s.outbox || [],
    events = s.events || []
  delete s.outbox
  delete s.events
  const guard =
    'EXISTS(SELECT 1 FROM match_operations WHERE matchId=? AND mutation=?)'
  const previous = row.originalState
    ? JSON.parse(row.originalState)
    : typeof row.state === 'string'
      ? JSON.parse(row.state)
      : row.state
  const fresh = s.people
    .filter(
      (p) =>
        !previous.people.some(
          (old) => old.userId === p.userId && old.requestId === p.requestId,
        ),
    )
    .flatMap((p) => {
      const r = s.requests.find((r) => r.id === p.requestId)
      return r && r.ownerId !== p.userId
        ? [{ userId: p.userId, teamId: r.teamId, ownerId: r.ownerId }]
        : []
    })
  const batch = [
    q(
      db,
      `UPDATE match_operations SET state=?,revision=?,mutation=?,updatedAt=? WHERE matchId=? AND revision=? AND NOT EXISTS(SELECT 1 FROM json_each(?) f WHERE NOT EXISTS(SELECT 1 FROM team_members tm JOIN teams t ON t.id=tm.teamId WHERE tm.userId=json_extract(f.value,'$.userId') AND tm.teamId=json_extract(f.value,'$.teamId') AND t.ownerId=json_extract(f.value,'$.ownerId') AND tm.status='accepted' AND t.archivedAt IS NULL))`,
      JSON.stringify(s),
      revision,
      mutation,
      at,
      s.id,
      row.revision,
      JSON.stringify(fresh),
    ),
  ]
  // All materialized views and side effects are guarded by the winning compare-and-swap.
  batch.push(
    q(
      db,
      `UPDATE matches SET hostId=?,title=?,venue=?,start=?,capacity=?,fee=?,level=?,description=?,endAt=?,info=?,cancelledAt=?,mutation=? WHERE id=? AND ${guard}`,
      s.hostId,
      s.title,
      s.venue,
      iso(s.start),
      s.max,
      s.fee,
      s.level,
      s.description,
      iso(s.end),
      JSON.stringify(s.info),
      s.cancelledAt ? iso(s.cancelledAt) : null,
      mutation,
      s.id,
      s.id,
      mutation,
    ),
  )
  for (const r of s.requests) {
    const people = s.people.filter(
      (p) =>
        p.requestId === r.id &&
        p.consent !== 'cancelled' &&
        p.consent !== 'rejected',
    )
    batch.push(
      q(
        db,
        `INSERT INTO entries(id,matchId,userId,team,roster,note,status,at,mutation,teamId,memberIds,rosterRevision) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard} ON CONFLICT(id) DO UPDATE SET roster=excluded.roster,note=excluded.note,status=excluded.status,memberIds=excluded.memberIds,mutation=excluded.mutation,rosterRevision=excluded.rosterRevision`,
        r.id,
        s.id,
        r.ownerId,
        s.kind === 'friendly' ? r.team : null,
        JSON.stringify(people.map((p) => p.name)),
        r.note,
        s.cancelledAt ? 'cancelled' : r.status,
        iso(r.at),
        mutation,
        r.teamId,
        JSON.stringify(people.map((p) => p.userId)),
        r.revision,
        s.id,
        mutation,
      ),
    )
  }
  for (const [i, n] of out.entries())
    batch.push(
      q(
        db,
        `INSERT OR IGNORE INTO notices(id,recipient,matchId,text,at) SELECT ?,?,?,?,? WHERE ${guard}`,
        mutation + ':' + i,
        n.userId,
        s.id,
        s.title + ' · ' + n.message,
        iso(at),
        s.id,
        mutation,
      ),
    )
  for (const e of events)
    batch.push(
      q(
        db,
        `INSERT OR IGNORE INTO conductEvents(id,matchId,userId,action,delta,source,at) SELECT ?,?,?,?,?,?,? WHERE ${guard}`,
        id(),
        s.id,
        e.userId,
        e.action,
        e.delta,
        e.source,
        e.at,
        s.id,
        mutation,
      ),
    )
  batch.push(
    q(
      db,
      `INSERT INTO operation_audit(id,matchId,actor,action,detail,at) SELECT ?,?,?,?,?,? WHERE ${guard}`,
      mutation,
      s.id,
      actor,
      action,
      JSON.stringify({
        revision,
        count: count(s),
        min: s.min,
        manualBelowMinimum: !!s.manualBelowMinimum,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        cancelledReason: s.cancelledReason,
        delegation: s.delegation,
      }),
      at,
      s.id,
      mutation,
    ),
  )
  const wasFull = previous.closed || count(previous) >= previous.max
  if (s.kind === 'pickup' && wasFull && count(s) < count(previous) &&
      ['ops.leave', 'ops.delegate', 'review', 'reviewRoster'].includes(action)) {
    const departingUser = action === 'ops.delegate' ? previous.hostId : actor
    batch.push(...operationVacancyNotices(db, s.id, mutation, departingUser))
  }
  batch.push(...extra.map((fn) => fn(guard, s.id, mutation)))
  const results = await db.batch(batch)
  ok(results[0].meta.changes === 1)
}
export async function createOperation(db, actor, c, env, at = Date.now()) {
  const f = c.fields
  validateFields(f, at)
  ok(
    typeof c.id === 'string' && /^[a-f0-9-]{20,40}$/.test(c.id),
    '모집글을 다시 등록해 주세요.',
    400,
  )
  const self = await q(db, 'SELECT * FROM profiles WHERE id=?', actor).first()
  ok(self?.dept, '프로필을 등록해 주세요.', 403)
  const team = await getActiveTeam(db, actor, env)
  if (f.kind === 'friendly')
    ok(
      team && canRepresentSport(team.sport, f.sport),
      '해당 종목의 팀 대표만 친선경기를 모집할 수 있어요.',
      403,
    )
  const selected = await selectedMembers(
    db,
    actor,
    team?.id || null,
    f.memberIds || [],
    f.members,
  )
  ok(
    selected.length + 1 <= f.capacity,
    '선택한 인원이 최대 인원보다 많아요.',
    400,
  )
  const s = {
    id: c.id,
    hostId: actor,
    kind: f.kind,
    sport: f.sport,
    title: f.title.trim(),
    venue: f.venue,
    start: Date.parse(f.start),
    end: Date.parse(f.endAt),
    max: f.capacity,
    min: f.minCapacity,
    minFormat: f.minFormat || '',
    maxFormat: f.maxFormat || '',
    finalFormat: '',
    fee: f.fee,
    level: f.level,
    description: f.description.trim(),
    info: f.info || {},
    teamId: team?.id || null,
    teamName: team?.name || null,
    people: [
      {
        userId: actor,
        name: self.name,
        requestId: null,
        consent: 'accepted',
        approved: true,
        confirmedAt: at,
      },
      ...selected.map((p) => ({
        userId: p.id,
        name: p.name,
        requestId: null,
        consent: 'pending',
        approved: true,
        confirmedAt: null,
      })),
    ],
    requests: [],
    startedAt: null,
    endedAt: null,
    cancelledAt: null,
    cancelledReason: null,
    lightningSource:
      Date.parse(f.start) - at <= P.autoCancelHours * H ? 'new' : null,
    everMet: false,
    closed: false,
    delegation: null,
  }
  const mutation = id()
  await db.batch([
    q(
      db,
      `INSERT INTO matches(id,hostId,kind,sport,title,venue,start,capacity,existing,fee,level,description,createdAt,homeTeam,homeRoster,hostTeamId,homeMemberIds,endAt,info,mutation) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      s.id,
      actor,
      f.kind,
      f.sport,
      s.title,
      f.venue,
      iso(s.start),
      s.max,
      1,
      s.fee,
      s.level,
      s.description,
      iso(at),
      team?.name || null,
      JSON.stringify([self.name]),
      team?.id || null,
      JSON.stringify([actor]),
      iso(s.end),
      JSON.stringify(s.info),
      mutation,
    ),
    q(
      db,
      'INSERT INTO match_operations(matchId,state,mutation,updatedAt) VALUES(?,?,?,?)',
      s.id,
      JSON.stringify(s),
      mutation,
      at,
    ),
    ...selected.map((p) =>
      q(
        db,
        'INSERT INTO notices(id,recipient,matchId,text,at) VALUES(?,?,?,?,?)',
        id(),
        p.id,
        s.id,
        '경기 참가 동의 요청 · ' + s.title,
        iso(at),
      ),
    ),
  ])
  return true
}
export async function runLifecycle(db, at = Date.now(), selectedIds = null) {
  const rows = await q(
    db,
    `SELECT * FROM match_operations WHERE json_extract(state,'$.cancelledAt') IS NULL AND json_extract(state,'$.endedAt') IS NULL ${selectedIds ? 'AND matchId IN (SELECT value FROM json_each(?))' : ''}`,
    ...(selectedIds ? [JSON.stringify(selectedIds)] : []),
  ).all()
  let changed = 0
  for (const row of rows.results) {
    const s = JSON.parse(row.state),
      before = JSON.stringify(s)
    advance(s, at)
    const compare = { ...s }
    delete compare.outbox
    if (JSON.stringify(compare) === before && !s.outbox.length) continue
    try {
      await persist(db, row, s, null, 'automatic', at)
      changed++
    } catch (e) {
      if (e.status !== 409) throw e
    }
  }
  return { checked: rows.results.length, changed, at: iso(at) }
}
export async function operationCommand(db, actor, c, env) {
  const at = Date.now()
  if (c.type === 'create') return createOperation(db, actor, c, env, at)
  let matchId = c.matchId
  if (!matchId && c.entryId)
    matchId = (
      await q(db, 'SELECT matchId FROM entries WHERE id=?', c.entryId).first()
    )?.matchId
  const row = matchId ? await loadOperation(db, matchId) : null
  if (!row) return false
  // Due changes commit before commands, so a failed command cannot undo an elapsed deadline.
  await runLifecycle(db, at)
  const current = await loadOperation(db, matchId),
    s = current.state
  s.outbox = []
  s.events = []
  const mine = s.hostId === actor,
    person = s.people.find(
      (p) => p.userId === actor && ['pending', 'accepted'].includes(p.consent),
    )
  const beforeStart = () =>
    ok(available(s) && at < s.start, '경기 시작 전 진행할 수 있어요.')
  const host = () => ok(mine, '현재 모집자만 처리할 수 있어요.', 403)
  if (
    s.delegation &&
    !['ops.delegate', 'ops.cancel', 'cancelMatch'].includes(c.type)
  )
    ok(false, '모집자 위임이 끝난 후 처리할 수 있어요.')
  switch (c.type) {
    case 'apply': {
      beforeStart()
      ok(
        !s.closed &&
          !person &&
          actor !== s.hostId &&
          !s.requests.some(
            (r) =>
              r.ownerId === actor && ['pending', 'approved'].includes(r.status),
          ),
        '이미 참가 중이거나 모집이 마감됐어요.',
      )
      ok(
        await q(
          db,
          'SELECT 1 FROM policy_consents WHERE userId=? AND version=?',
          actor,
          policyVersion,
        ).first(),
        '이용 규칙에 먼저 동의해 주세요.',
        403,
      )
      const self = await q(
        db,
        'SELECT * FROM profiles WHERE id=?',
        actor,
      ).first()
      checkLevel(s.level, self.levels, s.sport, c.levelAcknowledged)
      const team = await getActiveTeam(db, actor, env)
      if (s.kind === 'friendly')
        ok(
          team &&
            team.id !== s.teamId &&
            canRepresentSport(team.sport, s.sport) &&
            !s.requests.some((r) => r.status === 'approved'),
          '해당 종목의 다른 팀 대표만 신청할 수 있어요.',
          403,
        )
      const members = await selectedMembers(
        db,
        actor,
        team?.id || null,
        c.memberIds || [],
        c.members,
      )
      const uidList = [actor, ...members.map((p) => p.id)]
      ok(
        uidList.every(
          (uid) =>
            !s.people.some(
              (p) =>
                p.userId === uid && ['pending', 'accepted'].includes(p.consent),
            ),
        ),
        '중복 참가자가 있어요.',
      )
      for (const uid of uidList) {
        const ban = await q(
          db,
          `SELECT ${restrictionUntilSQL('?', '?')} AS untilMs`,
          uid,
          at,
        ).first()
        ok(!ban.untilMs, '참가 신청이 제한된 회원이 포함됐어요.', 403)
      }
      ok(text(c.note, 200), '신청 내용을 확인해 주세요.', 400)
      const r = {
        id: id(),
        ownerId: actor,
        teamId: team?.id || null,
        team: team?.name || null,
        status: 'pending',
        at,
        note: c.note.trim(),
        revision: 0,
      }
      s.requests.push(r)
      s.people.push(
        ...[{ id: actor, name: self.name }, ...members].map((p) => ({
          userId: p.id,
          name: p.name,
          requestId: r.id,
          consent: p.id === actor ? 'accepted' : 'pending',
          approved: false,
          confirmedAt: null,
        })),
      )
      s.outbox.push(
        { userId: s.hostId, message: '새 참가 신청이 도착했어요.' },
        ...members.map((p) => ({
          userId: p.id,
          message: '경기 참가 동의 요청이 도착했어요.',
        })),
      )
      break
    }
    case 'reviewRoster':
    case 'review': {
      beforeStart()
      const r = s.requests.find((r) => r.id === c.entryId)
      ok(r, '신청을 확인해 주세요.')
      if (c.decision === 'cancel') {
        ok(actor === r.ownerId, '본인 신청만 취소할 수 있어요.', 403)
        leavePerson(s, actor, at)
        notify(s, '참가 취소로 모집 인원이 변경됐어요.')
        break
      }
      host()
      ok(
        (r.status === 'pending' || r.needsReview) &&
          ['approve', 'reject'].includes(c.decision),
        '이미 처리된 신청이에요.',
      )
      ok(
        c.revision === undefined || c.revision === r.revision,
        '변경된 명단을 다시 확인해 주세요.',
      )
      const accepted = c.decision === 'approve'
      r.status = accepted ? 'approved' : 'rejected'
      r.revision++
      r.needsReview = false
      if (accepted && s.kind === 'friendly')
        ok(
          !s.requests.some((x) => x.id !== r.id && x.status === 'approved'),
          '상대팀은 한 팀만 확정할 수 있어요.',
        )
      for (const p of s.people.filter((p) => p.requestId === r.id)) {
        if (accepted) {
          p.approved = true
          if (p.consent === 'accepted') p.confirmedAt ||= at
        } else if (!p.confirmedAt) {
          p.approved = false
          p.consent = 'rejected'
        }
      }
      if (
        !accepted &&
        s.people.some(
          (p) =>
            p.requestId === r.id && p.confirmedAt && p.consent === 'accepted',
        )
      )
        r.status = 'approved'
      ok(count(s) <= s.max, '최대 인원을 초과해 승인할 수 없어요.')
      if (accepted && s.kind === 'friendly')
        for (const other of s.requests.filter(
          (x) => x.id !== r.id && x.status === 'pending',
        )) {
          other.status = 'unselected'
          for (const p of s.people.filter((p) => p.requestId === other.id)) {
            p.consent = 'rejected'
            p.approved = false
          }
        }
      notify(
        s,
        accepted
          ? '모집자 승인 완료 · 동의한 회원만 확정 인원에 포함돼요.'
          : '참가 신청이 거절됐어요.',
      )
      break
    }
    case 'ops.consent': {
      ok(typeof c.accept === 'boolean', '수락 또는 거절을 선택해 주세요.', 400)
      beforeStart()
      ok(
        person && person.consent === 'pending',
        '본인의 대기 중 요청만 응답할 수 있어요.',
        403,
      )
      const r = person.requestId
        ? s.requests.find((r) => r.id === person.requestId)
        : null
      ok(
        !r || ['pending', 'approved'].includes(r.status),
        '종료된 참가 요청이에요.',
      )
      person.consent = c.accept ? 'accepted' : 'rejected'
      if (c.accept && person.approved) person.confirmedAt = at
      ok(
        count(s) <= s.max,
        '현재 남은 자리가 없어요. 모집자에게 확인해 주세요.',
      )
      notify(s, '팀원이 경기 참가 요청에 응답했어요.')
      break
    }
    case 'editEntry': {
      beforeStart()
      const r = s.requests.find(
        (r) => r.id === c.entryId && r.ownerId === actor,
      )
      ok(
        r && ['pending', 'approved'].includes(r.status),
        '본인의 신청만 수정할 수 있어요.',
        403,
      )
      ok(
        c.revision === undefined || c.revision === r.revision,
        '명단이 변경됐어요.',
      )
      const members = await selectedMembers(
          db,
          actor,
          r.teamId,
          c.memberIds || [],
          c.members,
        ),
        uids = [actor, ...members.map((p) => p.id)]
      const old = s.people.filter(
        (p) =>
          p.requestId === r.id && ['pending', 'accepted'].includes(p.consent),
      )
      ok(
        old.every((p) => uids.includes(p.userId)),
        '팀원 본인이 참가를 취소해야 해요. 대표자가 대신 취소할 수 없어요.',
        403,
      )
      for (const p of members.filter(
        (p) => !old.some((x) => x.userId === p.id),
      )) {
        ok(
          !s.people.some(
            (x) =>
              x.userId === p.id && ['pending', 'accepted'].includes(x.consent),
          ),
          '중복 참가자가 있어요.',
        )
        s.people.push({
          userId: p.id,
          name: p.name,
          requestId: r.id,
          consent: 'pending',
          approved: false,
          confirmedAt: null,
        })
        s.outbox.push({
          userId: p.id,
          message: '경기 참가 동의 요청이 도착했어요.',
        })
      }
      ok(text(c.note, 200), '신청 내용을 확인해 주세요.', 400)
      r.note = c.note
      r.revision++
      if (members.some((p) => !old.some((x) => x.userId === p.id))) {
        if (r.status === 'approved') r.needsReview = true
        else r.status = 'pending'
      }
      s.outbox.push({
        userId: s.hostId,
        message: '참가 명단 변경 승인을 요청했어요.',
      })
      break
    }
    case 'ops.leave': {
      beforeStart()
      ok(person, '참가 내역이 없어요.', 403)
      if (mine) {
        s.delegation = {
          from: actor,
          target: '',
          declined: [],
          requestedAt: at,
          expiresAt: at,
          cancelAt: at,
        }
        nextDelegate(s, at)
      } else {
        leavePerson(s, actor, at)
        notify(s, '참가 취소로 모집 인원이 변경됐어요.')
      }
      break
    }
    case 'ops.delegate': {
      ok(typeof c.accept === 'boolean', '수락 또는 거절을 선택해 주세요.', 400)
      beforeStart()
      const d = s.delegation
      ok(
        d && d.target === actor && at < d.expiresAt,
        '본인에게 온 유효한 위임 요청만 응답할 수 있어요.',
        403,
      )
      if (c.accept) {
        ok(
          person?.approved && person.consent === 'accepted',
          '확정 참가 회원만 위임받을 수 있어요.',
        )
        leavePerson(s, d.from, at, d.cancelAt)
        s.hostId = actor
        s.delegation = null
        notify(s, '새로운 모집자로 권한이 위임됐어요.')
      } else {
        d.declined.push(actor)
        nextDelegate(s, at)
      }
      break
    }
    case 'ops.start': {
      host()
      ok(
        available(s) && at >= s.start && at < s.end,
        '예정 시작 이후 종료 시각 전에 시작할 수 있어요.',
      )
      ok(
        s.kind !== 'friendly' ||
          s.requests.some((r) => r.status === 'approved'),
        '친선경기는 상대팀 매칭 후 시작할 수 있어요.',
      )
      ok(
        count(s) >= s.min || c.acknowledged === true,
        '최소 인원 미달 안내를 확인해 주세요.',
        400,
      )
      s.startedAt = at
      s.manualBelowMinimum = count(s) < s.min
      notify(s, '모집자가 경기를 시작했어요.')
      break
    }
    case 'finishMatch':
    case 'ops.end': {
      host()
      ok(
        s.startedAt &&
          !s.endedAt &&
          !s.cancelledAt &&
          at >= s.startedAt + P.manualEndMinutes * M,
        '실제 시작 후 1시간부터 직접 종료할 수 있어요.',
      )
      s.endedAt = at
      notify(s, '경기가 종료됐어요. 출석 확인 후 칭찬을 전달해 보세요.')
      break
    }
    case 'cancelMatch':
    case 'ops.cancel': {
      host()
      ok(
        available(s) && at < s.end,
        '이미 시작되거나 종료된 경기는 취소할 수 없어요.',
      )
      ok(cancelReasons.includes(c.reason), '취소 사유를 선택해 주세요.', 400)
      if (
        at >= s.start - P.lateCancelHours * H &&
        !['우천 및 기상악화', '경기장 이용 불가'].includes(c.reason)
      )
        penalty(s, actor, 'whole-cancel:' + s.id, at)
      cancel(s, c.reason, at)
      break
    }
    case 'ops.close': {
      host()
      beforeStart()
      ok(typeof c.closed === 'boolean', '모집 상태를 확인해 주세요.', 400)
      s.closed = c.closed
      if (c.finalFormat) {
        ok(
          formats[s.sport]?.includes(c.finalFormat),
          '경기 방식을 확인해 주세요.',
          400,
        )
        s.finalFormat = c.finalFormat
      }
      break
    }
    case 'editMatch': {
      host()
      beforeStart()
      validateFields(c.fields, at)
      const f = c.fields
      ok(
        f.kind === s.kind && f.sport === s.sport && f.capacity >= count(s),
        '종목과 유형은 유지하고 확정 인원 이상으로 설정해 주세요.',
        400,
      )
      ok(
        JSON.stringify(f.memberIds || []) ===
          JSON.stringify(
            s.people
              .filter(
                (p) =>
                  p.requestId === null &&
                  p.userId !== s.hostId &&
                  ['pending', 'accepted'].includes(p.consent),
              )
              .map((p) => p.userId),
          ),
        '기존 참가자 변경은 각자의 참가 취소 절차를 이용해 주세요.',
        400,
      )
      Object.assign(s, {
        title: f.title.trim(),
        venue: f.venue,
        start: Date.parse(f.start),
        end: Date.parse(f.endAt),
        max: f.capacity,
        min: f.minCapacity,
        minFormat: f.minFormat || '',
        maxFormat: f.maxFormat || '',
        fee: f.fee,
        level: f.level,
        description: f.description,
        info: f.info || {},
      })
      notify(s, '경기 정보가 변경됐어요.')
      break
    }
    default:
      ok(false, '지원하지 않는 경기 처리 방식이에요.', 400)
  }
  if (count(s) >= s.min) s.everMet = true
  await persist(db, current, s, actor, c.type, at)
  return true
}
export async function enrichOperations(db, actor, data) {
  const rows = await q(db, 'SELECT matchId,state FROM match_operations WHERE matchId IN (SELECT value FROM json_each(?))', JSON.stringify(data.matches.map(m => m.id))).all()
  for (const row of rows.results) {
    const s = JSON.parse(row.state),
      m = data.matches.find((x) => x.id === row.matchId)
    if (!m) continue
    const own = s.people.filter((p) => p.userId === actor).at(-1),
      involved = !!own || s.hostId === actor
    for (const r of s.requests) {
      const entry = data.entries.find((e) => e.id === r.id)
      if (entry && r.needsReview) {
        const list = s.people.filter(
          (p) =>
            p.requestId === r.id && ['pending', 'accepted'].includes(p.consent),
        )
        entry.proposedRoster = list.map((p) => p.name)
        entry.proposedMemberIds = list
          .filter((p) => p.userId !== r.ownerId)
          .map((p) => p.userId)
        entry.proposedNote = r.note
      }
    }
    const people = involved
      ? s.people.filter(
          (p) =>
            s.hostId === actor ||
            p.userId === actor ||
            p.requestId === own?.requestId,
        )
      : []
    m.operations = {
      min: s.min,
      max: s.max,
      count: count(s),
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      lightning:
        !!s.lightningSource &&
        !s.startedAt &&
        !s.cancelledAt &&
        Date.now() < s.start,
      lightningSource: s.lightningSource,
      closed: s.closed,
      everMet: s.everMet,
      minFormat: s.minFormat,
      maxFormat: s.maxFormat,
      finalFormat: s.finalFormat,
      participants: people,
      delegation: involved ? s.delegation : null,
      cancelledReason: s.cancelledReason,
      hidden:
        !!s.cancelledAt &&
        Date.now() >= s.cancelledAt + P.hideCancelledMinutes * M,
      joined: !!own,
      ownConsent: own?.consent || null,
    }
    m.existing = s.people.filter(
      (p) => !p.requestId && p.approved && p.consent === 'accepted',
    ).length
    m.approvals =
      s.kind === 'friendly'
        ? s.requests.filter((r) => r.status === 'approved').length
        : count(s) - m.existing
    if (s.hostId === actor) {
      m.homeRoster = s.people
        .filter(
          (p) =>
            p.requestId === null && ['pending', 'accepted'].includes(p.consent),
        )
        .map((p) => p.name)
      m.homeMemberIds = s.people
        .filter(
          (p) =>
            p.requestId === null &&
            p.userId !== actor &&
            ['pending', 'accepted'].includes(p.consent),
        )
        .map((p) => p.userId)
    }
    for (const p of people)
      if (!data.users.some((u) => u.id === p.userId))
        data.users.push({
          id: p.userId,
          name: p.name,
          year: 0,
          dept: '',
          role: 'student',
        })
  }
  return data
}
