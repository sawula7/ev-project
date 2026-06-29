import { Schema, model, Document, Types } from 'mongoose';

export interface IOwner extends Document {
  email: string;
  passwordHash: string;
  name: string;
  businessName?: string;
  phone?: string;
  walletId: Types.ObjectId;
  // KYC / bank payout fields
  bankAccount?: {
    bankName: string;
    accountNumber: string;
    accountHolderName: string;
    branchCode?: string;
  };
  kycVerified: boolean;
  fcmToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ownerSchema = new Schema<IOwner>(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true },
    businessName: String,
    phone: String,
    walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true },
    bankAccount: {
      bankName: String,
      accountNumber: String,
      accountHolderName: String,
      branchCode: String,
    },
    kycVerified: { type: Boolean, default: false },
    fcmToken: String,
  },
  { timestamps: true }
);

export const Owner = model<IOwner>('Owner', ownerSchema);
