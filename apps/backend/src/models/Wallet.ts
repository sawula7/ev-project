import { Schema, model, Document, Types } from 'mongoose';

export type WalletOwnerType = 'driver' | 'owner' | 'system';

export interface IWallet extends Document {
  ownerType: WalletOwnerType;
  ownerId: Types.ObjectId; // Driver._id, Owner._id, or a system account id
  // Cached balance derived from LedgerEntry — updated inside the same transaction.
  // Source of truth is the ledger; this field is the materialized view.
  balance: number; // integer, smallest currency unit
  currency: string; // ISO 4217, e.g. "LKR"
  createdAt: Date;
  updatedAt: Date;
}

const walletSchema = new Schema<IWallet>(
  {
    ownerType: {
      type: String,
      enum: ['driver', 'owner', 'system'],
      required: true,
    },
    ownerId: { type: Schema.Types.ObjectId, required: true },
    balance: { type: Number, required: true, default: 0 },
    currency: { type: String, required: true, default: 'LKR' },
  },
  { timestamps: true }
);

walletSchema.index({ ownerType: 1, ownerId: 1 }, { unique: true });

export const Wallet = model<IWallet>('Wallet', walletSchema);
