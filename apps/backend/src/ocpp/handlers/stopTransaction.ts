import { eq } from 'drizzle-orm';
import { type Db, type ChargingSession, chargingSessions, chargers } from '@ev/db';
import { ChargerStatus, SessionStatus } from '@ev/shared';
import { getRedis } from '../../config/redis';
import { logger } from '../../config/logger';
import { config } from '../../config';
import { finalizeSessionPayment } from '../../services/billing';

interface StopTransactionParams {
  transactionId: number;
  idTag?: string;
  meterStop: number; // Wh cumulative
  timestamp: string;
  reason?: string;
  transactionData?: unknown[];
}

export async function handleStopTransaction(
  db: Db,
  chargePointId: string,
  params: StopTransactionParams
) {
  logger.info({ chargePointId, params }, 'StopTransaction');

  const redis = getRedis();
  const cached = await redis.get(`ocpp:session:${chargePointId}`);

  if (!cached) {
    logger.warn({ chargePointId }, 'StopTransaction: no session in cache');
    return { idTagInfo: { status: 'Accepted' } };
  }

  const { sessionId, meterStart } = JSON.parse(cached) as {
    sessionId: string;
    transactionId: number;
    meterStart: number;
  };

  const [session] = await db.select().from(chargingSessions).where(eq(chargingSessions.id, sessionId));
  if (!session) {
    logger.warn({ sessionId }, 'StopTransaction: session not found');
    return { idTagInfo: { status: 'Accepted' } };
  }

  const [charger] = await db.select().from(chargers).where(eq(chargers.serialNumber, chargePointId));

  const deliveredWh = Math.max(0, params.meterStop - meterStart);
  const pricePerKwh = charger?.pricePerKwh ?? 0;
  const grossAmount = Math.floor((pricePerKwh * deliveredWh) / 1000);
  const commissionAmount = Math.floor(
    (grossAmount * config.commissionRateBps) / 10000
  );
  const ownerPayoutAmount = grossAmount - commissionAmount;

  const updatedSession: ChargingSession = {
    ...session,
    status: SessionStatus.COMPLETED,
    stopTime: new Date(params.timestamp),
    energyDeliveredWh: deliveredWh,
    grossAmount,
    commissionAmount,
    ownerPayoutAmount,
    stopReason: params.reason ?? null,
  };

  await db
    .update(chargingSessions)
    .set({
      status: updatedSession.status,
      stopTime: updatedSession.stopTime,
      energyDeliveredWh: updatedSession.energyDeliveredWh,
      grossAmount: updatedSession.grossAmount,
      commissionAmount: updatedSession.commissionAmount,
      ownerPayoutAmount: updatedSession.ownerPayoutAmount,
      stopReason: updatedSession.stopReason,
      updatedAt: new Date(),
    })
    .where(eq(chargingSessions.id, session.id));

  await redis.del(`ocpp:session:${chargePointId}`);

  await db
    .update(chargers)
    .set({ status: ChargerStatus.IDLE, updatedAt: new Date() })
    .where(eq(chargers.serialNumber, chargePointId));

  // Finalise payment (Phase 1: direct gateway charge; Phase 2+: wallet debit)
  try {
    await finalizeSessionPayment(db, updatedSession);
  } catch (err) {
    logger.error({ err, sessionId }, 'Failed to finalise session payment');
    // Don't fail the OCPP response — session is recorded, payment can be retried
  }

  return { idTagInfo: { status: 'Accepted' } };
}
