import { pgTable, text, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const wallets = pgTable('wallets', {
  id:        text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  ownerType: text('owner_type').notNull(), // 'driver' | 'owner' | 'system'
  ownerId:   text('owner_id').notNull(),
  balance:   integer('balance').notNull().default(0),
  currency:  text('currency').notNull().default('LKR'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  ownerIdx: uniqueIndex('wallets_owner_idx').on(t.ownerType, t.ownerId),
}));

export type Wallet = typeof wallets.$inferSelect;
export type NewWallet = typeof wallets.$inferInsert;
