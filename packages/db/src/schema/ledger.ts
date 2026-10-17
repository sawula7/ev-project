import { pgTable, text, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const ledgerEntries = pgTable('ledger_entries', {
  id:               text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  fromWalletId:     text('from_wallet_id'),
  toWalletId:       text('to_wallet_id'),
  amount:           integer('amount').notNull(),
  type:             text('type').notNull(),
  idempotencyKey:   text('idempotency_key').notNull(),
  relatedSessionId: text('related_session_id'),
  relatedPayoutId:  text('related_payout_id'),
  metadata:         text('metadata'),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  idempotencyIdx: uniqueIndex('ledger_idempotency_idx').on(t.idempotencyKey),
}));

export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type NewLedgerEntry = typeof ledgerEntries.$inferInsert;
