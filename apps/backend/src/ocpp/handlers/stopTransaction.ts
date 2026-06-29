import { ChargingSession } from '../../models/ChargingSession';
import { Charger } from '../../models/Charger';
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

  const session = await ChargingSession.findById(sessionId);
  if (!session) {
    logger.warn({ sessionId }, 'StopTransaction: session not found');
    return { idTagInfo: { status: 'Accepted' } };
  }

  const charger = await Charger.findOne({ serialNumber: chargePointId });

  const deliveredWh = Math.max(0, params.meterStop - meterStart);
  const pricePerKwh = charger?.pricePerKwh ?? 0;
  const grossAmount = Math.floor((pricePerKwh * deliveredWh) / 1000);
  const commissionAmount = Math.floor(
    (grossAmount * config.commissionRateBps) / 10000
  );
  const ownerPayoutAmount = grossAmount - commissionAmount;

  session.status = SessionStatus.COMPLETED;
  session.stopTime = new Date(params.timestamp);
  session.energyDeliveredWh = deliveredWh;
  session.grossAmount = grossAmount;
  session.commissionAmount = commissionAmount;
  session.ownerPayoutAmount = ownerPayoutAmount;
  session.stopReason = params.reason;
  await session.save();

  await redis.del(`ocpp:session:${chargePointId}`);

  await Charger.updateOne(
    { serialNumber: chargePointId },
    { $set: { status: ChargerStatus.IDLE } }
  );

  // Finalise payment (Phase 1: direct gateway charge; Phase 2+: wallet debit)
  try {
    await finalizeSessionPayment(session);
  } catch (err) {
    logger.error({ err, sessionId }, 'Failed to finalise session payment');
    // Don't fail the OCPP response — session is recorded, payment can be retried
  }

  return { idTagInfo: { status: 'Accepted' } };
}
