import { Schema, model, Document, Types } from 'mongoose';
import { ChargerStatus } from '@ev/shared';

export interface ICharger extends Document {
  serialNumber: string;
  authorizationKey: string; // OCPP Basic Auth password, store hashed or via Secrets Manager in prod
  ownerId?: Types.ObjectId;
  claimCode: string; // 6-8 char alphanumeric, printed on unit
  location: {
    lat: number;
    lng: number;
    address: string;
  };
  connectorType: string; // e.g. "Type2", "CCS", "CHAdeMO"
  pricePerKwh: number; // integer, smallest currency unit per kWh
  status: ChargerStatus;
  lastHeartbeat?: Date;
  lastBootInfo?: {
    chargePointVendor: string;
    chargePointModel: string;
    firmwareVersion?: string;
    iccid?: string;
    imsi?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const chargerSchema = new Schema<ICharger>(
  {
    serialNumber: { type: String, required: true, unique: true },
    authorizationKey: { type: String, required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'Owner' },
    claimCode: { type: String, required: true },
    location: {
      lat: { type: Number, default: 0 },
      lng: { type: Number, default: 0 },
      address: { type: String, default: '' },
    },
    connectorType: { type: String, default: 'Type2' },
    pricePerKwh: { type: Number, default: 0 },
    status: {
      type: String,
      enum: Object.values(ChargerStatus),
      default: ChargerStatus.UNCLAIMED,
    },
    lastHeartbeat: Date,
    lastBootInfo: {
      chargePointVendor: String,
      chargePointModel: String,
      firmwareVersion: String,
      iccid: String,
      imsi: String,
    },
  },
  { timestamps: true }
);

export const Charger = model<ICharger>('Charger', chargerSchema);
