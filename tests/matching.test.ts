import assert from 'node:assert/strict'
import test from 'node:test'
import { updateDemoCatalog } from '../src/data/upgrade.ts'
import { demoData } from '../src/data/seed.ts'
import { applyCommand, schoolEmail } from '../src/domain/matching.ts'
import { cardTitle, confirmed, matchStatus, seats, venues } from '../src/domain/model.ts'
import type { Data } from '../src/domain/model.ts'
import type { Command } from '../src/domain/matching.ts'

const now = Date.parse('2026-11-11T10:00:00+09:00')
const fresh = () => demoData(now)
const run = (data: Data, id: string, cmd: Command, time = now) =>
  applyCommand({ ...data, currentId: id }, id, cmd, time)
const join = (data: Data, id: string, matchId: string) =>
  run(data, id, { type: 'apply', matchId, note: '참가할게요.' })
const match = (data: Data, id: string) => data.matches.find((m) => m.id === id)!
const review = (
  data: Data,
  host: string,
  entryId: string,
  decision: 'approve' | 'reject' | 'cancel',
) => run(data, host, { type: 'review', entryId, decision })

test('individual approval uses one seat, rejects stale approval, cancellation reopens before kickoff', () => {
  let d = join(fresh(), 'min', 'futsal')
  const m = match(d, 'futsal'),
    one = d.entries[0].id
  assert.equal(seats(d, m), 9)
  assert.throws(() => join(d, 'min', 'futsal'), /이미 신청/)
  d = join(d, 'sol', 'futsal')
  const two = d.entries[0].id
  assert.throws(() => review(d, 'sol', one, 'approve'), /모집자만/)
  d = review(d, 'jun', one, 'approve')
  assert.equal(seats(d, m), 10)
  assert.equal(matchStatus(d, m, now), '모집 마감')
  assert.throws(() => review(d, 'jun', two, 'approve'), /남은 자리/)
  assert.throws(() => review(d, 'jun', one, 'approve'), /이미 처리/)
  d = review(d, 'min', one, 'cancel')
  assert.equal(matchStatus(d, m, now), '모집 중')
  d = review(d, 'jun', two, 'approve')
  assert.equal(seats(d, m), 10)
})
test('rejection and withdrawn pending requests leave the roster untouched', () => {
  let d = join(fresh(), 'min', 'futsal')
  d = review(d, 'jun', d.entries[0].id, 'reject')
  assert.equal(d.entries[0].status, 'rejected')
  assert.equal(seats(d, match(d, 'futsal')), 9)
  d = join(d, 'min', 'basket')
  d = review(d, 'min', d.entries[0].id, 'cancel')
  assert.equal(d.entries[0].status, 'cancelled')
  assert.ok(d.notices.some((n) => n.to === 'min'))
})
test('friendly match selects exactly one team, reopening permits fresh applications', () => {
  let d = fresh()
  assert.throws(() => join(d, 'min', 'friendly'), /대표만/)
  assert.throws(() => join(d, 'jun', 'friendly'), /직접 모집/)
  d = join(d, 'sol', 'friendly')
  const winner = d.entries[0].id
  d = join(d, 'yul', 'friendly')
  const other = d.entries[0].id
  d = review(d, 'jun', winner, 'approve')
  assert.equal(confirmed(d, match(d, 'friendly')).length, 1)
  assert.equal(d.entries.find((e) => e.id === other)?.status, 'unselected')
  assert.throws(() => review(d, 'jun', other, 'approve'), /이미 처리/)
  assert.equal(matchStatus(d, match(d, 'friendly'), now), '매칭 확정')
  d = review(d, 'sol', winner, 'cancel')
  assert.equal(matchStatus(d, match(d, 'friendly'), now), '모집 중')
  d = join(d, 'yul', 'friendly')
  assert.equal(d.entries[0].status, 'pending')
})
test('starting time prevents late approval, withdrawal and reopening', () => {
  const d = join(fresh(), 'min', 'futsal'),
    m = match(d, 'futsal')
  const t = Date.parse(m.start)
  assert.throws(
    () => run(d, 'jun', { type: 'review', entryId: d.entries[0].id, decision: 'approve' }, t),
    /시작한 경기/,
  )
  assert.throws(
    () => run(d, 'min', { type: 'review', entryId: d.entries[0].id, decision: 'cancel' }, t),
    /시작한 경기/,
  )
  assert.equal(matchStatus(d, m, t), '경기 시작')
})
test('creation verifies role, sport, time, fee and capacity with host included', () => {
  const d = fresh(),
    fields = match(d, 'friendly')
  const create = (changes = {}, actor = 'jun') =>
    run(d, actor, { type: 'create', id: 'new', fields: { ...fields, ...changes } })
  assert.throws(() => create({}, 'min'), /대표만/)
  assert.throws(() => create({ sport: '러닝' }), /축구/)
  assert.throws(() => create({ existing: 0 }), /모집자/)
  assert.throws(() => create({ existing: 13, capacity: 12 }), /정원/)
  assert.throws(() => create({ fee: -1 }), /참가비/)
  assert.throws(() => create({ venue: '자유 입력' }), /운동 장소/)
  for (const venue of venues) assert.equal(create({ venue }).matches[0].venue, venue)
  assert.throws(() => create({ start: new Date(now - 1).toISOString() }), /시작 시간/)
  assert.equal(create({ kind: 'pickup', existing: 1 }, 'min').matches[0].hostId, 'min')
})
test('session changes and wrong actor cannot commit another user action', () => {
  const d = { ...fresh(), currentId: 'min' }
  assert.throws(() => applyCommand(d, 'jun', { type: 'readNotices' }, now), /계정/)
  assert.equal(d.entries.length, 0)
})
test('school domain is exact and sign-up uses an alias', () => {
  assert.ok(schoolEmail('demo_1@yonsei.ac.kr'))
  assert.ok(!schoolEmail('demo@yonsei.ac.kr.example'))
  assert.ok(!schoolEmail('demo@example.com'))
})
test('friendly card shows the opponent only after approval and restores recruiting on withdrawal', () => {
  let data = join(fresh(), 'sol', 'friendly')
  const game = match(data, 'friendly')
  const entry = data.entries[0].id
  assert.equal(cardTitle(data, game, now), '리베로 vs 상대팀 모집 중')
  data = review(data, 'jun', entry, 'approve')
  assert.equal(cardTitle(data, game, now), '리베로 vs 비즈 fc')
  data = review(data, 'sol', entry, 'cancel')
  assert.equal(cardTitle(data, game, now), '리베로 vs 상대팀 모집 중')
  assert.equal(cardTitle(data, game, Date.parse(game.start)), '리베로 친선경기')
})
test('existing local demo gets the new catalog without losing listings, rosters or decisions', () => {
  const catalog = fresh()
  const saved = fresh()
  delete saved.catalogRevision
  saved.matches = saved.matches.filter((m) => m.id !== 'basket-friendly')
  match(saved, 'friendly').title = '킥오프와 친선전 할 팀을 찾아요'
  match(saved, 'friendly').venue = '미래캠퍼스 대운동장'
  saved.users.find((u) => u.id === 'sol')!.team = '매지 유나이티드'
  saved.matches.push({
    ...match(saved, 'futsal'),
    id: 'custom',
    title: '기존 글',
    venue: '원래 약속 장소',
  })
  let data = join(saved, 'sol', 'friendly')
  data = review(data, 'jun', data.entries[0].id, 'approve')
  const upgraded = updateDemoCatalog(data, catalog)
  assert.equal(upgraded.currentId, 'jun')
  assert.equal(upgraded.entries[0].team, '비즈 fc')
  assert.equal(upgraded.entries[0].status, 'approved')
  assert.deepEqual(match(upgraded, 'custom'), match(data, 'custom'))
  assert.equal(match(upgraded, 'friendly').start, match(data, 'friendly').start)
  assert.equal(match(upgraded, 'friendly').venue, '대운동장')
  assert.ok(
    upgraded.notices.every(
      (n) => !n.text.includes('킥오프') && !n.text.includes('매지 유나이티드'),
    ),
  )
  assert.equal(upgraded.matches.filter((m) => m.id === 'basket-friendly').length, 1)
  assert.equal(updateDemoCatalog(upgraded, catalog), upgraded)
})
