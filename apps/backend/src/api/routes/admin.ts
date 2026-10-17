import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, desc, sql } from 'drizzle-orm';
import { authenticate, AuthRequest, requireRole } from '../middleware/authenticate';
import { type Db, chargers, drivers, owners, chargingSessions, payouts, wallets, ledgerEntries } from '@ev/db';
import { ChargerStatus, PayoutStatus, LedgerEntryType } from '@ev/shared';

export function adminRouter(db: Db) {
  const router = Router();
  router.use(authenticate, requireRole('admin'));

  // GET /admin/chargers
  router.get('/chargers', async (_req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const rows = await db
        .select({
          charger: chargers,
          ownerName: owners.name,
          ownerEmail: owners.email,
        })
        .from(chargers)
        .leftJoin(owners, eq(chargers.ownerId, owners.id))
        .orderBy(desc(chargers.createdAt));

      const data = rows.map((r) => ({
        ...r.charger,
        owner: r.ownerName ? { name: r.ownerName, email: r.ownerEmail } : null,
      }));
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // POST /admin/chargers — provision a new charger record (before it boots)
  const provisionSchema = z.object({
    serialNumber: z.string().min(1),
    authorizationKey: z.string().min(8),
    connectorType: z.string().default('Type2'),
    location: z.object({ lat: z.number(), lng: z.number(), address: z.string() }).optional(),
  });

  router.post('/chargers', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const body = provisionSchema.parse(req.body);
      const claimCode = generateClaimCode();

      const [charger] = await db
        .insert(chargers)
        .values({
          serialNumber: body.serialNumber,
          authorizationKey: body.authorizationKey,
          connectorType: body.connectorType,
          claimCode,
          status: ChargerStatus.OFFLINE,
          lat: body.location?.lat ?? 0,
          lng: body.location?.lng ?? 0,
          address: body.location?.address ?? '',
        })
        .returning();

      res.status(201).json({ success: true, data: { chargerId: charger.id, claimCode } });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /admin/chargers/:id — admin override (status, auth key, etc.)
  const adminUpdateChargerSchema = z.object({
    status: z.nativeEnum(ChargerStatus).optional(),
    authorizationKey: z.string().optional(),
    pricePerKwh: z.number().int().optional(),
    connectorType: z.string().optional(),
    location: z.object({ lat: z.number(), lng: z.number(), address: z.string() }).optional(),
  });

  router.patch('/chargers/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const body = adminUpdateChargerSchema.parse(req.body);
      const [charger] = await db
        .update(chargers)
        .set({
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(body.authorizationKey !== undefined ? { authorizationKey: body.authorizationKey } : {}),
          ...(body.pricePerKwh !== undefined ? { pricePerKwh: body.pricePerKwh } : {}),
          ...(body.connectorType !== undefined ? { connectorType: body.connectorType } : {}),
          ...(body.location
            ? { lat: body.location.lat, lng: body.location.lng, address: body.location.address }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(chargers.id, req.params.id))
        .returning();

      if (!charger) {
        res.status(404).json({ success: false, error: 'Not found' });
        return;
      }
      res.json({ success: true, data: charger });
    } catch (err) {
      next(err);
    }
  });

  // GET /admin/sessions
  router.get('/sessions', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt((req.query.page as string) ?? '1', 10);
      const limit = 50;

      const rows = await db
        .select({
          session: chargingSessions,
          driverName: drivers.name,
          driverEmail: drivers.email,
          chargerSerial: chargers.serialNumber,
          chargerLat: chargers.lat,
          chargerLng: chargers.lng,
          chargerAddress: chargers.address,
        })
        .from(chargingSessions)
        .leftJoin(drivers, eq(chargingSessions.driverId, drivers.id))
        .leftJoin(chargers, eq(chargingSessions.chargerId, chargers.id))
        .orderBy(desc(chargingSessions.createdAt))
        .limit(limit)
        .offset((page - 1) * limit);

      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(chargingSessions);

      const data = rows.map((r) => ({
        ...r.session,
        driver: { name: r.driverName, email: r.driverEmail },
        charger: {
          serialNumber: r.chargerSerial,
          location: { lat: r.chargerLat, lng: r.chargerLng, address: r.chargerAddress },
        },
      }));

      res.json({ success: true, data, meta: { page, total: Number(count) } });
    } catch (err) {
      next(err);
    }
  });

  // GET /admin/drivers
  router.get('/drivers', async (_req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const rows = await db
        .select({
          id: drivers.id,
          email: drivers.email,
          name: drivers.name,
          phone: drivers.phone,
          walletId: drivers.walletId,
          createdAt: drivers.createdAt,
          updatedAt: drivers.updatedAt,
        })
        .from(drivers)
        .orderBy(desc(drivers.createdAt));
      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  });

  // GET /admin/owners
  router.get('/owners', async (_req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const rows = await db
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
        .orderBy(desc(owners.createdAt));
      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /admin/owners/:id/kyc — verify/reject KYC
  router.patch('/owners/:id/kyc', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { verified } = z.object({ verified: z.boolean() }).parse(req.body);
      await db
        .update(owners)
        .set({ kycVerified: verified, updatedAt: new Date() })
        .where(eq(owners.id, req.params.id));
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // GET /admin/payouts — list payout requests by status
  router.get('/payouts', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const status = (req.query.status as PayoutStatus) ?? PayoutStatus.REQUESTED;
      const rows = await db
        .select({
          payout: payouts,
          ownerName: owners.name,
          ownerEmail: owners.email,
          ownerBankName: owners.bankName,
          ownerAccountNumber: owners.accountNumber,
          ownerAccountHolderName: owners.accountHolderName,
          ownerBranchCode: owners.branchCode,
        })
        .from(payouts)
        .leftJoin(owners, eq(payouts.ownerId, owners.id))
        .where(eq(payouts.status, status))
        .orderBy(payouts.createdAt);

      const data = rows.map((r) => ({
        ...r.payout,
        owner: {
          name: r.ownerName,
          email: r.ownerEmail,
          bankAccount: {
            bankName: r.ownerBankName,
            accountNumber: r.ownerAccountNumber,
            accountHolderName: r.ownerAccountHolderName,
            branchCode: r.ownerBranchCode,
          },
        },
      }));
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // POST /admin/payouts/:id/complete — admin marks bank transfer as done
  // This is the only place a PAYOUT ledger entry is written, ensuring the
  // entry only exists once the money has actually left.
  router.post('/payouts/:id/complete', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { bankTransferReference } = z.object({ bankTransferReference: z.string().min(1) }).parse(req.body);

      const [payout] = await db.select().from(payouts).where(eq(payouts.id, req.params.id));
      if (!payout) {
        res.status(404).json({ success: false, error: 'Payout not found' });
        return;
      }
      if (payout.status !== PayoutStatus.REQUESTED && payout.status !== PayoutStatus.PROCESSING) {
        res.status(400).json({ success: false, error: 'Payout already completed or failed' });
        return;
      }

      const idempotencyKey = `payout:${payout.id}`;
      const [existing] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.idempotencyKey, idempotencyKey));
      if (existing) {
        res.status(409).json({ success: false, error: 'Payout already recorded' });
        return;
      }

      await db.transaction(async (tx) => {
        await tx.insert(ledgerEntries).values({
          fromWalletId: payout.walletId,
          toWalletId: null, // external bank
          amount: payout.requestedAmount,
          type: LedgerEntryType.PAYOUT,
          idempotencyKey,
          relatedPayoutId: payout.id,
          metadata: JSON.stringify({ bankTransferReference }),
        });

        await tx
          .update(wallets)
          .set({ balance: sql`${wallets.balance} - ${payout.requestedAmount}`, updatedAt: new Date() })
          .where(eq(wallets.id, payout.walletId));

        await tx
          .update(payouts)
          .set({
            status: PayoutStatus.COMPLETED,
            bankTransferReference,
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(payouts.id, payout.id));
      });

      res.json({ success: true, data: { payoutId: payout.id, status: PayoutStatus.COMPLETED } });
    } catch (err) {
      next(err);
    }
  });

  // GET /admin/reconciliation — on-demand balance check
  router.get('/reconciliation', async (_req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const [walletRow] = await db
        .select({ total: sql<string>`coalesce(sum(${wallets.balance}), 0)` })
        .from(wallets);
      const [topupRow] = await db
        .select({ total: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)` })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.type, LedgerEntryType.TOPUP));
      const [payoutRow] = await db
        .select({ total: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)` })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.type, LedgerEntryType.PAYOUT));

      const walletTotal = Number(walletRow.total);
      const topupTotal = Number(topupRow.total);
      const payoutTotal = Number(payoutRow.total);
      const drift = walletTotal - (topupTotal - payoutTotal);

      res.json({ success: true, data: { walletTotal, topupTotal, payoutTotal, drift, ok: drift === 0 } });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function generateClaimCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
