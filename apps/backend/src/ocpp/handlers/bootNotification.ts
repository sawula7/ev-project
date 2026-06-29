import { Charger } from '../../models/Charger';
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

export async function handleBootNotification(
  chargePointId: string,
  params: BootNotificationParams
) {
  logger.info({ chargePointId, params }, 'BootNotification received');

  const charger = await Charger.findOne({ serialNumber: chargePointId });

  if (charger) {
    charger.lastBootInfo = {
      chargePointVendor: params.chargePointVendor,
      chargePointModel: params.chargePointModel,
      firmwareVersion: params.firmwareVersion,
      iccid: params.iccid,
      imsi: params.imsi,
    };
    charger.lastHeartbeat = new Date();
    if (charger.status === ChargerStatus.OFFLINE) {
      charger.status = ChargerStatus.IDLE;
    }
    await charger.save();
  } else {
    // Unknown charger — create a placeholder in unclaimed state
    await Charger.create({
      serialNumber: chargePointId,
      // Temporary auth key — will be replaced when claimed or configured
      authorizationKey: 'UNCONFIGURED',
      claimCode: generateClaimCode(),
      status: ChargerStatus.UNCLAIMED,
      lastBootInfo: {
        chargePointVendor: params.chargePointVendor,
        chargePointModel: params.chargePointModel,
        firmwareVersion: params.firmwareVersion,
      },
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

function generateClaimCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}
