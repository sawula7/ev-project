import { Schema, model, Document, Types } from 'mongoose';

export interface IDriver extends Document {
  email: string;
  passwordHash: string;
  name: string;
  phone?: string;
  walletId: Types.ObjectId;
  fcmToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

const driverSchema = new Schema<IDriver>(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true },
    phone: String,
    walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true },
    fcmToken: String,
  },
  { timestamps: true }
);

export const Driver = model<IDriver>('Driver', driverSchema);
