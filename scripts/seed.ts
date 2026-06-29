/**
 * Local test seed — run once after starting the backend.
 * Creates: 1 admin JWT, 1 test charger, 1 test driver, 1 test owner.
 *
 * Usage:
 *   npx ts-node scripts/seed.ts
 *
 * Output: prints tokens and IDs you need for manual testing.
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../apps/backend/.env.local') });

import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

const MONGODB_URI = process.env.MONGODB_URI!;
const JWT_SECRET  = process.env.JWT_SECRET!;

// ── Inline minimal schemas (avoids importing compiled backend) ────────────────

const walletSchema = new mongoose.Schema({ ownerType: String, ownerId: mongoose.Schema.Types.ObjectId, balance: { type: Number, default: 0 }, currency: { type: String, default: 'LKR' } }, { timestamps: true });
const driverSchema = new mongoose.Schema({ email: String, passwordHash: String, name: String, walletId: mongoose.Schema.Types.ObjectId }, { timestamps: true });
const ownerSchema  = new mongoose.Schema({ email: String, passwordHash: String, name: String, walletId: mongoose.Schema.Types.ObjectId, kycVerified: { type: Boolean, default: false } }, { timestamps: true });
const chargerSchema = new mongoose.Schema({
  serialNumber: { type: String, unique: true },
  authorizationKey: String,
  claimCode: String,
  ownerId: mongoose.Schema.Types.ObjectId,
  location: { lat: Number, lng: Number, address: String },
  connectorType: { type: String, default: 'Type2' },
  pricePerKwh: { type: Number, default: 5000 }, // LKR 50.00 per kWh (in paisa)
  status: { type: String, default: 'idle' },
  lastHeartbeat: Date,
}, { timestamps: true });

const Wallet  = mongoose.model('Wallet',  walletSchema);
const Driver  = mongoose.model('Driver',  driverSchema);
const Owner   = mongoose.model('Owner',   ownerSchema);
const Charger = mongoose.model('Charger', chargerSchema);

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB\n');

  // ── Clear existing test data ────────────────────────────────────────────────
  await Promise.all([Wallet.deleteMany({}), Driver.deleteMany({}), Owner.deleteMany({}), Charger.deleteMany({})]);

  // ── Test Driver ─────────────────────────────────────────────────────────────
  const driverWallet = await Wallet.create({ ownerType: 'driver', ownerId: new mongoose.Types.ObjectId(), balance: 50000, currency: 'LKR' });
  const driver = await Driver.create({
    email: 'driver@test.com',
    passwordHash: await bcrypt.hash('password123', 10),
    name: 'Test Driver',
    walletId: driverWallet._id,
  });
  driverWallet.ownerId = driver._id as mongoose.Types.ObjectId;
  await driverWallet.save();
  const driverToken = jwt.sign({ sub: driver._id.toString(), role: 'driver' }, JWT_SECRET, { expiresIn: '7d' });

  // ── Test Owner ──────────────────────────────────────────────────────────────
  const ownerWallet = await Wallet.create({ ownerType: 'owner', ownerId: new mongoose.Types.ObjectId(), balance: 0, currency: 'LKR' });
  const owner = await Owner.create({
    email: 'owner@test.com',
    passwordHash: await bcrypt.hash('password123', 10),
    name: 'Test Owner',
    walletId: ownerWallet._id,
    kycVerified: true,
  });
  ownerWallet.ownerId = owner._id as mongoose.Types.ObjectId;
  await ownerWallet.save();
  const ownerToken = jwt.sign({ sub: owner._id.toString(), role: 'owner' }, JWT_SECRET, { expiresIn: '7d' });

  // ── Test Charger (pre-claimed by test owner) ────────────────────────────────
  const charger = await Charger.create({
    serialNumber: 'TESTUNIT001',
    authorizationKey: 'testkey123',
    claimCode: 'TESTCODE',
    ownerId: owner._id,
    location: { lat: 6.9271, lng: 79.8612, address: '123 Galle Road, Colombo 03' },
    connectorType: 'Type2',
    pricePerKwh: 5000,
    status: 'idle',
  });

  // ── Admin JWT ───────────────────────────────────────────────────────────────
  const adminToken = jwt.sign({ sub: 'admin', role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });

  // ── Print results ───────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════');
  console.log('SEED COMPLETE — copy these values for testing\n');

  console.log('CHARGER');
  console.log(`  ID:             ${charger._id}`);
  console.log(`  Serial:         TESTUNIT001`);
  console.log(`  Auth key:       testkey123`);
  console.log(`  Price/kWh:      5000 paisa = LKR 50.00`);
  console.log(`  OCPP URL:       ws://localhost:9000/ocpp/TESTUNIT001`);
  console.log('');

  console.log('DRIVER  (email: driver@test.com  password: password123)');
  console.log(`  ID:     ${driver._id}`);
  console.log(`  Wallet: LKR ${(driverWallet.balance as number / 100).toFixed(2)} starting balance`);
  console.log(`  Token:  ${driverToken}`);
  console.log('');

  console.log('OWNER   (email: owner@test.com   password: password123)');
  console.log(`  ID:     ${owner._id}`);
  console.log(`  Token:  ${ownerToken}`);
  console.log('');

  console.log('ADMIN');
  console.log(`  Token:  ${adminToken}`);
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');

  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
