import {
  activeEntry,
  confirmed,
  entriesFor,
  isTeamSport,
  matchStatus,
  sports,
  validVenue,
} from './model.ts'
import type { Data, Entry, MatchFields, Match, User } from './model.ts'

export type Command =
  | { type: 'create'; id: string; fields: MatchFields }
  | {
      type: 'apply'
      matchId: string
      note: string
      members?: string[]
      memberIds?: (string | null)[]
      levelAcknowledged?: boolean
    }
  | {
      type: 'review'
      entryId: string
      revision?: number
      decision: 'approve' | 'reject' | 'cancel'
    }
  | { type: 'readNotices' }

export function requireRule(test: unknown, message: string): asserts test {
  if (!test) throw new Error(message)
}
export const uid = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
export const schoolEmail = (value: string) =>
  /^[^@\s]+@yonsei\.ac\.kr$/i.test(value.trim())

function validateMatch(fields: MatchFields, user: User, now: number) {
  requireRule(sports.includes(fields.sport), '운동 종목을 선택해 주세요.')
  requireRule(
    fields.kind === 'pickup' || fields.kind === 'friendly',
    '모집 유형을 선택해 주세요.',
  )
  if (fields.kind === 'friendly') {
    requireRule(
      user.role === 'leader' && user.team,
      '팀 대표만 친선경기를 모집할 수 있어요.',
    )
    requireRule(
      isTeamSport(fields.sport),
      '친선경기는 축구·풋살·농구에서 열 수 있어요.',
    )
  }
  requireRule(
    fields.title.trim() && fields.title.trim().length <= 40,
    '제목은 1~40자로 입력해 주세요.',
  )
  requireRule(
    validVenue(fields.venue),
    '운동 장소를 선택해 주세요.',
  )
  requireRule(
    Date.parse(fields.start) > now,
    '시작 시간을 현재보다 늦게 설정해 주세요.',
  )
  requireRule(
    Number.isInteger(fields.capacity) &&
      fields.capacity >= 2 &&
      fields.capacity <= 30,
    '정원은 2~30명이에요.',
  )
  requireRule(
    Number.isInteger(fields.existing) &&
      fields.existing >= 1 &&
      fields.existing <= fields.capacity,
    '기존 인원에는 모집자 1명이 포함돼요. 정원을 확인해 주세요.',
  )
  requireRule(
    Number.isSafeInteger(fields.fee) &&
      fields.fee >= 0 &&
      fields.fee <= 1000000,
    '참가비는 0~1,000,000원 사이의 정수로 입력해 주세요.',
  )
  requireRule(
    fields.description.length <= 500,
    '설명은 500자까지 입력할 수 있어요.',
  )
}
export function applyCommand(
  previous: Data,
  actor: string,
  cmd: Command,
  now = Date.now(),
): Data {
  const data = structuredClone(previous)
  const user = data.users.find((u) => u.id === actor)
  requireRule(
    user && data.currentId === actor,
    '계정이 변경됐어요. 현재 계정을 확인해 주세요.',
  )
  const timestamp = new Date(now).toISOString()
  const notify = (to: string, match: Match, message: string) => {
    data.notices.unshift({
      id: uid(),
      to,
      matchId: match.id,
      text: match.title + ' · ' + message,
      at: timestamp,
      read: false,
    })
  }
  if (cmd.type === 'readNotices') {
    for (const n of data.notices) if (n.to === actor) n.read = true
    return data
  }
  if (cmd.type === 'create') {
    validateMatch(cmd.fields, user, now)
    requireRule(
      !data.matches.some((m) => m.id === cmd.id),
      '이미 등록된 경기예요.',
    )
    data.matches.unshift({
      ...cmd.fields,
      title: cmd.fields.title.trim(),
      venue: cmd.fields.venue.trim(),
      id: cmd.id,
      hostId: actor,
      createdAt: timestamp,
    })
    return data
  }
  if (cmd.type === 'apply') {
    const m = data.matches.find((item) => item.id === cmd.matchId)
    requireRule(
      m && matchStatus(data, m, now) === '모집 중',
      '현재 신청할 수 없는 경기예요.',
    )
    requireRule(m.hostId !== actor, '직접 모집한 경기예요.')
    requireRule(!activeEntry(data, m, actor), '이미 신청한 경기예요.')
    const friendly = m.kind === 'friendly'
    if (friendly) {
      requireRule(
        user.role === 'leader' && user.team,
        '팀 대표만 친선경기를 신청할 수 있어요.',
      )
      requireRule(
        user.team !== data.users.find((u) => u.id === m.hostId)?.team,
        '같은 팀의 친선경기에는 신청할 수 없어요.',
      )
      requireRule(
        !entriesFor(data, m).some(
          (e) =>
            e.team === user.team && ['approved', 'pending'].includes(e.status),
        ),
        '이미 신청한 팀이에요.',
      )
    }
    requireRule(cmd.note.length <= 200, '한마디는 200자까지 입력할 수 있어요.')
    const entry: Entry = {
      id: uid(),
      matchId: m.id,
      userId: actor,
      status: 'pending',
      at: timestamp,
      note: cmd.note.trim(),
    }
    if (friendly) entry.team = user.team
    data.entries.unshift(entry)
    notify(m.hostId, m, (entry.team || user.name) + ' 신청이 도착했어요.')
    notify(actor, m, '신청을 접수했어요. 승인 대기 중이에요.')
    return data
  }

  const entry = data.entries.find((e) => e.id === cmd.entryId)
  requireRule(entry, '신청 정보를 찾을 수 없어요.')
  const m = data.matches.find((item) => item.id === entry.matchId)
  requireRule(
    m && Date.parse(m.start) > now,
    '시작한 경기의 신청은 변경할 수 없어요.',
  )
  if (cmd.decision === 'cancel') {
    requireRule(
      actor === entry.userId || actor === m.hostId,
      '이 신청을 취소할 수 없어요.',
    )
    requireRule(
      entry.status === 'approved' || entry.status === 'pending',
      '이미 처리된 신청이에요.',
    )
    entry.status = 'cancelled'
    notify(
      actor === m.hostId ? entry.userId : m.hostId,
      m,
      (entry.team ||
        data.users.find((u) => u.id === entry.userId)?.name ||
        '') + ' 신청이 취소됐어요.',
    )
    return data
  }
  requireRule(actor === m.hostId, '모집자만 승인하거나 거절할 수 있어요.')
  requireRule(entry.status === 'pending', '이미 처리된 신청이에요.')
  if (cmd.decision === 'reject') {
    entry.status = 'rejected'
    notify(entry.userId, m, '신청이 거절됐어요.')
    return data
  }
  requireRule(matchStatus(data, m, now) === '모집 중', '남은 자리가 없어요.')
  entry.status = 'approved'
  notify(
    entry.userId,
    m,
    m.kind === 'friendly' ? '상대팀 매칭이 확정됐어요.' : '참가가 확정됐어요.',
  )
  if (m.kind === 'friendly') {
    requireRule(confirmed(data, m).length === 1, '이미 상대팀을 확정했어요.')
    for (const other of entriesFor(data, m)) {
      if (other.status !== 'pending') continue
      other.status = 'unselected'
      notify(other.userId, m, '다른 상대팀이 선정됐어요.')
    }
  }
  return data
}
