export const chatPolicy = {
  maxLength: 500,
  recentMessages: 50,
  refreshMs: 3_000,
  sendCooldownMs: 3_000,
  sendsPerMinute: 12,
  messagesPerRoom: 500,
  reportsPerDay: 5,
  hoursAfterStart: 2,
} as const

export const chatReportReasons = [
  '욕설 및 비하',
  '위협적인 발언',
  '성희롱·불쾌한 발언',
  '스팸·광고',
  '개인정보 노출',
] as const

export interface ChatMessage {
  seq: number
  nonce: string
  senderId: string
  name: string
  body: string
  at: number
}
export interface ChatRoom {
  matchId: string
  title: string
  hostId: string
  closed: boolean
  closeReason: string | null
  closesAt: number | null
  announcement: string | null
  canPost: boolean
  canManage: boolean
  canReport: boolean
  moderation: boolean
  reported: boolean
  messages: ChatMessage[]
}
export type ChatAction =
  | { type: 'send'; matchId: string; nonce: string; body: string }
  | { type: 'announce'; matchId: string; body: string }
  | { type: 'report'; matchId: string; reason: string }
