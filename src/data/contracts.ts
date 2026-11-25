import type { OperationCommand } from '../domain/operations'
import type { ChatAction, ChatRoom } from '../domain/chat'
import type { TeamCommand } from '../domain/teams'
import type { ConductCommand } from '../domain/conduct'
import type { User } from '../domain/model'
import type { Command } from '../domain/matching'
import type { Data, MatchFields, Status } from '../domain/model'
export interface ActivityPage {
  data: Data
  items: { id: string; status: Status | null }[]
  nextCursor: string | null
}
export function mergeMatchData(base: Data, part: Data): Data {
  const ids = new Set(part.matches.map(m => m.id))
  return { ...base,
    users: [...new Map([...base.users, ...part.users].map(u => [u.id, u])).values()],
    matches: [...base.matches.filter(m => !ids.has(m.id)), ...part.matches],
    entries: [...base.entries.filter(e => !ids.has(e.matchId)), ...part.entries],
    conduct: base.conduct && part.conduct ? {...part.conduct,
      scores: {...base.conduct.scores, ...part.conduct.scores},
      rooms: [...base.conduct.rooms.filter(r => !ids.has(r.matchId)), ...part.conduct.rooms],
    } : part.conduct || base.conduct,
  }
}
export type OnlineCommand =
  | { type: 'clearNotices' }
  | { type: 'vacancySubscribe' | 'vacancyUnsubscribe'; matchId: string }
  | OperationCommand
  | Command
  | TeamCommand
  | ConductCommand
  | { type: 'acceptPolicy'; version: string }
  | { type: 'setLevels'; levels: NonNullable<User['levels']> }
  | { type: 'finishMatch'; matchId: string }
  | { type: 'pushSubscribe'; subscription: PushSubscriptionJSON }
  | { type: 'pushUnsubscribe'; endpoint: string }
  | { type: 'cancelMatch'; matchId: string }
  | { type: 'editMatch'; matchId: string; fields: MatchFields }
  | {
      type: 'editEntry'
      entryId: string
      note: string
      members: string[]
      memberIds?: (string | null)[]
      levelAcknowledged?: boolean
      revision?: number
    }
  | {
      type: 'reviewRoster'
      entryId: string
      decision: 'approve' | 'reject'
      revision: number
    }
export type Snapshot =
  | { data: Data; error?: undefined; needsProfile?: false }
  | { data?: undefined; error?: string; needsProfile?: boolean }
export interface Services {
  findDay?: (day: string) => Promise<Data>
  activity?: (tab: 'hosted' | 'joined', status: 'all' | 'pending' | 'approved', cursor?: string, scope?: 'current' | 'history') => Promise<ActivityPage>
  loadMatch?: (id: string) => Promise<void>
  chat?: {
    read(matchId: string, after?: number): Promise<ChatRoom>
    send(action: ChatAction): Promise<void>
  }
  inviteLink?: (
    input: {
      teamId?: string
      token?: string
      accept?: boolean
      revokeId?: string
    },
    read?: boolean,
  ) => Promise<{
    id?: string
    token?: string
    expiresAt?: number
    name?: string
    sport?: string
  }>
  searchMembers?: (
    query: string,
  ) => Promise<{ id: string; name: string; year: number }[]>
  matches: {
    snapshot(): Snapshot
    subscribe(listener: () => void): () => void
    execute(actor: string, command: OnlineCommand): Promise<void>
  }
  session: {
    logout(): Promise<void>
    save(
      name: string,
      year: number,
      dept: string,
      skillLevel: string,
    ): Promise<void>
  }
  refresh(): Promise<void>
}
