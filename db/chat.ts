import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { matches, profiles } from './schema'

export const chatRooms = sqliteTable('chat_rooms', {
  matchId: text().primaryKey().references(() => matches.id),
  createdAt: integer().notNull(),
  closedAt: integer(),
  closeReason: text(),
  announcement: text(),
})
export const chatMessages = sqliteTable('chat_messages', {
  seq: integer().primaryKey({ autoIncrement: true }),
  nonce: text().notNull(),
  matchId: text().notNull().references(() => chatRooms.matchId),
  senderId: text().notNull().references(() => profiles.id),
  body: text().notNull(),
  at: integer().notNull(),
}, t => [
  uniqueIndex('chat_message_nonce').on(t.nonce),
  index('chat_room_sequence').on(t.matchId, t.seq),
  index('chat_sender_time').on(t.senderId, t.at),
])
