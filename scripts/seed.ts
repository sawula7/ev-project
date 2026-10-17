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

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { getDb, closeDb, chargers, drivers, owners, wallets } from '@ev/db';

const DATABASE_URL = process.env.DATABASE_URL!;
const JWT_SECRET = process.env.JWT_SECRET!;

async function main() {
  const db = getDb(DATABASE_URL);
  console.log('Connected to PostgreSQL\n');

  // ── Clear existing test data ────────────────────────────────────────────────
  await db.delete(wallets);
  await db.delete(drivers);
  await db.delete(owners);
  await db.delete(chargers);

  // ── Test Driver ─────────────────────────────────────────────────────────────
  const driverId = crypto.randomUUID();
  const driverWalletId = crypto.randomUUID();

  await db.insert(drivers).values({
    id: driverId,
    email: 'driver@test.com',
    passwordHash: await bcrypt.hash('password123', 10),
    name: 'Test Driver',
    walletId: driverWalletId,
  });
  await db.insert(wallets).values({
    id: driverWalletId,
    ownerType: 'driver',
    ownerId: driverId,
    balance: 50000,
    currency: 'LKR',
  });
  const driverToken = jwt.sign({ sub: driverId, role: 'driver' }, JWT_SECRET, { expiresIn: '7d' });

  // ── Test Owner ──────────────────────────────────────────────────────────────
  const ownerId = crypto.randomUUID();
  const ownerWalletId = crypto.randomUUID();

  await db.insert(owners).values({
    id: ownerId,
    email: 'owner@test.com',
    passwordHash: await bcrypt.hash('password123', 10),
    name: 'Test Owner',
    walletId: ownerWalletId,
    kycVerified: true,
  });
  await db.insert(wallets).values({
    id: ownerWalletId,
    ownerType: 'owner',
    ownerId,
    balance: 0,
    currency: 'LKR',
  });
  const ownerToken = jwt.sign({ sub: ownerId, role: 'owner' }, JWT_SECRET, { expiresIn: '7d' });

  // ── Test Charger (pre-claimed by test owner) ────────────────────────────────
  const [charger] = await db
    .insert(chargers)
    .values({
      serialNumber: 'TESTUNIT001',
      authorizationKey: 'testkey123',
      claimCode: 'TESTCODE',
      ownerId,
      lat: 6.9271,
      lng: 79.8612,
      address: '123 Galle Road, Colombo 03',
      connectorType: 'Type2',
      pricePerKwh: 5000,
      status: 'idle',
    })
    .returning();

  // ── Admin JWT ───────────────────────────────────────────────────────────────
  const adminToken = jwt.sign({ sub: 'admin', role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });

  // ── Print results ───────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════');
  console.log('SEED COMPLETE — copy these values for testing\n');

  console.log('CHARGER');
  console.log(`  ID:             ${charger.id}`);
  console.log(`  Serial:         TESTUNIT001`);
  console.log(`  Auth key:       testkey123`);
  console.log(`  Price/kWh:      5000 paisa = LKR 50.00`);
  console.log(`  OCPP URL:       ws://localhost:9000/ocpp/TESTUNIT001`);
  console.log('');

  console.log('DRIVER  (email: driver@test.com  password: password123)');
  console.log(`  ID:     ${driverId}`);
  console.log(`  Wallet: LKR ${(50000 / 100).toFixed(2)} starting balance`);
  console.log(`  Token:  ${driverToken}`);
  console.log('');

  console.log('OWNER   (email: owner@test.com   password: password123)');
  console.log(`  ID:     ${ownerId}`);
  console.log(`  Token:  ${ownerToken}`);
  console.log('');

  console.log('ADMIN');
  console.log(`  Token:  ${adminToken}`);
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
