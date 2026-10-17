import { pgTable, text, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const payouts = pgTable('payouts', {
  id:                    text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  ownerId:               text('owner_id').notNull(),
  walletId:              text('wallet_id').notNull(),
  requestedAmount:       integer('requested_amount').notNull(),
  status:                text('status').notNull().default('pending'),
  bankTransferReference: text('bank_transfer_reference'),
  processedAt:           timestamp('processed_at'),
  idempotencyKey:        text('idempotency_key').notNull(),
  createdAt:             timestamp('created_at').notNull().defaultNow(),
  updatedAt:             timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  idempotencyIdx: uniqueIndex('payouts_idempotency_idx').on(t.idempotencyKey),
}));

export type Payout = typeof payouts.$inferSelect;
export type NewPayout = typeof payouts.$inferInsert;
