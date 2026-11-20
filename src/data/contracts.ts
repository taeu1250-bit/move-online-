import type { OperationCommand } from '../domain/operations'
import type { TeamCommand } from '../domain/teams'
import type { ConductCommand } from '../domain/conduct'
import type { User } from '../domain/model'
import type { Command } from '../domain/matching'
import type { Data, MatchFields } from '../domain/model'
export type OnlineCommand =
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
