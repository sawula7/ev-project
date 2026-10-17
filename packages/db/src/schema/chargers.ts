import { pgTable, text, real, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const chargers = pgTable('chargers', {
  id:               text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  serialNumber:     text('serial_number').notNull(),
  authorizationKey: text('authorization_key').notNull(),
  ownerId:          text('owner_id'),
  claimCode:        text('claim_code').notNull(),
  lat:              real('lat'),
  lng:              real('lng'),
  address:          text('address'),
  connectorType:    text('connector_type').notNull().default('Type2'),
  pricePerKwh:      integer('price_per_kwh').notNull().default(0),
  status:           text('status').notNull().default('offline'),
  lastHeartbeat:    timestamp('last_heartbeat'),
  lastBootInfo:     text('last_boot_info'),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  serialIdx: uniqueIndex('chargers_serial_idx').on(t.serialNumber),
}));

export type Charger = typeof chargers.$inferSelect;
export type NewCharger = typeof chargers.$inferInsert;
