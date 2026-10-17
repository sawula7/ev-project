import { pgTable, text, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const owners = pgTable('owners', {
  id:                text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email:             text('email').notNull(),
  passwordHash:      text('password_hash').notNull(),
  name:              text('name').notNull(),
  businessName:      text('business_name'),
  phone:             text('phone'),
  walletId:          text('wallet_id'),
  bankName:          text('bank_name'),
  accountNumber:     text('account_number'),
  accountHolderName: text('account_holder_name'),
  branchCode:        text('branch_code'),
  kycVerified:       boolean('kyc_verified').notNull().default(false),
  createdAt:         timestamp('created_at').notNull().defaultNow(),
  updatedAt:         timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  emailIdx: uniqueIndex('owners_email_idx').on(t.email),
}));

export type Owner = typeof owners.$inferSelect;
export type NewOwner = typeof owners.$inferInsert;
