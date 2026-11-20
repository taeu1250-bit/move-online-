import { requireValue } from './identity.mjs'
import { sports } from '../src/domain/model.ts'
import {
  rosterError,
  policyVersion,
  levelMismatch,
} from '../src/domain/feedback.ts'
import { resolveRosterLinks } from './teams.mjs'

// Only explicitly selected, accepted accounts get a UID. Legacy rosters contain names alone.
export function companionIds(raw, names) {
  return raw
    ? JSON.parse(raw).slice(1)
    : Array(Math.max(0, names.length - 1)).fill(null)
}
export async function makeRoster(
  db,
  actor,
  teamId,
  representative,
  members,
  ids,
  previous,
) {
  // An unchanged link stays part of the original signup when someone later leaves the team.
  const requested = ids ?? members.map(() => null)
  requireValue(
    Array.isArray(requested) && requested.length === members.length,
    400,
    '참가자 연결을 확인해 주세요.',
  )
  const old = new Map(
    (previous?.ids || []).map((id, i) => [id, previous.names[i]]),
  )
  const fresh = requested.map((id) => (id && old.has(id) ? null : id))
  const result = await resolveRosterLinks(db, actor, teamId, members, fresh)
  const names = result.names.map((name, i) =>
    requested[i] && old.has(requested[i]) ? old.get(requested[i]) : name,
  )
  const error = rosterError(representative, names, requested)
  requireValue(
    !error && !requested.includes(actor),
    400,
    error || '대표자를 두 번 등록할 수 없어요.',
  )
  return {
    names: [representative, ...names],
    ids: [actor, ...requested],
    fresh: JSON.stringify(fresh),
  }
}
export function onlyRosterRemovals(before, ids, after, nextIds) {
  const keys = new Set(
    before.map((name, i) =>
      JSON.stringify([name.normalize('NFC'), ids[i] || null]),
    ),
  )
  return after.every((name, i) =>
    keys.has(JSON.stringify([name.normalize('NFC'), nextIds[i] || null])),
  )
}
// Only one confirmed slot for the same Firebase user within a match.
export function noOverlap(idsSQL, skipEntrySQL, includeHome = true) {
  const fromHome = includeHome
    ? `OR x.value=m.hostId OR x.value IN (SELECT value FROM json_each(m.homeMemberIds))`
    : ''
  return `NOT EXISTS(SELECT 1 FROM json_each(${idsSQL}) x WHERE x.value IS NOT NULL AND
    (EXISTS(SELECT 1 FROM entries booked WHERE booked.matchId=m.id AND booked.id<>${skipEntrySQL}
      AND booked.status='approved' AND (booked.userId=x.value OR x.value IN (SELECT value FROM json_each(booked.memberIds)))) ${fromHome}))`
}
export async function acceptPolicy(db, actor, version) {
  requireValue(
    version === policyVersion,
    409,
    '현재 이용 안내를 다시 확인해 주세요.',
  )
  await db
    .prepare(
      'INSERT INTO policy_consents(id,userId,version,at) VALUES(?,?,?,?) ON CONFLICT(userId,version) DO NOTHING',
    )
    .bind(crypto.randomUUID(), actor, version, new Date().toISOString())
    .run()
}
export async function setLevels(db, actor, levels) {
  requireValue(
    levels &&
      typeof levels === 'object' &&
      !Array.isArray(levels) &&
      Object.entries(levels).every(
        ([sport, level]) =>
          sports.includes(sport) && ['초보', '중급', '고수'].includes(level),
      ),
    400,
    '종목별 운동 레벨을 확인해 주세요.',
  )
  await db
    .prepare('UPDATE profiles SET levels=? WHERE id=?')
    .bind(JSON.stringify(levels), actor)
    .run()
}
export function checkLevel(condition, levels, sport, ack) {
  requireValue(
    !levelMismatch(condition, JSON.parse(levels || '{}')[sport]) ||
      ack === true,
    409,
    '운동 레벨 안내를 확인해 주세요.',
  )
}
