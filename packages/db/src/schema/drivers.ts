import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const drivers = pgTable('drivers', {
  id:           text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email:        text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  name:         text('name').notNull(),
  phone:        text('phone'),
  walletId:     text('wallet_id'),
  fcmToken:     text('fcm_token'),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
  updatedAt:    timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  emailIdx: uniqueIndex('drivers_email_idx').on(t.email),
}));

export type Driver = typeof drivers.$inferSelect;
export type NewDriver = typeof drivers.$inferInsert;
