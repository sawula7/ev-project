import { Router, Response, NextFunction } from 'express';
import { Wallet } from '../../models/Wallet';
import { authenticate, AuthRequest, requireRole } from '../middleware/authenticate';
import { Driver } from '../../models/Driver';

export const walletRouter = Router();

walletRouter.use(authenticate);

// GET /wallet — driver's wallet balance
walletRouter.get(
  '/',
  requireRole('driver'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const driver = await Driver.findById(req.user!.sub);
      if (!driver) {
        res.status(404).json({ success: false, error: 'Driver not found' });
        return;
      }
      const wallet = await Wallet.findById(driver.walletId);
      res.json({
        success: true,
        data: {
          balance: wallet?.balance ?? 0,
          currency: wallet?.currency ?? 'LKR',
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// NOTE: Top-up endpoint wired in Phase 2 when payment gateway is chosen.
// Placeholder to avoid 404:
walletRouter.post(
  '/topup',
  requireRole('driver'),
  async (_req: AuthRequest, res: Response) => {
    res.status(501).json({
      success: false,
      error: 'Top-up not yet implemented — pending payment gateway selection (Phase 2)',
    });
  }
);
