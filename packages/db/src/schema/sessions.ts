import { pgTable, text, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const chargingSessions = pgTable('charging_sessions', {
  id:                    text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  driverId:              text('driver_id').notNull(),
  chargerId:             text('charger_id').notNull(),
  ownerId:               text('owner_id'),
  ocppTransactionId:     integer('ocpp_transaction_id'),
  status:                text('status').notNull().default('pending'),
  startTime:             timestamp('start_time'),
  stopTime:              timestamp('stop_time'),
  energyDeliveredWh:     integer('energy_delivered_wh').notNull().default(0),
  accruedAmount:         integer('accrued_amount').notNull().default(0),
  grossAmount:           integer('gross_amount').notNull().default(0),
  commissionAmount:      integer('commission_amount').notNull().default(0),
  ownerPayoutAmount:     integer('owner_payout_amount').notNull().default(0),
  paymentIdempotencyKey: text('payment_idempotency_key'),
  stopReason:            text('stop_reason'),
  createdAt:             timestamp('created_at').notNull().defaultNow(),
  updatedAt:             timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  driverStatusIdx:  index('sessions_driver_status_idx').on(t.driverId, t.status),
  chargerStatusIdx: index('sessions_charger_status_idx').on(t.chargerId, t.status),
  ocppTxIdx:        uniqueIndex('sessions_ocpp_tx_idx').on(t.ocppTransactionId),
}));

export type ChargingSession = typeof chargingSessions.$inferSelect;
export type NewChargingSession = typeof chargingSessions.$inferInsert;
