import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { matches, profiles } from './schema'

export const attendance = sqliteTable(
  'attendance',
  {
    id: text().primaryKey(),
    matchId: text()
      .notNull()
      .references(() => matches.id),
    personKey: text().notNull(),
    userId: text().references(() => profiles.id),
    status: text().notNull(),
    changedAt: integer().notNull(),
    mutation: text().notNull(),
  },
  (t) => [
    uniqueIndex('attendance_person').on(t.matchId, t.personKey),
    index('attendance_account').on(t.userId),
  ],
)
export const praises = sqliteTable(
  'praises',
  {
    id: text().primaryKey(),
    matchId: text()
      .notNull()
      .references(() => matches.id),
    sender: text()
      .notNull()
      .references(() => profiles.id),
    recipient: text()
      .notNull()
      .references(() => profiles.id),
    reason: text().notNull(),
    at: integer().notNull(),
  },
  (t) => [
    uniqueIndex('praise_per_pair').on(t.matchId, t.sender, t.recipient),
    index('praise_for').on(t.recipient),
  ],
)
export const noShows = sqliteTable(
  'noShows',
  {
    id: text().primaryKey(),
    matchId: text()
      .notNull()
      .references(() => matches.id),
    personKey: text().notNull(),
    name: text().notNull(),
    representativeId: text()
      .notNull()
      .references(() => profiles.id),
    subjectId: text().references(() => profiles.id),
    state: text().notNull(),
    openedAt: integer().notNull(),
    deadline: integer().notNull(),
    appeal: text(),
    appealedAt: integer(),
    resolvedBy: text().references(() => profiles.id),
    reason: text(),
    resolvedAt: integer(),
    confirmedAt: integer(),
    mutation: text().notNull(),
  },
  (t) => [
    uniqueIndex('one_absence_report').on(t.matchId, t.personKey),
    index('absence_due').on(t.state, t.deadline),
    index('absence_subject').on(t.subjectId, t.state, t.confirmedAt),
  ],
)
export const conductEvents = sqliteTable(
  'conductEvents',
  {
    id: text().primaryKey(),
    matchId: text()
      .notNull()
      .references(() => matches.id),
    userId: text()
      .notNull()
      .references(() => profiles.id),
    action: text().notNull(),
    delta: integer().notNull(),
    source: text().notNull(),
    at: integer().notNull(),
  },
  (t) => [
    uniqueIndex('one_conduct_event').on(t.source, t.action),
    index('conduct_account').on(t.userId, t.at),
  ],
)
export const generalReports = sqliteTable(
  'generalReports',
  {
    id: text().primaryKey(),
    reporter: text()
      .notNull()
      .references(() => profiles.id),
    targetType: text().notNull(),
    targetId: text().notNull(),
    reason: text().notNull(),
    at: integer().notNull(),
    state: text().notNull(),
    reviewer: text().references(() => profiles.id),
    result: text(),
    resolvedAt: integer(),
  },
  (t) => [
    index('reports_by_author').on(t.reporter, t.at),
    index('reports_by_target').on(t.reporter, t.targetType, t.targetId),
    index('reports_pending').on(t.state, t.at),
  ],
)
