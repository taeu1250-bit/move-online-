import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const profiles = sqliteTable('profiles', {
  id: text().primaryKey(),
  name: text().notNull(),
  year: integer().notNull(),
  levels: text(),
  dept: text().notNull().default(''),
  skillLevel: text().notNull().default(''),
})
export const matches = sqliteTable(
  'matches',
  {
    id: text().primaryKey(),
    hostId: text()
      .notNull()
      .references(() => profiles.id),
    kind: text().notNull(),
    sport: text().notNull(),
    title: text().notNull(),
    venue: text().notNull(),
    start: text().notNull(),
    capacity: integer().notNull(),
    existing: integer().notNull(),
    fee: integer().notNull(),
    level: text().notNull(),
    description: text().notNull(),
    createdAt: text().notNull(),
    homeTeam: text(),
    hostTeamId: text(),
    homeMemberIds: text(),
    info: text(),
    endAt: text(),
    homeRoster: text().notNull(),
    cancelledAt: text(),
    mutation: text(),
  },
  (t) => [
    index('match_start').on(t.start),
    index('match_host').on(t.hostId),
    check(
      'capacity_bounds',
      sql`${t.capacity} between 2 and 30 and ${t.existing} between 1 and ${t.capacity}`,
    ),
  ],
)
export const entries = sqliteTable(
  'entries',
  {
    id: text().primaryKey(),
    matchId: text()
      .notNull()
      .references(() => matches.id),
    userId: text()
      .notNull()
      .references(() => profiles.id),
    team: text(),
    teamId: text(),
    memberIds: text(),
    proposedMemberIds: text(),
    roster: text().notNull(),
    proposedRoster: text(),
    proposedNote: text(),
    rosterRevision: integer().notNull().default(0),
    note: text().notNull(),
    status: text().notNull(),
    at: text().notNull(),
    mutation: text().notNull(),
  },
  (t) => [
    index('entry_status').on(t.matchId, t.status),
    index('entry_user').on(t.userId),
    uniqueIndex('one_user_application')
      .on(t.matchId, t.userId)
      .where(sql`status in ('pending','approved')`),
    uniqueIndex('one_team_application')
      .on(t.matchId, t.team)
      .where(sql`team is not null and status in ('pending','approved')`),
    uniqueIndex('one_opponent')
      .on(t.matchId)
      .where(sql`team is not null and status='approved'`),
    check(
      'entry_status_enum',
      sql`status in ('pending','approved','rejected','cancelled','unselected')`,
    ),
  ],
)
export const notices = sqliteTable(
  'notices',
  {
    id: text().primaryKey(),
    recipient: text()
      .notNull()
      .references(() => profiles.id),
    matchId: text()
      .notNull()
      .references(() => matches.id),
    text: text().notNull(),
    at: text().notNull(),
    seen: integer().notNull().default(0),
    dismissedAt: text(),
  },
  (t) => [index('notice_inbox').on(t.recipient, t.at)],
)

export const consents = sqliteTable(
  'policy_consents',
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => profiles.id),
    version: text().notNull(),
    at: text().notNull(),
  },
  (t) => [uniqueIndex('user_policy_version').on(t.userId, t.version)],
)
export const pushDevices = sqliteTable(
  'push_devices',
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    subscription: text().notNull(),
    updatedAt: text().notNull(),
  },
  (t) => [index('push_device_owner').on(t.userId)],
)
export const pushDeliveries = sqliteTable(
  'push_deliveries',
  {
    id: text().primaryKey(),
    matchId: text()
      .notNull()
      .references(() => matches.id),
    deviceId: text().notNull(),
    start: text().notNull(),
    hours: integer().notNull(),
    status: text().notNull(),
    at: text().notNull(),
  },
  (t) => [index('push_delivery_match').on(t.matchId)],
)

export const vacancySubscriptions = sqliteTable(
  'vacancy_subscriptions',
  {
    id: text().primaryKey(),
    matchId: text().notNull().references(() => matches.id, { onDelete: 'cascade' }),
    userId: text().notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('vacancy_match_user').on(t.matchId, t.userId)],
)
