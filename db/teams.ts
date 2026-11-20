import { sql } from 'drizzle-orm'
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/sqlite-core'
import { profiles } from './schema'

export const teams = sqliteTable(
  'teams',
  {
    id: text().primaryKey(),
    ownerId: text()
      .notNull()
      .references(() => profiles.id),
    name: text().notNull(),
    sport: text().notNull(),
    affiliation: text().notNull().default(''),
    bio: text().notNull().default(''),
    revision: integer().notNull().default(0),
    archivedAt: text(),
  },
  (t) => [index('team_owner').on(t.ownerId)],
)

export const teamPreferences = sqliteTable(
  'team_preferences',
  {
    userId: text()
      .primaryKey()
      .references(() => profiles.id),
    activeTeamId: text().references(() => teams.id),
    inviteCode: text(),
  },
  (t) => [uniqueIndex('team_invite_code').on(t.inviteCode)],
)

export const teamMembers = sqliteTable(
  'team_members',
  {
    id: text().primaryKey(),
    teamId: text()
      .notNull()
      .references(() => teams.id),
    userId: text().references(() => profiles.id),
    guestName: text(),
    status: text().notNull(),
    updatedAt: text().notNull(),
  },
  (t) => [
    uniqueIndex('team_member_user').on(t.teamId, t.userId),
    uniqueIndex('team_member_guest').on(t.teamId, t.guestName),
    index('team_inbox').on(t.userId, t.status),
    check(
      'team_member_identity',
      sql`(status='guest' AND guestName IS NOT NULL AND userId IS NULL)
    OR (status IN ('pending','accepted','declined') AND userId IS NOT NULL AND guestName IS NULL)`,
    ),
  ],
)
