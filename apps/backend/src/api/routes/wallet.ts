import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Wallet } from '../../models/Wallet';
import { authenticate, AuthRequest, requireRole } from '../middleware/authenticate';
import { Driver } from '../../models/Driver';

export const walletRouter = Router();

walletRouter.use(authenticate);

// GET /wallet — driver's current balance
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

// POST /wallet/topup
//
// POS purchase model:
//   1. Driver submits a top-up amount + their saved card token.
//   2. Backend initiates a PURCHASE transaction (not auth/capture) via the
//      payment gateway using the stored card token.
//   3. Backend returns a gatewayOrderId so the app can show a pending state.
//   4. Gateway fires a webhook to POST /wallet/topup/confirm — that handler
//      writes the TOPUP LedgerEntry and credits the wallet (idempotent).
//
// NOTE: gateway integration is wired once the gateway is chosen (PayHere /
// WebXPay). The schema and flow below are final; only the gateway SDK call
// is the remaining stub.
const topupSchema = z.object({
  // Amount in smallest currency unit (e.g. LKR cents). Must be positive integer.
  amount: z.number().int().positive(),
  // Tokenized card reference returned by the gateway SDK on the client side.
  // We never receive or store raw card numbers.
  cardToken: z.string().min(1),
});

walletRouter.post(
  '/topup',
  requireRole('driver'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { amount, cardToken } = topupSchema.parse(req.body);
      const driverId = req.user!.sub;

      // TODO (Phase 2): call gateway.purchase({ amount, cardToken, orderId })
      // where orderId = uuidv4() used as the idempotency key for the webhook.
      // Return the gatewayOrderId to the client so it can poll/display status.
      //
      // Chosen gateway must support:
      //   - POS purchase / sale transaction type (not auth-only)
      //   - Card tokenization (recurring token / stored credential)
      //   - Webhook / server-to-server callback on payment result

      void driverId; void cardToken; void amount; // remove once gateway is wired

      res.status(501).json({
        success: false,
        error: 'Gateway not yet configured — pending gateway selection (Phase 2)',
        hint: 'Implement gateway.purchase() call here once PayHere/WebXPay is chosen',
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /wallet/topup/confirm — gateway webhook
//
// Called by the payment gateway after a purchase transaction completes.
// Must be idempotent: the gateway may retry the callback multiple times.
walletRouter.post(
  '/topup/confirm',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // TODO (Phase 2):
      //   1. Verify gateway signature/hash on req.body
      //   2. Extract orderId (our idempotency key) and status
      //   3. If status === 'success' and no LedgerEntry exists for orderId:
      //        - Start MongoDB transaction
      //        - Write TOPUP LedgerEntry (fromWalletId: null, toWalletId: driverWallet)
      //        - Increment wallet.balance by amount
      //        - Commit
      //   4. Always return 200 so the gateway stops retrying

      res.status(501).json({
        success: false,
        error: 'Webhook handler not yet configured (Phase 2)',
      });
    } catch (err) {
      next(err);
    }
  }
);
