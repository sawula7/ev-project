import { Schema, model, Document, Types } from 'mongoose';
import { PayoutStatus } from '@ev/shared';

export interface IPayout extends Document {
  ownerId: Types.ObjectId;
  walletId: Types.ObjectId;
  requestedAmount: number; // integer
  status: PayoutStatus;
  bankTransferReference?: string;
  processedAt?: Date;
  notes?: string;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

const payoutSchema = new Schema<IPayout>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'Owner', required: true },
    walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true },
    requestedAmount: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: Object.values(PayoutStatus),
      default: PayoutStatus.REQUESTED,
    },
    bankTransferReference: String,
    processedAt: Date,
    notes: String,
    idempotencyKey: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

payoutSchema.index({ ownerId: 1, status: 1 });

export const Payout = model<IPayout>('Payout', payoutSchema);
