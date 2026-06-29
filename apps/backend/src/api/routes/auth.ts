import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Driver } from '../../models/Driver';
import { Owner } from '../../models/Owner';
import { Wallet } from '../../models/Wallet';
import { hashPassword, verifyPassword, signToken } from '../../services/auth';

export const authRouter = Router();

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

// POST /auth/driver/register
authRouter.post(
  '/driver/register',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = registerSchema.parse(req.body);

      const existing = await Driver.findOne({ email: body.email });
      if (existing) {
        res.status(409).json({ success: false, error: 'Email already registered' });
        return;
      }

      const wallet = await Wallet.create({
        ownerType: 'driver',
        ownerId: 'placeholder', // replaced below after driver is created
        balance: 0,
        currency: 'LKR',
      });

      const driver = await Driver.create({
        email: body.email,
        passwordHash: await hashPassword(body.password),
        name: body.name,
        phone: body.phone,
        walletId: wallet._id,
      });

      // Fix wallet ownerId now that we have the driver id
      wallet.ownerId = driver._id as typeof wallet.ownerId;
      await wallet.save();

      const token = signToken({ sub: driver._id.toString(), role: 'driver' });
      res.status(201).json({ success: true, data: { token } });
    } catch (err) {
      next(err);
    }
  }
);

// POST /auth/driver/login
authRouter.post(
  '/driver/login',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = loginSchema.parse(req.body);
      const driver = await Driver.findOne({ email: body.email });
      if (!driver || !(await verifyPassword(body.password, driver.passwordHash))) {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
        return;
      }
      const token = signToken({ sub: driver._id.toString(), role: 'driver' });
      res.json({ success: true, data: { token } });
    } catch (err) {
      next(err);
    }
  }
);

// ── Owner auth ────────────────────────────────────────────────────────────────

const ownerRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  businessName: z.string().optional(),
  phone: z.string().optional(),
});

// POST /auth/owner/register
authRouter.post(
  '/owner/register',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = ownerRegisterSchema.parse(req.body);

      const existing = await Owner.findOne({ email: body.email });
      if (existing) {
        res.status(409).json({ success: false, error: 'Email already registered' });
        return;
      }

      const wallet = await Wallet.create({
        ownerType: 'owner',
        ownerId: 'placeholder',
        balance: 0,
        currency: 'LKR',
      });

      const owner = await Owner.create({
        email: body.email,
        passwordHash: await hashPassword(body.password),
        name: body.name,
        businessName: body.businessName,
        phone: body.phone,
        walletId: wallet._id,
      });

      wallet.ownerId = owner._id as typeof wallet.ownerId;
      await wallet.save();

      const token = signToken({ sub: owner._id.toString(), role: 'owner' });
      res.status(201).json({ success: true, data: { token } });
    } catch (err) {
      next(err);
    }
  }
);

// POST /auth/owner/login
authRouter.post(
  '/owner/login',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = loginSchema.parse(req.body);
      const owner = await Owner.findOne({ email: body.email });
      if (!owner || !(await verifyPassword(body.password, owner.passwordHash))) {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
        return;
      }
      const token = signToken({ sub: owner._id.toString(), role: 'owner' });
      res.json({ success: true, data: { token } });
    } catch (err) {
      next(err);
    }
  }
);
