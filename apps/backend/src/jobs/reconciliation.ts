import { eq, sql } from 'drizzle-orm';
import { type Db, wallets, ledgerEntries } from '@ev/db';
import { LedgerEntryType } from '@ev/shared';
import { logger } from '../config/logger';

// Periodic reconciliation job (Phase 4: run via cron / ECS scheduled task).
//
// Invariant: sum of all wallet balances must equal
//   total TOPUPs − total PAYOUTS (what's actually held on behalf of users).
// Any drift indicates a missed ledger entry or a double-credit bug.
export async function runReconciliation(db: Db): Promise<void> {
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
export function startReconciliationJob(db: Db, intervalMs = 60 * 60 * 1000): NodeJS.Timeout {
  return setInterval(() => {
    runReconciliation(db).catch((err) =>
      logger.error({ err }, 'Reconciliation job error')
    );
  }, intervalMs);
}
