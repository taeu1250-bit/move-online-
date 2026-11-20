export const conductPolicy = {
  baseTenths: 365,
  completedTenths: 2,
  praiseTenths: 1,
  noShowTenths: -30,
  floorTenths: 0,
  ceilingTenths: 990,
  appealHours: 48,
  praiseHours: 24,
  lookbackDays: 90,
  secondBanDays: 7,
  repeatedBanDays: 30,
  reportCooldownHours: 24,
  reportsPerDay: 5,
} as const

export const praiseOptions = [
  '시간 약속을 잘 지켜요.',
  '친절하고 배려심이 있어요.',
  '적극적으로 운동에 참여해요.',
  '팀워크가 좋아요.',
  '경기 매너가 좋아요.',
] as const
export const reportOptions = [
  '욕설 및 폭언',
  '위협적인 행동',
  '비매너 행동',
  '허위 경기 모집',
  '부적절한 게시물',
  '기타',
] as const
export type ConductCommand =
  | {
      type: 'conductAttendance'
      matchId: string
      personKey: string
      status: 'present' | 'unknown'
    }
  | {
      type: 'conductNoShow'
      matchId: string
      personKey: string
      acknowledged: boolean
    }
  | { type: 'conductPraise'; matchId: string; targetId: string; reason: string }
  | { type: 'conductAppeal'; caseId: string; message: string }
  | {
      type: 'conductDecide'
      caseId: string
      decision: 'confirm' | 'dismiss'
      reason: string
    }
  | {
      type: 'conductReport'
      targetType: 'user' | 'match'
      targetId: string
      reason: string
    }
  | {
      type: 'conductResolveReport'
      reportId: string
      decision: 'reviewed' | 'dismissed'
      reason: string
    }
export type CaseStatus =
  | 'pending'
  | 'appealed'
  | 'confirmed'
  | 'dismissed'
  | 'guest_warning'
export interface ConductCase {
  id: string
  matchId: string
  title: string
  name: string
  state: CaseStatus
  deadline: number
  appeal: string | null
  reason: string | null
  subjectId: string | null
  representativeId: string
  confirmedAt: number | null
}
export interface Score {
  temperature: number
  completions: number
  praises: number
}
export interface Person {
  personKey: string
  name: string
  userId: string | null
  status: 'unknown' | 'present' | 'absent'
  canReport?: boolean
  canPraise: boolean
  praised: boolean
  caseStatus: CaseStatus | null
}
export interface ConductRoom {
  matchId: string
  title: string
  endAt: string
  canManage: boolean
  participants: Person[]
}
export interface ConductState {
  scores: Record<string, Score>
  rooms: ConductRoom[]
  cases: ConductCase[]
  isAdmin: boolean
  restrictionUntil: number | null
  reports: {
    id: string
    targetType: 'user' | 'match'
    label: string
    reason: string
    at: number
    state: 'pending' | 'reviewed' | 'dismissed'
    result: string | null
  }[]
}
