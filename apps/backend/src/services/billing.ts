import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { IChargingSession } from '../models/ChargingSession';
import { Wallet } from '../models/Wallet';
import { LedgerEntry } from '../models/LedgerEntry';
import { LedgerEntryType, SessionStatus } from '@ev/shared';
import { logger } from '../config/logger';

/**
 * Phase 1: records the financial outcome of a completed session.
 * In Phase 1 there is no driver wallet — this just writes ledger entries
 * so the record exists. Wallet debit is added in Phase 2.
 *
 * MUST be called only once per session (idempotencyKey guards double-apply).
 */
export async function finalizeSessionPayment(
  session: IChargingSession
): Promise<void> {
  if (session.grossAmount === 0) {
    logger.info({ sessionId: session._id }, 'Zero-amount session — skipping ledger');
    return;
  }

  const idempotencyKey = `session_payment:${session._id.toString()}`;

  // Guard: if a ledger entry already exists for this key, skip silently
  const existing = await LedgerEntry.findOne({ idempotencyKey });
  if (existing) {
    logger.warn({ idempotencyKey }, 'Session payment already recorded — skipping');
    return;
  }

  const dbSession = await mongoose.startSession();
  try {
    await dbSession.withTransaction(async () => {
      const driverWallet = await Wallet.findById(session.driverId).session(dbSession);
      // Owner wallet may not exist in Phase 1 (no owner assigned)
      const ownerWallet = session.ownerId
        ? await Wallet.findOne({ ownerType: 'owner', ownerId: session.ownerId }).session(dbSession)
        : null;

      // Write driver debit entry
      await LedgerEntry.create(
        [
          {
            fromWalletId: driverWallet?._id ?? null,
            toWalletId: null, // platform receives gross
            amount: session.grossAmount,
            type: LedgerEntryType.SESSION_PAYMENT,
            idempotencyKey,
            relatedSessionId: session._id,
          },
        ],
        { session: dbSession }
      );

      // Debit driver wallet
      if (driverWallet) {
        driverWallet.balance -= session.grossAmount;
        await driverWallet.save({ session: dbSession });
      }

      // Credit owner wallet (net of commission)
      if (ownerWallet && session.ownerPayoutAmount > 0) {
        await LedgerEntry.create(
          [
            {
              fromWalletId: null,
              toWalletId: ownerWallet._id,
              amount: session.ownerPayoutAmount,
              type: LedgerEntryType.COMMISSION,
              idempotencyKey: `${idempotencyKey}:owner`,
              relatedSessionId: session._id,
            },
          ],
          { session: dbSession }
        );
        ownerWallet.balance += session.ownerPayoutAmount;
        await ownerWallet.save({ session: dbSession });
      }

      session.paymentIdempotencyKey = idempotencyKey;
      await session.save({ session: dbSession });
    });

    logger.info({ sessionId: session._id, grossAmount: session.grossAmount }, 'Session payment finalised');
  } finally {
    await dbSession.endSession();
  }
}
