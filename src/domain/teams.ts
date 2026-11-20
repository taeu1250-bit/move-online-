import type { Sport } from './model'

export type TeamFields = {
  name: string
  sport: Sport
  affiliation: string
  bio: string
}
export type TeamMember = {
  id: string
  userId: string | null
  name: string
  status: 'guest' | 'pending' | 'accepted'
}
export interface Team extends TeamFields {
  id: string
  revision: number
  archivedAt: string | null
  members: TeamMember[]
}
export interface TeamMembership {
  id: string
  teamId: string
  teamName: string
  sport: Sport
  ownerName: string
  status: 'pending' | 'accepted'
}
export interface TeamHub {
  activeTeamId: string | null
  inviteCode: string | null
  owned: Team[]
  memberships: TeamMembership[]
}
export type TeamCommand =
  | { type: 'team.create'; id: string; fields: TeamFields; guests: string[] }
  | { type: 'team.edit'; teamId: string; revision: number; fields: TeamFields }
  | { type: 'team.archive'; teamId: string; revision: number }
  | { type: 'team.switch'; teamId: string | null }
  | { type: 'team.guest'; teamId: string; name: string }
  | { type: 'team.remove'; teamId: string; memberId: string }
  | { type: 'team.code' }
  | { type: 'team.invite'; teamId: string; code: string }
  | { type: 'team.reply'; memberId: string; accept: boolean }
  | { type: 'team.leave'; memberId: string }
