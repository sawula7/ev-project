import { ChargingSession } from '../../models/ChargingSession';
import { Charger } from '../../models/Charger';
import { ChargerStatus, SessionStatus } from '@ev/shared';
import { getRedis } from '../../config/redis';
import { logger } from '../../config/logger';

interface StartTransactionParams {
  connectorId: number;
  idTag: string;
  meterStart: number; // Wh
  timestamp: string;
  reservationId?: number;
}

export async function handleStartTransaction(
  chargePointId: string,
  params: StartTransactionParams
) {
  logger.info({ chargePointId, params }, 'StartTransaction');

  // idTag carries our session id (set when we sent RemoteStartTransaction)
  const sessionId = params.idTag;
  const session = await ChargingSession.findById(sessionId);

  if (!session || session.status !== SessionStatus.INITIATED) {
    logger.warn({ chargePointId, sessionId }, 'StartTransaction: session not found or wrong status');
    return { transactionId: 0, idTagInfo: { status: 'Invalid' } };
  }

  const transactionId = Date.now(); // simple incrementing id via timestamp; good enough for single-charger
  session.ocppTransactionId = transactionId;
  session.status = SessionStatus.ACTIVE;
  session.startTime = new Date(params.timestamp);
  session.energyDeliveredWh = 0;
  await session.save();

  // Cache active session in Redis for fast MeterValues lookup
  await getRedis().set(
    `ocpp:session:${chargePointId}`,
    JSON.stringify({ sessionId: session._id.toString(), transactionId, meterStart: params.meterStart }),
    'EX',
    86400 // 24h TTL safety net
  );

  await Charger.updateOne(
    { serialNumber: chargePointId },
    { $set: { status: ChargerStatus.CHARGING } }
  );

  return {
    transactionId,
    idTagInfo: { status: 'Accepted' },
  };
}
