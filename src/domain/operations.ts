export const operationPolicy = {
  version: '2026-11-18-v2',
  lightningHours: 2,
  autoCancelHours: 1,
  autoStartMinutes: 30,
  manualEndMinutes: 60,
  maxPlayHours: 3,
  hideCancelledMinutes: 60,
  lateCancelHours: 3,
  lateCancelTenths: -10,
  reportTenths: -20,
  priorityReports: 3,
  delegationMinutes: 30,
  inviteHours: 24,
} as const

// Preserve an earlier planned finish, but never keep a started match open past the cap.
export function automaticEndAt(startedAt: number, plannedEnd: number) {
  const limit = startedAt + operationPolicy.maxPlayHours * 3600000
  return Number.isFinite(plannedEnd) ? Math.max(startedAt, Math.min(limit, plannedEnd)) : limit
}
export const cancelReasons = [
  '최소 인원 부족',
  '우천 및 기상악화',
  '경기장 이용 불가',
  '모집자 개인 사정',
  '기타',
] as const
export const postReasons = ['허위 경기 모집', '부적절한 게시물'] as const
export const participantReasons = [
  '욕설 및 폭언',
  '위협적인 행동',
  '비매너 행동',
  '심한 지각',
] as const
export interface Participant {
  userId: string
  name: string
  requestId: string | null
  consent: 'pending' | 'accepted' | 'rejected' | 'cancelled'
  approved: boolean
  confirmedAt: number | null
}
export interface Delegation {
  from: string
  target: string
  declined: string[]
  requestedAt: number
  expiresAt: number
  cancelAt: number
}
export interface OperationView {
  min: number
  max: number
  count: number
  startedAt: number | null
  endedAt: number | null
  lightning: boolean
  lightningSource: 'new' | 'converted' | null
  closed: boolean
  everMet: boolean
  minFormat: string
  maxFormat: string
  finalFormat: string
  participants: Participant[]
  delegation: Delegation | null
  cancelledReason: string | null
  hidden: boolean
  joined: boolean
  ownConsent: Participant['consent'] | null
}
export type OperationCommand =
  | { type: 'ops.consent'; matchId: string; accept: boolean }
  | { type: 'ops.start'; matchId: string; acknowledged: boolean }
  | { type: 'ops.end' | 'ops.leave'; matchId: string }
  | { type: 'ops.delegate'; matchId: string; accept: boolean }
  | {
      type: 'ops.close'
      matchId: string
      closed: boolean
      finalFormat?: string
    }
  | { type: 'ops.cancel'; matchId: string; reason: string }
  | {
      type: 'ops.report'
      matchId: string
      targetId?: string
      category: 'post' | 'user' | 'operation'
      reason: string
    }
  | {
      type: 'ops.reportDecision'
      caseId: string
      decision: 'confirm' | 'dismiss' | 'correct'
      reason: string
    }
  | { type: 'ops.reportAppeal'; caseId: string; message: string }
  | { type: 'team.inviteMember'; teamId: string; userId: string }
