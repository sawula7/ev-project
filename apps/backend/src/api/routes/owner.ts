import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest, requireRole } from '../middleware/authenticate';
import { Charger } from '../../models/Charger';
import { Owner } from '../../models/Owner';
import { Wallet } from '../../models/Wallet';
import { Payout } from '../../models/Payout';
import { ChargingSession } from '../../models/ChargingSession';
import { ChargerStatus, PayoutStatus } from '@ev/shared';
import { v4 as uuidv4 } from 'uuid';

export const ownerRouter = Router();
ownerRouter.use(authenticate, requireRole('owner'));

// GET /owner/me
ownerRouter.get('/me', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const owner = await Owner.findById(req.user!.sub).select('-passwordHash');
    if (!owner) { res.status(404).json({ success: false, error: 'Not found' }); return; }
    const wallet = await Wallet.findById(owner.walletId);
    res.json({ success: true, data: { owner, wallet: { balance: wallet?.balance ?? 0, currency: wallet?.currency ?? 'LKR' } } });
  } catch (err) { next(err); }
});

// ── Charger claim flow ────────────────────────────────────────────────────────

const claimSchema = z.object({
  serialNumber: z.string().min(1),
  claimCode: z.string().length(8),
});

// POST /owner/chargers/claim
// Owner enters the serial number + claim code printed on the unit.
ownerRouter.post('/chargers/claim', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { serialNumber, claimCode } = claimSchema.parse(req.body);

    const charger = await Charger.findOne({ serialNumber });
    if (!charger) {
      res.status(404).json({ success: false, error: 'Charger not found' });
      return;
    }
    if (charger.ownerId) {
      res.status(409).json({ success: false, error: 'Charger already claimed' });
      return;
    }
    if (charger.claimCode !== claimCode.toUpperCase()) {
      res.status(400).json({ success: false, error: 'Invalid claim code' });
      return;
    }

    charger.ownerId = req.user!.sub as unknown as typeof charger.ownerId;
    charger.status = ChargerStatus.IDLE;
    await charger.save();

    res.json({ success: true, data: { chargerId: charger._id, serialNumber: charger.serialNumber } });
  } catch (err) { next(err); }
});

// GET /owner/chargers — list chargers owned by this owner
ownerRouter.get('/chargers', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const chargers = await Charger.find({ ownerId: req.user!.sub }).select('-authorizationKey -claimCode');
    res.json({ success: true, data: chargers });
  } catch (err) { next(err); }
});

const updateChargerSchema = z.object({
  pricePerKwh: z.number().int().positive().optional(),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
    address: z.string(),
  }).optional(),
  connectorType: z.string().optional(),
});

// PATCH /owner/chargers/:id
ownerRouter.patch('/chargers/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = updateChargerSchema.parse(req.body);
    const charger = await Charger.findOne({ _id: req.params.id, ownerId: req.user!.sub });
    if (!charger) { res.status(404).json({ success: false, error: 'Charger not found' }); return; }

    if (body.pricePerKwh !== undefined) charger.pricePerKwh = body.pricePerKwh;
    if (body.location) charger.location = body.location;
    if (body.connectorType) charger.connectorType = body.connectorType;
    await charger.save();

    res.json({ success: true, data: charger });
  } catch (err) { next(err); }
});

// GET /owner/sessions — session history for all owned chargers
ownerRouter.get('/sessions', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const sessions = await ChargingSession.find({ ownerId: req.user!.sub })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('chargerId', 'serialNumber location');
    res.json({ success: true, data: sessions });
  } catch (err) { next(err); }
});

// ── Payouts ───────────────────────────────────────────────────────────────────

const payoutSchema = z.object({
  amount: z.number().int().positive(),
});

// POST /owner/payouts/request
ownerRouter.post('/payouts/request', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { amount } = payoutSchema.parse(req.body);
    const owner = await Owner.findById(req.user!.sub);
    if (!owner) { res.status(404).json({ success: false, error: 'Owner not found' }); return; }

    if (!owner.kycVerified) {
      res.status(403).json({ success: false, error: 'KYC not verified — contact support' });
      return;
    }

    const wallet = await Wallet.findById(owner.walletId);
    if (!wallet || wallet.balance < amount) {
      res.status(400).json({ success: false, error: 'Insufficient balance' });
      return;
    }

    const payout = await Payout.create({
      ownerId: owner._id,
      walletId: wallet._id,
      requestedAmount: amount,
      status: PayoutStatus.REQUESTED,
      idempotencyKey: uuidv4(),
    });

    res.status(201).json({ success: true, data: { payoutId: payout._id, status: payout.status } });
  } catch (err) { next(err); }
});

// GET /owner/payouts
ownerRouter.get('/payouts', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const payouts = await Payout.find({ ownerId: req.user!.sub }).sort({ createdAt: -1 });
    res.json({ success: true, data: payouts });
  } catch (err) { next(err); }
});
