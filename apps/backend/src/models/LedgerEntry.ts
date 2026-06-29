import { Schema, model, Document, Types } from 'mongoose';
import { LedgerEntryType } from '@ev/shared';

export interface ILedgerEntry extends Document {
  fromWalletId: Types.ObjectId | null; // null = external (gateway top-up)
  toWalletId: Types.ObjectId | null;   // null = external (payout)
  amount: number; // integer, smallest currency unit, always positive
  type: LedgerEntryType;
  idempotencyKey: string;
  relatedSessionId?: Types.ObjectId;
  relatedPayoutId?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const ledgerEntrySchema = new Schema<ILedgerEntry>(
  {
    fromWalletId: { type: Schema.Types.ObjectId, ref: 'Wallet', default: null },
    toWalletId: { type: Schema.Types.ObjectId, ref: 'Wallet', default: null },
    amount: { type: Number, required: true, min: 1 },
    type: {
      type: String,
      enum: Object.values(LedgerEntryType),
      required: true,
    },
    idempotencyKey: { type: String, required: true, unique: true },
    relatedSessionId: { type: Schema.Types.ObjectId, ref: 'ChargingSession' },
    relatedPayoutId: { type: Schema.Types.ObjectId, ref: 'Payout' },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ledgerEntrySchema.index({ relatedSessionId: 1 });
ledgerEntrySchema.index({ relatedPayoutId: 1 });

export const LedgerEntry = model<ILedgerEntry>('LedgerEntry', ledgerEntrySchema);
