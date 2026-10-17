import { eq, and, sql } from 'drizzle-orm';
import { type Db, type ChargingSession, wallets, ledgerEntries, chargingSessions } from '@ev/db';
import { LedgerEntryType } from '@ev/shared';
import { logger } from '../config/logger';

/**
 * Phase 1: records the financial outcome of a completed session.
 * In Phase 1 there is no driver top-up gateway yet — this just writes ledger
 * entries so the record exists. Wallet debit/credit is live from Phase 2.
 *
 * MUST be called only once per session (idempotencyKey guards double-apply).
 */
export async function finalizeSessionPayment(
  db: Db,
  session: ChargingSession
): Promise<void> {
  if (session.grossAmount === 0) {
    logger.info({ sessionId: session.id }, 'Zero-amount session — skipping ledger');
    return;
  }

  const idempotencyKey = `session_payment:${session.id}`;

  const [existing] = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.idempotencyKey, idempotencyKey));
  if (existing) {
    logger.warn({ idempotencyKey }, 'Session payment already recorded — skipping');
    return;
  }

  await db.transaction(async (tx) => {
    const [driverWallet] = await tx
      .select()
      .from(wallets)
      .where(and(eq(wallets.ownerType, 'driver'), eq(wallets.ownerId, session.driverId)));

    const [ownerWallet] = session.ownerId
      ? await tx
          .select()
          .from(wallets)
          .where(and(eq(wallets.ownerType, 'owner'), eq(wallets.ownerId, session.ownerId)))
      : [];

    await tx.insert(ledgerEntries).values({
      fromWalletId: driverWallet?.id ?? null,
      toWalletId: null, // platform receives gross
      amount: session.grossAmount,
      type: LedgerEntryType.SESSION_PAYMENT,
      idempotencyKey,
      relatedSessionId: session.id,
    });

    if (driverWallet) {
      await tx
        .update(wallets)
        .set({ balance: sql`${wallets.balance} - ${session.grossAmount}`, updatedAt: new Date() })
        .where(eq(wallets.id, driverWallet.id));
    }

    if (ownerWallet && session.ownerPayoutAmount > 0) {
      await tx.insert(ledgerEntries).values({
        fromWalletId: null,
        toWalletId: ownerWallet.id,
        amount: session.ownerPayoutAmount,
        type: LedgerEntryType.COMMISSION,
        idempotencyKey: `${idempotencyKey}:owner`,
        relatedSessionId: session.id,
      });

      await tx
        .update(wallets)
        .set({ balance: sql`${wallets.balance} + ${session.ownerPayoutAmount}`, updatedAt: new Date() })
        .where(eq(wallets.id, ownerWallet.id));
    }

    await tx
      .update(chargingSessions)
      .set({ paymentIdempotencyKey: idempotencyKey, updatedAt: new Date() })
      .where(eq(chargingSessions.id, session.id));
  });

  logger.info({ sessionId: session.id, grossAmount: session.grossAmount }, 'Session payment finalised');
}
