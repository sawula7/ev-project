import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { type Db, chargers, owners, wallets, payouts, chargingSessions } from '@ev/db';
import { authenticate, AuthRequest, requireRole } from '../middleware/authenticate';
import { ChargerStatus, PayoutStatus } from '@ev/shared';
import { toPublicCharger } from '../serializers';

export function ownerRouter(db: Db) {
  const router = Router();
  router.use(authenticate, requireRole('owner'));

  // GET /owner/me
  router.get('/me', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const [owner] = await db
        .select({
          id: owners.id,
          email: owners.email,
          name: owners.name,
          businessName: owners.businessName,
          phone: owners.phone,
          walletId: owners.walletId,
          kycVerified: owners.kycVerified,
          createdAt: owners.createdAt,
          updatedAt: owners.updatedAt,
        })
        .from(owners)
        .where(eq(owners.id, req.user!.sub));
      if (!owner) {
        res.status(404).json({ success: false, error: 'Not found' });
        return;
      }

      const [wallet] = await db
        .select()
        .from(wallets)
        .where(and(eq(wallets.ownerType, 'owner'), eq(wallets.ownerId, req.user!.sub)));

      res.json({
        success: true,
        data: { owner, wallet: { balance: wallet?.balance ?? 0, currency: wallet?.currency ?? 'LKR' } },
      });
    } catch (err) {
      next(err);
    }
  });

  // ── Charger claim flow ────────────────────────────────────────────────────────

  const claimSchema = z.object({
    serialNumber: z.string().min(1),
    claimCode: z.string().length(8),
  });

  // POST /owner/chargers/claim
  // Owner enters the serial number + claim code printed on the unit.
  router.post('/chargers/claim', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { serialNumber, claimCode } = claimSchema.parse(req.body);

      const [charger] = await db.select().from(chargers).where(eq(chargers.serialNumber, serialNumber));
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

      await db
        .update(chargers)
        .set({ ownerId: req.user!.sub, status: ChargerStatus.IDLE, updatedAt: new Date() })
        .where(eq(chargers.id, charger.id));

      res.json({ success: true, data: { chargerId: charger.id, serialNumber: charger.serialNumber } });
    } catch (err) {
      next(err);
    }
  });

  // GET /owner/chargers — list chargers owned by this owner
  router.get('/chargers', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const rows = await db.select().from(chargers).where(eq(chargers.ownerId, req.user!.sub));
      res.json({ success: true, data: rows.map(toPublicCharger) });
    } catch (err) {
      next(err);
    }
  });

  const updateChargerSchema = z.object({
    pricePerKwh: z.number().int().positive().optional(),
    location: z
      .object({
        lat: z.number(),
        lng: z.number(),
        address: z.string(),
      })
      .optional(),
    connectorType: z.string().optional(),
  });

  // PATCH /owner/chargers/:id
  router.patch('/chargers/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const body = updateChargerSchema.parse(req.body);
      const [charger] = await db
        .select()
        .from(chargers)
        .where(and(eq(chargers.id, req.params.id), eq(chargers.ownerId, req.user!.sub)));
      if (!charger) {
        res.status(404).json({ success: false, error: 'Charger not found' });
        return;
      }

      const [updated] = await db
        .update(chargers)
        .set({
          ...(body.pricePerKwh !== undefined ? { pricePerKwh: body.pricePerKwh } : {}),
          ...(body.location
            ? { lat: body.location.lat, lng: body.location.lng, address: body.location.address }
            : {}),
          ...(body.connectorType ? { connectorType: body.connectorType } : {}),
          updatedAt: new Date(),
        })
        .where(eq(chargers.id, charger.id))
        .returning();

      res.json({ success: true, data: toPublicCharger(updated) });
    } catch (err) {
      next(err);
    }
  });

  // GET /owner/sessions — session history for all owned chargers
  router.get('/sessions', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const rows = await db
        .select({
          session: chargingSessions,
          chargerSerial: chargers.serialNumber,
          chargerLat: chargers.lat,
          chargerLng: chargers.lng,
          chargerAddress: chargers.address,
        })
        .from(chargingSessions)
        .leftJoin(chargers, eq(chargingSessions.chargerId, chargers.id))
        .where(eq(chargingSessions.ownerId, req.user!.sub))
        .orderBy(desc(chargingSessions.createdAt))
        .limit(100);

      const data = rows.map((r) => ({
        ...r.session,
        charger: {
          serialNumber: r.chargerSerial,
          location: { lat: r.chargerLat, lng: r.chargerLng, address: r.chargerAddress },
        },
      }));

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // ── Payouts ───────────────────────────────────────────────────────────────────

  const payoutSchema = z.object({
    amount: z.number().int().positive(),
  });

  // POST /owner/payouts/request
  router.post('/payouts/request', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { amount } = payoutSchema.parse(req.body);
      const [owner] = await db.select().from(owners).where(eq(owners.id, req.user!.sub));
      if (!owner) {
        res.status(404).json({ success: false, error: 'Owner not found' });
        return;
      }

      if (!owner.kycVerified) {
        res.status(403).json({ success: false, error: 'KYC not verified — contact support' });
        return;
      }

      const [wallet] = await db
        .select()
        .from(wallets)
        .where(and(eq(wallets.ownerType, 'owner'), eq(wallets.ownerId, owner.id)));
      if (!wallet || wallet.balance < amount) {
        res.status(400).json({ success: false, error: 'Insufficient balance' });
        return;
      }

      const [payout] = await db
        .insert(payouts)
        .values({
          ownerId: owner.id,
          walletId: wallet.id,
          requestedAmount: amount,
          status: PayoutStatus.REQUESTED,
          idempotencyKey: crypto.randomUUID(),
        })
        .returning();

      res.status(201).json({ success: true, data: { payoutId: payout.id, status: payout.status } });
    } catch (err) {
      next(err);
    }
  });

  // GET /owner/payouts
  router.get('/payouts', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const rows = await db
        .select()
        .from(payouts)
        .where(eq(payouts.ownerId, req.user!.sub))
        .orderBy(desc(payouts.createdAt));
      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
