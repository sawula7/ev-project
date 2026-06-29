import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest, requireRole } from '../middleware/authenticate';
import { Charger } from '../../models/Charger';
import { Driver } from '../../models/Driver';
import { Owner } from '../../models/Owner';
import { ChargingSession } from '../../models/ChargingSession';
import { Payout } from '../../models/Payout';
import { Wallet } from '../../models/Wallet';
import { LedgerEntry } from '../../models/LedgerEntry';
import { ChargerStatus, PayoutStatus, LedgerEntryType } from '@ev/shared';
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';

export const adminRouter = Router();
adminRouter.use(authenticate, requireRole('admin'));

// GET /admin/chargers
adminRouter.get('/chargers', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const chargers = await Charger.find().sort({ createdAt: -1 }).populate('ownerId', 'name email');
    res.json({ success: true, data: chargers });
  } catch (err) { next(err); }
});

// POST /admin/chargers — provision a new charger record (before it boots)
const provisionSchema = z.object({
  serialNumber: z.string().min(1),
  authorizationKey: z.string().min(8),
  connectorType: z.string().default('Type2'),
  location: z.object({ lat: z.number(), lng: z.number(), address: z.string() }).optional(),
});

adminRouter.post('/chargers', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = provisionSchema.parse(req.body);
    const claimCode = generateClaimCode();
    const charger = await Charger.create({
      ...body,
      claimCode,
      status: ChargerStatus.OFFLINE,
      location: body.location ?? { lat: 0, lng: 0, address: '' },
    });
    res.status(201).json({ success: true, data: { chargerId: charger._id, claimCode } });
  } catch (err) { next(err); }
});

// PATCH /admin/chargers/:id — admin override (status, auth key, etc.)
adminRouter.patch('/chargers/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const charger = await Charger.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!charger) { res.status(404).json({ success: false, error: 'Not found' }); return; }
    res.json({ success: true, data: charger });
  } catch (err) { next(err); }
});

// GET /admin/sessions
adminRouter.get('/sessions', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string ?? '1', 10);
    const limit = 50;
    const sessions = await ChargingSession.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('driverId', 'name email')
      .populate('chargerId', 'serialNumber location');
    const total = await ChargingSession.countDocuments();
    res.json({ success: true, data: sessions, meta: { page, total } });
  } catch (err) { next(err); }
});

// GET /admin/drivers
adminRouter.get('/drivers', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const drivers = await Driver.find().select('-passwordHash').sort({ createdAt: -1 });
    res.json({ success: true, data: drivers });
  } catch (err) { next(err); }
});

// GET /admin/owners
adminRouter.get('/owners', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const owners = await Owner.find().select('-passwordHash').sort({ createdAt: -1 });
    res.json({ success: true, data: owners });
  } catch (err) { next(err); }
});

// PATCH /admin/owners/:id/kyc — verify/reject KYC
adminRouter.patch('/owners/:id/kyc', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { verified } = z.object({ verified: z.boolean() }).parse(req.body);
    await Owner.findByIdAndUpdate(req.params.id, { $set: { kycVerified: verified } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /admin/payouts — list all pending payout requests
adminRouter.get('/payouts', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const status = (req.query.status as PayoutStatus) ?? PayoutStatus.REQUESTED;
    const payouts = await Payout.find({ status })
      .sort({ createdAt: 1 })
      .populate('ownerId', 'name email bankAccount');
    res.json({ success: true, data: payouts });
  } catch (err) { next(err); }
});

// POST /admin/payouts/:id/complete — admin marks bank transfer as done
// This is the only place a PAYOUT ledger entry is written, ensuring the
// entry only exists once the money has actually left.
adminRouter.post('/payouts/:id/complete', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { bankTransferReference } = z.object({ bankTransferReference: z.string().min(1) }).parse(req.body);

    const payout = await Payout.findById(req.params.id);
    if (!payout) { res.status(404).json({ success: false, error: 'Payout not found' }); return; }
    if (payout.status !== PayoutStatus.REQUESTED && payout.status !== PayoutStatus.PROCESSING) {
      res.status(400).json({ success: false, error: 'Payout already completed or failed' });
      return;
    }

    const idempotencyKey = `payout:${payout._id.toString()}`;
    const existing = await LedgerEntry.findOne({ idempotencyKey });
    if (existing) {
      res.status(409).json({ success: false, error: 'Payout already recorded' });
      return;
    }

    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        await LedgerEntry.create([{
          fromWalletId: payout.walletId,
          toWalletId: null, // external bank
          amount: payout.requestedAmount,
          type: LedgerEntryType.PAYOUT,
          idempotencyKey,
          relatedPayoutId: payout._id,
          metadata: { bankTransferReference },
        }], { session: dbSession });

        await Wallet.findByIdAndUpdate(
          payout.walletId,
          { $inc: { balance: -payout.requestedAmount } },
          { session: dbSession }
        );

        payout.status = PayoutStatus.COMPLETED;
        payout.bankTransferReference = bankTransferReference;
        payout.processedAt = new Date();
        await payout.save({ session: dbSession });
      });
    } finally {
      await dbSession.endSession();
    }

    res.json({ success: true, data: { payoutId: payout._id, status: payout.status } });
  } catch (err) { next(err); }
});

// GET /admin/reconciliation — on-demand balance check
adminRouter.get('/reconciliation', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const [walletsAgg, topupAgg, payoutAgg] = await Promise.all([
      Wallet.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]),
      LedgerEntry.aggregate([{ $match: { type: LedgerEntryType.TOPUP } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      LedgerEntry.aggregate([{ $match: { type: LedgerEntryType.PAYOUT } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    ]);
    const walletTotal = walletsAgg[0]?.total ?? 0;
    const topupTotal = topupAgg[0]?.total ?? 0;
    const payoutTotal = payoutAgg[0]?.total ?? 0;
    const drift = walletTotal - (topupTotal - payoutTotal);
    res.json({ success: true, data: { walletTotal, topupTotal, payoutTotal, drift, ok: drift === 0 } });
  } catch (err) { next(err); }
});

function generateClaimCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
