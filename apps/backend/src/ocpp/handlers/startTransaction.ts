import { eq } from 'drizzle-orm';
import { type Db, chargingSessions, chargers } from '@ev/db';
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
  db: Db,
  chargePointId: string,
  params: StartTransactionParams
) {
  logger.info({ chargePointId, params }, 'StartTransaction');

  // idTag carries our session id (set when we sent RemoteStartTransaction)
  const sessionId = params.idTag;
  const [session] = await db.select().from(chargingSessions).where(eq(chargingSessions.id, sessionId));

  if (!session || session.status !== SessionStatus.INITIATED) {
    logger.warn({ chargePointId, sessionId }, 'StartTransaction: session not found or wrong status');
    return { transactionId: 0, idTagInfo: { status: 'Invalid' } };
  }

  // OCPP 1.6's transactionId is a 32-bit integer on the wire — ocpp-rpc enforces
  // this and rejects a millisecond Date.now() value as out of range. Seconds
  // since epoch stays well within int32 until year 2038, and is still unique
  // enough per charge point for single-charger pilot scale.
  const transactionId = Math.floor(Date.now() / 1000);

  await db
    .update(chargingSessions)
    .set({
      ocppTransactionId: transactionId,
      status: SessionStatus.ACTIVE,
      startTime: new Date(params.timestamp),
      energyDeliveredWh: 0,
      updatedAt: new Date(),
    })
    .where(eq(chargingSessions.id, session.id));

  // Cache active session in Redis for fast MeterValues lookup
  await getRedis().set(
    `ocpp:session:${chargePointId}`,
    JSON.stringify({ sessionId: session.id, transactionId, meterStart: params.meterStart }),
    'EX',
    86400 // 24h TTL safety net
  );

  await db
    .update(chargers)
    .set({ status: ChargerStatus.CHARGING, updatedAt: new Date() })
    .where(eq(chargers.serialNumber, chargePointId));

  return {
    transactionId,
    idTagInfo: { status: 'Accepted' },
  };
}
