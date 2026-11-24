import type { Match, Sport } from './model.ts'
import { operationPolicy } from './operations.ts'

export const policyVersion = operationPolicy.version
export const skillLevels = ['초보', '중급', '고수'] as const
export type SkillLevel = (typeof skillLevels)[number]
export const matchLevels = [
  '모든 레벨',
  ...skillLevels,
  '중급 이상',
  '초보~중급',
] as const
export const genders = ['남성', '여성', '남녀모두'] as const
export interface MatchInfo {
  venueAddress?: string
  venueMapUrl?: string
  venueMeeting?: string
  gender?: (typeof genders)[number]
  format?: string
  shoes?: string
  distanceKm?: number
  pace?: string
  goal?: string
}

export const formats: Partial<Record<Sport, readonly string[]>> = {
  풋살: ['4vs4', '5vs5', '6vs6'],
  축구: ['7vs7', '8vs8', '9vs9', '11vs11'],
  농구: ['3vs3', '4vs4', '5vs5'],
}
const optionalText = (v: unknown, max: number) =>
  typeof v === 'string' && !!v.trim() && v.length <= max

export function validMatchInfo(sport: Sport, value: unknown): boolean {
  if (value == null) return true
  if (typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value).every(([key, v]) => {
    switch (key) {
      case 'venueAddress':
        return optionalText(v, 200)
      case 'venueMeeting':
        return optionalText(v, 300)
      case 'venueMapUrl':
        return validMapUrl(v)
      case 'gender':
        return genders.some((item) => item === v)
      case 'format':
        return !!formats[sport]?.some((item) => item === v)
      case 'shoes':
        return sport === '풋살' && optionalText(v, 40)
      case 'distanceKm':
        return (
          sport === '러닝' &&
          typeof v === 'number' &&
          Number.isFinite(v) &&
          v > 0 &&
          v <= 1000
        )
      case 'pace':
        return (
          sport === '러닝' &&
          typeof v === 'string' &&
          /^[0-9]{1,2}:[0-5][0-9]$/.test(v) &&
          !/^0+:00$/.test(v)
        )
      case 'goal':
        return sport === '헬스' && optionalText(v, 60)
      default:
        return false
    }
  })
}

export function validMapUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 1000) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch { return false }
}

export function validEndAt(start: string, end: unknown) {
  if (end == null || end === '') return true
  return (
    typeof end === 'string' &&
    Number.isFinite(Date.parse(end)) &&
    Date.parse(end) > Date.parse(start) &&
    Date.parse(end) - Date.parse(start) <= operationPolicy.maxPlayHours * 3600000
  )
}

// Both member names and linked account IDs are checked. Manual names never supply an account ID.
export function rosterError(
  representative: string,
  names: unknown,
  ids?: unknown,
): string {
  if (!Array.isArray(names) || names.length > 29)
    return '본인 포함 최대 30명까지 등록할 수 있어요.'
  const normalized = new Set([
    representative.trim().normalize('NFC').toLowerCase(),
  ])
  for (const name of names) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 30)
      return '각 참가자의 이름을 1~30자로 입력해 주세요.'
    const key = name.trim().normalize('NFC').toLowerCase()
    if (normalized.has(key))
      return '같은 이름이 두 번 들어갔어요. 참가자 명단을 확인해 주세요.'
    normalized.add(key)
  }
  if (ids != null) {
    if (
      !Array.isArray(ids) ||
      ids.length !== names.length ||
      ids.some(
        (id) =>
          id !== null &&
          (typeof id !== 'string' || !id.trim() || id.length > 128),
      )
    )
      return '연결된 팀원 정보를 다시 확인해 주세요.'
    const linked = ids.filter((id) => id !== null)
    if (new Set(linked).size !== linked.length)
      return '같은 회원을 두 번 선택했어요.'
  }
  return ''
}

export function levelMismatch(condition: string, skill?: string | null) {
  if (!skill || !skillLevels.some((level) => level === skill)) return false
  if (condition === '중급 이상') return skill === '초보'
  if (condition === '초보~중급') return skill === '고수'
  if (condition === '숙련자 위주') return skill !== '고수'
  return skillLevels.some((level) => level === condition) && condition !== skill
}

export function matchInfoTags(
  m: Pick<Match, 'sport' | 'kind' | 'level' | 'start' | 'capacity'> & {
    info?: MatchInfo
    endAt?: string | null
    operations?: Match['operations']
  },
) {
  const info = m.info || {}
  const tags: string[] = []
  if (info.gender) tags.push(info.gender)
  if (m.level) tags.push(m.level)
  if (formats[m.sport] && info.format) tags.push(info.format)
  if (m.sport === '러닝') {
    if (info.distanceKm) tags.push(info.distanceKm + 'km')
    if (info.pace) tags.push(info.pace + '/km')
  }
  tags.push((m.operations ? '전체 최대 ' : m.kind === 'friendly' ? '홈팀 ' : '정원 ') + m.capacity + '명')
  if (m.endAt && Date.parse(m.endAt) - Date.parse(m.start) > operationPolicy.maxPlayHours * 3600000)
    tags.push('최대 ' + operationPolicy.maxPlayHours + '시간')
  if (m.endAt && validEndAt(m.start, m.endAt)) {
    const minutes = Math.round(
      (Date.parse(m.endAt) - Date.parse(m.start)) / 60000,
    )
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    if (minutes > 0)
      tags.push(
        [hours && hours + '시간', rest && rest + '분']
          .filter(Boolean)
          .join(' '),
      )
  }
  if (m.sport === '풋살' && info.shoes) tags.push(info.shoes)
  if (m.sport === '헬스' && info.goal) tags.push(info.goal)
  return tags
}

export const mannerGuidelines = [
  '경기 일정과 장소를 확인한 후 신청해 주세요.',
  '참가가 승인되었다면 약속한 시간에 도착해 주세요.',
  '참여하기 어려워진 경우 가능한 한 빨리 참가 신청을 취소해 주세요.',
  '사전 취소 없이 불참하면 노쇼 신고 대상이 될 수 있습니다.',
  '노쇼 신고가 확정되면 매너온도가 하락합니다.',
  '반복적인 노쇼는 일정 기간 경기 참가 신청 제한으로 이어집니다.',
  '잘못된 신고에 대해서는 이의제기할 수 있습니다.',
  '경기 중 다른 참가자를 존중하고 기본적인 스포츠 매너를 지켜 주세요.',
]
