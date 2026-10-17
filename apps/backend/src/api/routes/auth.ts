import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { type Db, drivers, owners, wallets } from '@ev/db';
import { hashPassword, verifyPassword, signToken } from '../../services/auth';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export function authRouter(db: Db) {
  const router = Router();

  // POST /auth/driver/register
  router.post('/driver/register', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = registerSchema.parse(req.body);

      const [existing] = await db.select().from(drivers).where(eq(drivers.email, body.email));
      if (existing) {
        res.status(409).json({ success: false, error: 'Email already registered' });
        return;
      }

      const driverId = crypto.randomUUID();
      const walletId = crypto.randomUUID();
      const passwordHash = await hashPassword(body.password);

      await db.transaction(async (tx) => {
        await tx.insert(drivers).values({
          id: driverId,
          email: body.email,
          passwordHash,
          name: body.name,
          phone: body.phone,
          walletId,
        });
        await tx.insert(wallets).values({
          id: walletId,
          ownerType: 'driver',
          ownerId: driverId,
          balance: 0,
          currency: 'LKR',
        });
      });

      const token = signToken({ sub: driverId, role: 'driver' });
      res.status(201).json({ success: true, data: { token } });
    } catch (err) {
      next(err);
    }
  });

  // POST /auth/driver/login
  router.post('/driver/login', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = loginSchema.parse(req.body);
      const [driver] = await db.select().from(drivers).where(eq(drivers.email, body.email));
      if (!driver || !(await verifyPassword(body.password, driver.passwordHash))) {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
        return;
      }
      const token = signToken({ sub: driver.id, role: 'driver' });
      res.json({ success: true, data: { token } });
    } catch (err) {
      next(err);
    }
  });

  // ── Owner auth ────────────────────────────────────────────────────────────────

  const ownerRegisterSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(1),
    businessName: z.string().optional(),
    phone: z.string().optional(),
  });

  // POST /auth/owner/register
  router.post('/owner/register', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = ownerRegisterSchema.parse(req.body);

      const [existing] = await db.select().from(owners).where(eq(owners.email, body.email));
      if (existing) {
        res.status(409).json({ success: false, error: 'Email already registered' });
        return;
      }

      const ownerId = crypto.randomUUID();
      const walletId = crypto.randomUUID();
      const passwordHash = await hashPassword(body.password);

      await db.transaction(async (tx) => {
        await tx.insert(owners).values({
          id: ownerId,
          email: body.email,
          passwordHash,
          name: body.name,
          businessName: body.businessName,
          phone: body.phone,
          walletId,
        });
        await tx.insert(wallets).values({
          id: walletId,
          ownerType: 'owner',
          ownerId,
          balance: 0,
          currency: 'LKR',
        });
      });

      const token = signToken({ sub: ownerId, role: 'owner' });
      res.status(201).json({ success: true, data: { token } });
    } catch (err) {
      next(err);
    }
  });

  // POST /auth/owner/login
  router.post('/owner/login', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = loginSchema.parse(req.body);
      const [owner] = await db.select().from(owners).where(eq(owners.email, body.email));
      if (!owner || !(await verifyPassword(body.password, owner.passwordHash))) {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
        return;
      }
      const token = signToken({ sub: owner.id, role: 'owner' });
      res.json({ success: true, data: { token } });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
