import { Schema, model, Document, Types } from 'mongoose';
import { SessionStatus } from '@ev/shared';

export interface IChargingSession extends Document {
  driverId: Types.ObjectId;
  chargerId: Types.ObjectId;
  ownerId?: Types.ObjectId;
  // OCPP transaction id assigned by the charger
  ocppTransactionId?: number;
  status: SessionStatus;
  startTime?: Date;
  stopTime?: Date;
  // Accumulated from MeterValues (Wh)
  energyDeliveredWh: number;
  // Running cost accumulator (integer, smallest currency unit)
  accruedAmount: number;
  // Finalised on StopTransaction
  grossAmount: number;
  commissionAmount: number;
  ownerPayoutAmount: number;
  // Payment idempotency key — set when the ledger entries are written
  paymentIdempotencyKey?: string;
  stopReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const chargingSessionSchema = new Schema<IChargingSession>(
  {
    driverId: { type: Schema.Types.ObjectId, ref: 'Driver', required: true },
    chargerId: { type: Schema.Types.ObjectId, ref: 'Charger', required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'Owner' },
    ocppTransactionId: Number,
    status: {
      type: String,
      enum: Object.values(SessionStatus),
      default: SessionStatus.INITIATED,
    },
    startTime: Date,
    stopTime: Date,
    energyDeliveredWh: { type: Number, default: 0 },
    accruedAmount: { type: Number, default: 0 },
    grossAmount: { type: Number, default: 0 },
    commissionAmount: { type: Number, default: 0 },
    ownerPayoutAmount: { type: Number, default: 0 },
    paymentIdempotencyKey: String,
    stopReason: String,
  },
  { timestamps: true }
);

chargingSessionSchema.index({ driverId: 1, status: 1 });
chargingSessionSchema.index({ chargerId: 1, status: 1 });
chargingSessionSchema.index({ ocppTransactionId: 1 });

export const ChargingSession = model<IChargingSession>(
  'ChargingSession',
  chargingSessionSchema
);
