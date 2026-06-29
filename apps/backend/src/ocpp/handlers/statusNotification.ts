import { Charger } from '../../models/Charger';
import { ChargerStatus } from '@ev/shared';
import { logger } from '../../config/logger';

interface StatusNotificationParams {
  connectorId: number;
  errorCode: string;
  status: string;
  timestamp?: string;
  info?: string;
  vendorId?: string;
  vendorErrorCode?: string;
}

// Maps OCPP 1.6 connector status to our internal status
function mapOcppStatus(ocppStatus: string, errorCode: string): ChargerStatus {
  if (errorCode !== 'NoError') return ChargerStatus.FAULTED;
  switch (ocppStatus) {
    case 'Available':
      return ChargerStatus.IDLE;
    case 'Charging':
    case 'SuspendedEV':
    case 'SuspendedEVSE':
      return ChargerStatus.CHARGING;
    case 'Faulted':
    case 'Unavailable':
      return ChargerStatus.FAULTED;
    default:
      return ChargerStatus.IDLE;
  }
}

export async function handleStatusNotification(
  chargePointId: string,
  params: StatusNotificationParams
) {
  logger.info({ chargePointId, params }, 'StatusNotification');

  // connectorId 0 = the charger itself; connectorId >= 1 = individual connectors
  if (params.connectorId === 0) {
    // Charger-level status — update only for fault/unavailable
    if (params.errorCode !== 'NoError' || params.status === 'Faulted') {
      await Charger.updateOne(
        { serialNumber: chargePointId },
        { $set: { status: ChargerStatus.FAULTED } }
      );
    }
  } else {
    const status = mapOcppStatus(params.status, params.errorCode);
    await Charger.updateOne(
      { serialNumber: chargePointId },
      { $set: { status } }
    );
  }

  return {};
}
