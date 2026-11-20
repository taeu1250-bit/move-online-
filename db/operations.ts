import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { matches, profiles } from './schema'
import { teams } from './teams'
export const matchOperations = sqliteTable('match_operations', {
  matchId: text()
    .primaryKey()
    .references(() => matches.id),
  revision: integer().notNull().default(0),
  state: text().notNull(),
  mutation: text().notNull(),
  updatedAt: integer().notNull(),
})
export const operationAudit = sqliteTable(
  'operation_audit',
  {
    id: text().primaryKey(),
    matchId: text()
      .notNull()
      .references(() => matches.id),
    actor: text(),
    action: text().notNull(),
    detail: text().notNull(),
    at: integer().notNull(),
  },
  (t) => [index('operation_audit_match').on(t.matchId, t.at)],
)
export const reportCases = sqliteTable(
  'report_cases',
  {
    id: text().primaryKey(),
    matchId: text()
      .notNull()
      .references(() => matches.id),
    targetId: text()
      .notNull()
      .references(() => profiles.id),
    category: text().notNull(),
    state: text().notNull().default('pending'),
    reason: text(),
    reviewer: text(),
    appeal: text(),
    appealedAt: integer(),
    resolvedAt: integer(),
    revision: integer().notNull().default(0),
  },
  (t) => [
    uniqueIndex('report_case_subject').on(t.matchId, t.targetId, t.category),
  ],
)
export const participantReports = sqliteTable(
  'participant_reports',
  {
    id: text().primaryKey(),
    caseId: text()
      .notNull()
      .references(() => reportCases.id),
    reporter: text()
      .notNull()
      .references(() => profiles.id),
    reason: text().notNull(),
    at: integer().notNull(),
  },
  (t) => [uniqueIndex('report_once_per_case').on(t.caseId, t.reporter)],
)
export const teamInviteLinks = sqliteTable(
  'team_invite_links',
  {
    id: text().primaryKey(),
    teamId: text()
      .notNull()
      .references(() => teams.id),
    createdBy: text()
      .notNull()
      .references(() => profiles.id),
    tokenHash: text().notNull(),
    expiresAt: integer().notNull(),
    usedBy: text().references(() => profiles.id),
    usedAt: integer(),
    usedMutation: text(),
    revokedAt: integer(),
  },
  (t) => [uniqueIndex('invite_link_hash').on(t.tokenHash)],
)
