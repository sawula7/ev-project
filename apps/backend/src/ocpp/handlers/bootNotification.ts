import { eq } from 'drizzle-orm';
import { type Db, chargers } from '@ev/db';
import { ChargerStatus } from '@ev/shared';
import { logger } from '../../config/logger';

interface BootNotificationParams {
  chargePointVendor: string;
  chargePointModel: string;
  chargePointSerialNumber?: string;
  firmwareVersion?: string;
  iccid?: string;
  imsi?: string;
}

function generateClaimCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

export async function handleBootNotification(
  db: Db,
  chargePointId: string,
  params: BootNotificationParams
) {
  logger.info({ chargePointId, params }, 'BootNotification received');

  const [charger] = await db.select().from(chargers).where(eq(chargers.serialNumber, chargePointId));

  if (charger) {
    await db
      .update(chargers)
      .set({
        lastBootInfo: JSON.stringify({
          chargePointVendor: params.chargePointVendor,
          chargePointModel: params.chargePointModel,
          firmwareVersion: params.firmwareVersion,
          iccid: params.iccid,
          imsi: params.imsi,
        }),
        lastHeartbeat: new Date(),
        status: charger.status === ChargerStatus.OFFLINE ? ChargerStatus.IDLE : charger.status,
        updatedAt: new Date(),
      })
      .where(eq(chargers.id, charger.id));
  } else {
    // Unknown charger — create a placeholder in unclaimed state
    await db.insert(chargers).values({
      serialNumber: chargePointId,
      authorizationKey: 'UNCONFIGURED',
      claimCode: generateClaimCode(),
      status: ChargerStatus.UNCLAIMED,
      lastBootInfo: JSON.stringify({
        chargePointVendor: params.chargePointVendor,
        chargePointModel: params.chargePointModel,
        firmwareVersion: params.firmwareVersion,
      }),
      lastHeartbeat: new Date(),
    });
    logger.info({ chargePointId }, 'Auto-created unclaimed charger record');
  }

  return {
    status: 'Accepted',
    currentTime: new Date().toISOString(),
    interval: 300, // heartbeat interval suggestion (seconds)
  };
}
