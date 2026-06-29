import { Wallet } from '../models/Wallet';
import { LedgerEntry } from '../models/LedgerEntry';
import { LedgerEntryType } from '@ev/shared';
import { logger } from '../config/logger';

// Periodic reconciliation job (Phase 4: run via cron / ECS scheduled task).
//
// Invariant: sum of all wallet balances must equal
//   total TOPUPs − total PAYOUTS (what's actually held on behalf of users).
// Any drift indicates a missed ledger entry or a double-credit bug.
export async function runReconciliation(): Promise<void> {
  const [walletsResult, topupResult, payoutResult] = await Promise.all([
    Wallet.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]),
    LedgerEntry.aggregate([
      { $match: { type: LedgerEntryType.TOPUP } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    LedgerEntry.aggregate([
      { $match: { type: LedgerEntryType.PAYOUT } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  const walletTotal: number = walletsResult[0]?.total ?? 0;
  const topupTotal: number = topupResult[0]?.total ?? 0;
  const payoutTotal: number = payoutResult[0]?.total ?? 0;

  // Expected held amount = topups received − payouts sent
  const expected = topupTotal - payoutTotal;
  const drift = walletTotal - expected;

  logger.info(
    { walletTotal, topupTotal, payoutTotal, expected, drift },
    'Reconciliation run'
  );

  if (drift !== 0) {
    // Phase 4: emit a CloudWatch metric / SNS alert here
    logger.error(
      { drift },
      'RECONCILIATION DRIFT DETECTED — wallet balances do not match ledger'
    );
  }
}

// Schedule: call this from index.ts or an ECS scheduled task
export function startReconciliationJob(intervalMs = 60 * 60 * 1000): NodeJS.Timeout {
  return setInterval(() => {
    runReconciliation().catch((err) =>
      logger.error({ err }, 'Reconciliation job error')
    );
  }, intervalMs);
}
